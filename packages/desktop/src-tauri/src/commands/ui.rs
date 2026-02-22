use tauri::menu::{Menu, MenuItem};
use tauri::Manager;
use crate::AppState;

#[tauri::command]
pub fn show_grid_context_menu(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    rows: Vec<serde_json::Value>,
    columns: Vec<serde_json::Value>,
) -> Result<(), String> {
    let mut all_tsv_lines = Vec::new();
    
    for row in &rows {
        let mut tsv_parts = Vec::new();
        for col in &columns {
            if let Some(key) = col.get("key").and_then(|k| k.as_str()) {
                let val = row.get(key).unwrap_or(&serde_json::Value::Null);
                tsv_parts.push(match val {
                    serde_json::Value::Null => "".to_string(),
                    serde_json::Value::String(s) => s.clone(),
                    serde_json::Value::Number(n) => n.to_string(),
                    serde_json::Value::Bool(b) => b.to_string(),
                    _ => val.to_string(),
                });
            }
        }
        all_tsv_lines.push(tsv_parts.join("\t"));
    }
    
    let tsv = all_tsv_lines.join("\n");
    let json = if rows.len() == 1 {
        serde_json::to_string_pretty(&rows[0]).map_err(|e| e.to_string())?
    } else {
        serde_json::to_string_pretty(&rows).map_err(|e| e.to_string())?
    };

    {
        let mut data = state.0.lock().unwrap();
        data.tsv = tsv;
        data.json = json;
    }

    let copy_label = if rows.len() > 1 {
        format!("Copy {} rows", rows.len())
    } else {
        "Copy".to_string()
    };

    let copy_item = MenuItem::with_id(&app, "grid-copy", copy_label, true, None::<&str>).map_err(|e| e.to_string())?;
    let copy_json_item = MenuItem::with_id(&app, "grid-copy-json", "Copy as JSON", true, None::<&str>).map_err(|e| e.to_string())?;

    let menu = Menu::with_items(&app, &[
        &copy_item,
        &copy_json_item,
    ]).map_err(|e| e.to_string())?;

    if let Some(window) = app.get_webview_window("main") {
        window.popup_menu(&menu).map_err(|e| e.to_string())?;
    }

    Ok(())
}
