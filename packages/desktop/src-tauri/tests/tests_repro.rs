
use helixdb_explorer_lib::hql_translator::{FinalAction, map_traversal_to_tools};
use helixdb_explorer_lib::mcp_protocol::ToolArgs;
use helix_db::helixc::parser::HelixParser;
use std::io::Write;
use serde_json::json;
use helix_db::helixc::parser::types::Traversal;

pub fn write_to_temp_file(content: Vec<&str>) -> helix_db::helixc::parser::types::Content {
    let mut files = Vec::new();
    for c in content {
        let mut file = tempfile::NamedTempFile::new().unwrap();
        file.write_all(c.as_bytes()).unwrap();
        let path = file.path().to_string_lossy().into_owned();
        files.push(helix_db::helixc::parser::types::HxFile {
            name: path,
            content: c.to_string(),
        });
    }
    helix_db::helixc::parser::types::Content {
        content: String::new(),
        files,
        source: Default::default(),
    }
}

// Mock of resolve_traversal from commands.rs
fn resolve_traversal(
    name: &str, 
    assignments: &std::collections::HashMap<String, &Traversal>
) -> Result<Option<Traversal>, String> {
    // This logic MUST match commands.rs exactly for the test to be valid
    
    let base = match assignments.get(name) {
        Some(t) => (*t).clone(),
        None => return Ok(None),
    };

    // If the base traversal starts with an Identifier, we need to resolve it recursively
    if let helix_db::helixc::parser::types::StartNode::Identifier(id) = &base.start {
        // Resolve the parent
        let parent = resolve_traversal(id, assignments)?
            .ok_or_else(|| format!("Variable '{}' not found", id))?;
        
        // Merge parent steps + base steps
        // Parent: Start -> Steps
        // Base: Identifier -> Steps
        // Result: Parent Start -> Parent Steps + Base Steps
        
        let mut new_traversal = parent.clone();
        new_traversal.steps.extend(base.steps.clone());
        return Ok(Some(new_traversal));
    }

    Ok(Some(base))
}

#[test]
fn test_dependent_variable_resolution() {
    let query = r#"
        QUERY Test() =>
            uid <- "123"
            user <- N<User>(uid)
            emails <- user::Out<HasEmail>
            RETURN emails
    "#;
    
    let content = write_to_temp_file(vec![query]);
    let source = HelixParser::parse_source(&content).expect("Parse failed");
    let q = &source.queries[0];
    
    let mut params = json!({});
    let mut variable_assignments = std::collections::HashMap::new();

    for stmt in &q.statements {
       match &stmt.statement {
           helix_db::helixc::parser::types::StatementType::Assignment(assign) => {
               match &assign.value.expr {
                   helix_db::helixc::parser::types::ExpressionType::StringLiteral(s) => {
                       if let serde_json::Value::Object(map) = &mut params {
                           map.insert(assign.variable.clone(), serde_json::Value::String(s.clone()));
                       }
                   },
                   helix_db::helixc::parser::types::ExpressionType::Traversal(t) => {
                        variable_assignments.insert(assign.variable.clone(), &**t);
                   }
                   _ => {}
               }
           }
           _ => {}
       }
    }
    
    // Resolve 'emails'
    // 'emails' should resolve to: N<User>(uid)::Out<HasEmail>
    let resolved_emails = resolve_traversal("emails", &variable_assignments).unwrap().unwrap();
    
    // Translate to tools
    let (tools, _action, id_filters) = map_traversal_to_tools(&resolved_emails, &params).unwrap();
    
    println!("Resolved Emails Tools: {:?}", tools);
    println!("ID Filters: {:?}", id_filters);
    
    // Check chain:
    // 1. NFromType(User) — start tool
    // 2. OutStep(HasEmail) — traversal step
    // ID filtering is done client-side (id_filters vec), NOT via FilterItems
    // (because helix-db's Node.get_property("id") returns None)
    
    assert_eq!(id_filters, vec!["123".to_string()], "ID filters should contain '123'");
    assert_eq!(tools.len(), 2, "Expected 2 tools (NFromType + OutStep), found {}", tools.len());
    
    if let ToolArgs::NFromType { node_type } = &tools[0] {
        assert_eq!(node_type, "User");
    } else {
        panic!("Tool 0 is not NFromType");
    }
    
    if let ToolArgs::OutStep { edge_label, .. } = &tools[1] {
        assert_eq!(edge_label, "HasEmail");
    } else {
        panic!("Tool 1 is not OutStep");
    }
}
