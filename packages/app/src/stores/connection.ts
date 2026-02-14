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

if (typeof window !== "undefined") {
  (window as any).activeConnection = activeConnection;
  (window as any).getConnectionUrl = () => getConnectionUrl(activeConnection());
}
