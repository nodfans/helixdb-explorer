use std::io::{self, Write};
use std::collections::HashSet;
use std::fs;
use helix_db::helixc::parser::{HelixParser, write_to_temp_file};
use helix_db::helixc::parser::types::*;
use crate::hql_analyzer::{self, LitType};
use crate::config;

#[tauri::command]
pub fn log_to_terminal(message: String) {
    println!("{}", message);
    let _ = io::stdout().flush();
}

#[tauri::command]
pub fn terminate_app() {
    std::process::exit(0);
}

pub fn map_reqwest_error(e: reqwest::Error, prefix: &str) -> String {
    if e.is_connect() {
        if let Some(url) = e.url() {
            let host = url.host_str().unwrap_or(url.as_str());
            let port = url.port().map(|p| format!(":{}", p)).unwrap_or_default();
            return format!("ERROR: Connection refused: {}{}", host, port);
        }
    }
    format!("{}: {}", prefix, e)
}

#[tauri::command]
pub fn helix_request(
    method: String,
    url: String,
    headers: std::collections::HashMap<String, String>,
    body: Option<String>,
) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10)) // Reduced timeout for debugging
        .no_proxy()
        .build()
        .map_err(|e| format!("Client build error: {}", e))?;

    let method_type = match method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        _ => return Err(format!("Unsupported method: {}", method)),
    };

    let mut req = client.request(method_type, &url);

    for (key, value) in headers {
        req = req.header(key, value);
    }

    if let Some(b) = body {
        req = req.body(b);
    }

    let resp = req.send().map_err(|e| map_reqwest_error(e, "Request error"))?;

    let status = resp.status();
    let text = resp.text().unwrap_or_default();
    
    if status.is_success() {
        Ok(text)
    } else {
        Err(format!("Server responded with status {}: {}", status, text))
    }
}

#[tauri::command]
pub async fn execute_query(url: String, query_name: String, args: serde_json::Value) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;
    
    // Helix gateway routes queries directly at the root path, e.g., /QueryName
    let url = format!("{}/{}", url, query_name);
    
    let resp = client.post(url)
        .json(&args)
        .send()
        .await
        .map_err(|e| map_reqwest_error(e, "Request failed"))?;

    if resp.status().is_success() {
        let json: serde_json::Value = resp.json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        Ok(json)
    } else {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_else(|_| String::new());
        Err(format!("Server error ({}): {}", status, err_text))
    }
}

fn expression_to_json(expr: &helix_db::helixc::parser::types::Expression) -> Option<serde_json::Value> {
    match &expr.expr {
        helix_db::helixc::parser::types::ExpressionType::StringLiteral(s) => Some(serde_json::Value::String(s.clone())),
        helix_db::helixc::parser::types::ExpressionType::IntegerLiteral(i) => Some(serde_json::Value::Number((*i).into())),
        helix_db::helixc::parser::types::ExpressionType::FloatLiteral(f) => serde_json::Number::from_f64(*f).map(serde_json::Value::Number),
        helix_db::helixc::parser::types::ExpressionType::BooleanLiteral(b) => Some(serde_json::Value::Bool(*b)),
        helix_db::helixc::parser::types::ExpressionType::ArrayLiteral(arr) => {
            let values: Vec<serde_json::Value> = arr.iter().filter_map(expression_to_json).collect();
            Some(serde_json::Value::Array(values))
        },
        _ => None,
    }
}

use crate::hql_processor;

