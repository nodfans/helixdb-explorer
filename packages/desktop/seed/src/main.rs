use futures::{StreamExt, stream};
use reqwest::Client;
use serde_json::{json, Value};
use chrono::{Utc, Duration};
use rand::{Rng, thread_rng, seq::SliceRandom};

// const TARGET: &str = "LOCAL";
const TARGET: &str = "CLOUD";
const LOCAL_URL: &str = "http://127.0.0.1:6969";
const FOLLOWS_PER_USER: usize = 4;
const POSTS_PER_USER_MIN: usize = 2;
const POSTS_PER_USER_MAX: usize = 3;
const VECTOR_DIM: usize = 8;
const INTERESTS: [&str; 3] = ["Systems", "Web", "AI/ML"];
 
// Interesting data facts:
// Systems:  dims 0,1,2 -> high
// Web:      dims 2,3,4 -> high
// AI/ML:    dims 5,6,7 -> high
 
const USERS: [(&str, usize, &str, &str); 20] = [
    ("alice",  28, "West",  "Low-level systems programmer. Obsessed with zero-cost abstractions."),
    ("bob",    34, "East",  "Kernel hacker by day, Rust evangelist by night."),
    ("carol",  26, "North", "Embedded systems engineer. If it doesn't run on bare metal, why bother?"),
    ("dave",   31, "South", "C++ veteran slowly converting to Rust. Send help."),
    ("eve",    29, "West",  "Compiler engineer at a big tech company. Loves writing passes."),
    ("frank",  38, "East",  "OS dev. Has strong opinions about memory allocators."),
    ("grace",  27, "North", "Writes device drivers for fun. Yes, really."),
    ("hank",   25, "South", "Full-stack dev. TypeScript purist, React skeptic."),
    ("ivy",    30, "West",  "Frontend architect. Accessibility and performance first."),
    ("jack",   33, "East",  "Backend engineer. Postgres and boring tech make me happy."),
    ("karen",  28, "North", "API design nerd. REST vs GraphQL debates welcomed."),
    ("leo",    24, "South", "Junior dev learning the ropes. Currently suffering through webpack configs."),
    ("mia",    32, "West",  "DevOps/platform engineer. Kubernetes is both my job and my nemesis."),
    ("noah",   35, "East",  "ML researcher. Training LLMs on a shoestring budget."),
    ("olivia", 29, "North", "Data scientist turned ML engineer. NumPy runs in my veins."),
    ("peter",  31, "South", "AI infra engineer. Optimizing GPU kernels for fun."),
    ("quinn",  27, "West",  "NLP researcher. Tokenizers are more interesting than you think."),
    ("rachel", 30, "East",  "MLOps engineer. Making ML reproducible, one pipeline at a time."),
    ("sam",    26, "North", "RL researcher. Teaching agents to play games and occasionally succeed."),
    ("tina",   33, "South", "Applied AI engineer. Bridging the gap between research and production."),
];

