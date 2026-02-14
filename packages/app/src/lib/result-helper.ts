function isTableFriendly(val: any): boolean {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

/**
 * 1. If root is an Array, wrap it as { "Results": data }.
 * 2. If root is an Object:
 *    - Check for common HQL patterns (Count, Group).
 *    - If it contains multiple Arrays or Objects at Depth 1, return them as separate tables.
 *    - If it looks like a single record (mostly primitives), wrap it as { "Result": [data] }.
 */
export function extractMultiTableData(data: any): Record<string, any[]> {
  if (!data) return {};

  if (Array.isArray(data)) {
    return { Results: data };
  }

  if (typeof data !== "object") {
    return { Result: [{ Value: data }] };
  }

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
      metrics[key] = val;
      scalarCount++;
    }
  }

  if (scalarCount > 0) {
    results["Summary"] = [metrics];
  }
  if (complexCount > 0 || scalarCount > 0) {
    return results;
  }

  return { Result: [data] };
}
export function extractTableData(data: any): any[] | null {
  const multi = extractMultiTableData(data);
  const keys = Object.keys(multi);
  if (keys.length === 0) return null;

  const priority = ["data", "results", "items", "users", "records", "Results"];
  const match = priority.find((p) => multi[p]);
  if (match) return multi[match];

  return multi[keys[0]];
}
