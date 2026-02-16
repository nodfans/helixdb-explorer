use regex::Regex;

/// Preprocesses HQL query code to support inline vector literals in `SearchV` calls.
///
/// # Problem
/// The underlying Helix engine's parser currently does not support passing vector literals
/// directly into the `SearchV` function. For example, `SearchV<Face>([0.1, 0.2, ...])`
/// will fail to parse or execute because it expects a variable reference, not a literal.
///
/// # Solution
/// This function performs a syntax rewrite ("lifting") before sending the code to the engine:
/// 1. Scans for the pattern `SearchV<Type>([ ... ])`.
/// 2. Extracts the vector literal content.
/// 3. Generates a temporary variable name (e.g., `tmpVec_0`).
/// 4. Replaces the literal in the function call with the variable: `SearchV<Type>(tmpVec_0)`.
/// 5. Injects the variable assignment `tmpVec_0 <- [ ... ]` at the beginning of the query body
///    (specifically after the `QUERY ... =>` signature if present, or at the very top).
///
/// This allows users to write intuitive inline syntax while satisfying the engine's strict requirements.
pub fn preprocess_hql(code: &str) -> String {
    let re = Regex::new(r"SearchV\s*<\s*(\w+)\s*>\s*\(\s*(\[[^\]]*\])").unwrap();
    let mut assignments = Vec::new();
    let mut last_end = 0;
    let mut result = String::new();
    let mut counter = 0;
    
    for cap in re.captures_iter(code) {
         let m = cap.get(0).unwrap();
         result.push_str(&code[last_end..m.start()]);
         
         let type_name = &cap[1];
         let vec_literal = &cap[2];
         let var_name = format!("tmpVec_{}", counter);
         counter += 1;
         
         assignments.push(format!("{} <- {}", var_name, vec_literal));
         result.push_str(&format!("SearchV<{}>({}", type_name, var_name));
         
         last_end = m.end();
    }
    result.push_str(&code[last_end..]);
    
    if assignments.is_empty() {
         return code.to_string();
    }
    
    let joined_assignments = assignments.join("\n");
    let query_re = regex::RegexBuilder::new(r"^\s*QUERY\s+.*=>")
        .case_insensitive(true)
        .dot_matches_new_line(true)
        .build()
        .unwrap();
        
    if let Some(mat) = query_re.find(&result) {
         let end = mat.end();
         let (head, tail) = result.split_at(end);
         format!("{}\n{}\n{}", head, joined_assignments, tail)
    } else {
         format!("{}\n{}", joined_assignments, result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_searchv_replacement() {
        let code = r#"
            QUERY Test() =>
                SearchV<Doc>([0.1, 0.2], 10)
                RETURN 1
        "#;
        let processed = preprocess_hql(code);
        assert!(processed.contains("tmpVec_0 <- [0.1, 0.2]"));
        assert!(processed.contains("SearchV<Doc>(tmpVec_0"));
        assert!(!processed.contains("SearchV<Doc>(["));
    }

    #[test]
    fn test_multiple_searchv_replacements() {
        let code = r#"
            QUERY Test() =>
                a <- SearchV<Doc>([0.1], 10)
                b <- SearchV<Image>([0.9], 5)
                RETURN a, b
        "#;
        let processed = preprocess_hql(code);
        
        assert!(processed.contains("tmpVec_0 <- [0.1]"));
        assert!(processed.contains("tmpVec_1 <- [0.9]"));
        
        assert!(processed.contains("SearchV<Doc>(tmpVec_0"));
        assert!(processed.contains("SearchV<Image>(tmpVec_1"));
    }

    #[test]
    fn test_no_replacement_needed() {
        let code = r#"
            QUERY Test() =>
                myVal <- [0.1, 0.2]
                SearchV<Doc>(myVal, 10)
                RETURN 1
        "#;
        let processed = preprocess_hql(code);
        assert_eq!(code, processed);
    }

    #[test]
    fn test_searchv_with_newlines_and_spaces() {
        let code = r#"
            QUERY Test() =>
                SearchV  <  Doc  >  (  [ 0.1 , 0.2 ]  , 10 )
                RETURN 1
        "#;
        let processed = preprocess_hql(code);
        assert!(processed.contains("tmpVec_0 <- [ 0.1 , 0.2 ]"));
        assert!(processed.contains("SearchV<Doc>(tmpVec_0"));
    }

    #[test]
    fn test_injection_position_with_query() {
        let code = r#"
            QUERY Test(id: ID) =>
                SearchV<Doc>([0.1], 1)
        "#;
        let processed = preprocess_hql(code);
        // Should inject after "=>"
        let split: Vec<&str> = processed.split("=>").collect();
        assert!(split.len() > 1);
        let body = split[1];
        assert!(body.trim().starts_with("tmpVec_0"));
    }

    #[test]
    fn test_injection_position_without_query() {
        // Raw traversal case
        let code = r#"
            SearchV<Doc>([0.1], 1)
        "#;
        let processed = preprocess_hql(code);
        // Should inject at the top
        assert!(processed.trim().starts_with("tmpVec_0"));
    }
}