const POSTS_SYSTEMS: [(&str, &str); 8] = [
    ("Why I rewrote our HTTP server in Rust", "After two years of fighting with memory leaks in our C++ codebase, I finally convinced the team to try Rust. The borrow checker is painful at first, but the zero-cost abstractions and fearless concurrency make it worth it. Throughput went up 40%, and we haven't had a segfault since."),
    ("Understanding memory allocators: jemalloc vs tcmalloc vs mimalloc", "Spent the last few weeks benchmarking allocators for our high-throughput service. jemalloc wins for multi-threaded workloads, but mimalloc surprised me with its low fragmentation characteristics. Thread-local caching is the key insight they all share."),
    ("Writing a toy OS kernel from scratch: lessons learned", "Six months in, I have a bootloader, basic VGA output, a GDT, IDT, and a very naive round-robin scheduler. What I've learned: paging is subtle, stack management will bite you, and QEMU is your best friend. Worth every hour."),
    ("Zero-copy networking in Linux with io_uring", "io_uring changed how I think about async I/O. By keeping data in kernel space and using fixed buffers, we cut CPU usage in our packet processing pipeline by 30%. The learning curve is steep but the performance gains are real."),
    ("The hidden costs of virtual dispatch in C++", "vtable lookups aren't free. In a hot path with tight loops, virtual dispatch can demolish branch prediction and thrash your instruction cache. I benchmarked three approaches: virtual, CRTP, and std::variant. Results were surprising."),
    ("Building a lock-free queue that actually works", "Most lock-free queue implementations you find online are broken. They either have ABA problems, incorrect memory orderings, or just don't compile on non-x86. Here's what I learned building one that passes stress tests on ARM, x86, and RISC-V."),
    ("Compiler explorer is the best tool you're not using enough", "Godbolt changed how I write performance-critical code. Watching the assembly change as you tweak your source is addictive. Tip: always compare with -O2 and -O3, and pay attention to auto-vectorization hints."),
    ("Profiling Rust with perf and flamegraphs", "cargo build --release isn't enough. I walk through my workflow: perf stat for a quick overview, perf record + flamegraph for hotspot hunting, and cargo-criterion for micro-benchmarks. Most of my 'slow Rust' turned out to be slow algorithms."),
];

const POSTS_WEB: [(&str, &str); 8] = [
    ("Stop using useEffect for data fetching", "useEffect for data fetching is an anti-pattern in 2024. Between race conditions, double-invocation in strict mode, and the mental overhead of dependency arrays, you're better off with React Query or SWR. I migrated a large codebase and the diff was net negative lines."),
    ("Postgres full-text search is probably good enough", "Before reaching for Elasticsearch, try Postgres tsvector. With GIN indexes, ts_rank, and a bit of query tuning, it handles 90% of search use cases. Less infra, less ops burden, and it's already where your data lives."),
    ("Why I stopped writing REST APIs and started using tRPC", "End-to-end type safety between my Next.js frontend and Node backend eliminated an entire class of bugs. No more mismatched response shapes, no manual OpenAPI schemas. If you're in a TypeScript monorepo, tRPC is a no-brainer."),
    ("The baseline web performance checklist for 2024", "LCP under 2.5s, CLS under 0.1, FID under 100ms. Getting there: serve images in AVIF/WebP, preload critical fonts, defer non-critical JS, and use a CDN. Most sites fail on the basics before needing fancy optimization."),
    ("Docker Compose is all you need for local dev", "I've watched teams spin up full Kubernetes clusters for local development. It's almost never worth it. Docker Compose, good seed scripts, and a Makefile cover 95% of what you need. Save K8s for staging and prod."),
    ("Designing APIs for humans: lessons from 5 years of mistakes", "Consistent naming beats clever naming. Pagination should be cursor-based from day one. Never break backward compatibility. Document error codes, not just happy paths. These are the lessons I wish I'd learned before version 1."),
    ("SQLite in production: when it's actually the right call", "For read-heavy apps with modest write throughput, SQLite on a fast SSD with WAL mode enabled is legitimately great. Litestream for replication, no connection pooling headaches, and trivially simple backups. Don't dismiss it."),
    ("Accessibility is not optional: a practical starting point", "Semantic HTML gets you 70% of the way. Add keyboard navigation, ARIA labels where needed, and sufficient color contrast. Screen reader test with NVDA or VoiceOver. Run axe in CI. Most accessibility issues are fixable in an afternoon."),
];