#[tauri::command]
pub async fn execute_dynamic_hql(url: String, code: String, params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let code = hql_processor::preprocess_hql(&code);

    fn try_parse(code: &str) -> Result<helix_db::helixc::parser::types::Source, String> {
        let content = write_to_temp_file(vec![code]);
        HelixParser::parse_source(&content).map_err(|e| format!("{:?}", e))
    }

    let source = if code.trim().to_uppercase().starts_with("QUERY") {
        try_parse(&code).map_err(|e| format!("Failed to parse Query: {}\nCode: '{}'", e, code))?
    } else {
        match try_parse(&code) {
            Ok(s) => s,
            Err(_) => {
                // If that fails, assume it's a raw traversal and wrap it
                let wrapped = format!("QUERY ExplorerTmp() => {}", code);
                try_parse(&wrapped).map_err(|e| format!("Failed to parse HQL: {}", e))?
            }
        }
    };

    if source.queries.len() > 1 {
        return Err("Multiple queries detected in editor. Please select a specific query to execute, or ensure only one query exists.".to_string());
    }
    
    let query = source.queries.first().ok_or_else(|| "No query found in parsed source".to_string())?;
    let mut params_val = params.unwrap_or(serde_json::json!({}));

    let mut variable_assignments = std::collections::HashMap::<String, &helix_db::helixc::parser::types::Traversal>::new();
    let mut variable_search_tools = std::collections::HashMap::<String, crate::tool_args::ToolArgs>::new();
    let mut return_vars = Vec::<String>::new();

    for stmt in &query.statements {
        match &stmt.statement {
            StatementType::Assignment(assign) => {
                if let Some(val) = expression_to_json(&assign.value) {
                    if let serde_json::Value::Object(map) = &mut params_val {
                        map.insert(assign.variable.clone(), val);
                    }
                }

                match &assign.value.expr {
                    ExpressionType::Traversal(t) => {
                        variable_assignments.insert(assign.variable.clone(), &**t);
                    },
                    ExpressionType::StringLiteral(s) => {
                        if let serde_json::Value::Object(map) = &mut params_val {
                            map.insert(assign.variable.clone(), serde_json::Value::String(s.clone()));
                        }
                    },
                    ExpressionType::IntegerLiteral(i) => {
                        if let serde_json::Value::Object(map) = &mut params_val {
                            map.insert(assign.variable.clone(), serde_json::Value::Number((*i).into()));
                        }
                    },
                    ExpressionType::FloatLiteral(f) => {
                        if let serde_json::Value::Object(map) = &mut params_val {
                            if let Some(n) = serde_json::Number::from_f64(*f) {
                                map.insert(assign.variable.clone(), serde_json::Value::Number(n));
                            }
                        }
                    },
                    ExpressionType::BooleanLiteral(b) => {
                        if let serde_json::Value::Object(map) = &mut params_val {
                            map.insert(assign.variable.clone(), serde_json::Value::Bool(*b));
                        }
                    },
                    ExpressionType::AddNode(_) | ExpressionType::AddEdge(_) | ExpressionType::AddVector(_) => {
                        return Err("Explorer Mode is Read-Only: The underlying MCP protocol does not support writing data. For more details, refer to https://docs.helix-db.com/guides/mcp-guide. To modify data (Add/Update/Delete), please use Migrations or the HTTP API.".to_string());
                    },
                    ExpressionType::BM25Search(bm25) => {
                        let tool = crate::hql_translator::map_bm25_to_tool(bm25).map_err(|e| e.to_string())?;
                        variable_search_tools.insert(assign.variable.clone(), tool);
                    },
                    ExpressionType::SearchVector(sv) => {
                        let tool = crate::hql_translator::map_search_vector_to_tool(sv, &params_val).map_err(|e| e.to_string())?;
                        variable_search_tools.insert(assign.variable.clone(), tool);
                    },
                    _ => {}
                }
            },
            StatementType::Expression(expr) => {
                match &expr.expr {
                    ExpressionType::Traversal(t) => {
                         variable_assignments.insert("_implicit_".to_string(), &**t);
                    },
                    ExpressionType::AddNode(_) | ExpressionType::AddEdge(_) | ExpressionType::AddVector(_) => {
                        return Err("Explorer Mode is Read-Only: The underlying MCP protocol does not support writing data. For more details, refer to https://docs.helix-db.com/guides/mcp-guide. To modify data (Add/Update/Delete), please use Migrations or the HTTP API.".to_string());
                    },
                    ExpressionType::BM25Search(bm25) => {
                        let tool = crate::hql_translator::map_bm25_to_tool(bm25).map_err(|e| e.to_string())?;
                        variable_search_tools.insert("_implicit_".to_string(), tool);
                        // Also mark as implicit return
                        return_vars.push("_implicit_".to_string());
                    },
                    ExpressionType::SearchVector(sv) => {
                        let tool = crate::hql_translator::map_search_vector_to_tool(sv, &params_val).map_err(|e| e.to_string())?;
                        variable_search_tools.insert("_implicit_".to_string(), tool);
                        // Also mark as implicit return
                        return_vars.push("_implicit_".to_string());
                    },
                    _ => {}
                }
            }
            StatementType::Drop(_) | StatementType::ForLoop(_) => {
                return Err("Explorer Mode is Read-Only: The underlying MCP protocol does not support writing data or complex control flow. For more details, refer to https://docs.helix-db.com/guides/mcp-guide. To modify data (Add/Update/Delete), please use Migrations or the HTTP API.".to_string());
            }
        }
    }

    if !query.return_values.is_empty() {
        for ret in &query.return_values {
            match ret {
                ReturnType::Expression(expr) => {
                     if let ExpressionType::Identifier(id) = &expr.expr {
                         return_vars.push(id.clone());
                     }
                },
                ReturnType::Array(rets) => {
                    for r in rets {
                        if let ReturnType::Expression(expr) = r {
                            if let ExpressionType::Identifier(id) = &expr.expr {
                                return_vars.push(id.clone());
                            }
                        }
                    }
                },
                _ => {} // Handle Object return types if needed in future
            }
        }
    } else if let Some(_implicit) = variable_assignments.get("_implicit_") {
        // No explicit return, but we have a bare expression traversal -> return it
        return_vars.push("_implicit_".to_string());
    } else if variable_search_tools.contains_key("_implicit_") {
        return_vars.push("_implicit_".to_string());
    } else if return_vars.is_empty() && (!variable_assignments.is_empty() || !variable_search_tools.is_empty()) {
        // Fallback: if no return and no bare expression, but we have assignments, return the last assignment for REPL feel
        if let Some(last_stmt) = query.statements.last() {
             if let StatementType::Assignment(assign) = &last_stmt.statement {
                 return_vars.push(assign.variable.clone());
             }
        }
    }

    if return_vars.is_empty() {
        return Err("No executable traversal or return statement found.".to_string());
    }

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;

    // Fast Path: Try calling compiled query endpoint directly if applicable.
    // server's compiled engine is more reliable for ID-based traversals.
    let query_name = &query.name;
    if query_name != "ExplorerTmp" && !query.parameters.is_empty() {
        let compiled_url = format!("{}/{}", url, query_name);
        let compiled_resp = client.post(&compiled_url)
            .json(&params_val)
            .send()
            .await;

        if let Ok(resp) = compiled_resp {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    return Ok(crate::hql_translator::normalize_value(json));
                }
            }
        }
        // If compiled endpoint fails (404, network error, etc.), fall through to MCP pipeline
    }

    let mut final_map = serde_json::Map::new();

    // Shuffle return variables to mimic server's random HashMap behavior
    {
        use rand::seq::SliceRandom;
        let mut rng = rand::thread_rng();
        return_vars.shuffle(&mut rng);
    }

    for var_name in return_vars {
        let search_tool = variable_search_tools.get(&var_name);
        
        let traversal = if search_tool.is_none() {
             match crate::hql_translator::resolve_traversal(&var_name, &variable_assignments)? {
                Some(t) => Some(t),
                None => None,
             }
        } else {
             None
        };

        if search_tool.is_none() && traversal.is_none() {
            continue;
        }

        // Init connection per variable to ensure isolation
        let init_resp = client.post(format!("{}/mcp/init", url))
            .send()
            .await
            .map_err(|e| map_reqwest_error(e, "Init failed"))?;
        
        if !init_resp.status().is_success() {
            let status = init_resp.status();
            let err_text = init_resp.text().await.unwrap_or_else(|_| String::new());
            return Err(format!("Init request failed ({}): {}", status, err_text));
        }

        let init_body = init_resp.text().await.map_err(|e| format!("Failed to read init body: {}", e))?;
        let connection_id: String = serde_json::from_str(&init_body)
            .map_err(|e| format!("Failed to parse connection_id from '{}': {}", init_body, e))?;

        // Execute individual traversal pipeline OR search tool
        let result = if let Some(tool) = search_tool {
             crate::hql_executor::execute_search_tool(&client, &url, &connection_id, tool).await?
        } else if let Some(t) = traversal {
             crate::hql_executor::execute_pipeline(&client, &url, &connection_id, &t, &params_val).await?
        } else {
             // Should not happen given logic above
             serde_json::Value::Null
        };
        
        // Single implicit return Optimization: if it's the ONLY return, return it raw
        if var_name == "_implicit_" && final_map.is_empty() {
             // We still need to check if there are subsequent variables to be safe
             // But the current query logic ensures _implicit_ is exclusive if chosen
             return Ok(crate::hql_translator::normalize_value(result));
        }
        
        final_map.insert(var_name, result);
    }

    if final_map.len() == 1 && final_map.contains_key("_implicit_") {
        return Ok(crate::hql_translator::normalize_value(final_map.get("_implicit_").unwrap().clone()));
    }

    Ok(crate::hql_translator::normalize_value(serde_json::Value::Object(final_map)))
}



