
use helixdb_explorer_lib::hql_translator::{map_traversal_to_tools, resolve_traversal};
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

fn setup_test(query: &str) -> (std::collections::HashMap<String, Traversal>, serde_json::Value) {
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
                        variable_assignments.insert(assign.variable.clone(), (**t).clone());
                   }
                   _ => {}
               }
           }
           _ => {}
       }
    }
    (variable_assignments, params)
}

#[test]
fn test_deep_recursion_resolution() {
    let query = r#"
        QUERY Test() =>
            v0 <- N<User>("0")
            v1 <- v0::Out<Step1>
            v2 <- v1::Out<Step2>
            v3 <- v2::Out<Step3>
            v4 <- v3::Out<Step4>
            v5 <- v4::Out<Step5>
            RETURN v5
    "#;
    
    let (vars, params) = setup_test(query);
    let var_refs: std::collections::HashMap<_, _> = vars.iter().map(|(k, v)| (k.clone(), v)).collect();
    
    let resolved = resolve_traversal("v5", &var_refs).unwrap().unwrap();
    
    // Check steps: Step1, Step2, Step3, Step4, Step5
    assert_eq!(resolved.steps.len(), 5);
    
    let (tools, _action, _ids) = map_traversal_to_tools(&resolved, &params).unwrap();
    assert_eq!(tools.len(), 6); // N + 5 OutSteps
}

#[test]
fn test_circular_dependency_handling() {
    let query = r#"
        QUERY Test() =>
            a <- b::Out<E1>
            b <- a::Out<E2>
            RETURN a
    "#;
    
    let (vars, _params) = setup_test(query);
    let var_refs: std::collections::HashMap<_, _> = vars.iter().map(|(k, v)| (k.clone(), v)).collect();
    
    let result = resolve_traversal("a", &var_refs);
    assert!(result.is_err());
    assert!(result.err().unwrap().contains("Circular dependency"));
}

#[test]
fn test_complex_start_nodes() {
    let query = r#"
        QUERY Test() =>
            target <- N<User>("u1")::WHERE(_::{name}::EQ("John"))
            results <- target::Out<Follows>
            RETURN results
    "#;
    
    let (vars, params) = setup_test(query);
    let var_refs: std::collections::HashMap<_, _> = vars.iter().map(|(k, v)| (k.clone(), v)).collect();
    
    let resolved = resolve_traversal("results", &var_refs).unwrap().unwrap();
    let (tools, _action, id_filters) = map_traversal_to_tools(&resolved, &params).unwrap();
    
    // Expect: NFromType, FilterItems(name=John), OutStep(Follows)
    assert_eq!(tools.len(), 3);
    assert_eq!(id_filters, vec!["u1"]);
}

#[test]
fn test_missing_variable() {
    let query = r#"
        QUERY Test() =>
            a <- N<User>("1")
            b <- missing_var::Out<Edge>
            RETURN b
    "#;
    
    let (vars, _params) = setup_test(query);
    let var_refs: std::collections::HashMap<_, _> = vars.iter().map(|(k, v)| (k.clone(), v)).collect();
    
    let result = resolve_traversal("b", &var_refs);
    assert!(result.is_err(), "Should error when parent variable is missing");
    assert!(result.err().unwrap().contains("Variable 'missing_var' not found"));
}

#[test]
fn test_parameter_substitution_in_resolution() {
    let query = r#"
        QUERY Test(id: String) =>
            user <- N<User>(id)
            friends <- user::Out<Friend>
            RETURN friends
    "#;
    
    let (vars, mut params) = setup_test(query);
    if let serde_json::Value::Object(map) = &mut params {
        map.insert("id".to_string(), json!("u2"));
    }
    
    let var_refs: std::collections::HashMap<_, _> = vars.iter().map(|(k, v)| (k.clone(), v)).collect();
    let resolved = resolve_traversal("friends", &var_refs).unwrap().unwrap();
    let (_tools, _action, id_filters) = map_traversal_to_tools(&resolved, &params).unwrap();
    
    assert_eq!(id_filters, vec!["u2"]);
}