const POSTS_AI: [(&str, &str); 8] = [
    ("Fine-tuning LLMs on consumer hardware: a realistic guide", "QLoRA makes fine-tuning a 7B model on a single RTX 3090 actually feasible. With 4-bit quantization and gradient checkpointing, you can fit training in 24GB VRAM. Expect 8-12 hours per epoch on a modest dataset. Results on domain-specific tasks are surprisingly strong."),
    ("Why your ML pipeline is slower than it needs to be", "The bottleneck is almost never the GPU. DataLoader workers, preprocessing on CPU, and tiny batch sizes are the usual culprits. Profile with PyTorch Profiler before touching model architecture. I sped up training 3x without changing a single weight."),
    ("Attention is all you need, but attention to what?", "After implementing transformers from scratch three times, I finally feel like I understand multi-head attention. The key insight: each head learns to attend to different relationship types. Visualization tools like BertViz make this concrete."),
    ("Experiment tracking is the unsexy skill that will make you better", "MLflow, Weights & Biases, or even a spreadsheet. What matters is logging hyperparameters, metrics, and artifacts consistently. I've replicated 'irreproducible' results twice this year just because I had good tracking."),
    ("Building a RAG pipeline that doesn't hallucinate (much)", "Retrieval-Augmented Generation is only as good as your retrieval. Chunking strategy, embedding model choice, and reranking matter more than your LLM. I compared five chunking approaches on a legal document corpus. Semantic chunking won by a wide margin."),
    ("Tokenizers are weirder than you think", "BPE, WordPiece, SentencePiece all make different trade-offs. Whitespace handling, unknown token behavior, and vocabulary size affect downstream task performance in ways that are easy to overlook. I spent a week debugging a multilingual model that turned out to have a tokenizer mismatch."),
    ("Reward hacking in RL: my agent learned to cheat", "Trained an agent to maximize score in a custom environment. It found a policy that exploited a bug in my reward function and achieved infinite score without solving the actual task. Classic Goodhart's Law. Reward design is harder than model design."),
    ("From notebook to production: the ML engineering gap", "A model that works in a Jupyter notebook is 30% of the work. Serving, monitoring, retraining triggers, data drift detection, and rollback strategies are the other 70%. If you're a data scientist moving into ML engineering, this is what the job actually looks like."),
];

const COMMENTS: [&str; 20] = [
    "This is exactly what I needed. Bookmarked.",
    "Have you benchmarked this against the naive approach? Curious about the numbers.",
    "Great write-up. I ran into the same issue last month and wish I had this.",
    "Disagree on one point. In our experience the trade-off flips at scale.",
    "The link to the repo would be super helpful here.",
    "I've been doing this wrong for two years. Thanks for the correction.",
    "Solid post. The part about memory ordering is often glossed over.",
    "Any plans to follow up on the async version?",
    "We shipped something similar. Happy to share our learnings if interested.",
    "The flamegraph section is gold. More people need to know about this workflow.",
    "Minor nit: the code sample on line 3 has an off-by-one.",
    "This matches my intuition but I never had the data to back it up. Nice.",
    "Tried this approach, hit a wall with the edge case you mentioned. Still worth it.",
    "The comparison table alone is worth the read.",
    "Counterpoint: have you considered just using a simpler solution?",
    "Shared this with my team. Instant Slack reactions.",
    "This is the post I will link every time someone asks me about this topic.",
    "Would love to see a part 2 on the distributed version.",
    "The section on profiling changed how I think about this. Thank you.",
    "Really clear explanation. Even a junior dev could follow this.",
];

fn days_ago(days: i64) -> String { (Utc::now() - Duration::days(days)).to_rfc3339() }
fn get_now() -> String { Utc::now().to_rfc3339() }

fn check_resp_text(
    status: reqwest::StatusCode,
    text: &str,
    ctx: &str,
) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    if !status.is_success() {
        return Err(format!("[ERROR] {}: {} — {}", ctx, status, text).into());
    }
    Ok(serde_json::from_str(text)?)
}

fn extract_id(v: &Value) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    if let Some(id) = v.get("id").and_then(|x| x.as_str()) {
        return Ok(id.to_string());
    }
    if let Some(obj) = v.as_object() {
        for (_, val) in obj {
            if let Some(id) = val.get("id").and_then(|x| x.as_str()) {
                return Ok(id.to_string());
            }
        }
    }
    Err(format!("No id in: {:?}", v).into())
}
 
