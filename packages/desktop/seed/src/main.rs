use reqwest::blocking::Client;
use serde_json::{json, Value};
use chrono::Utc;
use rand::{Rng, thread_rng};
use rand::distributions::Alphanumeric;
use std::env;

const RECORD_COUNT: usize = 1000; // 手动控制数量的 const
const HELIX_URL: &str = "http://127.0.0.1:6969";

fn generate_random_string(len: usize) -> String {
    thread_rng()
        .sample_iter(&Alphanumeric)
        .take(len)
        .map(char::from)
        .collect()
}

fn generate_random_vector(dim: usize) -> Vec<f64> {
    let mut rng = thread_rng();
    (0..dim).map(|_| rng.gen_range(-1.0..1.0)).collect()
}

fn extract_id(resp_json: Value) -> Result<String, String> {
    // Try root first
    if let Some(id) = resp_json.get("id").and_then(|v| v.as_str()) {
        return Ok(id.to_string());
    }
    
    // Try nested (first child object)
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
    println!(">>> Clearing all data...");
    let url = format!("{}/clear_all_data", HELIX_URL);
    let resp = client.post(&url)
        .header("Content-Type", "application/json")
        .header("Connection", "close")
        .body("{}")
        .send()?;

    if resp.status().is_success() {
        println!(">>> Successfully cleared all data.");
    } else {
        eprintln!(">>> Failed to clear data: status {}", resp.status());
        let error_text = resp.text().unwrap_or_default();
        eprintln!("Error: {}", error_text);
    }
    Ok(())
}

fn seed_users(client: &Client) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    println!(">>> Seeding Users...");
    let mut ids = Vec::new();
    for i in 0..RECORD_COUNT {
        let name = format!("User_{}_{}", i, generate_random_string(4));
        let age = thread_rng().gen_range(18..80);
        let score = thread_rng().gen_range(0.0..100.0);
        let active = thread_rng().gen_bool(0.5);
        let created_at = Utc::now().to_rfc3339();

        let payload = json!({
            "name": name,
            "age": age,
            "score": score,
            "active": active,
            "created_at": created_at
        });

        let url = format!("{}/create_user", HELIX_URL);
        let resp = client.post(&url)
            .header("Content-Type", "application/json")
            .header("Connection", "close")
            .body(serde_json::to_string(&payload)?)
            .send()?;
        
        let json: Value = resp.json()?;
        let id = extract_id(json)?;
        ids.push(id);
        println!("  [{}/{}] Created User: {}", i + 1, RECORD_COUNT, name);
    }
    Ok(ids)
}

fn seed_posts(client: &Client) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    println!(">>> Seeding Posts...");
    let mut ids = Vec::new();
    let categories = vec!["Tech", "Life", "Work", "Travel", "Food"];
    for i in 0..RECORD_COUNT {
        let title = format!("Post Title {} - {}", i, generate_random_string(8));
        let content = format!("This is some random content for post {}. {}", i, generate_random_string(20));
        let category = categories[thread_rng().gen_range(0..categories.len())];
        let published = thread_rng().gen_bool(0.8);

        let payload = json!({
            "title": title,
            "content": content,
            "category": category,
            "published": published
        });

        let url = format!("{}/create_post", HELIX_URL);
        let resp = client.post(&url)
            .header("Content-Type", "application/json")
            .header("Connection", "close")
            .body(serde_json::to_string(&payload)?)
            .send()?;
        
        let json: Value = resp.json()?;
        let id = extract_id(json)?;
        ids.push(id);
        println!("  [{}/{}] Created Post: {}", i + 1, RECORD_COUNT, title);
    }
    Ok(ids)
}

fn seed_products(client: &Client) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    println!(">>> Seeding Products...");
    let mut ids = Vec::new();
    for i in 0..RECORD_COUNT {
        let sku = format!("SKU-{}-{}", i, generate_random_string(6));
        let name = format!("Product {}", generate_random_string(5));
        let price = thread_rng().gen_range(9.99..999.99);

        let payload = json!({
            "sku": sku,
            "name": name,
            "price": price
        });

        let url = format!("{}/create_product", HELIX_URL);
        let resp = client.post(&url)
            .header("Content-Type", "application/json")
            .header("Connection", "close")
            .body(serde_json::to_string(&payload)?)
            .send()?;
        
        let json: Value = resp.json()?;
        let id = extract_id(json)?;
        ids.push(id);
        println!("  [{}/{}] Created Product: {} ({})", i + 1, RECORD_COUNT, name, sku);
    }
    Ok(ids)
}

