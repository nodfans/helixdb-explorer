import { NodesEdgesResponse, SchemaInfo, ConnectionData, NodeDetailsResponse, EndpointConfig } from "./types";
import { invoke } from "@tauri-apps/api/core";

// Helper to check if we are running inside Tauri
const isTauri = () => typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__;

// Helper to make requests via Tauri's Rust backend or standard fetch
const tauriFetch = async (url: string, method: string = "GET", headers: Record<string, string> = {}, body: any = null): Promise<any> => {
  if (isTauri()) {
    try {
      console.log(`[tauriFetch] Requesting: ${method} ${url}`);
      const responseText = await invoke<string>("helix_request", {
        method,
        url,
        headers,
        body: body ? JSON.stringify(body) : null,
      });
      console.log(`[tauriFetch] Response text length: ${responseText?.length || 0} bytes`);
      if (responseText) {
        console.log(`[tauriFetch] Response preview: ${responseText.substring(0, 200)}`);
      }

      if (!responseText || responseText.trim() === "") {
        throw new Error("Empty response from server");
      }

      const parsed = JSON.parse(responseText);
      console.log(`[tauriFetch] Parsed response:`, parsed);
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
  private baseUrl: string;
  private apiKey: string | null;

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
    return tauriFetch(url, method, headers, body);
  }

  async fetchSchema(): Promise<SchemaInfo> {
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
      const sharedProps = data.properties || data.fields || data.schema || {};

      const nodesInput = data.nodes || data.classes || data.labels || (Array.isArray(data) ? data : []);
      const edgesInput = data.edges || data.relationships || data.links || [];
      const vectorsInput = data.vectors || data.indexes || [];

      return {
        nodes: normalizeItems(nodesInput, sharedProps),
        edges: normalizeEdges(edgesInput, sharedProps),
        vectors: normalizeItems(vectorsInput, sharedProps),
      };
    };

    // HelixDB primarily uses /introspect for schema info. /schema is often restricted to POST.
    try {
      console.log("HelixApi: Fetching schema via /introspect...");
      const res = await this.request("/introspect");
      console.log("HelixApi: /introspect success", res);

      const data = res.data || res.schema || res.results || res || {};
      const normalized = processData(data);
      console.log("HelixApi: Normalized /introspect data", normalized);
      return normalized;
    } catch (introspectErr: any) {
      console.warn("HelixApi: /introspect failed, trying /nodes-edges sampling fallback...", introspectErr);

      try {
        const res = await this.request("/nodes-edges");
        const rawData = res.data || res || { nodes: [], edges: [], vectors: [] };

        const nodes: Record<string, any> = {};
        const edges: Record<string, any> = {};
        const vectors: Record<string, any> = {};

        const nodeList = Array.isArray(rawData.nodes) ? rawData.nodes : [];
        const edgeList = Array.isArray(rawData.edges) ? rawData.edges : [];

        // Discovery: Since /nodes-edges might be bare (ids only), sample some items
        // to find their actual labels and properties via /node-details
        const sampledNodes = nodeList.slice(0, 10);
        for (const s of sampledNodes) {
          try {
            const detail = await this.request(`/node-details?id=${encodeURIComponent(s.id)}`);
            const n = detail.node || detail.data || s;
            const label = n.label || n.name || "Unknown";
            if (!nodes[label]) nodes[label] = { name: label, properties: {} };

            // Extract properties from the sample
            const propsSource = n.properties || n.fields || n;
            Object.entries(propsSource).forEach(([k, v]) => {
              if (!["id", "title", "label", "name", "properties", "fields"].includes(k)) {
                nodes[label].properties[k] = typeof v;
              }
            });
          } catch (e) {
            console.warn("Sampling node failed", s.id, e);
          }
        }

        // Handle edges (if bare)
        edgeList.forEach((e: any) => {
          const label = e.label || e.name || "Edge";
          if (!edges[label]) {
            edges[label] = {
              name: label,
              from_node: e.from_node || e.from || "Unknown",
              to_node: e.to_node || e.to || "Unknown",
              properties: {},
            };
          }
        });

        // Ensure we have at least something if sampling found nothing
        if (Object.keys(nodes).length === 0 && nodeList.length > 0) {
          nodes["Node"] = { name: "Node", properties: { id: "ID" } };
        }

        const result = {
          nodes: Object.values(nodes),
          edges: Object.values(edges),
          vectors: Object.values(vectors),
        };

        console.log("HelixApi: Inferred schema result", result);
        return result;
      } catch (fallbackErr: any) {
        console.error("HelixApi: All discovery methods failed", { introspectErr, fallbackErr });
        throw new Error(`Failed to fetch schema: ${introspectErr.message || String(introspectErr)}`);
      }
    }
  }

  async fetchEndpoints(): Promise<Record<string, EndpointConfig>> {
    const res = await this.request("/introspect");

    // queries is an Array of objects based on dashboard analysis
    // @ts-ignore
    const rawQueries: any[] = Array.isArray(res.queries) ? res.queries : Object.values(res.queries || {});

    console.log("Raw queries from /introspect:", rawQueries);

    const endpoints: Record<string, EndpointConfig> = {};

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
  private normalizeId(id: string | number): string {
    const s = String(id);
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
    try {
      const res = await invoke<any>("execute_dynamic_hql", {
        url: this.baseUrl,
        code: hql,
        params,
      });
      return res;
    } catch (e) {
      console.error("HQL execution failed:", e);
      throw e;
    }
  }

  /**
   * Fetches all nodes that are associated with a vector index.
   * This is used for the Similarity Map visualization.
   */
  async fetchVectorNodes(vectorLabel: string, limit: number = 1000): Promise<any[]> {
    // HelixDB's MCP protocol has a limitation where V<Label> is often translated
    // to NFromType which only searches the Node table.
    // Since we cannot modify the server source, we use a traversal workaround:
    // We try to find the actual vectors by traversing from the corresponding nodes.

    // Map vector labels back to their source nodes (based on our seed/schema)
    const labelMapping: Record<string, { node: string; edge: string }> = {
      UserEmbedding: { node: "User", edge: "HasUserEmbedding" },
      PostEmbedding: { node: "Post", edge: "HasPostEmbedding" },
      ProductEmbedding: { node: "Product", edge: "HasProductEmbedding" },
    };

    const mapping = labelMapping[vectorLabel];

    // If we have a mapping, use a traversal which is supported by MCP
    const hql = mapping
      ? `QUERY GetVectors() =>
          src <- N<${mapping.node}>::RANGE(0, ${limit})
          v <- src::OutE<${mapping.edge}>::ToV
          RETURN v
        `
      : `QUERY GetVectors() =>
          v <- V<${vectorLabel}>::RANGE(0, ${limit})
          RETURN v
        `;

    try {
      const res = await this.executeHQL(hql);
      if (res && typeof res === "object") {
        const data = res.v || res.nodes || res.data || Object.values(res)[0];
        if (Array.isArray(data)) return data;
      }
      return Array.isArray(res) ? res : [];
    } catch (e) {
      console.warn("fetchVectorNodes failed:", e);
      return [];
    }
  }

  /**
   * Finds the nearest neighbors for a given node using its vector embedding.
   */
  async fetchSimilarNodes(nodeId: string, vectorLabel: string, k: number = 10): Promise<any[]> {
    // Note: For similarity search, we would typically get the node's vector first
    // then use SearchV<vectorLabel>(vector, k).
    // For now, using a placeholder query that avoids invalid SIMILAR syntax.
    // k is added to params to satisfy lint.
    const hql = `QUERY FindSimilar(start_id: ID, k: I32) =>
      target <- N<${vectorLabel}>(id: $start_id)
      RETURN target
    `;

    try {
      const res = await this.executeHQL(hql, { start_id: nodeId, k });
      if (res && typeof res === "object") {
        return res.matches || res.target || res.data || Object.values(res)[0] || [];
      }
      return Array.isArray(res) ? res : [];
    } catch (e) {
      console.warn("fetchSimilarNodes failed:", e);
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
}
