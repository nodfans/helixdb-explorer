use reqwest::blocking::Client;
use serde_json::{json, Value};
use chrono::{Utc, Duration};
use rand::{Rng, thread_rng, seq::SliceRandom};

const HELIX_URL: &str = "http://127.0.0.1:6969";

// ─── Config ───────────────────────────────────────────────────────────────────
//
// FOLLOWS_PER_USER: how many Follows edges each user creates (outgoing).
//   Min: 1  →  15 total edges   (sparse graph)
//   Max: 14 →  up to 210 edges  (everyone follows everyone else)
//
const FOLLOWS_PER_USER: usize = 1;

// VECTOR_DIM: dimensionality of each UserEmbedding vector.
const VECTOR_DIM: usize = 8;

// ─────────────────────────────────────────────────────────────────────────────

// Interest groups — drive the embedding signal
// Tech:      dims 0,1,2  → high
// Art:       dims 3,4,5  → high
// Wellness:  dims 5,6,7  → high
const INTERESTS: [&str; 3] = ["Tech", "Art", "Wellness"];

fn generate_vector(interest_idx: usize, user_idx: usize) -> Vec<f64> {
    let mut rng = thread_rng();
    (0..VECTOR_DIM).map(|i| {
        let is_signal = match interest_idx {
            0 => i < 3,
            1 => i >= 3 && i < 6,
            2 => i >= 5,
            _ => false,
        };
        let base = if is_signal {
            (0.70 + user_idx as f64 * 0.03).min(0.95)
        } else {
            0.05
        };
        let noise: f64 = rng.gen_range(0.0..0.05);
        (base + noise).clamp(0.0, 1.0)
    }).collect()
}

fn get_now() -> String { Utc::now().to_rfc3339() }
fn days_ago(days: i64) -> String { (Utc::now() - Duration::days(days)).to_rfc3339() }

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

struct SeededUser {
    id: String,
    name: String,
    interest_idx: usize,
}

// ─── Seed Users ───────────────────────────────────────────────────────────────

fn seed_users(client: &Client) -> Result<Vec<SeededUser>, Box<dyn std::error::Error>> {
    println!(">>> Seeding 15 Users...");
    let mut rng = thread_rng();
    let regions = ["North", "South", "East", "West"];

    // 5 users per interest group
    let users_def: Vec<(&str, usize)> = vec![
        ("Alice",   0),
        ("Bob",     0),
        ("Carol",   0),
        ("Dave",    0),
        ("Eve",     0),
        ("Frank",   1),
        ("Grace",   1),
        ("Hank",    1),
        ("Ivy",     1),
        ("Jack",    1),
        ("Karen",   2),
        ("Leo",     2),
        ("Mia",     2),
        ("Noah",    2),
        ("Olivia",  2),
    ];

    let mut users = Vec::new();
    for (i, (name, interest_idx)) in users_def.iter().enumerate() {
        let bio = format!(
            "{} is a {} enthusiast from the {} region.",
            name,
            INTERESTS[*interest_idx],
            regions[rng.gen_range(0..regions.len())]
        );
        let payload = json!({
            "name": name,
            "age": rng.gen_range(18..55_i32),
            "region": regions[rng.gen_range(0..regions.len())],
            "bio": bio
        });
        let resp = client.post(format!("{}/create_user", HELIX_URL)).json(&payload).send()?;
        let id = extract_id(&check_resp(resp, "create_user")?)?;
        println!("  [User {:02}] {} ({}) → {}", i, name, INTERESTS[*interest_idx], id);
        users.push(SeededUser { id, name: name.to_string(), interest_idx: *interest_idx });
    }
    println!("  Total users: {}\n", users.len());
    Ok(users)
}

// ─── Seed Follows ─────────────────────────────────────────────────────────────

fn seed_follows(client: &Client, users: &[SeededUser]) -> Result<(), Box<dyn std::error::Error>> {
    let per_user = FOLLOWS_PER_USER.min(users.len() - 1);
    let max_possible = users.len() * (users.len() - 1);
    println!(">>> Seeding Follows edges ({} per user, {} total, max possible {})...", per_user, users.len() * per_user, max_possible);

    let mut rng = thread_rng();
    let mut total = 0;

    for user in users.iter() {
        // Pick `per_user` distinct targets (not self)
        let mut candidates: Vec<&SeededUser> = users.iter().filter(|u| u.id != user.id).collect();
        candidates.shuffle(&mut rng);
        let targets = &candidates[..per_user];

        for target in targets {
            let resp = client.post(format!("{}/follow_user", HELIX_URL)).json(&json!({
                "from_id": &user.id,
                "to_id":   &target.id,
                "followed_at": days_ago(rng.gen_range(1..365_i64))
            })).send()?;
            check_resp(resp, "follow_user")?;
            println!("  [Follow] {} → {}", user.name, target.name);
            total += 1;
        }
    }

    println!("  Total Follows edges: {}\n", total);
    Ok(())
}

// ─── Seed User Embeddings ─────────────────────────────────────────────────────

fn seed_embeddings(client: &Client, users: &[SeededUser]) -> Result<(), Box<dyn std::error::Error>> {
    println!(">>> Seeding {} UserEmbeddings (1 per user)...", users.len());

    for (i, user) in users.iter().enumerate() {
        let vector = generate_vector(user.interest_idx, i);
        println!("  [Embed {:02}] \"{}\" → {:?}", i, user.name, vector);

        let payload = json!({
            "user_id": user.id,
            "bio_text": format!("{} | interest: {}", user.name, INTERESTS[user.interest_idx]),
            "vec_data": vector,
            "created_at": get_now()
        });
        let resp = client.post(format!("{}/add_user_embedding", HELIX_URL)).json(&payload).send()?;
        check_resp(resp, "add_user_embedding")?;
    }

    println!("  Total UserEmbeddings: {}\n", users.len());
    Ok(())
}

// ─── Clear ────────────────────────────────────────────────────────────────────

fn clear_all_data(client: &Client) -> Result<(), Box<dyn std::error::Error>> {
    println!(">>> Clearing all data...");
    let resp = client.post(format!("{}/clear_all_data", HELIX_URL)).json(&json!({})).send()?;
    check_resp(resp, "clear_all_data")?;
    println!(">>> Cleared.\n");
    Ok(())
}

// ─── Main ─────────────────────────────────────────────────────────────────────

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .user_agent("HelixSeed/4.0.0")
        .no_proxy()
        .build()?;

    if args.iter().any(|a| a == "--clean") {
        clear_all_data(&client)?;
        return Ok(());
    }

    let per_user = FOLLOWS_PER_USER.min(14);
    println!("=== Helix Social Seed ===");
    println!("    Users:      15 (5 Tech, 5 Art, 5 Wellness)");
    println!("    Follows:    {} per user = {} total edges  (max possible: 210)", per_user, 15 * per_user);
    println!("    Embeddings: 15 (1 per user, grouped by interest)\n");

    let users = seed_users(&client)?;
    seed_follows(&client, &users)?;
    seed_embeddings(&client, &users)?;

    println!("=== Done ===");
    Ok(())
}