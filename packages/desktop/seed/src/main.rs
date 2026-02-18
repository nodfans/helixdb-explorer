use reqwest::blocking::Client;
use serde_json::{json, Value};
use chrono::Utc;
use rand::{Rng, thread_rng};
use std::env;

const NODE_LIMIT: usize = 100; // Nodes per type per domain
const DOMAINS: [&str; 3] = ["Tech", "Life", "Health"];
const HELIX_URL: &str = "http://127.0.0.1:6969";

/// Generates a vector clustered around a domain centroid.
fn generate_clustered_vector(domain_idx: usize, dim: usize) -> Vec<f64> {
    let mut rng = thread_rng();
    let mut vec = Vec::with_capacity(dim);
    
    let bases = [
        vec![0.6; dim],   // Tech cluster
        vec![-0.6; dim],  // Life cluster
        vec![0.0; dim],   // Health cluster
    ];

    let base = &bases[domain_idx % bases.len()];
    for i in 0..dim {
        let jitter = rng.gen_range(-0.35..0.35);
        vec.push(base[i] + jitter);
    }
    vec
}

fn extract_id(resp_json: Value) -> Result<String, String> {
    if let Some(id) = resp_json.get("id").and_then(|v| v.as_str()) {
        return Ok(id.to_string());
    }
    if let Some(obj) = resp_json.as_object() {
        for (_key, value) in obj {
            if let Some(id) = value.get("id").and_then(|v| v.as_str()) {
                return Ok(id.to_string());
            }
        }
    }
    Err(format!("Could not extract 'id' from response: {:?}", resp_json))
}

fn clear_all_data(client: &Client) -> Result<(), Box<dyn std::error::Error>> {
    println!(">>> Clearing all data via /clear_all_data...");
    let url = format!("{}/clear_all_data", HELIX_URL);
    let resp = client.post(&url).json(&json!({})).send()?;
    if resp.status().is_success() {
        println!(">>> Successfully cleared all data.");
    }
    Ok(())
}

struct SeededNode {
    id: String,
    domain_idx: usize,
}

fn check_resp(resp: reqwest::blocking::Response, context: &str) -> Result<Value, Box<dyn std::error::Error>> {
    let status = resp.status();
    let text = resp.text().unwrap_or_default();
    if !status.is_success() {
        eprintln!(">>> Error in {}: Status {}. Body: {}", context, status, text);
        return Err(format!("Request failed: {}", context).into());
    }
    let json: Value = serde_json::from_str(&text)?;
    Ok(json)
}

fn get_now() -> String {
    Utc::now().to_rfc3339()
}

fn seed_users(client: &Client) -> Result<Vec<SeededNode>, Box<dyn std::error::Error>> {
    println!(">>> Seeding Users...");
    let mut nodes = Vec::new();
    for domain_idx in 0..DOMAINS.len() {
        let domain = DOMAINS[domain_idx];
        for i in 0..NODE_LIMIT {
            let name = format!("{}_User_{}", domain, i);
            let payload = json!({
                "name": name, // Argument name in create_user
                "age": thread_rng().gen_range(20..70),
                "score": (thread_rng().gen_range(50.0..100.0) as f64 * 100.0).round() / 100.0,
                "active": true,
                "created_at": get_now()
            });

            if i == 0 { println!("  [Sample Payload]: {}", payload); }

            let resp = client.post(format!("{}/create_user", HELIX_URL)).json(&payload).send()?;
            let id = extract_id(check_resp(resp, &format!("create_user {}", name))?)?;

            let embed_payload = json!({
                "user_id": id,
                "name": format!("Embed_{}", name),
                "vector": generate_clustered_vector(domain_idx, 1536),
                "created_at": get_now()
            });
            if i == 0 { println!("  [Embed Sample Payload]: {}", embed_payload); }

            let embed_resp = client.post(format!("{}/add_user_embedding", HELIX_URL)).json(&embed_payload).send()?;
            check_resp(embed_resp, &format!("add_user_embedding for {}", name))?;

            nodes.push(SeededNode { id, domain_idx });
        }
    }
    Ok(nodes)
}

