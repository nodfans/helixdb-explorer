
use helix_db::helixc::parser::HelixParser;
use helix_db::helixc::parser::types::{Content, HxFile, Source};
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::io::Write;

// ---------------------------------------------------------------------
// 1. Portable Path Resolution
// ---------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct Connection {
    #[serde(default)]
    pub name: String,
    #[serde(rename = "localPath")]
    pub local_path: String,
}

#[derive(Debug, Deserialize)]
struct ConnectionsConfig {
    pub connections: Vec<Connection>,
}

/// Dynamically locate the Helix Explorer configuration directory.
fn get_config_path() -> Option<PathBuf> {
    let mut path = if cfg!(target_os = "macos") {
        dirs::home_dir()?.join("Library/Application Support")
    } else {
        dirs::config_dir()?
    };
    path.push("com.helixdb.explorer/connections.json");
    Some(path)
}

/// Load connection settings from the dynamic config path.
fn load_connections() -> Option<ConnectionsConfig> {
    let path = get_config_path()?;
    if path.exists() {
        let content = fs::read_to_string(path).ok()?;
        serde_json::from_str(&content).ok()
    } else {
        None
    }
}

/// Heuristic to find schema.hx by walking up parent directories.
/// This ensures we can find the schema regardless of where the test is run.
fn find_schema(start_path: &Path) -> Option<PathBuf> {
    let mut curr = start_path.to_path_buf();
    loop {
        let targets = vec![
            curr.join("db/schema.hx"),
            curr.join("schema.hx"),
            curr.join("helix.hx"),
        ];
        for t in targets {
            if t.exists() { return Some(t); }
        }
        if !curr.pop() { break; }
    }
    None
}

// ---------------------------------------------------------------------
// 2. Query Generation Engine
// ---------------------------------------------------------------------

struct QueryGenerator<'a> {
    source: &'a Source,
}

impl<'a> QueryGenerator<'a> {
    fn new(source: &'a Source) -> Self {
        Self { source }
    }

    fn generate_all(&self) -> Vec<String> {
        let mut queries = Vec::new();
        let schema = match self.source.get_latest_schema() {
            Ok(s) => s,
            Err(_) => return queries,
        };

        // Node Queries
        for node in &schema.node_schemas {
            let name = &node.name.1;
            queries.push(format!(
                "// Fetch all nodes of type {}\nQUERY GetAll{}() =>\n    res <- N<{}>\n    RETURN res\n",
                name, name, name
            ));
            queries.push(format!(
                "// Fetch {} by ID\nQUERY Get{}ById(target_id: ID) =>\n    res <- N<{}>(target_id)\n    RETURN res\n",
                name, name, name
            ));
        }

        // Edge Traversals
        for edge in &schema.edge_schemas {
            let name = &edge.name.1;
            let from = &edge.from.1;
            let to = &edge.to.1;

            queries.push(format!(
                "// Traverse {} from {} to {}\nQUERY Traverse{}(start_id: ID) =>\n    start <- N<{}>(start_id)\n    res <- start::Out<{}>\n    RETURN res\n",
                name, from, to, name, from, name
            ));
            queries.push(format!(
                "// Reverse {} traversal\nQUERY Inbound{}(end_id: ID) =>\n    end <- N<{}>(end_id)\n    res <- end::In<{}>\n    RETURN res\n",
                name, name, to, name
            ));
        }

        // Complex Logic
        if !schema.node_schemas.is_empty() && !schema.edge_schemas.is_empty() {
             let node = &schema.node_schemas[0].name.1;
             let edge = &schema.edge_schemas[0].name.1;
             queries.push(format!(
                 "// Complex logic check\nQUERY Filtered{}(val: I32) =>\n    res <- N<{}>::WHERE(AND(_::ID::NEQ(\"0\"), EXISTS(_::Out<{}>)))\n    RETURN res\n",
                 node, node, edge
             ));
        }

        queries
    }
}

// ---------------------------------------------------------------------
// 3. Execution & Verification Lifecycle
// ---------------------------------------------------------------------

#[test]
fn generate_and_verify_real_queries() {
    println!(">>> [INIT] Starting Dynamic HQL Generation...");

    let config = load_connections();
    let mut all_valid_queries = Vec::new();

    // Strategy 1: Use connections.json if available
    if let Some(cfg) = config {
        for conn in cfg.connections {
            let base = PathBuf::from(&conn.local_path);
            if let Some(schema_path) = find_schema(&base) {
                process_schema(&schema_path, &mut all_valid_queries);
            }
        }
    }

    // Strategy 2: Fallback to current workspace detection
    if all_valid_queries.is_empty() {
        let current = std::env::current_dir().unwrap_or_default();
        if let Some(schema_path) = find_schema(&current) {
            process_schema(&schema_path, &mut all_valid_queries);
        }
    }

    // Final Step: Write to query.txt
    if !all_valid_queries.is_empty() {
        let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        path.push("tests/query.txt");
        
        let mut f = fs::File::create(&path).expect("Could not create query.txt");
        writeln!(f, "// PORTABLE GENERATOR RESULTS - verified against parser\n").ok();
        
        for q in all_valid_queries {
            writeln!(f, "{}\n", q).ok();
        }
        println!(">>> [DONE] Exported verified queries to: {:?}", path);
    } else {
        println!(">>> [WARNING] No schema found, 0 queries generated.");
    }
}

fn process_schema(path: &Path, output: &mut Vec<String>) {
    println!(">>> [SCHEMA] Processing: {:?}", path);
    let content_str = fs::read_to_string(path).ok().unwrap_or_default();
    let hx_file = HxFile { name: "temp.hx".into(), content: content_str };
    let content = Content { content: String::new(), files: vec![hx_file], source: Default::default() };

    if let Ok(source) = HelixParser::parse_source(&content) {
        let generator = QueryGenerator::new(&source);
        let queries = generator.generate_all();
        for q in queries {
            // Self-verify
            let v_file = HxFile { name: "v.hx".into(), content: q.clone() };
            let v_content = Content { content: String::new(), files: vec![v_file], source: Default::default() };
            if HelixParser::parse_source(&v_content).is_ok() {
                output.push(q);
            }
        }
    }
}
