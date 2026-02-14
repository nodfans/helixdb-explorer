
use crate::tool_args::{ToolArgs, FilterProperties, FilterTraversal, Operator};
use crate::hql_translator::{map_traversal_to_tools, FinalAction};
use helix_db::protocol::value::Value;

pub async fn execute_pipeline(
    client: &reqwest::Client,
    url: &str,
    connection_id: &str,
    traversal: &helix_db::helixc::parser::types::Traversal,
    params: &serde_json::Value
) -> Result<serde_json::Value, String> {
    
    // 1. Map to tools
    let (tools, final_action, id_filters) = map_traversal_to_tools(traversal, params)?;

    // 2. Determine execution strategy based on whether we have ID filters
    let has_subsequent_steps = tools.len() > 1;

    if !id_filters.is_empty() && has_subsequent_steps {
        // TWO-PASS EXECUTION
        let start_tool = &tools[0];
        let remaining_tools = &tools[1..];

        send_tool(client, url, connection_id, start_tool).await?;
        let all_items = collect_results(client, url, connection_id, None).await?;
        let filtered = filter_by_ids(&all_items, &id_filters);

        let prop_filter = if let Some(item) = filtered.as_array().and_then(|a| a.first()) {
            if let serde_json::Value::Object(map) = item {
                let props: Vec<FilterProperties> = map.iter()
                    .filter(|(k, _)| *k != "id" && *k != "label" && *k != "version")
                    .filter_map(|(k, v)| {
                        let value = match v {
                            serde_json::Value::String(s) => Some(Value::String(s.clone())),
                            serde_json::Value::Number(n) => {
                                if let Some(i) = n.as_i64() { Some(Value::I64(i)) }
                                else if let Some(f) = n.as_f64() { Some(Value::F64(f)) }
                                else { None }
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
                } else { None }
            } else { None }
        } else {
            return Ok(serde_json::Value::Array(vec![]));
        };

        let init_resp = client.post(format!("{}/mcp/init", url)).send().await
            .map_err(|e| format!("Init failed for pass 2: {}", e))?;
        let init_body = init_resp.text().await.map_err(|e| format!("Failed to read init body: {}", e))?;
        let conn2: String = serde_json::from_str(&init_body).map_err(|e| format!("Failed to parse connection_id: {}", e))?;

        send_tool(client, url, &conn2, start_tool).await?;
        if let Some(pf) = &prop_filter {
            send_tool(client, url, &conn2, pf).await?;
        }
        for tool in remaining_tools {
            send_tool(client, url, &conn2, tool).await?;
        }

        execute_final_action(client, url, &conn2, final_action).await
    } else {
        // STANDARD EXECUTION
        for tool in &tools {
            send_tool(client, url, connection_id, tool).await?;
        }

        let result = execute_final_action(client, url, connection_id, final_action).await?;

        if !id_filters.is_empty() {
            Ok(filter_by_ids(&result, &id_filters))
        } else {
            Ok(result)
        }
    }
}

async fn send_tool(client: &reqwest::Client, url: &str, connection_id: &str, tool: &ToolArgs) -> Result<(), String> {
    let is_search = matches!(tool, ToolArgs::SearchKeyword { .. } | ToolArgs::SearchVec { .. } | ToolArgs::SearchVecText { .. });
    
    if is_search {
        let (endpoint, body) = match tool {
            ToolArgs::SearchKeyword { query, limit, label } => ("search_keyword", serde_json::json!({ "connection_id": connection_id, "data": { "query": query, "limit": limit, "label": label } })),
            ToolArgs::SearchVec { vector, k, min_score, cutoff } => ("search_vector", serde_json::json!({ "connection_id": connection_id, "data": { "vector": vector, "k": k, "min_score": min_score, "cutoff": cutoff } })),
            ToolArgs::SearchVecText { query, label, k } => ("search_vector_text", serde_json::json!({ "connection_id": connection_id, "data": { "query": query, "label": label, "k": k } })),
            _ => unreachable!(),
        };

        let tool_resp = client.post(format!("{}/mcp/{}", url, endpoint)).json(&body).send().await
            .map_err(|e| format!("Search call failed: {}", e))?;
        if !tool_resp.status().is_success() {
            return Err(format!("Search error ({}): {}", tool_resp.status(), tool_resp.text().await.unwrap_or_default()));
        }
    } else {
        let tool_resp = client.post(format!("{}/mcp/tool_call", url)).json(&serde_json::json!({ "connection_id": connection_id, "tool": tool })).send().await
            .map_err(|e| format!("Tool call failed: {}", e))?;
        if !tool_resp.status().is_success() {
            return Err(format!("Tool call error ({}): {}", tool_resp.status(), tool_resp.text().await.unwrap_or_default()));
        }
    }
    Ok(())
}

async fn execute_final_action(client: &reqwest::Client, url: &str, conn: &str, action: FinalAction) -> Result<serde_json::Value, String> {
    match action {
        FinalAction::Collect { range } => collect_results(client, url, conn, range).await,
        FinalAction::Count => {
            let resp = client.post(format!("{}/mcp/aggregate_by", url)).json(&serde_json::json!({ "connection_id": conn, "properties": Vec::<String>::new(), "drop": true })).send().await
                .map_err(|e| format!("Count failed: {}", e))?;
            if resp.status().is_success() { resp.json().await.map_err(|e| e.to_string()) } else { Err(format!("Count error: {}", resp.status())) }
        }
        FinalAction::Aggregate { properties } => {
            let resp = client.post(format!("{}/mcp/aggregate_by", url)).json(&serde_json::json!({ "connection_id": conn, "properties": properties, "drop": true })).send().await
                .map_err(|e| format!("Aggregate failed: {}", e))?;
            if resp.status().is_success() { resp.json().await.map_err(|e| e.to_string()) } else { Err(format!("Aggregate error: {}", resp.status())) }
        }
        FinalAction::GroupBy { properties } => {
            let resp = client.post(format!("{}/mcp/group_by", url)).json(&serde_json::json!({ "connection_id": conn, "properties": properties, "drop": true })).send().await
                .map_err(|e| format!("GroupBy failed: {}", e))?;
            if resp.status().is_success() { resp.json().await.map_err(|e| e.to_string()) } else { Err(format!("GroupBy error: {}", resp.status())) }
        }
    }
}

async fn collect_results(client: &reqwest::Client, url: &str, connection_id: &str, range: Option<(usize, Option<usize>)>) -> Result<serde_json::Value, String> {
    let range_json = if let Some((start, end)) = range {
        if let Some(e) = end { serde_json::json!({ "start": start, "end": e }) } else { serde_json::json!({ "start": start }) }
    } else { serde_json::json!(null) };

    let resp = client.post(format!("{}/mcp/collect", url)).json(&serde_json::json!({ "connection_id": connection_id, "range": range_json, "drop": true })).send().await
        .map_err(|e| format!("Collect failed: {}", e))?;

    if resp.status().is_success() { resp.json().await.map_err(|e| format!("Failed to parse results: {}", e)) }
    else { Err(format!("Query execution error ({}): {}", resp.status(), resp.text().await.unwrap_or_default())) }
}

fn filter_by_ids(value: &serde_json::Value, ids: &[String]) -> serde_json::Value {
    match value {
        serde_json::Value::Array(arr) => {
            let filtered: Vec<serde_json::Value> = arr.iter().filter(|item| {
                if let Some(id_val) = item.get("id").and_then(|v| v.as_str()) {
                    ids.iter().any(|target_id| target_id == id_val)
                } else { false }
            }).cloned().collect();
            serde_json::Value::Array(filtered)
        }
        _ => value.clone(),
    }
}
