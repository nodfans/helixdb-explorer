use std::path::Path;
use std::fs;
use heed3::{EnvOpenOptions, Database, types::Bytes};
use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize)]
pub struct DBStat {
    pub entries: usize,
    pub psize: u32,
    pub depth: u32,
    pub branch_pages: usize,
    pub leaf_pages: usize,
    pub overflow_pages: usize,
}

#[derive(Serialize)]
pub struct DBInfo {
    pub map_size: usize,
    pub last_pgno: usize,
    pub last_txnid: usize,
    pub max_readers: u32,
    pub num_readers: u32,
}

#[derive(Serialize)]
pub struct LocalStorageStats {
    pub db_path: String,
    pub disk_size_bytes: u64,
    pub env_info: DBInfo,
    pub core_dbs: HashMap<String, DBStat>,
}

pub fn get_local_db_stats(path: &str) -> Result<LocalStorageStats, String> {
    let db_path = Path::new(path);
    if !db_path.exists() {
        return Err(format!("Database path does not exist: {}", path));
    }

    let data_file = db_path.join("data.mdb");
    let disk_size_bytes = if data_file.exists() {
        fs::metadata(&data_file).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

    // Open environment in read-only mode for introspection
    let env = unsafe {
        EnvOpenOptions::new()
            .max_dbs(200)
            .max_readers(200)
            .open(db_path)
            .map_err(|e| format!("Failed to open database environment: {}. Make sure the path is a valid HelixDB directory.", e))?
    };

    let info = env.info();
    let env_info = DBInfo {
        map_size: info.map_size,
        last_pgno: info.last_page_number,
        last_txnid: info.last_txn_id,
        max_readers: info.maximum_number_of_readers,
        num_readers: info.number_of_readers,
    };

    let txn = env.read_txn().map_err(|e| format!("Failed to start read transaction: {}", e))?;
    let mut core_dbs = HashMap::new();

    // Core databases used by HelixDB
    let core_names = [
        "nodes", 
        "edges", 
        "out_edges", 
        "in_edges", 
        "storage_metadata", 
        "vectors", 
        "vector_data", 
        "hnsw_out_nodes"
    ];

    for name in core_names {
        // Attempt to open each known database. If it doesn't exist, we just skip it.
        if let Ok(Some(db)) = env.open_database::<Bytes, Bytes>(&txn, Some(name)) {
            let db: Database<Bytes, Bytes> = db;
            if let Ok(stat) = db.stat(&txn) {
                core_dbs.insert(name.to_string(), DBStat {
                    entries: stat.entries,
                    psize: stat.page_size,
                    depth: stat.depth,
                    branch_pages: stat.branch_pages,
                    leaf_pages: stat.leaf_pages,
                    overflow_pages: stat.overflow_pages,
                });
            }
        }
    }

    Ok(LocalStorageStats {
        db_path: path.to_string(),
        disk_size_bytes,
        env_info,
        core_dbs,
    })
}
