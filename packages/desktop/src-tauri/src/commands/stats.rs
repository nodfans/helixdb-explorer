#[tauri::command]
pub async fn get_local_db_stats(path: String) -> Result<crate::stats::LocalStorageStats, String> {
    crate::stats::get_local_db_stats(&path)
}