fn seed_organizations(client: &Client) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    println!(">>> Seeding Organizations...");
    let mut ids = Vec::new();
    for i in 0..RECORD_COUNT {
        let name = format!("Org_{}_{}", i, generate_random_string(4));
        let tax_id = format!("{}-{}-{}", thread_rng().gen_range(10..99), thread_rng().gen_range(100..999), thread_rng().gen_range(1000..9999));

        let payload = json!({
            "name": name,
            "tax_id": tax_id
        });

        let url = format!("{}/create_organization", HELIX_URL);
        let resp = client.post(&url)
            .header("Content-Type", "application/json")
            .header("Connection", "close")
            .body(serde_json::to_string(&payload)?)
            .send()?;
        
        let json: Value = resp.json()?;
        let id = extract_id(json)?;
        ids.push(id);
        println!("  [{}/{}] Created Organization: {}", i + 1, RECORD_COUNT, name);
    }
    Ok(ids)
}

fn seed_email_addresses(client: &Client) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    println!(">>> Seeding Email Addresses...");
    let mut ids = Vec::new();
    let domains = vec!["gmail.com", "yahoo.com", "outlook.com", "example.com"];
    for i in 0..(RECORD_COUNT * 2) { // Create more emails than users
        let email = format!("{}.{}@{}", generate_random_string(5).to_lowercase(), i, domains[thread_rng().gen_range(0..domains.len())]);
        let is_primary = thread_rng().gen_bool(0.3);

        let payload = json!({
            "email": email,
            "is_primary": is_primary
        });

        let url = format!("{}/create_email_address", HELIX_URL);
        let resp = client.post(&url)
            .header("Content-Type", "application/json")
            .header("Connection", "close")
            .body(serde_json::to_string(&payload)?)
            .send()?;
        
        let json: Value = resp.json()?;
        let id = extract_id(json)?;
        ids.push(id);
        println!("  [{}/{}] Created Email: {}", i + 1, RECORD_COUNT * 2, email);
    }
    Ok(ids)
}

// --- Relationship Seeding with Sparsity and Multi-Edges ---

fn seed_relationships(
    client: &Client,
    user_ids: &[String],
    post_ids: &[String],
    product_ids: &[String],
    org_ids: &[String],
    email_ids: &[String]
) -> Result<(), Box<dyn std::error::Error>> {
    println!(">>> Establishing Refined Relationships (Edges)...");
    let mut rng = thread_rng();

    for user_id in user_ids {
        // 1. Authored: User -> Post (Multi-edge, 0 to 5 posts per user)
        let num_posts = rng.gen_range(0..6);
        for _ in 0..num_posts {
            if !post_ids.is_empty() {
                let post_id = &post_ids[rng.gen_range(0..post_ids.len())];
                let url = format!("{}/connect_authored", HELIX_URL);
                client.post(&url)
                    .json(&json!({ "from_id": user_id, "to_id": post_id, "at": Utc::now().to_rfc3339() }))
                    .send()?;
            }
        }
        if num_posts > 0 {
             println!("  User {} authored {} Posts", user_id, num_posts);
        }

        // 2. Follows: User -> User (Sparsity + Multi-edge, 0 to 3 follows)
        let num_follows = rng.gen_range(0..4);
        for _ in 0..num_follows {
            if user_ids.len() > 1 {
                let mut other_id = &user_ids[rng.gen_range(0..user_ids.len())];
                while other_id == user_id {
                    other_id = &user_ids[rng.gen_range(0..user_ids.len())];
                }
                let url = format!("{}/connect_follows", HELIX_URL);
                client.post(&url)
                    .json(&json!({ "from_id": user_id, "to_id": other_id, "since": Utc::now().to_rfc3339() }))
                    .send()?;
            }
        }
        if num_follows > 0 {
            println!("  User {} follows {} Users", user_id, num_follows);
        }

        // 3. Purchased: User -> Product (Sparsity: 40% probability, 0 to 3 items)
        if rng.gen_bool(0.4) {
            let num_purchases = rng.gen_range(1..4);
            for _ in 0..num_purchases {
                if !product_ids.is_empty() {
                    let product_id = &product_ids[rng.gen_range(0..product_ids.len())];
                    let url = format!("{}/connect_purchased", HELIX_URL);
                    client.post(&url)
                        .json(&json!({ "from_id": user_id, "to_id": product_id, "date": Utc::now().to_rfc3339() }))
                        .send()?;
                }
            }
            println!("  User {} purchased {} Products", user_id, num_purchases);
        }

        // 4. WorksAt: User -> Organization (Sparsity: 60% probability)
        if rng.gen_bool(0.6) {
            if !org_ids.is_empty() {
                let org_id = &org_ids[rng.gen_range(0..org_ids.len())];
                let url = format!("{}/connect_works_at", HELIX_URL);
                client.post(&url)
                    .json(&json!({ "from_id": user_id, "to_id": org_id, "since": Utc::now().to_rfc3339() }))
                    .send()?;
                println!("  User {} works at Organization {}", user_id, org_id);
            }
        }

        // 5. HasEmail: User -> EmailAddress (1 to 2 emails per user)
        let num_emails = rng.gen_range(1..3);
        for _ in 0..num_emails {
            if !email_ids.is_empty() {
                let email_id = &email_ids[rng.gen_range(0..email_ids.len())];
                let url = format!("{}/connect_has_email", HELIX_URL);
                client.post(&url)
                    .json(&json!({ "from_id": user_id, "to_id": email_id }))
                    .send()?;
            }
        }
        println!("  User {} linked to {} Emails", user_id, num_emails);
    }
    Ok(())
}

