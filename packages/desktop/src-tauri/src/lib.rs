pub mod hql_translator;
pub mod mcp_protocol;
pub mod commands;

use tauri::menu::{Menu, MenuItem, Submenu, PredefinedMenuItem};
use tauri::{Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use commands::*;
use std::sync::Mutex;

struct PendingCopyData {
    tsv: String,
    json: String,
}

struct AppState(Mutex<PendingCopyData>);

#[tauri::command]
fn show_grid_context_menu(
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    println!(">>> [Rust] Backend starting up...");
    tauri::Builder::default()
        .manage(AppState(Mutex::new(PendingCopyData { tsv: String::new(), json: String::new() })))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                let _ = apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None);
            }

            // Create Application menu
            let settings_item = MenuItem::with_id(app, "settings", "Settings...", true, Some("CmdOrCtrl+,"))?;
            let about_item = PredefinedMenuItem::about(app, Some("About HelixDB Explorer"), None)?;
            let quit_item = PredefinedMenuItem::quit(app, Some("Quit HelixDB Explorer"))?;
            let separator = PredefinedMenuItem::separator(app)?;
            let hide_item = PredefinedMenuItem::hide(app, Some("Hide HelixDB Explorer"))?;
            let hide_others_item = PredefinedMenuItem::hide_others(app, Some("Hide Others"))?;
            let show_all_item = PredefinedMenuItem::show_all(app, Some("Show All"))?;

            let app_menu = Submenu::with_items(
                app,
                "HelixDB Explorer",
                true,
                &[
                    &about_item,
                    &separator,
                    &settings_item,
                    &PredefinedMenuItem::separator(app)?,
                    &hide_item,
                    &hide_others_item,
                    &show_all_item,
                    &PredefinedMenuItem::separator(app)?,
                    &quit_item,
                ],
            )?;

            // Edit menu
            let edit_menu = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?;

            // Window menu
            let window_menu = Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?;

            let menu = Menu::with_items(app, &[&app_menu, &edit_menu, &window_menu])?;
            app.set_menu(menu)?;

            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "settings" {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("open-settings", ());
                }
            } else if event.id().as_ref() == "grid-copy" {
                let state = app.state::<AppState>();
                let data = state.0.lock().unwrap();
                let _ = app.clipboard().write_text(data.tsv.clone());
            } else if event.id().as_ref() == "grid-copy-json" {
                let state = app.state::<AppState>();
                let data = state.0.lock().unwrap();
                let _ = app.clipboard().write_text(data.json.clone());
            }
        })
        .invoke_handler(tauri::generate_handler![
            log_to_terminal,
            terminate_app,
            helix_request,
            execute_query,
            execute_dynamic_hql,
            load_connection_config,
            save_connection_config,
            sync_hql_to_project,
            detect_workspace_path,
            show_grid_context_menu
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Background cleanup: Clear all localStorage except 'theme' on exit
                // In Tauri v2, eval is on WebviewManager/WebviewWindow
                let _ = window.emit("cleanup-on-exit", ());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