fn seed_posts(client: &Client) -> Result<Vec<SeededNode>, Box<dyn std::error::Error>> {
    println!(">>> Seeding Posts...");
    let mut nodes = Vec::new();
    for domain_idx in 0..DOMAINS.len() {
        let domain = DOMAINS[domain_idx];
        for i in 0..NODE_LIMIT {
            let title = format!("{} Update #{}", domain, i);
            let payload = json!({
                "title": title,
                "content": format!("Latest news in {}...", domain),
                "category": domain,
                "published": true
            });

            let resp = client.post(format!("{}/create_post", HELIX_URL)).json(&payload).send()?;
            let id = extract_id(check_resp(resp, &format!("create_post {}", title))?)?;

            // Add Embedding
            let embed_resp = client.post(format!("{}/add_post_embedding", HELIX_URL)).json(&json!({
                "post_id": id,
                "title": title,
                "content": format!("Content for {}", title),
                "vector": generate_clustered_vector(domain_idx, 1536),
                "created_at": get_now()
            })).send()?;
            check_resp(embed_resp, &format!("add_post_embedding for {}", title))?;

            nodes.push(SeededNode { id, domain_idx });
        }
    }
    Ok(nodes)
}

fn seed_products(client: &Client) -> Result<Vec<SeededNode>, Box<dyn std::error::Error>> {
    println!(">>> Seeding Products...");
    let mut nodes = Vec::new();
    for domain_idx in 0..DOMAINS.len() {
        let domain = DOMAINS[domain_idx];
        for i in 0..NODE_LIMIT {
            let name = format!("{}_Gadget_{}", domain, i);
            let payload = json!({
                "sku": format!("SKU-{}-{}-{}", domain, i, thread_rng().gen_range(1000..9999)),
                "name": name,
                "price": thread_rng().gen_range(10.0..500.0)
            });

            let resp = client.post(format!("{}/create_product", HELIX_URL)).json(&payload).send()?;
            let id = extract_id(check_resp(resp, &format!("create_product {}", name))?)?;

            // Add Embedding
            let embed_resp = client.post(format!("{}/add_product_embedding", HELIX_URL)).json(&json!({
                "product_id": id,
                "name": name,
                "description": format!("Specialized product for {}", domain),
                "vector": generate_clustered_vector(domain_idx, 1536),
                "price": 99.0,
                "created_at": get_now()
            })).send()?;
            check_resp(embed_resp, &format!("add_product_embedding for {}", name))?;

            nodes.push(SeededNode { id, domain_idx });
        }
    }
    Ok(nodes)
}

fn seed_organizations(client: &Client) -> Result<Vec<SeededNode>, Box<dyn std::error::Error>> {
    println!(">>> Seeding Organizations...");
    let mut nodes = Vec::new();
    for domain_idx in 0..DOMAINS.len() {
        let domain = DOMAINS[domain_idx];
        for i in 0..10 { // Fewer orgs
            let name = format!("{} Corp {}", domain, i);
            let payload = json!({
                "name": name,
                "tax_id": format!("TX-{}", thread_rng().gen_range(100000..999999))
            });

            let resp = client.post(format!("{}/create_organization", HELIX_URL)).json(&payload).send()?;
            let id = extract_id(check_resp(resp, &format!("create_organization {}", name))?)?;
            nodes.push(SeededNode { id, domain_idx });
        }
    }
    Ok(nodes)
}

