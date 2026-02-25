#[tauri::command]
pub async fn get_local_db_stats(path: String, instance_name: Option<String>) -> Result<crate::stats::LocalStorageStats, String> {
    crate::stats::get_local_db_stats(&path, instance_name.as_deref())
}

#[tauri::command]
pub async fn validate_helix_workspace(path: String) -> Result<bool, String> {
    crate::stats::validate_helix_workspace(&path)
}