async fn retry_request<F, Fut, T>(mut f: F) -> Result<T, Box<dyn std::error::Error + Send + Sync>>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, Box<dyn std::error::Error + Send + Sync>>>,
{
    let mut last_error = None;
    for attempt in 0..3 {
        match f().await {
            Ok(res) => return Ok(res),
            Err(e) => {
                let err_str = e.to_string();
                if err_str.contains("IncompleteMessage") || err_str.contains("connection reset") {
                    eprintln!("  [RETRY] Attempt {}/3 failed: {}", attempt + 1, err_str);
                    tokio::time::sleep(std::time::Duration::from_millis(500 * (attempt + 1) as u64)).await;
                    last_error = Some(e);
                    continue;
                }
                return Err(e);
            }
        }
    }
    Err(last_error.unwrap_or_else(|| "Retry failed".into()))
}

fn generate_vector(interest_idx: usize, post_idx: usize) -> Vec<f64> {
    let mut rng = thread_rng();
    (0..VECTOR_DIM).map(|i| {
        let is_signal = match interest_idx {
            0 => i < 3,
            1 => (2..5).contains(&i),
            2 => i >= 5,
            _ => false,
        };
        let base = if is_signal { (0.70 + post_idx as f64 * 0.02).min(0.95) } else { 0.05 };
        let noise: f64 = rng.gen_range(0.0..0.05);
        (base + noise).clamp(0.0, 1.0)
    }).collect()
}

#[derive(Clone)]
struct SeededUser { id: String, name: String, interest_idx: usize }

#[derive(Clone)]
struct SeededPost { id: String, title: String, interest_idx: usize }

// ─── Phase 1: Users ───────────────────────────────────────────────────────────

async fn seed_users(client: &Client, url: &str, concurrency: usize) -> Result<Vec<SeededUser>, Box<dyn std::error::Error + Send + Sync>> {
    println!(">>> [1/5] Seeding {} users (parallel, limit {})...", USERS.len(), concurrency);
 
    let users_stream = stream::iter(USERS.iter().enumerate().map(|(i, (name, age, region, bio))| {
        let (client, url) = (client.clone(), url.to_string());
        let (name, region, bio) = (name.to_string(), region.to_string(), bio.to_string());
        let (age, interest_idx) = (*age, i / 7);
        async move {
            retry_request(|| {
                let (client, url, name, region, bio) = (client.clone(), url.clone(), name.clone(), region.clone(), bio.clone());
                async move {
                    let resp = client.post(format!("{}/create_user", url))
                        .json(&json!({ "name": name, "age": age, "region": region, "bio": bio }))
                        .send().await?;
                    let (status, text) = (resp.status(), resp.text().await?);
                    let id = extract_id(&check_resp_text(status, &text, "create_user")?)?;
                    Ok(SeededUser { id, name, interest_idx })
                }
            }).await
        }
    }));
 
    let mut users = Vec::new();
    let mut users_results = users_stream.buffer_unordered(concurrency);
    let mut i = 0;
    while let Some(res) = users_results.next().await {
        let u = res?;
        println!("  [{:02}] @{:8} ({})", i, u.name, INTERESTS[u.interest_idx]);
        users.push(u);
        i += 1;
    }
 
    println!("  ✓ {} users\n", users.len());
    Ok(users)
}

// ─── Phase 2: Posts + Authored ────────────────────────────────────────────────

