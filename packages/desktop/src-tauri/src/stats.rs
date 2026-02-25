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
pub struct HnswStat {
    pub vector_count: usize,
    pub vector_data_count: usize,
    pub out_nodes_count: usize,
}

#[derive(Serialize)]
pub struct DBInfo {
    pub map_size: usize,
    pub last_pgno: usize,
    pub last_txnid: usize,
    pub max_readers: u32,
    pub num_readers: u32,
}

#[derive(serde::Deserialize, Serialize, Clone, Debug)]
pub struct BM25Metadata {
    pub total_docs: u64,
    pub avgdl: f64,
    pub k1: f32, // controls term frequency saturation
    pub b: f32,  // controls document length normalization
}

#[derive(Serialize)]
pub struct LocalStorageStats {
    pub db_path: String,
    pub disk_size_bytes: u64,
    pub env_info: DBInfo,
    pub core_dbs: HashMap<String, DBStat>,
    pub bm25_stats: Option<HashMap<String, BM25Metadata>>,
    pub hnsw_stats: Option<HnswStat>,
}

pub fn get_local_db_stats(path: &str, instance_name: Option<&str>) -> Result<LocalStorageStats, String> {
    let base_path = Path::new(path).to_path_buf();
    let instance = instance_name.unwrap_or("dev");
    
    // Support multiple possible locations for the actual DB:
    // 1. Docker mapped workspaces: .helix/.volumes/[instance]/user
    // 2. Native workspaces (newer): .helix/user
    // 3. Native workspaces (older): .helix
    // 4. Direct path
    let docker_volume_path = base_path.join(".helix").join(".volumes").join(instance).join("user");
    let native_user_path = base_path.join(".helix").join("user");
    let native_base_path = base_path.join(".helix");
    
    let db_path = if docker_volume_path.join("data.mdb").exists() {
        docker_volume_path
    } else if native_user_path.join("data.mdb").exists() {
        native_user_path
    } else if native_base_path.join("data.mdb").exists() {
        native_base_path
    } else {
        base_path.clone()
    };

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
            .open(&db_path)
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
    let mut bm25_stats = HashMap::new();
    
    let mut vector_count = 0;
    let mut vector_data_count = 0;
    let mut out_nodes_count = 0;
    let mut has_hnsw = false;

    // 1. Iterate over the main unnamed database to find all named databases
    // In LMDB, the main unnamed database stores the names of all the named databases.
    if let Ok(Some(main_db)) = env.open_database::<Bytes, Bytes>(&txn, None) {
        let main_db: Database<Bytes, Bytes> = main_db;
        
        if let Ok(iter) = main_db.iter(&txn) {
            for result in iter {
                let (key_bytes, _) = match result {
                    Ok(res) => res,
                    Err(_) => continue,
                };
                
                let raw_name = match std::str::from_utf8(key_bytes) {
                    Ok(name) => name,
                    Err(_) => continue,
                };
                
                let db_name = raw_name.trim_matches('\0');
                
                let db: Database<Bytes, Bytes> = match env.open_database(&txn, Some(db_name)) {
                    Ok(Some(db)) => db,
                    _ => continue,
                };
                
                let stat = match db.stat(&txn) {
                    Ok(s) => s,
                    Err(_) => continue,
                };

                core_dbs.insert(db_name.to_string(), DBStat {
                    entries: stat.entries,
                    psize: stat.page_size,
                    depth: stat.depth,
                    branch_pages: stat.branch_pages,
                    leaf_pages: stat.leaf_pages,
                    overflow_pages: stat.overflow_pages,
                });

                // Check if this is a BM25 metadata DB
                if db_name.starts_with("bm25_metadata") {
                    if let Ok(Some(metadata_bytes)) = db.get(&txn, b"metadata") {
                        if let Ok(metadata) = bincode::deserialize::<BM25Metadata>(metadata_bytes) {
                            bm25_stats.insert(db_name.to_string(), metadata);
                        }
                    }
                }
                
                // Collecting HNSW stats
                if db_name == "vectors" {
                    vector_count = stat.entries;
                    has_hnsw = true;
                } else if db_name == "vector_data" {
                    vector_data_count = stat.entries;
                    has_hnsw = true;
                } else if db_name == "hnsw_out_nodes" {
                    out_nodes_count = stat.entries;
                    has_hnsw = true;
                }
            }
        }
    }


    Ok(LocalStorageStats {
        db_path: path.to_string(),
        disk_size_bytes,
        env_info,
        core_dbs,
        bm25_stats: if bm25_stats.is_empty() { None } else { Some(bm25_stats) },
        hnsw_stats: if has_hnsw { 
            Some(HnswStat { 
                vector_count, 
                vector_data_count, 
                out_nodes_count 
            }) 
        } else { 
            None 
        }
    })
}

pub fn validate_helix_workspace(path: &str) -> Result<bool, String> {
    let base_path = Path::new(path);
    if !base_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    
    if base_path.join("helix.toml").exists() {
        Ok(true)
    } else {
        Err("Not a valid Helix workspace: helix.toml not found.".to_string())
    }
}
