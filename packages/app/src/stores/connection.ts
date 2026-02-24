import { createStore } from "solid-js/store";
import { invoke } from "@tauri-apps/api/core";

export type ConnectionType = "local" | "cloud";

export interface ConnectionInfo {
  id: string;
  name: string;
  type?: ConnectionType;
  host: string;
  port: string;
  cloudHost?: string;
  apiKey: string;
  localPath?: string;
}

export const CLOUD_URL = "https://cloud.helix-db.com";

interface ConnectionState {
  connections: ConnectionInfo[];
  activeConnectionId: string | null;
  editingId: string | null;
}

const isTauri = () => (window as any).__TAURI_INTERNALS__ !== undefined;

const initialState: ConnectionState = {
  connections: [],
  activeConnectionId: null,
  editingId: null,
};

export const [connectionStore, setConnectionStore] = createStore<ConnectionState>(initialState);

if (isTauri()) {
  invoke("load_connection_config")
    .then((saved: any) => {
      if (saved && saved.connections) {
        setConnectionStore({
          connections: saved.connections,
          activeConnectionId: null,
          editingId: saved.connections[0]?.id || null,
        });
      }
    })
    .catch((err) => console.error("Failed to load connections from Tauri", err));
}

export const saveConnections = () => {
  const data = {
    connections: connectionStore.connections,
  };

  if (isTauri()) {
    invoke("save_connection_config", { config: data }).catch((err) => console.error("Failed to save connections to Tauri", err));
  }
};

export const getConnectionUrl = (conn: ConnectionInfo) => {
  if (conn.type === "cloud") {
    // Priority 1: Direct instance URL (cloudHost)
    let host = (conn.cloudHost || "").trim();
    if (host) {
      if (!host.startsWith("http")) host = `https://${host}`;
      return host.replace(/\/+$/, "");
    }

    // Fallback: Use official cloud URL if no host specified
    return CLOUD_URL;
  }

  // Local mode: use user host/port or default
  const host = conn.host?.trim() || "127.0.0.1";
  const port = conn.port?.trim() || "6969";
  return `http://${host}:${port}`;
};

export const validateConnection = (conn: ConnectionInfo) => {
  if (conn.type === "cloud") {
    if (!conn.cloudHost?.trim()) {
      throw new Error("Cloud Instance URL required");
    }
    if (!conn.apiKey?.trim()) {
      throw new Error("Cluster API Key required");
    }
  } else {
    if (!conn.host?.trim()) {
      throw new Error("Host address required");
    }
    if (!conn.port?.trim()) {
      throw new Error("Port number required");
    }
  }
};

export const activeConnection = () => {
  return connectionStore.connections.find((c) => c.id === connectionStore.activeConnectionId) || connectionStore.connections[0] || { id: "", name: "", host: "", port: "", apiKey: "" };
};

export const editingConnection = () => {
  return connectionStore.connections.find((c) => c.id === connectionStore.editingId) || activeConnection();
};

if (typeof window !== "undefined") {
  (window as any).activeConnection = activeConnection;
  (window as any).getConnectionUrl = () => getConnectionUrl(activeConnection());
}