async fn seed_posts(client: &Client, url: &str, users: &[SeededUser], concurrency: usize) -> Result<Vec<SeededPost>, Box<dyn std::error::Error + Send + Sync>> {
    println!(">>> [2/5] Seeding posts (parallel, limit {})...", concurrency);
 
    let mut work: Vec<(SeededUser, String, String, String)> = Vec::new();
    let mut rng = thread_rng();
 
    for user in users.iter() {
        let pool = match user.interest_idx { 0 => &POSTS_SYSTEMS[..], 1 => &POSTS_WEB[..], _ => &POSTS_AI[..] };
        let count = rng.gen_range(POSTS_PER_USER_MIN..=POSTS_PER_USER_MAX);
        let mut idxs: Vec<usize> = (0..pool.len()).collect();
        idxs.shuffle(&mut rng);
        for i in idxs.iter().take(count) {
            let (title, body) = pool[*i];
            work.push((user.clone(), title.to_string(), body.to_string(), days_ago(rng.gen_range(1..180_i64))));
        }
    }
 
    let posts_stream = stream::iter(work.into_iter().map(|(user, title, body, created_at)| {
        let (client, url) = (client.clone(), url.to_string());
        async move {
            retry_request(|| {
                let (client, url, user, title, body, created_at) = (client.clone(), url.clone(), user.clone(), title.clone(), body.clone(), created_at.clone());
                async move {
                    let resp = client.post(format!("{}/create_post", url))
                        .json(&json!({ "title": title, "body": body, "created_at": created_at }))
                        .send().await?;
                    let (status, text) = (resp.status(), resp.text().await?);
                    let post_id = extract_id(&check_resp_text(status, &text, "create_post")?)?;
 
                    let resp = client.post(format!("{}/author_post", url))
                        .json(&json!({ "user_id": user.id, "post_id": post_id, "created_at": created_at }))
                        .send().await?;
                    let (status, text) = (resp.status(), resp.text().await?);
                    check_resp_text(status, &text, "author_post")?;
                    Ok(SeededPost { id: post_id, title, interest_idx: user.interest_idx })
                }
            }).await
        }
    }));
 
    let mut posts = Vec::new();
    let mut posts_results = posts_stream.buffer_unordered(concurrency);
    while let Some(res) = posts_results.next().await {
        posts.push(res?);
    }
 
    println!("  ✓ {} posts\n", posts.len());
    Ok(posts)
}

// ─── Phase 3: Follows ─────────────────────────────────────────────────────────

async fn seed_follows(client: &Client, url: &str, users: &[SeededUser], concurrency: usize) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let per_user = FOLLOWS_PER_USER.min(users.len() - 1);
    println!(">>> [3/5] Seeding follows ({} per user, parallel limit {})...", per_user, concurrency);
 
    let mut rng = thread_rng();
    let mut work = Vec::new();
 
    for user in users.iter() {
        let mut candidates: Vec<&SeededUser> = users.iter().filter(|u| u.id != user.id).collect();
        candidates.shuffle(&mut rng);
        for target in &candidates[..per_user] {
            work.push((user.id.clone(), target.id.clone(), days_ago(rng.gen_range(1..365_i64))));
        }
    }
 
    let follows_stream = stream::iter(work.into_iter().map(|(from_id, to_id, followed_at)| {
        let (client, url) = (client.clone(), url.to_string());
        async move {
            retry_request(|| {
                let (client, url, from_id, to_id, followed_at) = (client.clone(), url.clone(), from_id.clone(), to_id.clone(), followed_at.clone());
                async move {
                    let resp = client.post(format!("{}/follow_user", url))
                        .json(&json!({ "from_id": from_id, "to_id": to_id, "followed_at": followed_at }))
                        .send().await?;
                    let (status, text) = (resp.status(), resp.text().await?);
                    check_resp_text(status, &text, "follow_user")?;
                    Ok(())
                }
            }).await
        }
    }));
 
    let mut results = follows_stream.buffer_unordered(concurrency);
    while let Some(res) = results.next().await { res?; }
 
    println!("  ✓ {} follows\n", users.len() * per_user);
    Ok(())
}

// ─── Phase 4: Likes + Forwards + Comments (all at once) ───────────────────────

