
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

pub fn detect_workspace_path(target_port: Option<String>) -> Result<String, String> {
    use std::process::Command;

    // 1. Attempt Docker-based detection if possible
    if let Ok(docker_check) = Command::new("docker").arg("--version").output() {
        if docker_check.status.success() {
            if let Ok(ps_output) = Command::new("docker").args(&["ps", "-q"]).output() {
                let ids_str = String::from_utf8_lossy(&ps_output.stdout);
                let ids: Vec<&str> = ids_str.lines().collect();

                if !ids.is_empty() {
                    if let Ok(inspect_output) = Command::new("docker").arg("inspect").args(&ids).output() {
                        if let Ok(inspect_json) = serde_json::from_slice::<serde_json::Value>(&inspect_output.stdout) {
                            if let Some(containers) = inspect_json.as_array() {
                                for container in containers {
                                    // Match by port if provided
                                    let mut port_matched = target_port.is_none();
                                    if let Some(target) = &target_port {
                                        if let Some(ports) = container.get("NetworkSettings").and_then(|n| n.get("Ports")).and_then(|p| p.as_object()) {
                                            for (container_port, host_bindings) in ports {
                                                if container_port.starts_with("6969/") { // Default Helix port
                                                    if let Some(bindings) = host_bindings.as_array() {
                                                        for binding in bindings {
                                                            if let Some(host_port) = binding.get("HostPort").and_then(|hp| hp.as_str()) {
                                                                if host_port == target {
                                                                    port_matched = true;
                                                                    break;
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                                if port_matched { break; }
                                            }
                                        }
                                    }

                                    if port_matched {
                                        if let Some(mounts) = container.get("Mounts").and_then(|m| m.as_array()) {
                                            for mount in mounts {
                                                if mount.get("Type").and_then(|t| t.as_str()) == Some("bind") {
                                                    if let Some(source) = mount.get("Source").and_then(|s| s.as_str()) {
                                                        let mut current_path = std::path::PathBuf::from(source);
                                                        loop {
                                                            if current_path.join("helix.toml").exists() || current_path.join("helix.hx").exists() {
                                                                return Ok(current_path.to_string_lossy().into_owned());
                                                            }
                                                            if !current_path.pop() { break; }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Fallback: heuristic based on current executable directory
    let mut curr = std::env::current_dir().map_err(|e| e.to_string())?;
    loop {
        if curr.join("helix.hx").exists() || curr.join("package.json").exists() || curr.join("helix.toml").exists() {
            return Ok(curr.to_string_lossy().to_string());
        }
        if !curr.pop() { break; }
    }
    Err("Could not detect workspace path. Please set it manually.".to_string())
}
