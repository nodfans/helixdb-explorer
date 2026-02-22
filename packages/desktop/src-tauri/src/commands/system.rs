use std::io::{self, Write};
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

#[tauri::command]
pub fn detect_workspace_path(port: Option<String>) -> Result<String, String> {
    config::detect_workspace_path(port)
}
