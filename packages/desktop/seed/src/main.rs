use reqwest::blocking::Client;
use serde_json::{json, Value};
use chrono::{Utc, Duration};
use rand::{Rng, thread_rng};

const HELIX_URL: &str = "http://127.0.0.1:6969";

const USERS_PER_DOMAIN: usize = 2;
const PRODUCTS_PER_DOMAIN: usize = 3;
const PURCHASES_PER_USER: usize = 2;
const EMBEDDINGS_PER_DOMAIN: usize = 5;

const DOMAINS: [&str; 3] = ["Fashion", "Electronics", "Wellness"];
const VECTOR_DIM: usize = 8;

fn generate_vector(domain_idx: usize, item_idx: usize) -> Vec<f64> {
    let mut rng = thread_rng();

    // Each domain occupies its own "strong" dimensions:
    // Fashion:     dims 0,1,2  → high signal
    // Electronics: dims 3,4,5  → high signal
    // Wellness:    dims 5,6,7  → high signal
    // All other dims stay near 0 → vectors are near-orthogonal across domains
    (0..VECTOR_DIM).map(|i| {
        let is_domain_dim = match domain_idx {
            0 => i < 3,
            1 => i >= 3 && i < 6,
            2 => i >= 5,
            _ => false,
        };

        let base = if is_domain_dim {
            // item_idx adds slight spread within the same domain
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

struct SeededNode { id: String, domain_idx: usize }

fn seed_users(client: &Client) -> Result<Vec<SeededNode>, Box<dyn std::error::Error>> {
    println!(">>> Seeding Users...");
    let mut rng = thread_rng();
    let tiers = ["Bronze", "Silver", "Gold", "Platinum"];
    let regions = ["North", "South", "East", "West"];

    let lifetime_ranges = [(500.0_f64, 3000.0_f64), (2000.0, 15000.0), (200.0, 1500.0)];
    let recency_ranges = [(1_i64, 30_i64), (30, 180), (7, 60)];

    let mut nodes = Vec::new();
    for domain_idx in 0..DOMAINS.len() {
        let domain = DOMAINS[domain_idx];
        for i in 0..USERS_PER_DOMAIN {
            let payload = json!({
                "name": format!("{}_User_{}", domain, i),
                "age": rng.gen_range(18..65_i32),
                "region": regions[rng.gen_range(0..regions.len())],
                "tier": tiers[rng.gen_range(0..tiers.len())],
                "lifetime_value": round2(rng.gen_range(lifetime_ranges[domain_idx].0..lifetime_ranges[domain_idx].1)),
                "created_at": days_ago(rng.gen_range(recency_ranges[domain_idx].0..recency_ranges[domain_idx].1))
            });
            let resp = client.post(format!("{}/create_user", HELIX_URL)).json(&payload).send()?;
            let id = extract_id(&check_resp(resp, "create_user")?)?;
            println!("  [{}] User_{} → {}", domain, i, id);
            nodes.push(SeededNode { id, domain_idx });
        }
    }
    println!("  Total users: {}", nodes.len());
    Ok(nodes)
}

fn seed_products(client: &Client) -> Result<Vec<SeededNode>, Box<dyn std::error::Error>> {
    println!(">>> Seeding Products...");
    let mut rng = thread_rng();
    let brands = [
        ["Zara", "H&M", "Uniqlo"],
        ["Apple", "Samsung", "Sony"],
        ["Lush", "Nivea", "The Ordinary"],
    ];
    let price_ranges = [(20.0_f64, 300.0_f64), (100.0, 2000.0), (10.0, 150.0)];

    let mut nodes = Vec::new();
    for domain_idx in 0..DOMAINS.len() {
        let domain = DOMAINS[domain_idx];
        for i in 0..PRODUCTS_PER_DOMAIN {
            let brand = brands[domain_idx][i % 3];
            let payload = json!({
                "sku": format!("SKU-{}-{:04}", domain.to_uppercase(), i),
                "name": format!("{} {} #{}", brand, domain, i),
                "category": domain,
                "price": round2(rng.gen_range(price_ranges[domain_idx].0..price_ranges[domain_idx].1))
            });
            let resp = client.post(format!("{}/create_product", HELIX_URL)).json(&payload).send()?;
            let id = extract_id(&check_resp(resp, "create_product")?)?;
            println!("  [{}] Product_{} → {}", domain, i, id);
            nodes.push(SeededNode { id, domain_idx });
        }
    }
    println!("  Total products: {}", nodes.len());
    Ok(nodes)
}

fn seed_purchases(
    client: &Client,
    users: &[SeededNode],
    products: &[SeededNode],
) -> Result<(), Box<dyn std::error::Error>> {
    println!(">>> Seeding Purchased edges...");
    let mut rng = thread_rng();
    let mut edge_count = 0;

    let mut domain_products: Vec<Vec<&SeededNode>> = vec![Vec::new(); 3];
    for p in products { domain_products[p.domain_idx].push(p); }

    let amount_ranges = [(20.0_f64, 300.0_f64), (100.0, 2000.0), (10.0, 150.0)];
    let recency_ranges = [(1_i64, 30_i64), (30, 180), (7, 60)];

    for user in users {
        let d = user.domain_idx;
        for _ in 0..PURCHASES_PER_USER {
            let product = if rng.gen_bool(0.7) && !domain_products[d].is_empty() {
                domain_products[d][rng.gen_range(0..domain_products[d].len())]
            } else {
                &products[rng.gen_range(0..products.len())]
            };
            let amount = round2(rng.gen_range(amount_ranges[d].0..amount_ranges[d].1));
            let resp = client.post(format!("{}/connect_purchased", HELIX_URL)).json(&json!({
                "from_id": &user.id,
                "to_id": &product.id,
                "date": days_ago(rng.gen_range(recency_ranges[d].0..recency_ranges[d].1)),
                "amount": amount,
                "quantity": rng.gen_range(1..4_i32)
            })).send()?;
            check_resp(resp, "connect_purchased")?;
            edge_count += 1;
        }
    }
    println!("  Total Purchased edges: {}", edge_count);
    Ok(())
}

fn seed_product_embeddings(
    client: &Client,
    products: &[SeededNode],
) -> Result<(), Box<dyn std::error::Error>> {
    println!(">>> Seeding ProductEmbeddings...");
    let mut rng = thread_rng();
    let mut count = 0;

    let mut domain_products: Vec<Vec<&SeededNode>> = vec![Vec::new(); 3];
    for p in products { domain_products[p.domain_idx].push(p); }

    for domain_idx in 0..DOMAINS.len() {
        let pool = &domain_products[domain_idx];
        for i in 0..EMBEDDINGS_PER_DOMAIN {
            let product = pool[i % pool.len()];
            let vector = generate_vector(domain_idx, i);
            println!("  [{}] Vector for {}: {:?}", DOMAINS[domain_idx], product.id, vector);
            let payload = json!({
                "product_id": product.id,
                "name": format!("{} Embed {}", DOMAINS[domain_idx], i),
                "description": format!("{} product semantic embedding {}", DOMAINS[domain_idx], i),
                "price": round2(rng.gen_range(10.0..2000.0_f64)),
                "vec_data": vector,
                "created_at": get_now()
            });
            let resp = client.post(format!("{}/add_product_embedding", HELIX_URL)).json(&payload).send()?;
            check_resp(resp, "add_product_embedding")?;
            count += 1;
        }
        println!("  [{}] {} embeddings seeded", DOMAINS[domain_idx], EMBEDDINGS_PER_DOMAIN);
    }
    println!("  Total ProductEmbeddings: {}", count);
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
    println!("    Users:      {} per domain × 3 = {}", USERS_PER_DOMAIN, USERS_PER_DOMAIN * 3);
    println!("    Products:   {} per domain × 3 = {}", PRODUCTS_PER_DOMAIN, PRODUCTS_PER_DOMAIN * 3);
    println!("    Purchases:  {} per user × {} = {}", PURCHASES_PER_USER, USERS_PER_DOMAIN * 3, PURCHASES_PER_USER * USERS_PER_DOMAIN * 3);
    println!("    Embeddings: {} per domain × 3 = {}", EMBEDDINGS_PER_DOMAIN, EMBEDDINGS_PER_DOMAIN * 3);

    let users    = seed_users(&client)?;
    let products = seed_products(&client)?;
    seed_purchases(&client, &users, &products)?;
    seed_product_embeddings(&client, &products)?;

    println!("=== Done ===");
    Ok(())
}