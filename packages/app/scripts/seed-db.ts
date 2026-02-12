/**
 * Standalone Seeding Script
 * Run with: npx tsx scripts/seed-db.ts
 */

export {};

const BASE_URL = "http://localhost:6969";

async function request(endpoint: string, body: any = null) {
  const url = `${BASE_URL}${endpoint}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`[${resp.status}] ${text}`);
  }
  return resp.json();
}

async function seed() {
  console.log("🚀 Starting data seeding...");

  try {
    // 1. Create Users (20 users)
    const userIds: string[] = [];
    const names = ["Alice", "Bob", "Charlie", "David", "Eve", "Frank", "Grace", "Heidi", "Ivan", "Judy", "Karl", "Linda", "Mike", "Nancy", "Oscar", "Peggy", "Quinn", "Rose", "Steve", "Trent"];

    console.log("👤 Creating 20 Users...");
    for (const name of names) {
      const age = 20 + Math.floor(Math.random() * 40);
      const score = 50 + Math.random() * 50;
      const res = await request("/create_user", { name, age, active: Math.random() > 0.2, score });
      // Extract the object (e.g. res.user) and get its id
      const userData = Object.values(res)[0] as any;
      userIds.push(userData.id);
    }

    // 2. Create Posts (50 posts)
    const postIds: string[] = [];
    const categories = ["Tech", "Life", "Finance", "Cooking", "Travel"];
    const titles = [
      "HQL vs SQL: The Ultimate Guide",
      "Graph Databases are Awesome",
      "Vector Search Explained",
      "How to Bake Sourdough",
      "My Trip to Japan",
      "Investing 101",
      "Rust Programming Tips",
      "SolidJS: Reactive UI",
      "Tauri is the future",
      "Best Coffee in Seattle",
      "10 Tips for Remote Work",
      "Healthy Meal Prep",
      "Introduction to Machine Learning",
      "Deep Learning with PyTorch",
      "AI in 2026",
      "The Magic of Graphs",
      "Scalable Systems Design",
      "Modern Web Architecture",
    ];

    console.log("📝 Creating 50 Posts...");
    for (let i = 0; i < 50; i++) {
      const userId = userIds[i % userIds.length];
      const title = titles[i % titles.length] + ` Part ${Math.floor(i / titles.length) + 1}`;
      const content = `This is a long article about ${title}. It contains keywords for search testing. #${categories[i % categories.length]}`;
      const res = await request("/seed_post_to_user", {
        user_id: userId,
        title,
        content,
        category: categories[i % categories.length],
        published: true,
        created_at: `2026-02-${(i % 28) + 1}`,
      });
      const postData = Object.values(res)[0] as any;
      postIds.push(postData.id);
    }

    // 3. Create Comments (100 comments)
    console.log("💬 Creating 100 Comments...");
    for (let i = 0; i < 100; i++) {
      const userId = userIds[Math.floor(Math.random() * userIds.length)];
      const postId = postIds[Math.floor(Math.random() * postIds.length)];
      await request("/seed_comment", {
        user_id: userId,
        post_id: postId,
        text: `Random comment #${i + 1} on this great post!`,
        created_at: `2026-02-${(i % 28) + 1}`,
      });
    }

    // 4. Relationships (Friendships & Likes)
    console.log("🔗 Creating Relationships...");
    for (let i = 0; i < userIds.length; i++) {
      const next = (i + 1) % userIds.length;
      await request("/make_friends", { user_id1: userIds[i], user_id2: userIds[next], since: "2025-01-01" });
    }
    for (let i = 0; i < 50; i++) {
      const userId = userIds[Math.floor(Math.random() * userIds.length)];
      const postId = postIds[Math.floor(Math.random() * postIds.length)];
      await request("/like_post", { user_id: userId, post_id: postId, liked_at: `2026-02-${(i % 28) + 1}` });
    }

    // 5. Vectors
    console.log("🧬 Adding Vector Data...");
    for (let i = 0; i < 10; i++) {
      const data = Array.from({ length: 4 }, () => Math.random());
      await request("/add_user_vector", {
        user_id: userIds[i % userIds.length],
        data,
      });
    }

    console.log("✅ Seeding complete!");
    console.log(`Summary: Created 20 users, 50 posts, 100 comments, and related edges.`);
  } catch (err) {
    console.error("❌ Seeding failed:", err);
    // process.exit(1);
  }
}

seed();