fn seed_emails(client: &Client) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    println!(">>> Seeding EmailAddresses...");
    let mut ids = Vec::new();
    for i in 0..(NODE_LIMIT * 3) {
        let payload = json!({
            "email": format!("user_{}@example.com", i),
            "is_primary": i % 2 == 0
        });
        let resp = client.post(format!("{}/create_email_address", HELIX_URL)).json(&payload).send()?;
        ids.push(extract_id(check_resp(resp, &format!("create_email_address {}", i))?)?);
    }
    Ok(ids)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    let should_clean = args.iter().any(|arg| arg == "--clean");

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .user_agent("HelixSeed/0.3.1")
        .no_proxy()
        .build()?;

    if should_clean {
        clear_all_data(&client)?;
        return Ok(());
    }

    println!(">>> Starting Seed with Clustered Entities (Aligned + Verbose)...");
    
    let users = seed_users(&client)?;
    let posts = seed_posts(&client)?;
    let products = seed_products(&client)?;
    let orgs = seed_organizations(&client)?;
    let emails = seed_emails(&client)?;

    println!(">>> Linking Relationships...");
    let mut rng = thread_rng();

    // Shuffle emails for unique 1-to-1 assignment (HasEmail is UNIQUE)
    use rand::seq::SliceRandom;
    let mut shuffled_emails = emails.clone();
    shuffled_emails.shuffle(&mut rng);
    let mut email_iter = shuffled_emails.iter();

    for user in &users {
        // Link to Emails (1-to-1 since HasEmail is UNIQUE)
        if let Some(email_id) = email_iter.next() {
            let resp = client.post(format!("{}/connect_has_email", HELIX_URL)).json(&json!({
                "from_id": &user.id, "to_id": email_id
            })).send()?;
            check_resp(resp, "connect_has_email")?;
        }

        // Link to Posts (Write in same domain)
        let same_domain_posts: Vec<&SeededNode> = posts.iter().filter(|p| p.domain_idx == user.domain_idx).collect();
        for _ in 0..rng.gen_range(1..4) {
             if !same_domain_posts.is_empty() {
                 let post = same_domain_posts[rng.gen_range(0..same_domain_posts.len())];
                 let resp = client.post(format!("{}/connect_authored", HELIX_URL)).json(&json!({
                     "from_id": &user.id, "to_id": &post.id, "at": get_now()
                 })).send()?;
                 check_resp(resp, "connect_authored")?;
             }
        }

        // Link to Products (Purchased)
        for _ in 0..rng.gen_range(0..3) {
            let product = &products[rng.gen_range(0..products.len())];
            let resp = client.post(format!("{}/connect_purchased", HELIX_URL)).json(&json!({
                "from_id": &user.id, "to_id": &product.id, "date": get_now()
            })).send()?;
            check_resp(resp, "connect_purchased")?;
        }

        // Link to Organizations (WorksAt same domain)
        let same_domain_orgs: Vec<&SeededNode> = orgs.iter().filter(|o| o.domain_idx == user.domain_idx).collect();
        if !same_domain_orgs.is_empty() && rng.gen_bool(0.7) {
            let org = same_domain_orgs[rng.gen_range(0..same_domain_orgs.len())];
            let resp = client.post(format!("{}/connect_works_at", HELIX_URL)).json(&json!({
                "from_id": &user.id, "to_id": &org.id, "since": get_now()
            })).send()?;
            check_resp(resp, "connect_works_at")?;
        }

        // Follows (Same domain)
        let colleagues: Vec<&SeededNode> = users.iter().filter(|u| u.domain_idx == user.domain_idx && u.id != user.id).collect();
        for _ in 0..rng.gen_range(0..2) {
            if !colleagues.is_empty() {
                let friend = colleagues[rng.gen_range(0..colleagues.len())];
                let resp = client.post(format!("{}/connect_follows", HELIX_URL)).json(&json!({
                    "from_id": &user.id, "to_id": &friend.id, "since": get_now()
                })).send()?;
                check_resp(resp, "connect_follows")?;
            }
        }
    }

    println!(">>> Seeding completed successfully. Aligned with db-test/db schema.");
    Ok(())
}


