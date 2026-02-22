use std::collections::HashSet;
use std::fs;
use helix_db::helixc::parser::{HelixParser, write_to_temp_file};
use helix_db::helixc::parser::types::*;
use crate::hql::analyzer::{self, LitType};

#[derive(serde::Serialize, Clone)]
pub struct PendingSyncItem {
    pub query_name: String,
    pub old_code: String,
    pub new_code: String,
    pub sync_type: String, // "CONFLICT" or "EXISTS"
}

#[derive(serde::Serialize)]
#[serde(tag = "type", content = "data")]
pub enum SyncResponse {
    Success(String),
    Pending(Vec<PendingSyncItem>),
}

#[tauri::command]
pub async fn sync_hql_to_project(code: String, local_path: String, force: bool) -> Result<SyncResponse, String> {
    let mut logs = String::new();
    fn log(logs: &mut String, msg: &str) {
        logs.push_str(msg);
        logs.push('\n');
    }

    log(&mut logs, &format!(">>> [Sync] Starting HQL Sync to project: {}", local_path));
    
    let root_path = std::path::Path::new(&local_path);
    if !root_path.exists() {
        return Err(format!("Local path does not exist: {}", local_path));
    }

    let queries_path = root_path.join("db").join("queries.hx");
    log(&mut logs, &format!(">>> [Sync] Target queries file resolved to: {:?}", queries_path));

    let re_purify = regex::Regex::new(r#"(?x)
        (\w+\s*:\s*[A-Za-z0-9_<>]+)
        \s*=\s*
        ('[^']*'|"[^"]*"|[\d\.]+|true|false)
    "#).unwrap();
    let purified_code = re_purify.replace_all(&code, "$1").to_string();

    let incoming_content = write_to_temp_file(vec![&purified_code]);
    let incoming_source = HelixParser::parse_source(&incoming_content)
        .map_err(|e| format!("Failed to parse incoming HQL: {}", e))?;
    
    if incoming_source.queries.is_empty() {
        return Err("No query found in provided HQL".to_string());
    }

    let mut incoming_names = HashSet::new();
    for q in &incoming_source.queries {
        if !incoming_names.insert(&q.name) {
            return Err(format!("Duplicate query name found in selection/editor: '{}'", q.name));
        }
    }

    let mut all_mappings: Vec<(std::ops::Range<usize>, String)> = Vec::new();
    for query in &incoming_source.queries {
        let (used_ids, mut literals) = analyzer::collect_dwim_info(query);
        let unused_params: Vec<_> = query.parameters.iter()
            .filter(|p| !used_ids.contains(&p.name.1))
            .collect();

        if !unused_params.is_empty() && !literals.is_empty() {
            log(&mut logs, &format!(">>> [Sync] DWIM ({}): Found {} unused params and {} candidate literals", 
                query.name, unused_params.len(), literals.len()));
            
            literals.sort_by(|a, b| a.0.start.cmp(&b.0.start));
            for param in unused_params {
                if let Some(pos) = literals.iter().position(|(_, lit_type)| {
                    match &param.param_type.1 {
                        FieldType::String | FieldType::Uuid => matches!(lit_type, LitType::String),
                        FieldType::I8 | FieldType::I16 | FieldType::I32 | FieldType::I64 |
                        FieldType::U8 | FieldType::U16 | FieldType::U32 | FieldType::U64 | FieldType::U128 |
                        FieldType::F32 | FieldType::F64 => matches!(lit_type, LitType::Number),
                        FieldType::Boolean => matches!(lit_type, LitType::Boolean),
                        _ => false,
                    }
                }) {
                    let (range, _) = literals.remove(pos);
                    all_mappings.push((range, param.name.1.clone()));
                }
            }
        }
    }

    all_mappings.sort_by(|a, b| b.0.start.cmp(&a.0.start));
    let mut final_code = purified_code.clone();
    for (range, name) in all_mappings {
        final_code.replace_range(range, &name);
    }

    let final_content = write_to_temp_file(vec![&final_code]);
    let _ = HelixParser::parse_source(&final_content)
        .map_err(|e| format!("Failed to reconstruct processed HQL: {}", e))?;

    let mut target_file_content = if queries_path.exists() {
        fs::read_to_string(&queries_path)
            .map_err(|e| format!("Failed to read queries.hx: {}", e))?
    } else {
        log(&mut logs, ">>> [Sync] Creating new queries.hx file");
        if let Some(parent) = queries_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        String::new()
    };

    let temp_target = write_to_temp_file(vec![&target_file_content]);
    let existing_source = if !target_file_content.trim().is_empty() {
        match HelixParser::parse_source(&temp_target) {
            Ok(src) => Some(src),
            Err(e) => {
                log(&mut logs, &format!(">>> [Sync] Warning: Failed to parse existing queries.hx: {}. This usually means there are syntax errors or duplicate query names in the file.", e));
                None
            }
        }
    } else {
        None
    };

    let sync_marker = "// Synced from Helix Explorer";
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    
    struct Change {
        start: usize,
        end: usize,
        content: String,
    }
    let mut replacements = Vec::new();
    let mut appends = Vec::new();
    let mut pending_items = Vec::new();

    for query in incoming_source.queries.iter() {
        let query_name = &query.name;
        let query_body: String = final_code[query.loc.byte_range()].trim().to_string();
        let snippet_with_marker = format!("{} at {}\n{}\n\n", sync_marker, timestamp, query_body);

        let mut matched = false;
        if let Some(ref source) = existing_source {
            if let Some(existing_query) = source.queries.iter().find(|q| q.name == *query_name) {
                let range = existing_query.loc.byte_range();
                let mut start_idx = range.start;
                let mut end_idx = range.end;

                let old_code = target_file_content[range.clone()].to_string();

                let prefix = &target_file_content[..start_idx];
                if let Some(pos) = prefix.rfind(sync_marker) {
                    let marker_to_query = &prefix[pos..];
                    if marker_to_query.lines().count() <= 3 {
                        start_idx = pos;
                    }
                }

                let suffix = &target_file_content[end_idx..];
                let mut consumed = 0;
                for c in suffix.chars() {
                    if c.is_whitespace() {
                        consumed += c.len_utf8();
                        if c == '\n' { 
                             let after_nl = &suffix[consumed..];
                            if after_nl.trim_start().starts_with(sync_marker) || after_nl.trim_start().starts_with("QUERY") {
                                break; 
                            }
                        }
                    } else if c == '8' || c == ';' { 
                        consumed += c.len_utf8();
                    } else {
                        break;
                    }
                }
                end_idx += consumed;

                if !force {
                    pending_items.push(PendingSyncItem {
                        query_name: query_name.clone(),
                        old_code,
                        new_code: query_body.clone(),
                        sync_type: "CONFLICT".to_string(),
                    });
                } else {
                    replacements.push(Change {
                        start: start_idx,
                        end: end_idx,
                        content: String::new(),
                    });
                    appends.push(snippet_with_marker.clone());
                }
                matched = true;
            }
        }

        if !matched {
            appends.push(snippet_with_marker);
        }
    }

    if !force && !pending_items.is_empty() {
        return Ok(SyncResponse::Pending(pending_items));
    }

    if !replacements.is_empty() {
        replacements.sort_by_key(|r| r.start);
        let mut merged: Vec<Change> = Vec::new();
        let mut current = replacements[0].start..replacements[0].end;

        for next in replacements.iter().skip(1) {
            if next.start < current.end {
                current.end = std::cmp::max(current.end, next.end);
            } else {
                merged.push(Change { start: current.start, end: current.end, content: String::new() });
                current = next.start..next.end;
            }
        }
        merged.push(Change { start: current.start, end: current.end, content: String::new() });
        replacements = merged;
    }

    replacements.sort_by(|a, b| b.start.cmp(&a.start));
    for change in replacements {
        target_file_content.replace_range(change.start..change.end, &change.content);
    }

    for snippet in appends {
        if !target_file_content.is_empty() {
            if !target_file_content.ends_with('\n') {
                target_file_content.push('\n');
            }
            if !target_file_content.ends_with("\n\n") {
                target_file_content.push('\n');
            }
        }
        target_file_content.push_str(&snippet);
    }

    fs::write(&queries_path, target_file_content).map_err(|e| e.to_string())?;
    
    Ok(SyncResponse::Success(logs))
}
