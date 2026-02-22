use crate::config;

#[tauri::command]
pub fn load_connection_config(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    config::load_connection_config(app)
}

#[tauri::command]
pub fn save_connection_config(app: tauri::AppHandle, config: serde_json::Value) -> Result<(), String> {
    config::save_connection_config(app, config)
}
