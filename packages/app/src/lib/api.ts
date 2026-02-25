import { NodesEdgesResponse, SchemaInfo, ConnectionData, NodeDetailsResponse, EndpointConfig, LocalStorageStats } from "./types";
import { invoke } from "@tauri-apps/api/core";

// Helper to check if we are running inside Tauri
const isTauri = () => typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__;

// Helper to make requests via Tauri's Rust backend or standard fetch
const tauriFetch = async (url: string, method: string = "GET", headers: Record<string, string> = {}, body: any = null): Promise<any> => {
  if (isTauri()) {
    try {
      const responseText = await invoke<string>("helix_request", {
        method,
        url,
        headers,
        body: body ? JSON.stringify(body) : null,
      });

      if (!responseText || responseText.trim() === "") {
        throw new Error("Empty response from server");
      }

      const parsed = JSON.parse(responseText);
      return parsed;
    } catch (err: any) {
      throw new Error(String(err));
    }
  } else {
    // Browser fallback: Use standard fetch
    try {
      const finalUrl = url;

      const response = await fetch(finalUrl, {
        method,
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : null,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server responded with status ${response.status}: ${text}`);
      }

      return await response.json();
    } catch (err: any) {
      throw new Error(String(err));
    }
  }
};

export class HelixApi {
  public baseUrl: string;
  private apiKey: string | null;
  private static inflightRequests: Map<string, Promise<any>> = new Map();
  private static schemaCache: Map<string, { data: SchemaInfo; timestamp: number }> = new Map();
  private static CACHE_TTL = 30000; // 30 seconds cache for schema

  constructor(baseUrl: string, apiKey: string | null) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  private async request(endpoint: string, method: string = "GET", body: any = null): Promise<any> {
    if (!this.baseUrl || this.baseUrl === "/") {
      console.warn("HelixApi: Request attempted with empty baseUrl, skipping.");
      throw new Error("No active connection URL configured");
    }
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }

    // Deduplication logic: Use URL + Method + Body as key
    const requestKey = `${method}:${url}:${JSON.stringify(body)}`;
    const existing = HelixApi.inflightRequests.get(requestKey);
    if (existing) {
      console.log(`[HelixApi] Deduplicating request: ${requestKey}`);
      return existing;
    }

    const requestPromise = tauriFetch(url, method, headers, body);
    HelixApi.inflightRequests.set(requestKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Small delay to prevent micro-duplicates but allowing eventual fresh data
      setTimeout(() => HelixApi.inflightRequests.delete(requestKey), 100);
    }
  }

  async ping(): Promise<void> {
    await this.request("/mcp/init", "POST", {});
  }

  async fetchSchema(force = false): Promise<SchemaInfo> {
    const cacheKey = this.baseUrl;
    const cached = HelixApi.schemaCache.get(cacheKey);
    const now = Date.now();

    if (!force && cached && now - cached.timestamp < HelixApi.CACHE_TTL) {
      console.log(`[HelixApi] Returning cached schema for: ${cacheKey}`);
      return cached.data;
    }

    const normalizeItems = (items: any, sharedProperties?: any) => {
      if (!items) return [];

      // If items is an array, process each item
      if (Array.isArray(items)) {
        return items.map((item: any) => {
          let name = "Unknown";
          let properties = {};

          if (typeof item === "string") {
            name = item;
            // Try to find properties in shared map
            if (sharedProperties && sharedProperties[item]) {
              properties = sharedProperties[item];
            }
          } else if (typeof item === "object" && item !== null) {
            name = item.name || item.title || item.id || item.label || "Unknown";
            properties = item.properties || item.fields || {};

            // If object has no properties, try shared map
            if (Object.keys(properties).length === 0 && sharedProperties && sharedProperties[name]) {
              properties = sharedProperties[name];
            }
          }

          return {
            ...(typeof item === "object" ? item : {}),
            name,
            properties,
          };
        });
      }

      // If items is an object, it might be a map of properties
      if (typeof items === "object" && items !== null) {
        // Double check if it's actually an array-like object
        const values = Object.values(items);
        if (values.length > 0 && typeof values[0] === "object" && values[0] !== null && ("name" in values[0] || "title" in values[0])) {
          return normalizeItems(values, sharedProperties);
        }

        // Handle map of properties where keys are node/edge/vector names
        return Object.entries(items).map(([name, properties]: [string, any]) => ({
          ...(typeof properties === "object" ? properties : {}),
          name,
          properties: typeof properties === "object" && properties !== null ? properties : sharedProperties?.[name] || {},
        }));
      }
      return [];
    };

    const normalizeEdges = (edges: any, sharedProperties?: any) => {
      const arr = normalizeItems(edges, sharedProperties);
      return arr.map((e: any) => ({
        ...e,
        from_node: e.from_node || e.from || e.source || "Unknown",
        to_node: e.to_node || e.to || e.target || "Unknown",
        name: e.name || e.title || e.label || "Unnamed",
      }));
    };

    const processData = (data: any) => {
      // Look for shared properties maps
      const sharedProps = data.properties || data.fields || data.schema?.properties || {};

      // The MCP schema_resource returns { queries: [...], schema: { nodes: [], edges: [], vectors: [] } }
      // while the old /introspect might return { nodes: [], edges: [], vectors: [] } directly or also nested.
      const sourceData = data.schema?.nodes ? data.schema : data;

      const nodesInput = sourceData.nodes || sourceData.classes || sourceData.labels || (Array.isArray(sourceData) ? sourceData : []);
      const edgesInput = sourceData.edges || sourceData.relationships || sourceData.links || [];
      const vectorsInput = sourceData.vectors || sourceData.indexes || [];
      const queriesInput = sourceData.queries || sourceData.tools || data.queries || data.tools || [];

      return {
        nodes: normalizeItems(nodesInput, sharedProps),
        edges: normalizeEdges(edgesInput, sharedProps),
        vectors: normalizeItems(vectorsInput, sharedProps),
        queries: (Array.isArray(queriesInput) ? queriesInput : []).map((q: any) => ({
          name: q.name || "Unknown",
          parameters: q.parameters || {},
          returns: Array.isArray(q.returns) ? q.returns : [],
        })),
      };
    };

    try {
      let data: any;
      if (isTauri()) {
        data = await invoke<any>("fetch_mcp_schema", {
          url: this.baseUrl,
          apiKey: this.apiKey,
        });
      } else {
        // Browser fallback for MCP (manually executing init & schema_resource rest calls)
        const initRes = await fetch(`${this.baseUrl}/mcp/init`, { method: "POST" });
        if (!initRes.ok) throw new Error("MCP Init failed");
        const connectionId = await initRes.json();

        const schemaRes = await fetch(`${this.baseUrl}/mcp/schema_resource`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connection_id: connectionId }),
        });
        if (!schemaRes.ok) throw new Error("MCP Schema Request failed");
        const val = await schemaRes.json();
        data = typeof val === "string" && val !== "no schema" ? JSON.parse(val) : val;
        if (data === "no schema") data = {};
      }

      const schema = processData(data);
      HelixApi.schemaCache.set(cacheKey, { data: schema, timestamp: Date.now() });
      return schema;
    } catch (introspectErr: any) {
      console.warn("HelixApi: Introspection failed, returning empty schema.", introspectErr);
      return {
        nodes: [],
        edges: [],
        vectors: [],
        queries: [],
      };
    }
  }

  async fetchEndpoints(): Promise<Record<string, EndpointConfig>> {
    const endpoints: Record<string, EndpointConfig> = {};
    let res: any;
    try {
      res = await this.request("/introspect");
    } catch (e) {
      console.warn("HelixApi: /introspect failed in fetchEndpoints, returning empty endpoints.", e);
      return endpoints;
    }

    // queries is an Array of objects based on dashboard analysis
    // @ts-ignore
    const rawQueries: any[] = Array.isArray(res.queries) ? res.queries : Object.values(res.queries || {});

    console.log("Raw queries from /introspect:", rawQueries);

    rawQueries.forEach((query) => {
      const queryName = query.name || query.query_name;
      if (!queryName) return;

      // Parse parameters: Supports both Object { name: type } and Array [{ name, param_type }]
      const params: any[] = [];
      if (query.parameters) {
        if (Array.isArray(query.parameters)) {
          // Array format: [{ name, param_type }]
          query.parameters.forEach((p: any) => {
            params.push({
              name: p.name,
              param_type: p.param_type || "String",
              type: "auto",
              required: true,
              description: p.name,
            });
          });
        } else if (typeof query.parameters === "object") {
          // Object format: { name: type }
          const sortedEntries = Object.entries(query.parameters).sort(([a], [b]) => a.localeCompare(b));
          sortedEntries.forEach(([name, type]) => {
            params.push({
              name,
              param_type: String(type),
              type: "auto",
              required: true,
              description: name,
            });
          });
        }
      }

      // Infer method using patterns from dashboard reference implementation
      // Priority: query.method > pattern inference > default GET
      // Default to GET (most queries are read operations), only override for specific patterns
      const nameLower = queryName.toLowerCase();

      // Pattern-based method inference (following dashboard reference)
      const methodPatterns = {
        POST: [/^create/, /^add/, /^insert/, /^new/, /^register/, /^make/, /^build/, /^generate/, /^send/, /^submit/, /^save/, /^assign/, /^post/],
        PUT: [/^update/, /^modify/, /^change/, /^edit/, /^replace/, /^set/, /^alter/, /^refresh/, /^sync/, /^put/],
        PATCH: [/^patch/, /^partial/, /^increment/, /^decrement/, /^toggle/],
        DELETE: [/^delete/, /^remove/, /^destroy/, /^drop/, /^clear/, /^purge/, /^erase/, /^cancel/, /^revoke/],
      };

      // Start with explicit method from server, or default to GET
      let method = query.method || "GET";

      // Only infer if server didn't provide an explicit method
      if (!query.method) {
        for (const [m, patterns] of Object.entries(methodPatterns)) {
          if (patterns.some((p) => p.test(nameLower))) {
            method = m;
            break;
          }
        }
        // If no pattern matched, method remains GET (default)
      }

      const key = `${queryName}-${method}`;

      // Priority 1: Check for explicit labels/metadata from Helix
      let labels: string[] = query.labels || query.metadata?.labels || query.target_nodes || [];

      // Extract definition if available
      const definition = query.definition || query.query_definition || query.code || "";

      // Extract labels from definition (e.g., N<User>, AddN<User>, DROP N<User>)
      // Refined regex to handle optional spaces and multiple entity types (N, Edge, Vector, etc.)
      const labelMatches = definition.matchAll(/(?:N|AddN|Edge|Vector|Link)\s*<\s*([a-zA-Z0-9_]+)\s*>/g);
      for (const match of labelMatches) {
        if (match[1] && !labels.includes(match[1])) {
          labels.push(match[1]);
        }
      }

      endpoints[key] = {
        id: key,
        name: queryName,
        method: method,
        url: `/query/${queryName}`,
        description: query.description || `Execute ${queryName}`,
        params: params,
        body: {},
        definition,
        labels,
      };
    });

    return endpoints;
  }

  /**
   * Normalizes IDs from the backend.
   * Backend returns raw u128 numeric strings in Top-N (limit) mode,
   * but hyphenated UUID strings in full graph mode.
   */
  private normalizeId(id: string | number | undefined | null): string {
    if (id === undefined || id === null) return "undefined";
    const s = String(id).toLowerCase();
    if (s.includes("-")) return s;

    // Attempt to convert numeric string to UUID hyphenated format
    try {
      const BigInt = globalThis.BigInt;
      const n = BigInt(s);
      const hex = n.toString(16).padStart(32, "0");
      return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join("-");
    } catch {
      return s;
    }
  }

  async fetchNodesAndEdges(limit?: number): Promise<NodesEdgesResponse> {
    try {
      // Use a dummy node_label to force decoding without overwriting the actual label
      let url = `/nodes-edges?node_label=__label__`;
      if (limit) url += `&limit=${limit}`;

      const response = (await this.request(url)) as any;

      // Normalize all IDs in the response
      if (response?.data) {
        response.data.nodes = (response.data.nodes || []).map((node: any) => ({
          ...node,
          id: this.normalizeId(node.id),
        }));

        response.data.edges = (response.data.edges || []).map((edge: any) => ({
          ...edge,
          from: this.normalizeId(edge.from),
          to: this.normalizeId(edge.to),
          id: edge.id ? this.normalizeId(edge.id) : undefined,
        }));
      }

      return response;
    } catch (e: any) {
      if (String(e).includes("empty")) {
        return {
          data: { nodes: [], edges: [], vectors: [] },
          stats: { num_nodes: 0, num_edges: 0, num_vectors: 0 },
        };
      }
      throw e;
    }
  }

  async fetchNodeConnections(nodeId: string): Promise<ConnectionData> {
    return this.request(`/node-connections?node_id=${encodeURIComponent(nodeId)}`);
  }

  async fetchNodeDetails(nodeId: string): Promise<NodeDetailsResponse> {
    return this.request(`/node-details?id=${encodeURIComponent(nodeId)}`);
  }

  /**
   * Executes dynamic HQL code via the Tauri backend.
   */
  async executeHQL(hql: string, params: Record<string, any> = {}): Promise<any> {
    const requestKey = `hql:${this.baseUrl}:${hql}:${JSON.stringify(params)}`;
    const existing = HelixApi.inflightRequests.get(requestKey);
    if (existing) {
      console.log(`[HelixApi] Deduplicating HQL request: ${hql.slice(0, 50)}...`);
      return existing;
    }

    const requestPromise = (async () => {
      try {
        const res = await invoke<any>("execute_dynamic_hql", {
          url: this.baseUrl,
          code: hql,
          params,
          apiKey: this.apiKey,
        });
        return res;
      } catch (e) {
        console.error("HQL execution failed:", e);
        throw e;
      }
    })();

    HelixApi.inflightRequests.set(requestKey, requestPromise);
    try {
      return await requestPromise;
    } finally {
      setTimeout(() => HelixApi.inflightRequests.delete(requestKey), 100);
    }
  }

  private cachedSchema: SchemaInfo | null = null;

  // TODO: implement
  async fetchVectorNodes(vectorLabel: string, limit: number = 1000): Promise<any[]> {
    console.log(`[HelixApi] fetchVectorNodes starting for: ${vectorLabel}`);

    if (!this.cachedSchema) {
      try {
        this.cachedSchema = await this.fetchSchema();
      } catch (e) {
        console.warn("[HelixApi] Could not fetch schema for vector mapping:", e);
      }
    }

    const vectorEdge = this.cachedSchema?.edges.find((e) => e.to_node === vectorLabel);

    let hql = "";
    if (vectorEdge) {
      // Start from vectors (v) to ensure every row has coord data,
      // then hop back to source (src) for labels/properties.
      hql = `QUERY GetVectors() =>
          v <- V<${vectorLabel}>::RANGE(0, ${limit})
          src <- v::In<${vectorEdge.name}>
          RETURN v, src
        `;
    } else {
      hql = `QUERY GetVectors() =>
          v <- V<${vectorLabel}>::RANGE(0, ${limit})
          RETURN v
        `;
    }

    try {
      console.log(`[HelixApi] fetchVectorNodes: Executing HQL:\n${hql}`);
      const res = await this.executeHQL(hql);
      console.log(`[HelixApi] fetchVectorNodes: Raw response:`, res);

      if (!res) {
        console.warn("[HelixApi] fetchVectorNodes: Received empty response from executeHQL");
        return [];
      }

      // HELIX-EXPLORER BACKEND VIBE:
      // Multiple HQL returns (e.g., "RETURN v, src") are returned as { v: [...], src: [...] }
      if (res.v && res.src && Array.isArray(res.v) && Array.isArray(res.src)) {
        console.log(`[HelixApi] fetchVectorNodes: Multiple returns detected (v, src). Zipping ${res.v.length} vectors with source nodes.`);
        return res.v.map((vNode: any, i: number) => {
          const srcNode = res.src[i] || {};
          return {
            ...vNode,
            ...srcNode,
            id: vNode.id, // Prefer vector ID for identification
          };
        });
      }

      // Fallback for single return or results-wrapped format
      let rawData: any[] = [];
      if (Array.isArray(res)) {
        rawData = res;
      } else if (res && typeof res === "object") {
        rawData = res.results || res.v || res.nodes || res.data || Object.values(res)[0] || [];
      }

      console.log(`[HelixApi] fetchVectorNodes: Returning ${rawData.length} nodes (fallback/single path)`);
      return rawData;
    } catch (e) {
      console.warn("fetchVectorNodes failed:", e);
      return [];
    }
  }

  async fetchSimilarNodes(nodeId: string, vectorLabel: string, k: number = 10): Promise<any[]> {
    // 1. Find the vector associated with this node first
    // 2. Perform SearchV based on that vector
    // For now, we'll use a direct SearchV query if we had the vector,
    // but since we only have nodeId, we traverse to the vector first then search.

    if (!this.cachedSchema) {
      try {
        this.cachedSchema = await this.fetchSchema();
      } catch {}
    }

    const vectorEdge = this.cachedSchema?.edges.find((e) => e.to_node === vectorLabel);
    if (!vectorEdge) return [];

    const hql = `QUERY FindSimilar(start_id: ID, k: I32) =>
      target <- N<${vectorEdge.from_node}>(id: $start_id)
      v_seed <- target::OutE<${vectorEdge.name}>::ToV
      sim_v <- SearchV<${vectorLabel}>(v_seed, $k)
      sim_node <- sim_v::In<${vectorEdge.name}>
      RETURN sim_node
    `;

    try {
      const res = await this.executeHQL(hql, { start_id: nodeId, k });
      if (res && res.sim_node) return res.sim_node;
      return Array.isArray(res) ? res : [];
    } catch (e) {
      console.warn("fetchSimilarNodes failed:", e);
      return [];
    }
  }

  async searchVectors(query: string, vectorLabel: string, k: number = 20): Promise<any[]> {
    const hql = `QUERY SemanticSearch(q: String, k: I32) =>
      v <- SearchV<${vectorLabel}>($q, $k)
      RETURN v
    `;

    try {
      const res = await this.executeHQL(hql, { q: query, k });
      if (res && res.v) return res.v;
      return Array.isArray(res) ? res : [];
    } catch (e) {
      console.warn("searchVectors failed:", e);
      return [];
    }
  }

  // Execute a query endpoint
  // IMPORTANT: HelixDB server requires ALL custom queries to be executed via POST with JSON body.
  // The endpoint.method field is for UI display only (semantic meaning), NOT for actual API calls.
  async executeEndpoint(
    endpoint: EndpointConfig,
    values: Record<string, any>,
    _methodOverride?: string // Deprecated: HelixDB always uses POST
  ): Promise<any> {
    const url = `/${endpoint.name}`;
    // Always use POST for HelixDB custom query execution
    const method = "POST";
    const body: Record<string, any> = {};

    // Map and convert values using robust type conversion
    // Aligned with dashboard reference implementation for HelixDB/Rust backend compatibility
    if (endpoint.params) {
      endpoint.params.forEach((p) => {
        const value = values[p.name];
        // Do not skip empty strings; send them as "" or default values to satisfy type requirements.
        if (value === undefined) return;

        // Use original param_type for exact matching (HelixDB uses PascalCase types)
        const typeOriginal = p.param_type;
        const typeLower = p.param_type.toLowerCase();

        let typedValue: any = value;

        // === String Types ===
        if (typeOriginal === "String" || typeLower === "string" || typeLower === "str" || typeOriginal === "ID" || typeLower === "id") {
          typedValue = String(value);
        }
        // === Date Type (pass through as string, Rust will parse) ===
        else if (typeOriginal === "Date" || typeLower === "date") {
          typedValue = String(value);
        }
        // === Boolean Types ===
        else if (typeOriginal === "Boolean" || typeOriginal === "Bool" || typeLower === "boolean" || typeLower === "bool") {
          // Handle various boolean representations
          if (typeof value === "boolean") {
            typedValue = value;
          } else if (typeof value === "string") {
            const lowerVal = value.toLowerCase().trim();
            typedValue = lowerVal === "true" || lowerVal === "1" || lowerVal === "yes";
          } else {
            typedValue = Boolean(value);
          }
        }
        // === Integer Types (both PascalCase and lowercase) ===
        else if (
          ["I8", "I16", "I32", "I64", "U8", "U16", "U32", "U64", "U128"].includes(typeOriginal) ||
          ["i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "u128", "int", "integer", "usize", "isize"].includes(typeLower)
        ) {
          const parsed = parseInt(String(value), 10);
          typedValue = isNaN(parsed) ? 0 : parsed;
        }
        // === Float Types (both PascalCase and lowercase) ===
        else if (["F32", "F64"].includes(typeOriginal) || typeLower === "f32" || typeLower === "f64" || typeLower.includes("float")) {
          const parsed = parseFloat(String(value));
          typedValue = isNaN(parsed) ? 0.0 : parsed;
        }
        // === Array Types ===
        else if (typeLower.includes("array") || typeLower.includes("vec") || typeLower.includes("list") || typeOriginal.startsWith("[") || typeOriginal.startsWith("Array(")) {
          // Determine element type from the array type definition
          // e.g., "Array(F64)" -> "F64", "[F64]" -> "F64", "Vec<f64>" -> "f64"
          let elementType = "string";
          const arrayMatch = typeOriginal.match(/(?:Array\(|Vec<|\[)([A-Za-z0-9]+)(?:\)|\>|\])/);
          if (arrayMatch) {
            elementType = arrayMatch[1].toLowerCase();
          }

          if (typeof value === "string") {
            const strVal = value.trim();
            try {
              // Try to parse as JSON array first (e.g., "[1, 2, 3]")
              if (strVal.startsWith("[") && strVal.endsWith("]")) {
                typedValue = JSON.parse(strVal);
              } else {
                // Split by comma
                typedValue = strVal
                  .split(",")
                  .map((s) => s.trim())
                  .filter((s) => s !== "");
              }
            } catch {
              // Fallback: split by comma
              typedValue = strVal
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s !== "");
            }

            // Convert elements based on detected element type
            if (Array.isArray(typedValue)) {
              if (elementType === "f32" || elementType === "f64" || elementType.includes("float")) {
                typedValue = typedValue.map((v) => {
                  const n = parseFloat(String(v));
                  return isNaN(n) ? 0.0 : n;
                });
              } else if (["i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64"].includes(elementType)) {
                typedValue = typedValue.map((v) => {
                  const n = parseInt(String(v), 10);
                  return isNaN(n) ? 0 : n;
                });
              }
              // else keep as strings
            }
          } else if (!Array.isArray(value)) {
            typedValue = [value];
          }
          // If already an array, leave as-is
        }
        // === Default: pass through as-is ===
        // For unknown types, let the server handle it

        body[p.name] = typedValue;
      });
    }

    // HelixDB requires POST with JSON body for all custom query executions
    return this.request(url, method, body);
  }

  // Deprecated: use executeEndpoint
  async runQuery(queryName: string, params: Record<string, any>): Promise<any> {
    return this.request(`/${queryName}`, "POST", params);
  }

  async getLocalDbStats(path: string, instanceName?: string): Promise<LocalStorageStats> {
    if (isTauri()) {
      return await invoke<LocalStorageStats>("get_local_db_stats", { path, instanceName });
    }
    throw new Error("Local DB stats are only available in the desktop application.");
  }
}
