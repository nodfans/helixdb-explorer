use reqwest::blocking::Client;
use serde_json::{json, Value};
use chrono::{Utc, Duration};
use rand::{Rng, thread_rng, seq::SliceRandom};

const HELIX_URL: &str = "http://127.0.0.1:6969";

const DOMAINS: [&str; 3] = ["Fashion", "Electronics", "Wellness"];
const VECTOR_DIM: usize = 8;

fn generate_vector(domain_idx: usize, item_idx: usize) -> Vec<f64> {
    let mut rng = thread_rng();

    // Each domain occupies its own "strong" dimensions:
    // Fashion:     dims 0,1,2  → high signal
    // Electronics: dims 3,4,5  → high signal
    // Wellness:    dims 5,6,7  → high signal
    (0..VECTOR_DIM).map(|i| {
        let is_domain_dim = match domain_idx {
            0 => i < 3,
            1 => i >= 3 && i < 6,
            2 => i >= 5,
            _ => false,
        };
        let base = if is_domain_dim {
            (0.7 + item_idx as f64 * 0.05).min(0.95)
        } else {
            0.05
        };
        let noise: f64 = rng.gen_range(0.0..0.05);
        (base + noise).clamp(0.0, 1.0)
    }).collect()
}

fn get_now() -> String { Utc::now().to_rfc3339() }
fn days_ago(days: i64) -> String { (Utc::now() - Duration::days(days)).to_rfc3339() }
fn round2(v: f64) -> f64 { (v * 100.0).round() / 100.0 }

fn check_resp(resp: reqwest::blocking::Response, ctx: &str) -> Result<Value, Box<dyn std::error::Error>> {
    let status = resp.status();
    let text = resp.text().unwrap_or_default();
    if !status.is_success() {
        eprintln!("[ERROR] {}: {} — {}", ctx, status, text);
        return Err(format!("Failed: {}", ctx).into());
    }
    Ok(serde_json::from_str(&text)?)
}

fn extract_id(v: &Value) -> Result<String, String> {
    if let Some(id) = v.get("id").and_then(|x| x.as_str()) { return Ok(id.to_string()); }
    if let Some(obj) = v.as_object() {
        for (_, val) in obj {
            if let Some(id) = val.get("id").and_then(|x| x.as_str()) { return Ok(id.to_string()); }
        }
    }
    Err(format!("No id in: {:?}", v))
}

struct SeededNode { id: String, domain_idx: usize, name: String }

fn seed_users(client: &Client) -> Result<Vec<SeededNode>, Box<dyn std::error::Error>> {
    println!(">>> Seeding 10 Users...");
    let mut rng = thread_rng();
    let tiers = ["Bronze", "Silver", "Gold", "Platinum"];
    let regions = ["North", "South", "East", "West"];

    let users_def: Vec<(&str, usize)> = vec![
        ("Alice",   0),
        ("Bob",     0),
        ("Carol",   0),
        ("Dave",    0),
        ("Eve",     1),
        ("Frank",   1),
        ("Grace",   1),
        ("Hank",    2),
        ("Ivy",     2),
        ("Jack",    2),
    ];

    let mut nodes = Vec::new();
    for (i, (name, domain_idx)) in users_def.iter().enumerate() {
        let payload = json!({
            "name": name,
            "age": rng.gen_range(18..65_i32),
            "region": regions[rng.gen_range(0..regions.len())],
            "tier": tiers[rng.gen_range(0..tiers.len())],
            "lifetime_value": round2(rng.gen_range(500.0..5000.0_f64)),
            "created_at": days_ago(rng.gen_range(1..180_i64))
        });
        let resp = client.post(format!("{}/create_user", HELIX_URL)).json(&payload).send()?;
        let id = extract_id(&check_resp(resp, "create_user")?)?;
        println!("  [User {:02}] {} ({}) → {}", i, name, DOMAINS[*domain_idx], id);
        nodes.push(SeededNode { id, domain_idx: *domain_idx, name: name.to_string() });
    }
    println!("  Total users: {}\n", nodes.len());
    Ok(nodes)
}

