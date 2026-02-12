/**
 * Cleanup Script
 * Run with: npx tsx scripts/cleanup-db.ts
 */

export {};

const BASE_URL = "http://localhost:6969";

async function request(endpoint: string, body: any = null) {
  const url = `${BASE_URL}${endpoint}`;
  const resp = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });

  if (!resp.ok) {
    const text = await resp.text();
    // Some endpoints might return 404 if no data, ignore those during cleanup
    if (resp.status === 404) return null;
    throw new Error(`[${resp.status}] ${text}`);
  }
  return resp.json();
}

async function cleanup() {
  console.log("🧹 Cleaning up database using clear_all_data query...");

  try {
    await request("/clear_all_data", {});
    console.log("✅ Cleanup complete! Database is now fresh.");
  } catch (err) {
    console.error("❌ Cleanup failed:", err);
  }
}

cleanup();
