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

#[tauri::command]
pub async fn execute_dynamic_hql(url: String, code: String, params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    // Helper: try parsing HQL source
    fn try_parse(code: &str) -> Result<helix_db::helixc::parser::types::Source, String> {
        let content = write_to_temp_file(vec![code]);
        HelixParser::parse_source(&content).map_err(|e| format!("{:?}", e))
    }

    // First try parsing as a full query/file
    let source = if code.trim().to_uppercase().starts_with("QUERY") {
        try_parse(&code).map_err(|e| format!("Failed to parse Query: {}", e))?
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

    // Extract context and RETURN statements
    if source.queries.len() > 1 {
        return Err("Multiple queries detected in editor. Please select a specific query to execute, or ensure only one query exists.".to_string());
    }
    
    let query = source.queries.first().ok_or_else(|| "No query found in parsed source".to_string())?;
    let mut params_val = params.unwrap_or(serde_json::json!({}));

    // Variable Context
    let mut variable_assignments = std::collections::HashMap::<String, &helix_db::helixc::parser::types::Traversal>::new();
    let mut return_vars = Vec::<String>::new();

    for stmt in &query.statements {
        match &stmt.statement {
            StatementType::Assignment(assign) => {
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
                    _ => {}
                }
            },
            StatementType::Expression(expr) => {
                // Bare traversal -> implicit return if no explicit RETURN exists
                if let ExpressionType::Traversal(t) = &expr.expr {
                     variable_assignments.insert("_implicit_".to_string(), &**t);
                }
            }
            _ => {}
        }
    }

    // Process explicit returns from AST
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
    } else if return_vars.is_empty() && !variable_assignments.is_empty() {
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

    // Execution Engine
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

    // MCP Pipeline Fallback
    let mut final_map = serde_json::Map::new();

    // Shuffle return variables to mimic server's random HashMap behavior
    {
        use rand::seq::SliceRandom;
        let mut rng = rand::thread_rng();
        return_vars.shuffle(&mut rng);
    }

    for var_name in return_vars {
        let traversal = match crate::hql_translator::resolve_traversal(&var_name, &variable_assignments)? {
            Some(t) => t,
            None => continue,
        };

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

        // Execute individual traversal pipeline
        let result = crate::hql_executor::execute_pipeline(&client, &url, &connection_id, &traversal, &params_val).await?;
        
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
        (\w+\s*:\s*[A-Za-z0-9_<>]+) # Capture param: Type
        \s*=\s*                     # Equals sign
        ('[^']*'|"[^"]*"|[\d\.]+|true|false) # Value
    "#).unwrap();
    let purified_code = re_purify.replace_all(&code, "$1").to_string();

    // 4. Parse incoming code to handle multiple queries
    let incoming_content = write_to_temp_file(vec![&purified_code]);
    let incoming_source = HelixParser::parse_source(&incoming_content)
        .map_err(|e| format!("Failed to parse incoming HQL: {}", e))?;
    
    if incoming_source.queries.is_empty() {
        return Err("No query found in provided HQL".to_string());
    }

    // 5. Check for internal duplicates in the batch
    let mut incoming_names = HashSet::new();
    for q in &incoming_source.queries {
        if !incoming_names.insert(&q.name) {
            return Err(format!("Duplicate query name found in selection/editor: '{}'", q.name));
        }
    }

    // 6. DWIM mapping for all queries
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

    // 7. Apply DWIM mapping replacements
    all_mappings.sort_by(|a, b| b.0.start.cmp(&a.0.start));
    let mut final_code = purified_code.clone();
    for (range, name) in all_mappings {
        final_code.replace_range(range, &name);
    }

    // 8. Re-parse the finalized code to extract individual query snippets for replacement
    let final_content = write_to_temp_file(vec![&final_code]);
    let final_source = HelixParser::parse_source(&final_content)
        .map_err(|e| format!("Failed to reconstruct processed HQL: {}", e))?;

    // 9. Load target file
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

    // 10. Load and parse target file once
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

    // 11. Plan changes
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
        
        // Final snippet: Lead with marker, end with DOUBLE newline for reliable separation
        // User requested INDIVIDUAL timestamps for everything.
        let snippet_with_marker = format!("{} at {}\n{}\n\n", sync_marker, timestamp, query_body);

        let mut matched = false;
        if let Some(ref source) = existing_source {
            if let Some(existing_query) = source.queries.iter().find(|q| q.name == *query_name) {
                let range = existing_query.loc.byte_range();
                let mut start_idx = range.start;
                let mut end_idx = range.end;

                log(&mut logs, &format!(">>> [Sync] Matching query '{}' in file at byte range {:?}.", query_name, range));

                // Capture old code for diff
                let old_code = target_file_content[range.clone()].to_string();

                // 1. Backtrack for marker
                // ... same logic ...
                let prefix = &target_file_content[..start_idx];
                if let Some(pos) = prefix.rfind(sync_marker) {
                    let marker_to_query = &prefix[pos..];
                    if marker_to_query.lines().count() <= 3 {
                        start_idx = pos;
                    }
                }

                // 2. Consume trailing whitespace/junk
                // ... same logic ...
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
                        // User requested to REMOVE "Blue Box" logic. Always treat as CONFLICT.
                        sync_type: "CONFLICT".to_string(),
                    });
                } else {
                    // FORCE UPDATE STRATEGY: 
                    // To preserve editor ordering, we DELETE the old query from its position
                    // and APPEND the new query to the end of the file.
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
            // Fix 1: Always append new queries, regardless of pending state
            appends.push(snippet_with_marker);
        }
    }

    // If there are any pending items and we are not forcing, return the collection
    if !force && !pending_items.is_empty() {
        log(&mut logs, &format!(">>> [Sync] Found {} items needing confirmation.", pending_items.len()));
        return Ok(SyncResponse::Pending(pending_items));
    }

    // 12. Apply Replacements (Bottom-Up)
    // Safe Merge: If force=true, all replacements are deletions (content="").
    // We can safely merge overlapping intervals.
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

    // 13. Apply Appends (Standard)
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