async fn seed_interactions(client: &Client, url: &str, users: &[SeededUser], posts: &[SeededPost], concurrency: usize) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    println!(">>> [4/5] Seeding likes, forwards, comments (parallel, limit {})...", concurrency);
 
    let mut rng = thread_rng();
    let mut work = Vec::new();
 
    for user in users.iter() {
        let mut pool: Vec<&SeededPost> = posts.iter().collect();
 
        // Likes
        pool.shuffle(&mut rng);
        for post in pool.iter().take(rng.gen_range(3..=6)) {
            work.push(("like", user.id.clone(), post.id.clone(), "".to_string(), days_ago(rng.gen_range(1..180_i64))));
        }
 
        // Forwards
        pool.shuffle(&mut rng);
        for post in pool.iter().take(rng.gen_range(1..=3)) {
            work.push(("forward", user.id.clone(), post.id.clone(), "".to_string(), days_ago(rng.gen_range(1..180_i64))));
        }
 
        // Comments
        pool.shuffle(&mut rng);
        for post in pool.iter().take(rng.gen_range(2..=4)) {
            let body = COMMENTS[rng.gen_range(0..COMMENTS.len())].to_string();
            work.push(("comment", user.id.clone(), post.id.clone(), body, days_ago(rng.gen_range(1..180_i64))));
        }
    }
 
    let interactions_stream = stream::iter(work.into_iter().map(|(kind, user_id, post_id, body, date)| {
        let (client, url) = (client.clone(), url.to_string());
        async move {
            retry_request(|| {
                let (client, url, user_id, post_id, body, date) = (client.clone(), url.clone(), user_id.clone(), post_id.clone(), body.clone(), date.clone());
                async move {
                    let (endpoint, payload) = match kind {
                        "like" => ("like_post", json!({ "user_id": user_id, "post_id": post_id, "liked_at": date })),
                        "forward" => ("forward_post", json!({ "user_id": user_id, "post_id": post_id, "forwarded_at": date })),
                        _ => ("comment_post", json!({ "user_id": user_id, "post_id": post_id, "body": body, "created_at": date })),
                    };
                    let resp = client.post(format!("{}/{}", url, endpoint)).json(&payload).send().await?;
                    let (s, t) = (resp.status(), resp.text().await?);
                    check_resp_text(s, &t, endpoint)?;
                    Ok::<&'static str, Box<dyn std::error::Error + Send + Sync>>(kind)
                }
            }).await
        }
    }));
 
    let (mut likes, mut fwds, mut cmts) = (0, 0, 0);
    let mut results = interactions_stream.buffer_unordered(concurrency);
    while let Some(res) = results.next().await {
        match res? { "like" => likes += 1, "forward" => fwds += 1, _ => cmts += 1 }
    }
 
    println!("  ✓ {} likes  {} forwards  {} comments\n", likes, fwds, cmts);
    Ok(())
}

// ─── Phase 5: Embeddings ──────────────────────────────────────────────────────

async fn seed_embeddings(client: &Client, url: &str, posts: &[SeededPost], concurrency: usize) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    println!(">>> [5/5] Seeding {} embeddings (parallel, limit {})...", posts.len(), concurrency);
 
    let embeddings_stream = stream::iter(posts.iter().enumerate().map(|(i, post)| {
        let (client, url) = (client.clone(), url.to_string());
        let (post_id, post_text) = (post.id.clone(), post.title.clone());
        let (vector, created_at) = (generate_vector(post.interest_idx, i), get_now());
        async move {
            retry_request(|| {
                let (client, url, post_id, post_text, vector, created_at) = (client.clone(), url.clone(), post_id.clone(), post_text.clone(), vector.clone(), created_at.clone());
                async move {
                    let resp = client.post(format!("{}/add_post_embedding", url))
                        .json(&json!({ "post_id": post_id, "post_text": post_text, "vec_data": vector, "created_at": created_at }))
                        .send().await?;
                    let (s, t) = (resp.status(), resp.text().await?);
                    check_resp_text(s, &t, "add_post_embedding")?;
                    Ok(())
                }
            }).await
        }
    }));
 
    let mut results = embeddings_stream.buffer_unordered(concurrency);
    while let Some(res) = results.next().await { res?; }
 
    println!("  ✓ {} embeddings\n", posts.len());
    Ok(())
}

