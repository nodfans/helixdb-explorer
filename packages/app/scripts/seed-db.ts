/**
 * Standalone Seeding Script (Scaled Complexity)
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
    throw new Error(`[${resp.status}] ${text} (Payload: ${JSON.stringify(body)})`);
  }
  return resp.json();
}

async function seed() {
  console.log("🚀 Starting Scaled Data Seeding...");

  try {
    // 0. Cleanup
    console.log("🧹 Cleaning up existing data...");
    await request("/clear_all_data");

    // 1. Create Users (50 users)
    const userIds: string[] = [];
    console.log("👤 Creating 50 Users...");
    for (let i = 1; i <= 50; i++) {
      const payload = {
        name: `User_${i.toString().padStart(3, "0")}`,
        age: 18 + Math.floor(Math.random() * 60),
        active: Math.random() > 0.2,
        score: parseFloat((Math.random() * 1000).toFixed(2)),
        created_at: "2026-01-01T00:00:00Z",
      };
      const res = await request("/create_user", payload);
      const userData = Object.values(res)[0] as any;
      userIds.push(userData.id);
    }

    // 2. Create Products (100 products)
    const productIds: string[] = [];
    console.log("📦 Creating 100 Products...");
    for (let i = 1; i <= 100; i++) {
      const res = await request("/create_product", {
        sku: `SKU-${i.toString().padStart(4, "0")}`,
        name: `HighEnd Gadget ${i}`,
        price: 9.99 + Math.random() * 2000,
      });
      const prodData = Object.values(res)[0] as any;
      productIds.push(prodData.id);
    }

    // 3. Create Organizations (10 orgs)
    const orgIds: string[] = [];
    const industries = ["Tech", "Bio", "Finance", "Space", "AI", "GreenEnergy", "Robotics", "Web3"];
    console.log("🏢 Creating 10 Organizations...");
    for (let i = 1; i <= 10; i++) {
      const res = await request("/create_organization", {
        name: `${industries[i % industries.length]}Corp_${i}`,
        tax_id: `TX-${Math.random().toString(36).toUpperCase().slice(2, 10)}`,
      });
      const orgData = Object.values(res)[0] as any;
      orgIds.push(orgData.id);
    }

    // 4. Create Posts (100 posts)
    const postIds: string[] = [];
    console.log("📝 Creating 100 Posts...");
    for (let i = 1; i <= 100; i++) {
      const res = await request("/create_post", {
        title: `Engineering Log #${i}`,
        content: `Technical documentation for system cluster ${i}. Performance at ${Math.floor(Math.random() * 100)}%.`,
        category: industries[i % industries.length],
        published: Math.random() > 0.1,
      });
      const postData = Object.values(res)[0] as any;
      postIds.push(postData.id);
    }

    // 5. Connect Entities (Denser Graph)
    console.log("🔗 Connecting Entities randomly...");
    for (const uid of userIds) {
      // Each user works at 1 org
      await request("/connect_works_at", {
        from_id: uid,
        to_id: orgIds[Math.floor(Math.random() * orgIds.length)],
        since: "2025-01-01T00:00:00Z",
      });

      // Each user authors 1-5 posts
      const authoredCount = 1 + Math.floor(Math.random() * 5);
      for (let j = 0; j < authoredCount; j++) {
        await request("/connect_authored", {
          from_id: uid,
          to_id: postIds[Math.floor(Math.random() * postIds.length)],
          at: "2026-02-14T00:00:00Z",
        });
      }

      // Each user purchases 0-10 products
      const purchaseCount = Math.floor(Math.random() * 11);
      for (let j = 0; j < purchaseCount; j++) {
        await request("/connect_purchased", {
          from_id: uid,
          to_id: productIds[Math.floor(Math.random() * productIds.length)],
          date: "2026-02-14T00:00:00Z",
        });
      }

      // Each user follows 0-8 other users (Social graph)
      const followCount = Math.floor(Math.random() * 9);
      for (let j = 0; j < followCount; j++) {
        const targetId = userIds[Math.floor(Math.random() * userIds.length)];
        if (targetId !== uid) {
          // Note: We don't have connect_follows in queries.hx yet, let's fix that or Skip
          // Actually, I'll update queries.hx next to include connect_follows
        }
      }
    }

    console.log("✅ Scaled Seeding complete!");
  } catch (err) {
    console.error("❌ Seeding failed:", err);
  }
}

seed();
