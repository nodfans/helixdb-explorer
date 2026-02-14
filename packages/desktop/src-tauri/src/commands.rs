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
                    return Ok(normalize_value(json));
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
        let traversal = match resolve_traversal(&var_name, &variable_assignments)? {
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
        let result = execute_pipeline(&client, &url, &connection_id, &traversal, &params_val).await?;
        
        if var_name == "_implicit_" && final_map.is_empty() {
            return Ok(normalize_value(result)); // Single direct traversal return
        }
        
        final_map.insert(var_name, result);
    }

    if final_map.len() == 1 && final_map.contains_key("_implicit_") {
        return Ok(normalize_value(final_map.get("_implicit_").unwrap().clone()));
    }

    Ok(normalize_value(serde_json::Value::Object(final_map)))
}

// Helper: Normalize the result to match the clean format of compiled queries
// (Flattens "properties", ensures "id", removes internal metadata)
fn normalize_value(v: serde_json::Value) -> serde_json::Value {
    match v {
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.into_iter().map(normalize_value).collect())
        }
        serde_json::Value::Object(mut map) => {
            // Check if this looks like a Node/Edge with "properties"
            if let Some(serde_json::Value::Object(props)) = map.remove("properties") {
                // It's a Node/Edge structure. Flatten properties up.
                
                // Merge properties
                for (k, v) in props {
                    map.insert(k, v);
                }
            }
            
            // Remove internal fields if they exist and we want a clean view
            // We do this unconditionally to handle both raw (nested) and pre-flattened responses
            map.remove("out_edges");
            map.remove("in_edges");
            map.remove("vectors");
            map.remove("version");
            
            // Recursively normalize children
            for (_, v) in map.iter_mut() {
                *v = normalize_value(v.clone());
            }
            
            serde_json::Value::Object(map)
        }
        _ => v,
    }
}

fn resolve_traversal<'a>(
    name: &str, 
    assignments: &std::collections::HashMap<String, &'a helix_db::helixc::parser::types::Traversal>
) -> Result<Option<helix_db::helixc::parser::types::Traversal>, String> {
    let t = match assignments.get(name) {
        Some(t) => *t,
        None => return Ok(None),
    };

    let mut resolved = t.clone();

    // Recursive resolution if the traversal starts with an identifier
    if let StartNode::Identifier(id) = &resolved.start {
        if let Some(parent_t) = resolve_traversal(id, assignments)? {
            // Prepend parent steps to current steps
            let mut all_steps = parent_t.steps.clone();
            all_steps.extend(resolved.steps);
            resolved.start = parent_t.start;
            resolved.steps = all_steps;
        }
    }

    Ok(Some(resolved))
}