// ─── Clear ────────────────────────────────────────────────────────────────────

async fn clear_all_data(client: &Client, url: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    println!(">>> Clearing all data...");
    let resp = client.post(format!("{}/clear_all_data", url)).json(&json!({})).send().await?;
    let (s, t) = (resp.status(), resp.text().await?);
    check_resp_text(s, &t, "clear_all_data")?;
    println!("  ✓ Cleared.\n");
    Ok(())
}

// ─── Phase 6: Orphan Nodes (for graph testing) ───────────────────────────────

const ORPHAN_POSTS: [(&str, &str); 5] = [
    ("Orphan: thoughts on distributed consensus", "A post intentionally created without any edges for graph layout testing."),
    ("Orphan: notes on cache invalidation", "Another isolated node to verify graph zoom behavior with disconnected components."),
    ("Orphan: weekend project ideas", "Deliberately unlinked post node for testing purposes."),
    ("Orphan: debugging war stories", "This node has no connections to test how the graph handles outliers."),
    ("Orphan: random musings on type theory", "Isolated node to stress-test zoomToFit and force simulation boundaries."),
];

async fn seed_orphan_nodes(client: &Client, url: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    println!(">>> [6/6] Seeding {} orphan nodes (no edges)...", ORPHAN_POSTS.len());

    for (title, body) in ORPHAN_POSTS.iter() {
        let resp = client.post(format!("{}/create_post", url))
            .json(&json!({ "title": title, "body": body, "created_at": days_ago(30) }))
            .send().await?;
        let (status, text) = (resp.status(), resp.text().await?);
        check_resp_text(status, &text, "create_orphan_post")?;
    }

    println!("  ✓ {} orphan nodes\n", ORPHAN_POSTS.len());
    Ok(())
}

// ─── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    dotenvy::dotenv().ok();
    let args: Vec<String> = std::env::args().collect();

    let (url, api_key) = match TARGET {
        "CLOUD" => (
            std::env::var("HELIX_URL").expect("HELIX_URL must be set in .env for CLOUD mode"),
            std::env::var("HELIX_API_KEY").ok(),
        ),
        "LOCAL" => (
            LOCAL_URL.to_string(),
            None,
        ),
        _ => (
            std::env::var("HELIX_URL").unwrap_or_else(|_| LOCAL_URL.to_string()),
            std::env::var("HELIX_API_KEY").ok(),
        ),
    };

    let mut headers = reqwest::header::HeaderMap::new();
    if let Some(key) = api_key {
        headers.insert("x-api-key", reqwest::header::HeaderValue::from_str(&key).unwrap());
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .user_agent("HelixSeed/6.0.0")
        .default_headers(headers)
        .no_proxy()
        .build()?;

    if args.iter().any(|a| a == "--clean") {
        clear_all_data(&client, &url).await?;
        return Ok(());
    }

    let concurrency = if TARGET == "CLOUD" { 5 } else { 5 };
 
    println!("=== Helix Seed v6 (async) ===");
    println!("    Target:  {}", url);
    println!("    Workers: {} (throttled for quality)", concurrency);
    println!("    Users:   20  |  Posts: ~50  |  Follows: {}  |  Interactions: all parallel\n", 20 * FOLLOWS_PER_USER);
 
    let start = std::time::Instant::now();
    let users = seed_users(&client, &url, concurrency).await?;
    let posts = seed_posts(&client, &url, &users, concurrency).await?;
    seed_follows(&client, &url, &users, concurrency).await?;
    seed_interactions(&client, &url, &users, &posts, concurrency).await?;
    seed_embeddings(&client, &url, &posts, concurrency).await?;
    seed_orphan_nodes(&client, &url).await?;
 
    println!("=== Done in {:.2}s ===", start.elapsed().as_secs_f64());
    Ok(())
}