
use std::path::PathBuf;
use std::fs;
use tauri::Manager;

pub fn get_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut path = app.path().app_config_dir()
        .map_err(|e| format!("Could not find config directory: {}", e))?;
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    path.push("connections.json");
    Ok(path)
}

pub fn load_connection_config(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = get_config_path(&app)?;
    if !path.exists() {
        return Ok(serde_json::json!({
            "connections": [],
            "current": null
        }));
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let config: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(config)
}

pub fn save_connection_config(app: tauri::AppHandle, config: serde_json::Value) -> Result<(), String> {
    let path = get_config_path(&app)?;
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn detect_workspace_path() -> Result<String, String> {
    // Basic heuristic: check current dir or parent dirs for package.json/helix.hx
    let mut curr = std::env::current_dir().map_err(|e| e.to_string())?;
    loop {
        if curr.join("helix.hx").exists() || curr.join("package.json").exists() {
            return Ok(curr.to_string_lossy().to_string());
        }
        if !curr.pop() { break; }
    }
    Err("Could not detect workspace path. Please set it manually.".to_string())
}