async fn execute_pipeline(
    client: &reqwest::Client,
    url: &str,
    connection_id: &str,
    traversal: &helix_db::helixc::parser::types::Traversal,
    params: &serde_json::Value
) -> Result<serde_json::Value, String> {
    use crate::hql_translator::{map_traversal_to_tools, FinalAction};
    use crate::mcp_protocol::{ToolArgs, FilterProperties, FilterTraversal, Operator};
    use helix_db::protocol::value::Value;
    
    // 1. Map to tools
    let (tools, final_action, id_filters) = map_traversal_to_tools(traversal, params)?;

    // Helper: send a single tool_call to the MCP server
    async fn send_tool(client: &reqwest::Client, url: &str, connection_id: &str, tool: &ToolArgs) -> Result<(), String> {
        let is_search = matches!(tool, ToolArgs::SearchKeyword { .. } | ToolArgs::SearchVec { .. } | ToolArgs::SearchVecText { .. });
        
        if is_search {
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
                .map_err(|e| map_reqwest_error(e, "Search call failed"))?;
            
            if !tool_resp.status().is_success() {
                let status = tool_resp.status();
                let err_text = tool_resp.text().await.unwrap_or_else(|_| String::new());
                return Err(format!("Search error ({}): {}", status, err_text));
            }
        } else {
            let tool_resp = client.post(format!("{}/mcp/tool_call", url))
                .json(&serde_json::json!({
                    "connection_id": connection_id,
                    "tool": tool
                }))
                .send()
                .await
                .map_err(|e| map_reqwest_error(e, "Tool call failed"))?;
            
            if !tool_resp.status().is_success() {
                let status = tool_resp.status();
                let err_text = tool_resp.text().await.unwrap_or_else(|_| String::new());
                return Err(format!("Tool call error ({}): {}", status, err_text));
            }
        }
        Ok(())
    }

    // Helper: collect results from the current pipeline
    async fn collect_results(client: &reqwest::Client, url: &str, connection_id: &str, range: Option<(usize, Option<usize>)>) -> Result<serde_json::Value, String> {
        let range_json = if let Some((start, end)) = range {
            if let Some(e) = end {
                serde_json::json!({ "start": start, "end": e })
            } else {
                serde_json::json!({ "start": start })
            }
        } else {
            serde_json::json!(null)
        };

        let resp = client.post(format!("{}/mcp/collect", url))
            .json(&serde_json::json!({
                "connection_id": connection_id,
                "range": range_json,
                "drop": true
            }))
            .send()
            .await
            .map_err(|e| map_reqwest_error(e, "Collect failed"))?;

        if resp.status().is_success() {
            resp.json().await.map_err(|e| format!("Failed to parse results: {}", e))
        } else {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_else(|_| String::new());
            Err(format!("Query execution error ({}): {}", status, err_text))
        }
    }

    // Helper: client-side filter a JSON array by ID
    fn filter_by_ids(value: &serde_json::Value, ids: &[String]) -> serde_json::Value {
        match value {
            serde_json::Value::Array(arr) => {
                let filtered: Vec<serde_json::Value> = arr.iter().filter(|item| {
                    if let Some(id_val) = item.get("id").and_then(|v| v.as_str()) {
                        ids.iter().any(|target_id| target_id == id_val)
                    } else {
                        false
                    }
                }).cloned().collect();
                serde_json::Value::Array(filtered)
            }
            _ => value.clone(),
        }
    }

    // 2. Determine execution strategy based on whether we have ID filters
    let has_subsequent_steps = tools.len() > 1; // More tools beyond the start NFromType/EFromType

    if !id_filters.is_empty() && has_subsequent_steps {
        // TWO-PASS EXECUTION for ID-filtered traversals with subsequent steps
        // Pass 1: Collect/filter by ID client-side.
        // Pass 2: Rebuild pipeline using property-based FilterItems for server processing.
        
        let start_tool = &tools[0];
        let remaining_tools = &tools[1..];

        // Pass 1: get the specific item(s) matched by ID
        send_tool(client, url, connection_id, start_tool).await?;
        let all_items = collect_results(client, url, connection_id, None).await?;
        let filtered = filter_by_ids(&all_items, &id_filters);

        // Extract properties from the first matched item to build a property-based filter
        let prop_filter = if let Some(item) = filtered.as_array().and_then(|a| a.first()) {
            if let serde_json::Value::Object(map) = item {
                // Build FilterProperties from all user-defined properties (skip id, label, version)
                let props: Vec<FilterProperties> = map.iter()
                    .filter(|(k, _)| *k != "id" && *k != "label" && *k != "version")
                    .filter_map(|(k, v)| {
                        let value = match v {
                            serde_json::Value::String(s) => Some(Value::String(s.clone())),
                            serde_json::Value::Number(n) => {
                                if let Some(i) = n.as_i64() {
                                    Some(Value::I64(i))
                                } else if let Some(f) = n.as_f64() {
                                    Some(Value::F64(f))
                                } else {
                                    None
                                }
                            }
                            serde_json::Value::Bool(b) => Some(Value::Boolean(*b)),
                            _ => None,
                        };
                        value.map(|v| FilterProperties {
                            key: k.clone(),
                            value: v,
                            operator: Some(Operator::Eq),
                        })
                    })
                    .collect();
                
                if !props.is_empty() {
                    Some(ToolArgs::FilterItems {
                        filter: FilterTraversal {
                            properties: Some(vec![props]),
                            filter_traversals: None,
                        }
                    })
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            // No items matched the ID filter — return empty for this variable
            return Ok(serde_json::Value::Array(vec![]));
        };

        // Pass 2: new connection, start tool + property filter + remaining steps
        let init_resp = client.post(format!("{}/mcp/init", url))
            .send()
            .await
            .map_err(|e| map_reqwest_error(e, "Init failed for pass 2"))?;
        if !init_resp.status().is_success() {
            return Err("Pass 2 init failed".to_string());
        }
        let init_body = init_resp.text().await.map_err(|e| format!("Failed to read init body: {}", e))?;
        let conn2: String = serde_json::from_str(&init_body)
            .map_err(|e| format!("Failed to parse connection_id: {}", e))?;

        // Send start tool
        send_tool(client, url, &conn2, start_tool).await?;
        // Send property-based filter (replaces broken ID filter)
        if let Some(pf) = &prop_filter {
            send_tool(client, url, &conn2, pf).await?;
        }
        // Send remaining steps
        for tool in remaining_tools {
            send_tool(client, url, &conn2, tool).await?;
        }

        // Collect final results
        let range = match &final_action {
            FinalAction::Collect { range } => *range,
            _ => None,
        };
        
        match final_action {
            FinalAction::Collect { .. } => collect_results(client, url, &conn2, range).await,
            FinalAction::Count => {
                let resp = client.post(format!("{}/mcp/aggregate_by", url))
                    .json(&serde_json::json!({ "connection_id": conn2, "properties": Vec::<String>::new(), "drop": true }))
                    .send().await.map_err(|e| map_reqwest_error(e, "Count failed"))?;
                if resp.status().is_success() {
                    resp.json().await.map_err(|e| format!("Failed to parse: {}", e))
                } else {
                    Err(format!("Count error: {}", resp.status()))
                }
            }
            FinalAction::Aggregate { properties } => {
                let resp = client.post(format!("{}/mcp/aggregate_by", url))
                    .json(&serde_json::json!({ "connection_id": conn2, "properties": properties, "drop": true }))
                    .send().await.map_err(|e| map_reqwest_error(e, "Aggregate failed"))?;
                if resp.status().is_success() {
                    resp.json().await.map_err(|e| format!("Failed to parse: {}", e))
                } else {
                    Err(format!("Aggregate error: {}", resp.status()))
                }
            }
            FinalAction::GroupBy { properties } => {
                let resp = client.post(format!("{}/mcp/group_by", url))
                    .json(&serde_json::json!({ "connection_id": conn2, "properties": properties, "drop": true }))
                    .send().await.map_err(|e| map_reqwest_error(e, "GroupBy failed"))?;
                if resp.status().is_success() {
                    resp.json().await.map_err(|e| format!("Failed to parse: {}", e))
                } else {
                    Err(format!("GroupBy error: {}", resp.status()))
                }
            }
        }
    } else {
        // STANDARD EXECUTION (no ID filter, or ID filter with no subsequent steps)
        
        // Execute all tools
        for tool in &tools {
            send_tool(client, url, connection_id, tool).await?;
        }

        // Final action
        let result = match final_action {
            FinalAction::Collect { range } => collect_results(client, url, connection_id, range).await?,
            FinalAction::Count => {
                let resp = client.post(format!("{}/mcp/aggregate_by", url))
                    .json(&serde_json::json!({ "connection_id": connection_id, "properties": Vec::<String>::new(), "drop": true }))
                    .send().await.map_err(|e| map_reqwest_error(e, "Count failed"))?;
                if resp.status().is_success() {
                    resp.json().await.map_err(|e| format!("Failed to parse: {}", e))?
                } else {
                    let status = resp.status();
                    let err_text = resp.text().await.unwrap_or_else(|_| String::new());
                    return Err(format!("Query execution error ({}): {}", status, err_text));
                }
            }
            FinalAction::Aggregate { properties } => {
                let resp = client.post(format!("{}/mcp/aggregate_by", url))
                    .json(&serde_json::json!({ "connection_id": connection_id, "properties": properties, "drop": true }))
                    .send().await.map_err(|e| map_reqwest_error(e, "Aggregate failed"))?;
                if resp.status().is_success() {
                    resp.json().await.map_err(|e| format!("Failed to parse: {}", e))?
                } else {
                    let status = resp.status();
                    let err_text = resp.text().await.unwrap_or_else(|_| String::new());
                    return Err(format!("Query execution error ({}): {}", status, err_text));
                }
            }
            FinalAction::GroupBy { properties } => {
                let resp = client.post(format!("{}/mcp/group_by", url))
                    .json(&serde_json::json!({ "connection_id": connection_id, "properties": properties, "drop": true }))
                    .send().await.map_err(|e| map_reqwest_error(e, "GroupBy failed"))?;
                if resp.status().is_success() {
                    resp.json().await.map_err(|e| format!("Failed to parse: {}", e))?
                } else {
                    let status = resp.status();
                    let err_text = resp.text().await.unwrap_or_else(|_| String::new());
                    return Err(format!("Query execution error ({}): {}", status, err_text));
                }
            }
        };

        // Client-side ID filtering for simple start-node queries (no subsequent steps)
        if !id_filters.is_empty() {
            Ok(filter_by_ids(&result, &id_filters))
        } else {
            Ok(result)
        }
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
