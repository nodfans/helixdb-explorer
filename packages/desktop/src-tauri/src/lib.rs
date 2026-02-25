pub mod hql;
pub mod stats;
pub mod commands;
pub mod config;

use tauri::menu::{Menu, MenuItem, Submenu, PredefinedMenuItem};
use tauri::{Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use commands::*;
use std::collections::HashMap;
use std::sync::Mutex;
use reqwest::Client;

pub struct NetworkState {
    pub client: Client,
    pub mcp_connections: Mutex<HashMap<String, String>>, // URL -> connection_id
}

pub struct PendingCopyData {
    pub tsv: String,
    pub json: String,
}

pub struct AppState(pub Mutex<PendingCopyData>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    println!(">>> [HelixDB Explorer] Backend starting up on port 1420...");

    let client = Client::builder()
        .no_proxy()
        .pool_max_idle_per_host(10)
        .tcp_keepalive(Some(std::time::Duration::from_secs(60)))
        .build()
        .expect("Failed to build reqwest client");

    tauri::Builder::default()
        .manage(AppState(Mutex::new(PendingCopyData { tsv: String::new(), json: String::new() })))
        .manage(NetworkState { 
            client, 
            mcp_connections: Mutex::new(HashMap::new()) 
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                let _ = apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None);
            }

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
            fetch_mcp_schema,
            execute_query,
            execute_dynamic_hql,
            load_connection_config,
            save_connection_config,
            sync_hql_to_project,
            detect_workspace_path,
            show_grid_context_menu,
            validate_hql,
            get_hql_completion,
            format_hql,
            get_vector_projections,
            get_local_db_stats,
            validate_helix_workspace
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let _ = window.emit("cleanup-on-exit", ());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