#[tauri::command]
pub fn load_connection_config(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    config::load_connection_config(app)
}

#[tauri::command]
pub fn save_connection_config(app: tauri::AppHandle, config: serde_json::Value) -> Result<(), String> {
    config::save_connection_config(app, config)
}

#[tauri::command]
pub fn detect_workspace_path(port: Option<String>) -> Result<String, String> {
    config::detect_workspace_path(port)
}

#[derive(serde::Serialize, Clone)]
pub struct PendingSyncItem {
    pub query_name: String,
    pub old_code: String,
    pub new_code: String,
    pub sync_type: String, // "CONFLICT" or "EXISTS"
}

#[derive(serde::Serialize)]
#[serde(tag = "type", content = "data")]
pub enum SyncResponse {
    Success(String),
    Pending(Vec<PendingSyncItem>),
}

#[tauri::command]
pub async fn sync_hql_to_project(code: String, local_path: String, force: bool) -> Result<SyncResponse, String> {
    let mut logs = String::new();
    fn log(logs: &mut String, msg: &str) {
        logs.push_str(msg);
        logs.push('\n');
    }

    log(&mut logs, &format!(">>> [Sync] Starting HQL Sync to project: {}", local_path));
    
    // 1. Validate paths
    let root_path = std::path::Path::new(&local_path);
    if !root_path.exists() {
        return Err(format!("Local path does not exist: {}", local_path));
    }

    // 2. Find db directory
    let queries_path = root_path.join("db").join("queries.hx");
    log(&mut logs, &format!(">>> [Sync] Target queries file resolved to: {:?}", queries_path));

    // 3. Purification: Strip debug default values
    let re_purify = regex::Regex::new(r#"(?x)
        (\w+\s*:\s*[A-Za-z0-9_<>]+)
        \s*=\s*
        ('[^']*'|"[^"]*"|[\d\.]+|true|false)
    "#).unwrap();
    let purified_code = re_purify.replace_all(&code, "$1").to_string();

    // 4. Parse incoming code to handle multiple queries
    let incoming_content = write_to_temp_file(vec![&purified_code]);
    let incoming_source = HelixParser::parse_source(&incoming_content)
        .map_err(|e| format!("Failed to parse incoming HQL: {}", e))?;
    
    if incoming_source.queries.is_empty() {
        return Err("No query found in provided HQL".to_string());
    }


    let mut incoming_names = HashSet::new();
    for q in &incoming_source.queries {
        if !incoming_names.insert(&q.name) {
            return Err(format!("Duplicate query name found in selection/editor: '{}'", q.name));
        }
    }


    let mut all_mappings: Vec<(std::ops::Range<usize>, String)> = Vec::new();
    for query in &incoming_source.queries {
        let (used_ids, mut literals) = hql_analyzer::collect_dwim_info(query);
        let unused_params: Vec<_> = query.parameters.iter()
            .filter(|p| !used_ids.contains(&p.name.1))
            .collect();

        if !unused_params.is_empty() && !literals.is_empty() {
            log(&mut logs, &format!(">>> [Sync] DWIM ({}): Found {} unused params and {} candidate literals", 
                query.name, unused_params.len(), literals.len()));
            
            literals.sort_by(|a, b| a.0.start.cmp(&b.0.start));
            for param in unused_params {
                if let Some(pos) = literals.iter().position(|(_, lit_type)| {
                    match &param.param_type.1 {
                        FieldType::String | FieldType::Uuid => matches!(lit_type, LitType::String),
                        FieldType::I8 | FieldType::I16 | FieldType::I32 | FieldType::I64 |
                        FieldType::U8 | FieldType::U16 | FieldType::U32 | FieldType::U64 | FieldType::U128 |
                        FieldType::F32 | FieldType::F64 => matches!(lit_type, LitType::Number),
                        FieldType::Boolean => matches!(lit_type, LitType::Boolean),
                        _ => false,
                    }
                }) {
                    let (range, _) = literals.remove(pos);
                    all_mappings.push((range, param.name.1.clone()));
                }
            }
        }
    }


    all_mappings.sort_by(|a, b| b.0.start.cmp(&a.0.start));
    let mut final_code = purified_code.clone();
    for (range, name) in all_mappings {
        final_code.replace_range(range, &name);
    }


    let final_content = write_to_temp_file(vec![&final_code]);
    let final_source = HelixParser::parse_source(&final_content)
        .map_err(|e| format!("Failed to reconstruct processed HQL: {}", e))?;


    let mut target_file_content = if queries_path.exists() {
        fs::read_to_string(&queries_path)
            .map_err(|e| format!("Failed to read queries.hx: {}", e))?
    } else {
        log(&mut logs, ">>> [Sync] Creating new queries.hx file");
        if let Some(parent) = queries_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        String::new()
    };


    let temp_target = write_to_temp_file(vec![&target_file_content]);
    let existing_source = if !target_file_content.trim().is_empty() {
        match HelixParser::parse_source(&temp_target) {
            Ok(src) => Some(src),
            Err(e) => {
                log(&mut logs, &format!(">>> [Sync] Warning: Failed to parse existing queries.hx: {}. This usually means there are syntax errors or duplicate query names in the file.", e));
                None
            }
        }
    } else {
        None
    };


    let sync_marker = "// Synced from Helix Explorer";
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    
    #[derive(Debug, Clone)]
    struct Change {
        start: usize,
        end: usize,
        content: String,
    }
    let mut replacements = Vec::new();
    let mut appends = Vec::new();
    let mut pending_items = Vec::new();

    log(&mut logs, &format!(">>> [Sync] Parser found {} queries in final editor code", final_source.queries.len()));

    for query in final_source.queries.iter() {
        let query_name = &query.name;
        // Extract the specific body for this query
        let query_body: String = final_code[query.loc.byte_range()].trim().to_string();
        
        let snippet_with_marker = format!("{} at {}\n{}\n\n", sync_marker, timestamp, query_body);

        let mut matched = false;
        if let Some(ref source) = existing_source {
            if let Some(existing_query) = source.queries.iter().find(|q| q.name == *query_name) {
                let range = existing_query.loc.byte_range();
                let mut start_idx = range.start;
                let mut end_idx = range.end;

                log(&mut logs, &format!(">>> [Sync] Matching query '{}' in file at byte range {:?}.", query_name, range));


                let old_code = target_file_content[range.clone()].to_string();


                let prefix = &target_file_content[..start_idx];
                if let Some(pos) = prefix.rfind(sync_marker) {
                    let marker_to_query = &prefix[pos..];
                    if marker_to_query.lines().count() <= 3 {
                        start_idx = pos;
                    }
                }


                let suffix = &target_file_content[end_idx..];
                let mut consumed = 0;
                for c in suffix.chars() {
                    if c.is_whitespace() {
                        consumed += c.len_utf8();
                        if c == '\n' { 
                             let after_nl = &suffix[consumed..];
                            if after_nl.trim_start().starts_with(sync_marker) || after_nl.trim_start().starts_with("QUERY") {
                                break; 
                            }
                        }
                    } else if c == '8' || c == ';' { 
                        consumed += c.len_utf8();
                    } else {
                        break;
                    }
                }
                end_idx += consumed;

                if !force {
                    pending_items.push(PendingSyncItem {
                        query_name: query_name.clone(),
                        old_code,
                        new_code: query_body.clone(),
                        sync_type: "CONFLICT".to_string(),
                    });
                } else {
                    replacements.push(Change {
                        start: start_idx,
                        end: end_idx,
                        content: String::new(), // Delete old
                    });
                    appends.push(snippet_with_marker.clone()); // Append new
                }
                matched = true;
            }
        }

        if !matched {
            appends.push(snippet_with_marker);
        }
    }

    // If there are any pending items and we are not forcing, return the collection
    if !force && !pending_items.is_empty() {
        log(&mut logs, &format!(">>> [Sync] Found {} items needing confirmation.", pending_items.len()));
        return Ok(SyncResponse::Pending(pending_items));
    }


    if !replacements.is_empty() {
        replacements.sort_by_key(|r| r.start);
        let mut merged: Vec<Change> = Vec::new();
        let mut current = replacements[0].clone();

        for next in replacements.iter().skip(1) {
            if next.start < current.end {
                // Overlap: merge
                current.end = std::cmp::max(current.end, next.end);
            } else {
                merged.push(current);
                current = next.clone();
            }
        }
        merged.push(current);
        replacements = merged;
    }

    replacements.sort_by(|a, b| b.start.cmp(&a.start));
    for change in replacements {
        target_file_content.replace_range(change.start..change.end, &change.content);
    }


    for snippet in appends {
        if !target_file_content.is_empty() {
             // Ensure at least one newline exists if not empty
            if !target_file_content.ends_with('\n') {
                target_file_content.push('\n');
            }
            // Ensure double newline separation
            if !target_file_content.ends_with("\n\n") {
                target_file_content.push('\n');
            }
        }
        target_file_content.push_str(&snippet);
    }

    fs::write(&queries_path, target_file_content).map_err(|e| e.to_string())?;
    log(&mut logs, ">>> [Sync] File write successful. (Logic: Individual Timestamps)");
    
    Ok(SyncResponse::Success(logs))
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct Diagnostic {
    pub from: usize,
    pub to: usize,
    pub severity: String,
    pub message: String,
}

fn map_custom_error(code_snippet: &str, original_error: &str) -> Option<String> {
    let trimmed = code_snippet.trim();
    
    // Rule 1: Direct negation of traversal (!_)
    if trimmed.contains("!_") && original_message_contains(original_error, "expected anonymous_traversal") {
        return Some("Direct negation of traversal is not supported by the DB. Use !AND(...) or !EXISTS(...) instead.".to_string());
    }

    None
}

fn original_message_contains(original: &str, pattern: &str) -> bool {
    original.contains(pattern)
}

#[tauri::command]
pub async fn validate_hql(code: String) -> Result<Vec<Diagnostic>, String> {
    let code = hql_processor::preprocess_hql(&code);
    let content = write_to_temp_file(vec![&code]);
    

    match HelixParser::parse_source(&content) {
        Ok(_) => Ok(vec![]),
        Err(e) => {
            let e_str = format!("{:?}", e);
            let mut diagnostics = Vec::new();
            

            let re = regex::Regex::new(r"-->\s+(\d+):(\d+)").unwrap();
            
            if let Some(caps) = re.captures(&e_str) {
                let line_one_based: usize = caps[1].parse().unwrap_or(0);

                
                if line_one_based > 0 {
                     let lines: Vec<&str> = code.split('\n').collect();
                     if line_one_based <= lines.len() {
                         let mut start_offset = 0;
                         for i in 0..(line_one_based - 1) {
                             start_offset += lines[i].len() + 1; // +1 for newline
                         }
                         let line_len = lines[line_one_based - 1].len();
                         
                         let original_message = format!("Syntax Error: {}", e);
                         let custom_message = map_custom_error(&lines[line_one_based - 1], &original_message)
                            .unwrap_or(original_message);
                         
                         diagnostics.push(Diagnostic {
                             from: start_offset,
                             to: start_offset + line_len,
                             severity: "error".to_string(),
                             message: custom_message,
                         });
                     }
                }
            } else {

                 diagnostics.push(Diagnostic {
                     from: 0,
                     to: code.len(),
                     severity: "error".to_string(),
                     message: format!("Syntax Error: {}", e),
                 });
            }
            
            Ok(diagnostics)
        }
    }
}


#[derive(serde::Serialize, Clone)]
pub struct CompletionItem {
    pub label: String,
    pub kind: String, // "keyword", "function", "type", "variable", "class", "interface", "namespace"
    pub detail: Option<String>,
}

#[derive(serde::Deserialize, Clone, Debug)]
pub struct SchemaSummary {
    pub nodes: Vec<SchemaItem>,
    pub edges: Vec<SchemaItem>,
    pub vectors: Vec<SchemaItem>,
}

#[derive(serde::Deserialize, Clone, Debug)]
pub struct SchemaItem {
    pub name: String,
}

#[tauri::command]
pub fn get_hql_completion(code: String, cursor: usize, schema: Option<SchemaSummary>) -> Vec<CompletionItem> {
    let keywords = vec![
        "QUERY", "MIGRATION", "RETURN", "UPDATE", "DROP", "FOR", "IN", "AS", 
        "DEFAULT", "UNIQUE", "INDEX", "EXISTS", "NOW", "NONE", "Properties"
    ];
    
    let traversals = vec![
        "N", "E", "V", 
        "Out", "In", "OutE", "InE", "FromN", "ToN", "FromV", "ToV",
        "ShortestPath", "ShortestPathDijkstras", "ShortestPathBFS", "ShortestPathAStar",
        "PREFILTER", "RerankRRF", "RerankMMR", "Embed",
        "AddN", "AddE", "AddV", "BatchAddV", "UpsertN", "UpsertE", "UpsertV",
        "WHERE", "ORDER", "RANGE", "COUNT", "FIRST", "AGGREGATE_BY", "GROUP_BY", "ID",
        "AND", "OR", "GT", "GTE", "LT", "LTE", "EQ", "NEQ", "IS_IN", "CONTAINS",
        "Asc", "Desc"
    ];

    let types = vec![
        "String", "Boolean", "F32", "F64", "I8", "I16", "I32", "I64", 
        "U8", "U16", "U32", "U64", "U128", "ID", "Date"
    ];

    let math_funcs = vec![
        "ADD", "SUB", "MUL", "DIV", "POW", "MOD", "ABS", "SQRT", "LN", "LOG10", 
        "LOG", "EXP", "CEIL", "FLOOR", "ROUND", "SIN", "COS", "TAN", 
        "ASIN", "ACOS", "ATAN", "ATAN2", "PI", "MIN", "MAX", "SUM", "AVG"
    ];

    let prefix = if cursor <= code.len() {
        &code[..cursor]
    } else {
        &code
    };
    let trimmed_prefix = prefix.trim_end();
    
    // Helper to extract schema items
    let mut schema_nodes = Vec::new();
    let mut schema_edges = Vec::new();
    let mut schema_vectors = Vec::new();

    if let Some(s) = schema {
        for n in s.nodes {
            schema_nodes.push(CompletionItem {
                label: n.name,
                kind: "class".to_string(), // Node -> class color
                detail: Some("Node".to_string()),
            });
        }
        for e in s.edges {
            schema_edges.push(CompletionItem {
                label: e.name,
                kind: "interface".to_string(), // Edge -> interface color
                detail: Some("Edge".to_string()),
            });
        }
        for v in s.vectors {
            schema_vectors.push(CompletionItem {
                label: v.name,
                kind: "namespace".to_string(), // Vector -> namespace color
                detail: Some("Vector".to_string()),
            });
        }
    }

    // Context Detection Logic
    
    // 1. Inside Search Generics: SearchV<| or SearchBM25<|
    // Regex to check if we are inside <...> of a Search function
    // We look for "Search(V|BM25)\s*<\s*$"
    let re_search_generic = regex::Regex::new(r"Search(V|BM25)\s*<\s*$").unwrap();
    if re_search_generic.is_match(trimmed_prefix) {
        // Suggest Nodes (most common) and maybe Vectors/Edges depending on context
        // Usually Search operations return Nodes
        return schema_nodes;
    }

    // 2. Type Hinting (::) or Casting
    if trimmed_prefix.ends_with("::") {
        let mut items: Vec<CompletionItem> = types.into_iter().map(|t| CompletionItem {
            label: t.to_string(),
            kind: "type".to_string(),
            detail: Some("Type".to_string()),
        }).collect();
        // Also suggest Nodes (for casting like ::User)
        items.extend(schema_nodes.clone());
        return items;
    }
    
    // 3. Traversal Start: N(| or E(| or V(|
    let re_traversal_start = regex::Regex::new(r"(N|E|V|AddN|AddE|AddV|UpsertN|UpsertE|UpsertV)\s*\(\s*$").unwrap();
    if re_traversal_start.is_match(trimmed_prefix) {
         // Suggest schema items appropriate for the traversal
         // For simplicity, suggest all schema items (Nodes, Edges, Vectors)
         let mut items = Vec::new();
         items.extend(schema_nodes.clone());
         items.extend(schema_edges.clone());
         items.extend(schema_vectors.clone());
         return items;
    }
    
    // Default: Suggest everything
    let mut items = Vec::new();

    // Add Keywords
    for k in keywords {
        items.push(CompletionItem {
            label: k.to_string(),
            kind: "keyword".to_string(),
            detail: None,
        });
    }

    // Add Traversals
    for t in traversals {
        items.push(CompletionItem {
            label: t.to_string(),
            kind: "function".to_string(),
            detail: Some("Traversal".to_string()),
        });
    }

    // Add Search Functions
    items.push(CompletionItem {
        label: "SearchBM25".to_string(),
        kind: "function".to_string(),
        detail: Some("SearchBM25<T>(query, limit)".to_string()),
    });
    items.push(CompletionItem {
        label: "SearchV".to_string(),
        kind: "function".to_string(),
        detail: Some("SearchV<T>(vector, k)".to_string()),
    });

    // Add Math
    for m in math_funcs {
        items.push(CompletionItem {
            label: m.to_string(),
            kind: "function".to_string(),
            detail: Some("Math".to_string()),
        });
    }

    // Add Types
    for t in types {
        items.push(CompletionItem {
            label: t.to_string(),
            kind: "type".to_string(),
            detail: None,
        });
    }

    // Add Schema Items
    items.extend(schema_nodes);
    items.extend(schema_edges);
    items.extend(schema_vectors);

    items
}

#[tauri::command]
pub fn format_hql(code: String) -> Result<String, String> {
    let mut processed = String::new();
    let mut iter = code.chars().peekable();
    let mut in_string = false;
    let mut quote_char = ' ';
    let mut escaped = false;
    let mut expand_stack = Vec::new();
    let mut tight_stack = Vec::new();

    while let Some(c) = iter.next() {
        if in_string {
            processed.push(c);
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == quote_char {
                in_string = false;
            }
            continue;
        }

        if c == '"' || c == '\'' || c == '`' {
            in_string = true;
            quote_char = c;
            processed.push(c);
            continue;
        }

        if c == '/' && iter.peek() == Some(&'/') {
            processed.push(c);
            processed.push(iter.next().unwrap());
            while let Some(&nc) = iter.peek() {
                if nc == '\n' { break; }
                processed.push(iter.next().unwrap());
            }
            continue;
        }
        if c == '#' {
            processed.push(c);
            while let Some(&nc) = iter.peek() {
                if nc == '\n' { break; }
                processed.push(iter.next().unwrap());
            }
            continue;
        }

        match c {
            '=' => {
                if iter.peek() == Some(&'>') {
                    iter.next(); // consume '>'
                    while processed.ends_with(' ') { processed.pop(); }
                    processed.push_str(" =>");
                    
                    let mut look = iter.clone();
                    let mut follows_brace = false;
                    while let Some(nc) = look.next() {
                        if nc == '{' { follows_brace = true; break; }
                        if !nc.is_whitespace() { break; }
                    }
                    if !follows_brace {
                        processed.push('\n');
                    } else {
                        processed.push(' ');
                    }
                } else {
                    processed.push(c);
                }
            }
            '{' | '(' | '[' => {
                while processed.ends_with(' ') { processed.pop(); }
                
                let mut look = iter.clone();
                let mut next_non_ws = ' ';
                while let Some(nc) = look.next() {
                    if !nc.is_whitespace() {
                         next_non_ws = nc;
                         break;
                    }
                }
                
                let mut look_content = iter.clone();
                let mut content_len = 0;
                let mut has_local_newline = false;
                let mut nesting = 0;
                let open_char = c;
                let close_char = match c {
                    '{' => '}',
                    '(' => ')',
                    '[' => ']',
                    _ => unreachable!(),
                };
                
                loop {
                    match look_content.next() {
                        Some(cc) if cc == close_char && nesting == 0 => break,
                        Some(cc) if cc == open_char => { nesting += 1; content_len += 2; }
                        Some(cc) if cc == close_char => { nesting -= 1; content_len += 2; }
                        Some('\n') => {
                            if nesting == 0 { has_local_newline = true; }
                        }
                        Some('/') if look_content.peek() == Some(&'/') => { 
                            if nesting == 0 { has_local_newline = true; }
                            break; 
                        }
                        Some(_) => {
                            content_len += 1;
                            if content_len > 120 { break; }
                        }
                        None => break,
                    }
                }
                
                let p_trimmed = processed.trim_end();
                let is_traversal = p_trimmed.ends_with('N') || p_trimmed.ends_with('E') || p_trimmed.ends_with('>') || p_trimmed.ends_with(':') || p_trimmed.ends_with("WHERE") || p_trimmed.ends_with("AND") || p_trimmed.ends_with("OR") || p_trimmed.ends_with("NOT") || p_trimmed.ends_with("EQ") || p_trimmed.ends_with("GT") || p_trimmed.ends_with("LT");
                let is_query_params = c == '(' && expand_stack.is_empty() && !is_traversal && !p_trimmed.is_empty();
                
                let is_block_keyword = p_trimmed.ends_with("WHERE") || p_trimmed.ends_with("UPDATE") || p_trimmed.ends_with("MIGRATION") || p_trimmed.ends_with("THEN") || p_trimmed.ends_with("ELSE") || p_trimmed.ends_with("=>");
                let is_query_body = c == '{' && is_block_keyword;
                
                let is_property_escape = c == '{' && p_trimmed.ends_with("::");
                let should_expand = !is_property_escape && (is_query_body || (has_local_newline && content_len > 40) || (c == '{' && content_len > 40));
                
                if !processed.is_empty() && !processed.ends_with('\n') && !processed.ends_with(' ')
                   && !processed.ends_with('(') && !processed.ends_with('[') && !processed.ends_with('{') && !processed.ends_with('<') && !processed.ends_with("::") {
                    if c == '{' || c == '[' || is_query_params {
                        processed.push(' ');
                    }
                }
                
                processed.push(c);
                expand_stack.push(should_expand);
                tight_stack.push(is_property_escape);

                if should_expand {
                    if (c == '(' || c == '[') && next_non_ws == '{' {
                        // Don't push newline if we are starting a ({ or [{ joint
                    } else {
                        processed.push('\n');
                    }
                } else if c == '{' && !is_property_escape {
                    processed.push(' ');
                }
            }
            '}' | ')' | ']' => {
                while processed.ends_with(' ') { processed.pop(); }
                let is_tight = tight_stack.pop().unwrap_or(false);
                if let Some(should_expand) = expand_stack.pop() {
                    if should_expand {
                        if !processed.ends_with('\n') {
                             if (c == ')' || c == ']') && processed.ends_with('}') {
                                 // Close block )} or ]} joint - no newline
                             } else {
                                 processed.push('\n');
                             }
                        }
                        processed.push(c);
                        
                        let mut keep_on_line = false;
                        let mut look_ahead = iter.clone();
                        while let Some(nc) = look_ahead.next() {
                            if nc == ')' || nc == ',' || nc == ']' || nc == ';' || nc == '.' || nc == ':' || nc == '>' || nc == '=' {
                                keep_on_line = true;
                                break;
                            }
                            if !nc.is_whitespace() { break; }
                        }
                        
                        if !keep_on_line {
                            processed.push('\n');
                        }
                    } else {
                        if c == '}' && !processed.ends_with('{') && !is_tight {
                             processed.push(' ');
                        }
                        processed.push(c);
                    }
                } else {
                    processed.push(c);
                }
            }
            ',' => {
                processed.push(',');
                if expand_stack.last() == Some(&true) {
                    processed.push('\n');
                } else {
                    processed.push(' ');
                }
            }
            ':' => {
                processed.push(':');
                if iter.peek() == Some(&':') {
                    processed.push(iter.next().unwrap());
                } else {
                    processed.push(' ');
                }
            }
            ';' => {
                processed.push(';');
                processed.push('\n');
            }
            '\n' => {
                let mut look = iter.clone();
                let mut next_non_ws = ' ';
                while let Some(nc) = look.next() {
                    if !nc.is_whitespace() {
                         next_non_ws = nc;
                         break;
                    }
                }
                
                if ((processed.ends_with('(') || processed.ends_with('[')) && next_non_ws == '{') || (processed.ends_with('}') && (next_non_ws == ')' || next_non_ws == ']')) {
                    // Skip newline for joints
                } else if !processed.ends_with('\n') && !processed.is_empty() {
                    processed.push('\n');
                }
            }
            _ => {
                if c.is_whitespace() {
                    if !processed.is_empty() && !processed.ends_with('\n') && !processed.ends_with(' ') {
                        processed.push(' ');
                    }
                } else {
                    processed.push(c);
                }
            }
        }
    }

    Ok(format_hql_lines(processed))
}

fn format_hql_lines(code: String) -> String {
    let mut output: Vec<String> = Vec::new();
    let lines = code.lines();
    let mut indent_level = 0;
    let indent_str = "    ";
    let mut comment_buffer: Vec<String> = Vec::new();

    for line in lines {
        let trimmed = line.trim();
        
        if trimmed.is_empty() {
             comment_buffer.push(String::new());
             continue;
        }

        if trimmed.starts_with("//") || trimmed.starts_with("#") {
            comment_buffer.push(trimmed.to_string());
            continue;
        }

        // Adjust indent based on content (Dedent)
        if trimmed.starts_with('}') || trimmed.starts_with(']') || trimmed.starts_with(')') {
            if indent_level > 0 { indent_level -= 1; }
        }
        
        // Check for top-level keywords that reset indentation
        if trimmed.starts_with("QUERY") || trimmed.starts_with("MIGRATION") {
            indent_level = 0;
            
            // Ensure empty line before new block (if not already buffered)
            let has_buffered_newline = comment_buffer.first().map(|s| s.is_empty()).unwrap_or(false);
            
            if !has_buffered_newline {
                let needs_newline = if let Some(last) = output.last() {
                    !last.is_empty()
                } else {
                    false
                };
                
                if needs_newline {
                    output.push(String::new());
                }
            }
        }
        
        // Flush Buffer with current indent
        let current_indent = indent_str.repeat(indent_level);
        for comment in comment_buffer.drain(..) {
            if comment.is_empty() {
                output.push(String::new());
            } else {
                output.push(format!("{}{}", current_indent, comment));
            }
        }

        // Print Current Line
        output.push(format!("{}{}", current_indent, trimmed));

        // Increase indent if line ends with opening bracket or `=>`
        // Ignore trailing comments for this check
        let effective_code = if let Some(idx) = trimmed.find("//") {
            &trimmed[..idx]
        } else if let Some(idx) = trimmed.find('#') {
            &trimmed[..idx]
        } else {
            trimmed
        }.trim();

        if effective_code.ends_with('{') || effective_code.ends_with('[') || effective_code.ends_with('(') || effective_code.ends_with("=>") {
            indent_level += 1;
        }
    }
    
    // Flush remaining comments (e.g. at end of file)
    let current_indent = indent_str.repeat(indent_level);
    for comment in comment_buffer {
        if comment.is_empty() {
            output.push(String::new());
        } else {
             output.push(format!("{}{}", current_indent, comment));
        }
    }
    
    output.join("\n").trim().to_string()
}
