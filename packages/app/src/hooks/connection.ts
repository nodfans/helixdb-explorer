import { createSignal, createMemo } from "solid-js";
import { HelixDB } from "helix-ts";
import { HelixApi } from "../lib/api";
import { invoke } from "@tauri-apps/api/core";
import { setConnectionStore, activeConnection, getConnectionUrl, ConnectionInfo, saveConnections } from "../stores/connection";

// Helper to check if we are running inside Tauri
const isTauri = () => typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__;

export function createConnection() {
  const [showSettings, setShowSettings] = createSignal(false);
  const [isConnected, setIsConnected] = createSignal(false);
  const [isConnecting, setIsConnecting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [showSuccess, setShowSuccess] = createSignal(false);

  const tauriFetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
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

    if (isTauri()) {
      try {
        const responseText = await invoke<string>("helix_request", {
          method,
          url,
          headers,
          body,
        });

        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => responseText,
          json: async () => JSON.parse(responseText),
        } as Response;
      } catch (err: any) {
        return {
          ok: false,
          status: 500,
          statusText: String(err),
          text: async () => String(err),
          json: async () => ({ error: String(err) }),
        } as Response;
      }
    } else {
      // Browser fallback
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
    const active = activeConnection();
    const url = getConnectionUrl(active);
    const client = new HelixDB(url, active.apiKey || null);
    (client as any).fetch = tauriFetch;
    return client;
  });

  const apiClient = createMemo(() => {
    const active = activeConnection();
    const url = getConnectionUrl(active);
    return new HelixApi(url, active.apiKey || null);
  });

  const handleConnect = async (conn: ConnectionInfo) => {
    setIsConnecting(true);
    setError(null);

    try {
      const trimmedHost = (conn.host || "").trim();
      if (!trimmedHost || trimmedHost === "http://" || trimmedHost === "https://") {
        throw new Error("Invalid Host");
      }
      const sanitizedUrl = getConnectionUrl(conn);
      const response = await tauriFetch(`${sanitizedUrl}/nodes-edges`, {
        method: "GET",
        headers: {
          ...(conn.apiKey ? { "x-api-key": conn.apiKey } : {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Server responded with status ${response.status}`);
      }

      // Update the connection in the store list and persist
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
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      setShowSettings(false);
    } catch (err: any) {
      setError(err.message || String(err));
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const testConnection = async (conn: ConnectionInfo) => {
    setError(null);
    const trimmedHost = (conn.host || "").trim();
    if (!trimmedHost || trimmedHost === "http://" || trimmedHost === "https://") {
      throw new Error("Invalid Host");
    }
    const sanitizedUrl = getConnectionUrl(conn);
    const response = await tauriFetch(`${sanitizedUrl}/nodes-edges`, {
      method: "GET",
      headers: {
        ...(conn.apiKey ? { "x-api-key": conn.apiKey } : {}),
      },
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

    // Clear workbench state on disconnect
    import("../stores/workbench").then(({ setWorkbenchState }) => {
      setWorkbenchState({
        endpoints: [],
        selectedEndpoint: null,
        params: {},
        result: null,
        rawResult: null,
        error: null,
        queryStateCache: {},
      });
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
