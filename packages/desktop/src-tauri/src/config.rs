
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

fn get_docker_path() -> String {
    use std::process::Command;
    if let Ok(output) = Command::new("which").arg("docker").output() {
        if output.status.success() {
            return String::from_utf8_lossy(&output.stdout).trim().to_string();
        }
    }
    let fallbacks = ["/usr/local/bin/docker", "/opt/homebrew/bin/docker", "/usr/bin/docker"];
    fallbacks.iter()
        .find(|p| std::path::Path::new(p).exists())
        .map(|p| p.to_string())
        .unwrap_or_else(|| "docker".to_string())
}

fn try_detect_from_docker(target_port: &str) -> Option<String> {
    use std::process::Command;
    let docker_path = get_docker_path();

    if !Command::new(&docker_path).arg("--version").output().map(|o| o.status.success()).unwrap_or(false) {
        return None;
    }

    let ps_output = Command::new(&docker_path).args(&["ps", "-q"]).output().ok()?;
    let ids_str = String::from_utf8_lossy(&ps_output.stdout);
    let ids: Vec<&str> = ids_str.lines().collect();

    if ids.is_empty() { return None; }

    let inspect_output = Command::new(&docker_path).arg("inspect").args(&ids).output().ok()?;
    let inspect_json: serde_json::Value = serde_json::from_slice(&inspect_output.stdout).ok()?;
    let containers = inspect_json.as_array()?;

    for container in containers {
        let ports = container.get("NetworkSettings")?.get("Ports")?.as_object()?;
        let mut port_matched = false;

        for (container_port, host_bindings) in ports {
            if container_port.starts_with("6969/") { // Default Helix port
                if let Some(bindings) = host_bindings.as_array() {
                    for binding in bindings {
                        if binding.get("HostPort").and_then(|hp| hp.as_str()) == Some(target_port) {
                            port_matched = true;
                            break;
                        }
                    }
                }
            }
            if port_matched { break; }
        }

        if port_matched {
            let mounts = container.get("Mounts")?.as_array()?;
            for mount in mounts {
                if mount.get("Type").and_then(|t| t.as_str()) == Some("bind") {
                    if let Some(source) = mount.get("Source").and_then(|s| s.as_str()) {
                        let mut current_path = std::path::PathBuf::from(source);
                        loop {
                            if current_path.join("helix.toml").exists() || current_path.join("helix.hx").exists() {
                                return Some(current_path.to_string_lossy().into_owned());
                            }
                            if !current_path.pop() { break; }
                        }
                    }
                }
            }
        }
    }

    None
}

pub fn detect_workspace_path(app: &tauri::AppHandle, target_port: Option<String>) -> Result<String, String> {
    // 1 & 2. Attempt Docker-based detection only if a specific port is provided (Local Connection)
    // For Cloud connections (target_port is None), we skip Docker checks to avoid confusing results.
    if let Some(target) = target_port {
        if let Some(path) = try_detect_from_docker(&target) {
            return Ok(path);
        }
    }

    // 3. Fallback: heuristic based on app executable directory (more reliable in production) or current dir
    let tauri_exec_dir = app.path().executable_dir().ok();
    let std_exec_path = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf()));
    let curr_dir = std::env::current_dir().ok();
    
    let mut search_paths = Vec::new();
    if let Some(path) = tauri_exec_dir.clone() { search_paths.push(path); }
    if let Some(path) = std_exec_path.clone() { search_paths.push(path); }
    if let Some(path) = curr_dir.clone() { search_paths.push(path); }

    for start_path in search_paths {
        let mut search_path = start_path.clone();
        loop {
            if search_path.join("helix.hx").exists() || search_path.join("package.json").exists() || search_path.join("helix.toml").exists() {
                return Ok(search_path.to_string_lossy().to_string());
            }
            if !search_path.pop() { break; }
        }
    }

    Err("Could not detect workspace path. Please set it manually in settings.".to_string())
}