fn seed_embeddings(
    client: &Client,
    user_ids: &[String],
    post_ids: &[String],
    product_ids: &[String]
) -> Result<(), Box<dyn std::error::Error>> {
    println!(">>> Seeding Embeddings (Vectors)...");
    
    // 1. User Embeddings
    for (i, user_id) in user_ids.iter().enumerate() {
        let url = format!("{}/add_user_embedding", HELIX_URL);
        client.post(&url)
            .json(&json!({
                "user_id": user_id,
                "name": format!("Embedding_{}", i),
                "vector": generate_random_vector(128),
                "created_at": Utc::now().to_rfc3339()
            }))
            .send()?;
    }
    println!("  Added embeddings for {} Users", user_ids.len());

    // 2. Post Embeddings
    for (i, post_id) in post_ids.iter().enumerate() {
        let url = format!("{}/add_post_embedding", HELIX_URL);
        client.post(&url)
            .json(&json!({
                "post_id": post_id,
                "title": format!("PostTitle_{}", i),
                "content": "Random description",
                "vector": generate_random_vector(128),
                "created_at": Utc::now().to_rfc3339()
            }))
            .send()?;
    }
    println!("  Added embeddings for {} Posts", post_ids.len());

    // 3. Product Embeddings
    for (i, product_id) in product_ids.iter().enumerate() {
        let url = format!("{}/add_product_embedding", HELIX_URL);
        client.post(&url)
            .json(&json!({
                "product_id": product_id,
                "name": format!("ProductName_{}", i),
                "description": "Random product description",
                "vector": generate_random_vector(128),
                "price": 99.99,
                "created_at": Utc::now().to_rfc3339()
            }))
            .send()?;
    }
    println!("  Added embeddings for {} Products", product_ids.len());

    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    let should_clean = args.iter().any(|arg| arg == "--clean");

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("HelixSeed/0.1.0")
        .no_proxy()
        .http1_only()
        .build()?;

    if should_clean {
        clear_all_data(&client)?;
    } else {
        println!(">>> Starting seed process with Sparsity and Multi-Edges...");
        
        let user_ids = seed_users(&client)?;
        let post_ids = seed_posts(&client)?;
        let product_ids = seed_products(&client)?;
        let org_ids = seed_organizations(&client)?;
        let email_ids = seed_email_addresses(&client)?;
        
        seed_relationships(&client, &user_ids, &post_ids, &product_ids, &org_ids, &email_ids)?;
        seed_embeddings(&client, &user_ids, &post_ids, &product_ids)?;
        
        println!(">>> Seeding completed successfully.");
    }

    Ok(())
}
