use std::collections::HashMap;

pub fn map_reqwest_error(e: reqwest::Error, prefix: &str) -> String {
    if e.is_connect() {
        return "Connection refused. Please check if the server is running.".to_string();
    }
    if e.is_timeout() {
        return "Connection timed out. Target is unreachable.".to_string();
    }
    
    // Fallback but try to be cleaner
    let err_str = e.to_string();
    if err_str.contains("http") || err_str.contains("127.0.0.1") {
        return format!("{}: Network error occurred", prefix);
    }

    format!("{}: {}", prefix, err_str)
}

#[tauri::command]
pub async fn helix_request(
    state: tauri::State<'_, crate::NetworkState>,
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<String, String> {
    let client = &state.client;
    let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(60000));

    let method_type = match method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        _ => return Err(format!("Unsupported method: {}", method)),
    };

    let mut req = client.request(method_type, &url).timeout(timeout);

    for (key, value) in headers {
        req = req.header(key, value);
    }

    if let Some(b) = body {
        req = req.body(b);
    }

    let resp = req.send().await.map_err(|e| {
        map_reqwest_error(e, "Request error")
    })?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    
    if status.is_success() {
        Ok(text)
    } else {
        Err(format!("Server responded with status {}: {}", status, text))
    }
}

#[tauri::command]
pub async fn execute_query(
    state: tauri::State<'_, crate::NetworkState>,
    url: String, 
    query_name: String, 
    args: serde_json::Value, 
    api_key: Option<String>
) -> Result<serde_json::Value, String> {
    let client = &state.client;
    
    let url = format!("{}/{}", url, query_name);
    
    let mut req = client.post(url)
        .json(&args);

    if let Some(key) = api_key {
        req = req.header("x-api-key", key);
    }
    
    let resp = req.send()
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
pub async fn fetch_mcp_schema(
    state: tauri::State<'_, crate::NetworkState>,
    url: String, 
    api_key: Option<String>
) -> Result<serde_json::Value, String> {
    let client = &state.client;

    let mut init_req = client.post(format!("{}/mcp/init", url));
    if let Some(key) = &api_key {
        init_req = init_req.header("x-api-key", key);
    }

    let init_resp = init_req.send()
        .await
        .map_err(|e| {
            map_reqwest_error(e, "Init failed")
        })?;
    
    if !init_resp.status().is_success() {
        let status = init_resp.status();
        let err_text = init_resp.text().await.unwrap_or_else(|_| String::new());
        return Err(format!("Init request failed ({}): {}", status, err_text));
    }

    let init_body = init_resp.text().await.map_err(|e| format!("Failed to read init body: {}", e))?;
    let connection_id: String = serde_json::from_str(&init_body)
        .map_err(|e| format!("Failed to parse connection_id from '{}': {}", init_body, e))?;

    let mut schema_req = client.post(format!("{}/mcp/schema_resource", url))
        .json(&serde_json::json!({ "connection_id": connection_id }));
    
    if let Some(key) = &api_key {
        schema_req = schema_req.header("x-api-key", key);
    }

    let schema_resp = schema_req.send()
        .await
        .map_err(|e| map_reqwest_error(e, "Schema request failed"))?;

    if !schema_resp.status().is_success() {
        let status = schema_resp.status();
        let err_text = schema_resp.text().await.unwrap_or_else(|_| String::new());
        return Err(format!("Schema request failed ({}): {}", status, err_text));
    }

    let val = schema_resp.json::<serde_json::Value>().await
        .map_err(|e| format!("Failed to parse schema response: {}", e))?;
    
   if let serde_json::Value::String(s) = &val {
        if s == "no schema" {
            return Ok(serde_json::json!({}));
        }
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(s) {
            return Ok(parsed);
        }
    }
    
    Ok(val)
}
