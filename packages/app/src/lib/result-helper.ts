/**
 * Detects if a value is a "table-friendly" object (not null, is an object, but not a primitive wrapper)
 */
function isTableFriendly(val: any): boolean {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

/**
 * Intelligently extracts multiple tables from a complex JSON result.
 * Returns a map of table names to row arrays.
 *
 * Heuristics:
 * 1. If root is an Array, wrap it as { "Results": data }.
 * 2. If root is an Object:
 *    - Check for common HQL patterns (Count, Group).
 *    - If it contains multiple Arrays or Objects at Depth 1, return them as separate tables.
 *    - If it looks like a single record (mostly primitives), wrap it as { "Result": [data] }.
 */
export function extractMultiTableData(data: any): Record<string, any[]> {
  if (!data) return {};

  // 1. Direct Array
  if (Array.isArray(data)) {
    return { Results: data };
  }

  // If not an object, it's a primitive, wrap it
  if (typeof data !== "object") {
    return { Result: [{ Value: data }] };
  }

  // 2. Known HQL Aggregation Patterns
  // Pattern: { Count: { "": { count: 20, values: [...] } } }
  if (data.Count) {
    const results: Record<string, any[]> = {};
    for (const key in data.Count) {
      const group = data.Count[key];
      if (group && Array.isArray(group.values)) {
        results[key || "Count"] = group.values;
      }
    }
    if (Object.keys(results).length > 0) return results;
  }

  // Pattern: { Group: { "key": [...] } }
  if (data.Group) {
    const results: Record<string, any[]> = {};
    for (const key in data.Group) {
      const group = data.Group[key];
      if (Array.isArray(group)) {
        results[key] = group;
      }
    }
    if (Object.keys(results).length > 0) return results;
  }

  // 3. General Multi-Return Pattern
  const keys = Object.keys(data);
  const results: Record<string, any[]> = {};
  const metrics: Record<string, any> = {};
  let complexCount = 0;
  let scalarCount = 0;

  for (const key of keys) {
    const val = data[key];
    if (Array.isArray(val)) {
      results[key] = val;
      complexCount++;
    } else if (isTableFriendly(val)) {
      results[key] = [val];
      complexCount++;
    } else if (val !== undefined) {
      // Scalar value (number, string, boolean)
      metrics[key] = val;
      scalarCount++;
    }
  }

  // If we have metrics, add them as a "Summary" table at the top
  if (scalarCount > 0) {
    // Add Summary at the beginning if possible by re-ordering keys or just adding it
    results["Summary"] = [metrics];
  }

  // If we found any data, return it
  if (complexCount > 0 || scalarCount > 0) {
    return results;
  }

  // 4. Fallback: Single flat object
  return { Result: [data] };
}

/**
 * Legacy support: Returns the "first" or "best" array found.
 */
export function extractTableData(data: any): any[] | null {
  const multi = extractMultiTableData(data);
  const keys = Object.keys(multi);
  if (keys.length === 0) return null;

  // Pick the most likely "main" data
  const priority = ["data", "results", "items", "users", "records", "Results"];
  const match = priority.find((p) => multi[p]);
  if (match) return multi[match];

  return multi[keys[0]];
}
