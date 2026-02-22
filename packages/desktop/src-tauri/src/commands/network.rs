use std::collections::HashMap;

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
pub async fn helix_request(
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
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

    let resp = req.send().await.map_err(|e| map_reqwest_error(e, "Request error"))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    
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
pub async fn fetch_mcp_schema(url: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;

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

    let schema_resp = client.post(format!("{}/mcp/schema_resource", url))
        .json(&serde_json::json!({ "connection_id": connection_id }))
        .send()
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
