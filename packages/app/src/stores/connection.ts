import { createStore } from "solid-js/store";
import { invoke } from "@tauri-apps/api/core";

export interface ConnectionInfo {
  id: string;
  name: string;
  host: string;
  port: string;
  apiKey: string;
  localPath?: string;
}

interface ConnectionState {
  connections: ConnectionInfo[];
  activeConnectionId: string | null;
  editingId: string | null; // For the manager UI
}

const isTauri = () => (window as any).__TAURI_INTERNALS__ !== undefined;

// Default empty state
const initialState: ConnectionState = {
  connections: [],
  activeConnectionId: null,
  editingId: null,
};

export const [connectionStore, setConnectionStore] = createStore<ConnectionState>(initialState);

// Initial load from Tauri if available
if (isTauri()) {
  invoke("load_connection_config")
    .then((saved: any) => {
      if (saved && saved.connections) {
        setConnectionStore({
          connections: saved.connections,
          activeConnectionId: null, // Always start disconnected
          editingId: saved.connections[0]?.id || null,
        });
      }
    })
    .catch((err) => console.error("Failed to load connections from Tauri", err));
}

// Persistence logic
export const saveConnections = () => {
  const data = {
    connections: connectionStore.connections,
  };

  // File System (Desktop Persistence Only)
  if (isTauri()) {
    invoke("save_connection_config", { config: data }).catch((err) => console.error("Failed to save connections to Tauri", err));
  }
};

// Utilities
export const getConnectionUrl = (conn: ConnectionInfo) => {
  if (!conn || !conn.host) return "";
  let host = conn.host.trim();
  if (!host.startsWith("http://") && !host.startsWith("https://")) {
    host = `http://${host}`;
  }
  host = host.replace(/\/+$/, "");
  return conn.port ? `${host}:${conn.port}` : host;
};

export const activeConnection = () => {
  return connectionStore.connections.find((c) => c.id === connectionStore.activeConnectionId) || connectionStore.connections[0] || { id: "", name: "", host: "", port: "", apiKey: "" };
};

export const editingConnection = () => {
  return connectionStore.connections.find((c) => c.id === connectionStore.editingId) || activeConnection();
};
