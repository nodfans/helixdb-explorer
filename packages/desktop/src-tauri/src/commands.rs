use std::io::{self, Write};
use tauri::Manager;
use std::fs;
use std::collections::HashSet;
use helix_db::helixc::parser::{HelixParser, write_to_temp_file};
use helix_db::helixc::parser::types::{
    Statement, StatementType, Expression, ExpressionType, Query, FieldType, Traversal, StartNode, StepType, ReturnType,
    ValueType, IdType, FieldValue, FieldValueType
};
use helix_db::protocol::value::Value;
use crate::hql_translator::{map_traversal_to_tools, FinalAction};

#[tauri::command]
pub fn log_to_terminal(message: String) {
    println!("{}", message);
    let _ = io::stdout().flush();
}

#[tauri::command]
pub fn terminate_app() {
    std::process::exit(0);
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

    let resp = req.send().map_err(|e| {
        format!("Request error: {}", e)
    })?;

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
        .map_err(|e| format!("Request failed: {}", e))?;

    if resp.status().is_success() {
        let json = resp.json::<serde_json::Value>()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        Ok(json)
    } else {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_default();
        Err(format!("Server error ({}): {}", status, err_text))
    }
}

#[tauri::command]
pub async fn execute_dynamic_hql(url: String, code: String) -> Result<serde_json::Value, String> {
    // 1. Parsing Strategy
    // Function to try parsing source, returning the Source AST if successful
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

    // 2. Extract Traversal from AST
    if source.queries.len() > 1 {
        return Err("Multiple queries detected in editor. Please select a specific query to execute, or ensure only one query exists.".to_string());
    }
    
    let query = source.queries.first().ok_or_else(|| "No query found in parsed source".to_string())?;
    
    // Find the first statement that is a traversal (either direct or via assignment)
    let mut traversal = None;
    
    for stmt in &query.statements {
        match &stmt.statement {
            StatementType::Expression(expr) => {
                match &expr.expr {
                    ExpressionType::Traversal(t) => {
                        traversal = Some(TraversalType::Normal(&**t));
                        break; 
                    },
                    ExpressionType::BM25Search(bm25) => {
                        traversal = Some(TraversalType::BM25(bm25));
                        break;
                    },
                    _ => {}
                }
            },
            StatementType::Assignment(assign) => {
                match &assign.value.expr {
                     ExpressionType::Traversal(t) => {
                        traversal = Some(TraversalType::Normal(&**t));
                        break;
                    },
                    ExpressionType::BM25Search(bm25) => {
                        traversal = Some(TraversalType::BM25(bm25));
                        break;
                    },
                    _ => {}
                }
            },
            _ => {}
        }
    }

    enum TraversalType<'a> {
        Normal(&'a helix_db::helixc::parser::types::Traversal),
        BM25(&'a helix_db::helixc::parser::types::BM25Search),
    }

    let traversal = traversal.ok_or_else(|| "No executable traversal found. Dynamic HQL supports direct Traversals (e.g. 'N<User>.out(...)') or Assignments (e.g. 'users = N<User>...').".to_string())?;

    // 3. Map AST to MCP Tools
    let (tools, client_filter, final_action) = match traversal {
        TraversalType::Normal(t) => map_traversal_to_tools(t)?,
        TraversalType::BM25(bm25) => {
            (
                vec![crate::hql_translator::map_bm25_to_tool(bm25)?], 
                crate::hql_translator::ClientSideFilter::default(), 
                crate::hql_translator::FinalAction::Collect { range: None }
            )
        }
    };

    // 4. Execute via MCP HTTP API
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;

    // Step A: Init connection
    let init_resp = client.post(format!("{}/mcp/init", url))
        .send()
        .await
        .map_err(|e| format!("Init failed: {}", e))?;
    
    if !init_resp.status().is_success() {
        let status = init_resp.status();
        let err_text = init_resp.text().await.unwrap_or_default();
        return Err(format!("Init request failed ({}): {}", status, err_text));
    }

    let init_body = init_resp.text().await.map_err(|e| format!("Failed to read init body: {}", e))?;
    let connection_id: String = serde_json::from_str(&init_body)
        .map_err(|e| format!("Failed to parse connection_id from '{}': {}", init_body, e))?;

    // Step B: Tool calls with Intelligent Routing
    let mut tool_iter = tools.iter().enumerate().peekable();
    
    while let Some((i, tool)) = tool_iter.next() {
        use crate::mcp_protocol::ToolArgs;
        
        let is_search = matches!(tool, ToolArgs::SearchKeyword { .. } | ToolArgs::SearchVec { .. } | ToolArgs::SearchVecText { .. });
        
        if is_search {
            if i > 0 {
                return Err("Search operations (SearchBM25, SearchV) can only be used at the start of a query in dynamic HQL.".to_string());
            }
            if tool_iter.peek().is_some() {
                 return Err("Chained search (search followed by other steps) is not yet supported in dynamic HQL. Please use a Synced Query (#[mcp]) for complex search pipelines.".to_string());
            }

            // Route to specialized endpoint
            let (endpoint, body) = match tool {
                ToolArgs::SearchKeyword { query, limit, label } => (
                    "search_keyword",
                    serde_json::json!({
                        "connection_id": connection_id,
                        "data": { "query": query, "limit": limit, "label": label }
                    })
                ),
                ToolArgs::SearchVec { vector, k, min_score, cutoff } => (
                    "search_vector",
                    serde_json::json!({
                        "connection_id": connection_id,
                        "data": { "vector": vector, "k": k, "min_score": min_score, "cutoff": cutoff }
                    })
                ),
                ToolArgs::SearchVecText { query, label, k } => (
                    "search_vector_text",
                    serde_json::json!({
                        "connection_id": connection_id,
                        "data": { "query": query, "label": label, "k": k }
                    })
                ),
                _ => unreachable!(),
            };

            let tool_resp = client.post(format!("{}/mcp/{}", url, endpoint))
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Search call failed: {}", e))?;
            
            if !tool_resp.status().is_success() {
                let status = tool_resp.status();
                let err_text = tool_resp.text().await.unwrap_or_default();
                return Err(format!("Search error ({}): {}", status, err_text));
            }
        } else {
            // Generic tool call
            let tool_resp = client.post(format!("{}/mcp/tool_call", url))
                .json(&serde_json::json!({
                    "connection_id": connection_id,
                    "tool": tool
                }))
                .send()
                .await
                .map_err(|e| format!("Tool call failed: {}", e))?;
            
            if !tool_resp.status().is_success() {
                let status = tool_resp.status();
                let err_text = tool_resp.text().await.unwrap_or_default();
                return Err(format!("Tool call error ({}): {}", status, err_text));
            }
        }
    }

    // Step C: Execute Final Action (Collect, Aggregate, or GroupBy)
    let final_resp = match final_action {
        FinalAction::Collect { range } => {
             let range_json = if let Some((start, end)) = range {
                 if let Some(e) = end {
                    serde_json::json!({ "start": start, "end": e })
                 } else {
                    serde_json::json!({ "start": start })
                 }
             } else {
                 serde_json::json!(null)
             };

             client.post(format!("{}/mcp/collect", url))
                .json(&serde_json::json!({
                    "connection_id": connection_id,
                    "range": range_json,
                    "drop": true
                }))
                .send()
                .await
                .map_err(|e| format!("Collect failed: {}", e))?
        },
        FinalAction::Count => {
             client.post(format!("{}/mcp/aggregate_by", url))
                .json(&serde_json::json!({
                    "connection_id": connection_id,
                    "properties": Vec::<String>::new(),
                    "drop": true
                }))
                .send()
                .await
                .map_err(|e| format!("Count failed: {}", e))?
        },
        FinalAction::Aggregate { properties } => {
             client.post(format!("{}/mcp/aggregate_by", url))
                .json(&serde_json::json!({
                    "connection_id": connection_id,
                    "properties": properties,
                    "drop": true
                }))
                .send()
                .await
                .map_err(|e| format!("Aggregate failed: {}", e))?
        },
        FinalAction::GroupBy { properties } => {
             client.post(format!("{}/mcp/group_by", url))
                .json(&serde_json::json!({
                    "connection_id": connection_id,
                    "properties": properties,
                    "drop": true
                }))
                .send()
                .await
                .map_err(|e| format!("GroupBy failed: {}", e))?
        },
    };

    if final_resp.status().is_success() {
        let results: serde_json::Value = final_resp.json()
            .await
            .map_err(|e| format!("Failed to parse results: {}", e))?;
        // 5. Client-Side Post-Processing
        let mut final_results = results;
        if let Some(ids) = client_filter.id_filter {
             if let Some(arr) = final_results.as_array() {
                 let filtered: Vec<serde_json::Value> = arr.iter().filter(|item| {
                     if let Some(id_val) = item.get("id") {
                         if let Some(id_str) = id_val.as_str() {
                             return ids.contains(&id_str.to_string());
                         }
                     }
                     false
                 }).cloned().collect();
                 final_results = serde_json::Value::Array(filtered);
             }
        }
        Ok(final_results)
    } else {
        let status = final_resp.status();
        let err_text = final_resp.text().await.unwrap_or_default();
        Err(format!("Query execution error ({}): {}", status, err_text))
    }
}

fn get_config_path() -> Result<std::path::PathBuf, String> {
    let home_dir = dirs::home_dir().ok_or_else(|| "Could not find home directory".to_string())?;
    let config_dir = home_dir.join(".helix-explorer");
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }
    Ok(config_dir.join("connections.json"))
}

