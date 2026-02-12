
#[tokio::test]
async fn test_batch_queries() {
    use std::fs;
    use std::path::PathBuf;
    use helixdb_explorer_lib::commands::execute_dynamic_hql;

    let base_url = "http://localhost:6969".to_string();

    // --- 1. Fetch Sample IDs ---
    println!(">>> [Test] Fetching sample IDs...");
    
    let mut u1 = "00000000-0000-0000-0000-000000000000".to_string();
    let mut u2 = "00000000-0000-0000-0000-000000000001".to_string();
    let mut p1 = "00000000-0000-0000-0000-000000000002".to_string();
    let mut c1 = "00000000-0000-0000-0000-000000000003".to_string();

    if let Ok(res) = execute_dynamic_hql(base_url.clone(), "QUERY GetUsers() => users <- N<User> RETURN users".into()).await {
        if let Some(arr) = res.as_array() {
            if arr.len() > 0 { u1 = arr[0].get("id").and_then(|id| id.as_str()).unwrap_or(&u1).to_string(); }
            if arr.len() > 1 { u2 = arr[1].get("id").and_then(|id| id.as_str()).unwrap_or(&u2).to_string(); }
        }
    }
    if let Ok(res) = execute_dynamic_hql(base_url.clone(), "QUERY GetPosts() => posts <- N<Post> RETURN posts".into()).await {
        if let Some(arr) = res.as_array() {
            if arr.len() > 0 { p1 = arr[0].get("id").and_then(|id| id.as_str()).unwrap_or(&p1).to_string(); }
        }
    }
    if let Ok(res) = execute_dynamic_hql(base_url.clone(), "QUERY GetComments() => comms <- N<Comment> RETURN comms".into()).await {
        if let Some(arr) = res.as_array() {
            if arr.len() > 0 { c1 = arr[0].get("id").and_then(|id| id.as_str()).unwrap_or(&c1).to_string(); }
        }
    }

    println!(">>> [Test] Using IDs: u1={}, u2={}, p1={}, c1={}", u1, u2, p1, c1);

    // --- 2. Run Verification ---
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set");
    let query_path = PathBuf::from(manifest_dir).join("tests").join("query.txt");
    let content = fs::read_to_string(&query_path).expect("Failed to read query.txt");

    let mut test_cases: Vec<(String, String, Vec<String>)> = Vec::new();
    let re_start = regex::Regex::new(r"^QUERY\s+([a-zA-Z0-9_]+)").unwrap();
    let mut current_name = String::new();
    let mut current_body_lines: Vec<String> = Vec::new();
    let mut current_comments: Vec<String> = Vec::new();
    let mut current_expected: Vec<String> = Vec::new();
    let mut in_query = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(caps) = re_start.captures(trimmed) {
            if in_query { 
                test_cases.push((current_name.clone(), current_body_lines.join("\n"), current_expected.clone())); 
            }
            in_query = true;
            current_name = caps.get(1).unwrap().as_str().to_string();
            current_body_lines.clear();
            current_body_lines.push(line.to_string());
            
            // Capture expectations from the comments block preceding this query
            current_expected = current_comments.iter()
                .filter(|c| c.to_lowercase().contains("expected"))
                .cloned()
                .collect();
            current_comments.clear();
            continue;
        }
        
        if trimmed.starts_with("//") {
            current_comments.push(trimmed.to_string());
        } else if !trimmed.is_empty() {
            if in_query { current_body_lines.push(line.to_string()); }
        }
    }
    if in_query { 
        test_cases.push((current_name, current_body_lines.join("\n"), current_expected)); 
    }

    println!(">>> [Test] Executing {} test cases.", test_cases.len());

    for (name, body, expected) in test_cases {
        println!("\n===================================================");
        println!(">>> EXECUTING: {}", name);
        if !expected.is_empty() {
            println!("   {}", expected.join("\n   "));
        }
        
        let is_parameterized = body.contains('(') && body.find('(').unwrap() < body.find(')').unwrap_or(body.len());
        
        let mut lines: Vec<String> = body.lines().map(|s| s.to_string()).collect();
        if !lines.is_empty() {
             let re_params_def = regex::Regex::new(r"\([^)]+\)").unwrap();
             lines[0] = re_params_def.replace(&lines[0], "()").to_string();
        }
        
        let mut final_body = lines.join("\n");
        final_body = final_body.replace("(user_id)", &format!("(\"{}\")", u1));
        final_body = final_body.replace("(post_id)", &format!("(\"{}\")", p1));
        final_body = final_body.replace("(comment_id)", &format!("(\"{}\")", c1));
        final_body = final_body.replace("(active)", "(true)");
        final_body = final_body.replace("(target_age)", "(30)");
        final_body = final_body.replace("(min_age)", "(20)");
        final_body = final_body.replace("(max_age)", "(40)");
        final_body = final_body.replace("(min_score)", "(70.0)");
        final_body = final_body.replace("(name_query)", "(\"Alice\")");
        final_body = final_body.replace("(limit)", "(5)"); // Lower limit for readability
        
        // --- 1. Original Execution ---
        println!("--- Original Result ---");
        match execute_dynamic_hql(base_url.clone(), final_body.clone()).await {
            Ok(result) => println!("{}", serde_json::to_string_pretty(&result).unwrap_or_default()),
            Err(e) => println!(">>> ❌ ERROR: {}", e),
        }

        // --- 2. Ad-hoc Comparative Execution (for non-parameterized list queries) ---
        if !is_parameterized && (name.starts_with("GetAll") || name.contains("active")) {
             println!("--- Ad-hoc Comparison (adding ::COUNT) ---");
             let count_body = final_body.replace("RETURN", "RETURN _").replace("RETURN _", "::COUNT"); 
             // Simplistic transform for comparison
             if count_body != final_body {
                 match execute_dynamic_hql(base_url.clone(), count_body).await {
                     Ok(result) => println!("Count Check: {}", serde_json::to_string_pretty(&result).unwrap_or_default()),
                     Err(_) => {}
                 }
             }
        }
    }
}
