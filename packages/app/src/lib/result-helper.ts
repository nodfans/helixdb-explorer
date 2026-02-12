/**
 * Intelligently extracts an array of objects from a complex JSON result
 * to display in a table view.
 *
 * Heuristics:
 * 1. If input is an array, return it directly.
 * 2. If input is an object, search for standard wrapper keys (values, items, data, rows).
 * 3. If input has 'Count' or 'Group' keys (common HQL patterns), drill down.
 * 4. Perform a shallow breadth-first search for the first array found.
 */
export function extractTableData(data: any): any[] | null {
  if (!data) return null;

  // 1. Direct Array
  if (Array.isArray(data)) {
    return data;
  }

  if (typeof data !== "object") {
    return null;
  }

  // 2. Known HQL Aggregation Patterns
  // Pattern: { Count: { "": { count: 20, values: [...] } } }
  if (data.Count) {
    // Try to find a 'values' array inside Count's children
    for (const key in data.Count) {
      const group = data.Count[key];
      if (group && Array.isArray(group.values)) {
        return group.values;
      }
    }
  }

  // Pattern: { Group: { "key": [...] } }
  if (data.Group) {
    for (const key in data.Group) {
      const group = data.Group[key];
      if (Array.isArray(group)) {
        return group;
      }
    }
  }

  // 3. Common Wrapper Keys (BFS level 1)
  const wrapperKeys = ["values", "items", "data", "rows", "results"];
  for (const key of wrapperKeys) {
    if (Array.isArray(data[key])) {
      return data[key];
    }
  }

  // 4. Fallback: Search values for any array (BFS level 1)
  for (const key in data) {
    const val = data[key];
    if (Array.isArray(val) && val.length > 0) {
      // Check if it looks like a row (objects) rather than primitives
      // (Though primitives are displayable too, usually objects make more sense for a table)
      return val;
    }
  }

  return null;
}
