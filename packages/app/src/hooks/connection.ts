import { createSignal, createMemo } from "solid-js";
import { HelixDB } from "helix-ts";
import { HelixApi } from "../lib/api";
import { invoke } from "@tauri-apps/api/core";
import { setConnectionStore, activeConnection, getConnectionUrl, ConnectionInfo, saveConnections, validateConnection } from "../stores/connection";
import { setWorkbenchState, queryStateCache } from "../stores/workbench";
import { setHqlStore } from "../stores/hql";

const isTauri = () => typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__;

export const resetWorkspaceState = () => {
  setWorkbenchState({
    endpoints: [],
    selectedEndpoint: null,
    params: {},
    result: null,
    rawResult: null,
    error: null,
    loading: false,
  });

  queryStateCache.clear();

  setHqlStore("tabs", () => true, {
    output: "",
    rawOutput: null,
    status: "idle",
    queryStatus: "idle",
    syncStatus: "idle",
    tableData: [],
    multiTableData: {},
    selectedRows: [],
    logs: "",
  });

  setHqlStore("schema", null);
};

export function createConnection() {
  const [showSettings, setShowSettings] = createSignal(false);
  const [isConnected, setIsConnected] = createSignal(false);
  const [isConnecting, setIsConnecting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [showSuccess, setShowSuccess] = createSignal(false);

  const [connectedConfig, setConnectedConfig] = createSignal<{ url: string; apiKey: string | null }>({
    url: getConnectionUrl(activeConnection()),
    apiKey: activeConnection().apiKey || null,
  });

  const tauriFetch = async (input: string | URL, init?: RequestInit & { timeout?: number }): Promise<Response> => {
    const url = input.toString();
    const method = init?.method || "GET";
    const headers: Record<string, string> = {};

    if (init?.headers) {
      const h = new Headers(init.headers);
      h.forEach((value, key) => {
        headers[key] = value;
      });
    }

    const body = init?.body ? String(init.body) : null;
    const timeout_ms = init?.timeout || null;

    if (isTauri()) {
      try {
        console.log(`[TauriFetch] Calling helix_request: ${method} ${url}`, { headers, body, timeout_ms });
        const responseText = await invoke<string>("helix_request", {
          method,
          url,
          headers,
          body,
          timeoutMs: timeout_ms,
        });
        console.log(`[TauriFetch] Response received:`, responseText.substring(0, 100) + "...");

        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => responseText,
          json: async () => JSON.parse(responseText),
        } as Response;
      } catch (err: any) {
        console.error(`[TauriFetch] Error:`, err);
        return {
          ok: false,
          status: 500,
          statusText: String(err),
          text: async () => String(err),
          json: async () => ({ error: String(err) }),
        } as Response;
      }
    } else {
      try {
        return await fetch(url, init);
      } catch (err: any) {
        return {
          ok: false,
          status: 500,
          statusText: String(err),
          text: async () => String(err),
          json: async () => ({ error: String(err) }),
        } as Response;
      }
    }
  };

  const dbClient = createMemo(() => {
    const config = connectedConfig();
    const client = new HelixDB(config.url, config.apiKey);
    (client as any).fetch = tauriFetch;
    return client;
  });

  const apiClient = createMemo(() => {
    const config = connectedConfig();
    return new HelixApi(config.url, config.apiKey);
  });

  const handleConnect = async (conn: ConnectionInfo) => {
    resetWorkspaceState();
    setIsConnecting(true);
    setError(null);

    try {
      validateConnection(conn);
      const sanitizedUrl = getConnectionUrl(conn);
      console.log(`[handleConnect] Attempting lightweight ping: type=${conn.type}, url=${sanitizedUrl}`);
      const response = await tauriFetch(`${sanitizedUrl}/mcp/init`, {
        method: "POST",
        headers: {
          ...(conn.apiKey ? { "x-api-key": conn.apiKey } : {}),
        },
        body: JSON.stringify({}),
      });

      console.log(`[handleConnect] Connection response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Server responded with status ${response.status}`);
      }

      setConnectionStore("connections", (connections) => {
        const index = connections.findIndex((c) => c.id === conn.id);
        if (index !== -1) {
          const newConnections = [...connections];
          newConnections[index] = conn;
          return newConnections;
        } else {
          return [...connections, conn];
        }
      });
      saveConnections();

      setConnectionStore("activeConnectionId", conn.id);
      setIsConnected(true);

      // Successfully connected: safe to update the client config and trigger background fetches
      setConnectedConfig({
        url: sanitizedUrl,
        apiKey: conn.apiKey || null,
      });

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      setShowSettings(false);
    } catch (err: any) {
      console.error(`[handleConnect] Connection failed:`, err);
      setError(err.message || String(err));
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const testConnection = async (conn: ConnectionInfo) => {
    setError(null);
    validateConnection(conn);
    const sanitizedUrl = getConnectionUrl(conn);
    // Increased timeout for better reliability
    const timeout = (conn.type || "local") === "local" ? 1000 : 5000;
    const response = await tauriFetch(`${sanitizedUrl}/mcp/init`, {
      method: "POST",
      headers: {
        ...(conn.apiKey ? { "x-api-key": conn.apiKey } : {}),
      },
      body: JSON.stringify({}),
      timeout,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Server responded with status ${response.status}`);
    }
  };

  const handleDisconnect = () => {
    setConnectionStore("activeConnectionId", null);
    setIsConnected(false);
    setShowSuccess(false);

    // Reset API config on disconnect
    setConnectedConfig({ url: "", apiKey: null });

    import("../stores/workbench").then(({ setWorkbenchState, queryStateCache }) => {
      setWorkbenchState({
        endpoints: [],
        selectedEndpoint: null,
        params: {},
        result: null,
        rawResult: null,
        error: null,
      });
      queryStateCache.clear();
    });
  };

  return {
    showSettings,
    isConnected,
    isConnecting,
    showSuccess,
    error,
    dbClient,
    apiClient,
    handleConnect,
    testConnection,
    setError,
    disconnect: handleDisconnect,
    openSettings: () => setShowSettings(true),
    closeSettings: () => setShowSettings(false),
  };
}