fn seed_products(client: &Client) -> Result<Vec<SeededNode>, Box<dyn std::error::Error>> {
    println!(">>> Seeding 10 Products...");
    let mut rng = thread_rng();

    let products_def: Vec<(&str, &str, usize, f64, f64)> = vec![
        ("SKU-0000", "Zara Jacket",        0, 20.0,  300.0),
        ("SKU-0001", "H&M Dress",          0, 20.0,  300.0),
        ("SKU-0002", "Uniqlo Tee",         0, 20.0,  300.0),
        ("SKU-0003", "Zara Boots",         0, 20.0,  300.0),
        ("SKU-0004", "Apple AirPods",      1, 100.0, 2000.0),
        ("SKU-0005", "Samsung Monitor",    1, 100.0, 2000.0),
        ("SKU-0006", "Sony Headphones",    1, 100.0, 2000.0),
        ("SKU-0007", "Lush Bath Bomb",     2, 10.0,  150.0),
        ("SKU-0008", "Nivea Cream",        2, 10.0,  150.0),
        ("SKU-0009", "The Ordinary Serum", 2, 10.0,  150.0),
    ];

    let mut nodes = Vec::new();
    for (i, (sku, name, domain_idx, min_p, max_p)) in products_def.iter().enumerate() {
        let payload = json!({
            "sku": sku,
            "name": name,
            "category": DOMAINS[*domain_idx],
            "price": round2(rng.gen_range(*min_p..*max_p))
        });
        let resp = client.post(format!("{}/create_product", HELIX_URL)).json(&payload).send()?;
        let id = extract_id(&check_resp(resp, "create_product")?)?;
        println!("  [Product {:02}] {} ({}) → {}", i, name, DOMAINS[*domain_idx], id);
        nodes.push(SeededNode { id, domain_idx: *domain_idx, name: name.to_string() });
    }
    println!("  Total products: {}\n", nodes.len());
    Ok(nodes)
}

fn seed_purchases(
    client: &Client,
    users: &[SeededNode],
    products: &[SeededNode],
) -> Result<(), Box<dyn std::error::Error>> {
    println!(">>> Seeding 10 Purchased edges (1 per user)...");
    let mut rng = thread_rng();

    let mut product_pool: Vec<&SeededNode> = products.iter().collect();
    product_pool.shuffle(&mut rng);

    for (i, (user, product)) in users.iter().zip(product_pool.iter()).enumerate() {
        let amount = round2(rng.gen_range(10.0..2000.0_f64));
        let resp = client.post(format!("{}/connect_purchased", HELIX_URL)).json(&json!({
            "from_id": &user.id,
            "to_id": &product.id,
            "date": days_ago(rng.gen_range(1..180_i64)),
            "amount": amount,
            "quantity": rng.gen_range(1..4_i32)
        })).send()?;
        check_resp(resp, "connect_purchased")?;
        println!("  [Purchase {:02}] {} → \"{}\" ${}", i, user.name, product.name, amount);
    }

    println!("  Total Purchased edges: {}\n", users.len());
    Ok(())
}

fn seed_product_embeddings(
    client: &Client,
    products: &[SeededNode],
) -> Result<(), Box<dyn std::error::Error>> {
    println!(">>> Seeding 10 ProductEmbeddings (1 per product)...");

    for (i, product) in products.iter().enumerate() {
        let vector = generate_vector(product.domain_idx, i);
        println!("  [Embed {:02}] \"{}\" → {:?}", i, product.name, vector);

        let payload = json!({
            "product_id": product.id,
            "name": format!("{} Embedding", product.name),
            "description": format!("Semantic embedding for {}", product.name),
            "vec_data": vector,
            "created_at": get_now()
        });
        let resp = client.post(format!("{}/add_product_embedding", HELIX_URL)).json(&payload).send()?;
        check_resp(resp, "add_product_embedding")?;
    }

    println!("  Total ProductEmbeddings: {}\n", products.len());
    Ok(())
}

fn clear_all_data(client: &Client) -> Result<(), Box<dyn std::error::Error>> {
    println!(">>> Clearing all data...");
    let resp = client.post(format!("{}/clear_all_data", HELIX_URL)).json(&json!({})).send()?;
    check_resp(resp, "clear_all_data")?;
    println!(">>> Cleared.");
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--clean") {
        let client = Client::builder().timeout(std::time::Duration::from_secs(60)).no_proxy().build()?;
        clear_all_data(&client)?;
        return Ok(());
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .user_agent("HelixSeed/3.0.0")
        .no_proxy()
        .build()?;

    println!("=== Helix Simple Seed ===");
    println!("    Users:      10 (4 Fashion, 3 Electronics, 3 Wellness)");
    println!("    Products:   10 (4 Fashion, 3 Electronics, 3 Wellness)");
    println!("    Purchases:  10 (1 per user, each product bought once)");
    println!("    Embeddings: 10 (1 per product, clean 1:1)\n");

    let users    = seed_users(&client)?;
    let products = seed_products(&client)?;
    seed_purchases(&client, &users, &products)?;
    seed_product_embeddings(&client, &products)?;

    println!("=== Done ===");
    Ok(())
}