#[tauri::command]
pub fn load_connection_config(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    // 1. Cleanup old config if it exists
    if let Ok(old_config_dir) = app.path().app_config_dir() {
        let old_path = old_config_dir.join("connections.json");
        if old_path.exists() {
            let _ = fs::remove_file(&old_path);
            println!("Deleted old config file at {:?}", old_path);
        }
    }

    // 2. Load from new path
    let path = get_config_path()?;

    if !path.exists() {
        return Ok(serde_json::json!({
            "connections": [],
            "activeConnectionId": null
        }));
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
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
        let (used_ids, mut literals) = collect_dwim_info(query);
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

#[tauri::command]
pub fn detect_workspace_path() -> Result<String, String> {
    use std::process::Command;
    
    // 1. Check if docker is available
    let docker_check = Command::new("docker")
        .arg("--version")
        .output()
        .map_err(|_| "Docker executable not found. Please ensure Docker is installed and in your PATH.".to_string())?;
        
    if !docker_check.status.success() {
        return Err("Docker is not running or not accessible.".to_string());
    }

    // 2. List all running container IDs
    let ps_output = Command::new("docker")
        .args(&["ps", "-q"])
        .output()
        .map_err(|e| format!("Failed to run docker ps: {}", e))?;

    let ids_str = String::from_utf8_lossy(&ps_output.stdout);
    let ids: Vec<&str> = ids_str.lines().collect();

    if ids.is_empty() {
        return Err("No running Docker containers found.".to_string());
    }

    // 3. Inspect all containers to find mounts
    let inspect_output = Command::new("docker")
        .arg("inspect")
        .args(&ids)
        .output()
        .map_err(|e| format!("Failed to run docker inspect: {}", e))?;

    let inspect_json: serde_json::Value = serde_json::from_slice(&inspect_output.stdout)
        .map_err(|e| format!("Failed to parse docker inspect output: {}", e))?;

    if let Some(containers) = inspect_json.as_array() {
        for container in containers {
            if let Some(mounts) = container.get("Mounts").and_then(|m| m.as_array()) {
                for mount in mounts {
                    // Check for Bind mounts
                    let is_bind = mount.get("Type")
                        .and_then(|t| t.as_str())
                        .map(|t| t == "bind")
                        .unwrap_or(false);

                    if is_bind {
                        if let Some(source) = mount.get("Source").and_then(|s| s.as_str()) {
                            let mut current_path = std::path::Path::new(source);
                            
                            // Traverse up the directory tree to find helix.toml
                            loop {
                                let config_path = current_path.join("helix.toml");
                                if config_path.exists() {
                                    println!(">>> [Auto-Detect] Found helix.toml at: {:?}", config_path);
                                    return Ok(current_path.to_string_lossy().into_owned());
                                }
                                
                                match current_path.parent() {
                                    Some(parent) => current_path = parent,
                                    None => break,
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Err("Could not find any Docker container with a mounted workspace containing 'helix.toml'.".to_string())
}

#[tauri::command]
pub fn save_connection_config(_app: tauri::AppHandle, config: serde_json::Value) -> Result<(), String> {
    let path = get_config_path()?;
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

// --- Universal Purifier (DWIM) Helpers ---

#[derive(Debug, Clone, Copy)]
enum LitType {
    String,
    Number,
    Boolean,
}

fn collect_dwim_info(query: &Query) -> (HashSet<String>, Vec<(std::ops::Range<usize>, LitType)>) {
    let mut used_ids = HashSet::new();
    let mut literals = Vec::new();

    for stmt in &query.statements {
        walk_statement(stmt, &mut used_ids, &mut literals);
    }
    for ret in &query.return_values {
        walk_return_type(ret, &mut used_ids, &mut literals);
    }

    (used_ids, literals)
}

fn walk_statement(stmt: &Statement, used: &mut HashSet<String>, literals: &mut Vec<(std::ops::Range<usize>, LitType)>) {
    match &stmt.statement {
        StatementType::Assignment(a) => {
            walk_expression(&a.value, used, literals);
        }
        StatementType::Expression(e) => {
            walk_expression(e, used, literals);
        }
        StatementType::ForLoop(f) => {
            used.insert(f.in_variable.1.clone());
            for s in &f.statements {
                walk_statement(s, used, literals);
            }
        }
        _ => {}
    }
}

fn walk_expression(expr: &Expression, used: &mut HashSet<String>, literals: &mut Vec<(std::ops::Range<usize>, LitType)>) {
    match &expr.expr {
        ExpressionType::Identifier(id) => {
            used.insert(id.clone());
        }
        ExpressionType::StringLiteral(_) => {
            literals.push((expr.loc.byte_range(), LitType::String));
        }
        ExpressionType::IntegerLiteral(_) | ExpressionType::FloatLiteral(_) => {
            literals.push((expr.loc.byte_range(), LitType::Number));
        }
        ExpressionType::BooleanLiteral(_) => {
            literals.push((expr.loc.byte_range(), LitType::Boolean));
        }
        ExpressionType::Traversal(t) => {
            walk_traversal(t, used, literals);
        }
        ExpressionType::ArrayLiteral(exprs) | ExpressionType::And(exprs) | ExpressionType::Or(exprs) => {
            for e in exprs {
                walk_expression(e, used, literals);
            }
        }
        ExpressionType::Not(e) => {
            walk_expression(e, used, literals);
        }
        ExpressionType::MathFunctionCall(m) => {
            for e in &m.args {
                walk_expression(e, used, literals);
            }
        }
        _ => {}
    }
}

fn walk_traversal(t: &Traversal, used: &mut HashSet<String>, literals: &mut Vec<(std::ops::Range<usize>, LitType)>) {
    match &t.start {
        StartNode::Identifier(id) => {
            used.insert(id.clone());
        }
        StartNode::Node { ids, .. } | StartNode::Edge { ids, .. } | StartNode::Vector { ids, .. } => {
            if let Some(ids) = ids {
                for id in ids {
                    walk_id_type(id, used, literals);
                }
            }
        }
        _ => {}
    }
    for step in &t.steps {
        match &step.step {
            StepType::Where(e) => walk_expression(e, used, literals),
            StepType::OrderBy(o) => walk_expression(&o.expression, used, literals),
            StepType::Update(u) => {
                for f in &u.fields {
                    walk_field_value(&f.value, used, literals);
                }
            }
            StepType::Upsert(u) => {
                for f in &u.fields {
                    walk_field_value(&f.value, used, literals);
                }
            }
            StepType::UpsertN(u) => {
                for f in &u.fields {
                    walk_field_value(&f.value, used, literals);
                }
            }
            StepType::UpsertE(u) => {
                for f in &u.fields {
                    walk_field_value(&f.value, used, literals);
                }
                if let Some(fid) = &u.connection.from_id {
                    walk_id_type(fid, used, literals);
                }
                if let Some(tid) = &u.connection.to_id {
                    walk_id_type(tid, used, literals);
                }
            }
            StepType::UpsertV(u) => {
                for f in &u.fields {
                    walk_field_value(&f.value, used, literals);
                }
            }
            _ => {}
        }
    }
}

fn walk_field_value(fv: &FieldValue, used: &mut HashSet<String>, literals: &mut Vec<(std::ops::Range<usize>, LitType)>) {
    match &fv.value {
        FieldValueType::Traversal(t) => walk_traversal(t, used, literals),
        FieldValueType::Expression(e) => walk_expression(e, used, literals),
        FieldValueType::Fields(fields) => {
            for f in fields {
                walk_field_value(&f.value, used, literals);
            }
        }
        FieldValueType::Literal(v) => {
            match v {
                Value::String(_) => literals.push((fv.loc.byte_range(), LitType::String)),
                Value::Boolean(_) => literals.push((fv.loc.byte_range(), LitType::Boolean)),
                Value::I8(_) | Value::I16(_) | Value::I32(_) | Value::I64(_) |
                Value::U8(_) | Value::U16(_) | Value::U32(_) | Value::U64(_) | Value::U128(_) |
                Value::F32(_) | Value::F64(_) => literals.push((fv.loc.byte_range(), LitType::Number)),
                _ => {}
            }
        }
        FieldValueType::Identifier(id) => {
            used.insert(id.clone());
        }
        _ => {}
    }
}

fn walk_value_type(vt: &ValueType, used: &mut HashSet<String>, literals: &mut Vec<(std::ops::Range<usize>, LitType)>) {
    match vt {
        ValueType::Literal { value, loc } => {
            match value {
                Value::String(_) => literals.push((loc.byte_range(), LitType::String)),
                Value::Boolean(_) => literals.push((loc.byte_range(), LitType::Boolean)),
                Value::I8(_) | Value::I16(_) | Value::I32(_) | Value::I64(_) |
                Value::U8(_) | Value::U16(_) | Value::U32(_) | Value::U64(_) | Value::U128(_) |
                Value::F32(_) | Value::F64(_) => literals.push((loc.byte_range(), LitType::Number)),
                _ => {}
            }
        }
        ValueType::Identifier { value, .. } => {
            used.insert(value.clone());
        }
        ValueType::Object { fields, .. } => {
            for v in fields.values() {
                walk_value_type(v, used, literals);
            }
        }
    }
}

fn walk_id_type(it: &IdType, used: &mut HashSet<String>, literals: &mut Vec<(std::ops::Range<usize>, LitType)>) {
    match it {
        IdType::Literal { loc, .. } => {
            literals.push((loc.byte_range(), LitType::String));
        }
        IdType::Identifier { value, .. } => {
            used.insert(value.clone());
        }
        IdType::ByIndex { index, value, .. } => {
            walk_id_type(index, used, literals);
            walk_value_type(value, used, literals);
        }
    }
}

fn walk_return_type(ret: &ReturnType, used: &mut HashSet<String>, literals: &mut Vec<(std::ops::Range<usize>, LitType)>) {
    match ret {
        ReturnType::Expression(e) => walk_expression(e, used, literals),
        ReturnType::Array(rets) => {
            for r in rets {
                walk_return_type(r, used, literals);
            }
        }
        ReturnType::Object(map) => {
            for r in map.values() {
                walk_return_type(r, used, literals);
            }
        }
        _ => {}
    }
}


