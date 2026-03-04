import { For, Show, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { CircleAlert, Plus, Trash2, Server, Globe, Hash, ShieldCheck, CircleCheck, Database, Zap, Activity } from "lucide-solid";
import { connectionStore, setConnectionStore, saveConnections, ConnectionInfo, activeConnection } from "../stores/connection";
import { invoke } from "@tauri-apps/api/core";

// Debounce helper for disk I/O
function debounce(fn: Function, ms: number) {
  let timeoutId: any;
  return (...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

const debouncedSave = debounce(saveConnections, 500);

export interface ConnectionProps {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  onConnect: (conn: ConnectionInfo) => void;
  onUpdate: (conn: ConnectionInfo) => void;
  onDisconnect: () => void;
  onTest: (conn: ConnectionInfo) => Promise<void>;
  onEditingIdChange?: () => void;
  mode: "standard" | "link";
}

export const Connection = (props: ConnectionProps & { isOpen: boolean; onCancel: () => void }) => {
  const [testResult, setTestResult] = createSignal<{ success: boolean; message: string; loading?: boolean } | null>(null);
  const [newIds, setNewIds] = createSignal<Set<string>>(new Set());

  const isModeLocked = (id: string | undefined) => {
    if (!id) return false;
    return !newIds().has(id);
  };

  createEffect(() => {
    connectionStore.editingId;
    editingConn()?.type;
    setTestResult(null);
    props.onEditingIdChange?.();
  });

  createEffect(() => {
    if (props.isOpen && connectionStore.connections.length === 0) {
      handleAdd();
    }
  });

  const handleAdd = () => {
    const id = crypto.randomUUID();
    const newConn: ConnectionInfo = {
      id,
      name: "New Connection",
      type: "local",
      host: "",
      port: "",
      apiKey: "",
    };
    setConnectionStore("connections", (c) => [...c, newConn]);
    setConnectionStore("editingId", id);
    setNewIds((s) => new Set(s).add(id));
    debouncedSave();
  };

  const handleDelete = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    if (connectionStore.connections.length <= 1) return;

    const newConns = connectionStore.connections.filter((c) => c.id !== id);
    setConnectionStore("connections", newConns);

    if (connectionStore.editingId === id) {
      setConnectionStore("editingId", newConns[0].id);
    }
    if (connectionStore.activeConnectionId === id) {
      setConnectionStore("activeConnectionId", null);
    }
    debouncedSave();
  };

  const editingConn = () => connectionStore.connections.find((c) => c.id === connectionStore.editingId) || connectionStore.connections[0];

  const updateEditing = (updates: Partial<ConnectionInfo>, idOverride?: string) => {
    const id = idOverride || connectionStore.editingId;
    if (!id) return;
    setConnectionStore("connections", (c) => c.id === id, updates);
    debouncedSave();
  };

  const triggerAutoDetect = (conn: ConnectionInfo, currentId: string) => {
    if ((conn.type || "local") === "local" && !conn.localPath) {
      invoke<string>("detect_workspace_path", { port: conn.port })
        .then((path) => {
          if (path) updateEditing({ localPath: path }, currentId);
        })
        .catch(() => {
          setTestResult({
            success: false,
            message: "Connection successful, but workspace path could not be auto-detected.",
          });
        });
    }
  };

  const handleTest = async () => {
    setTestResult({ success: false, message: "Testing...", loading: true });
    try {
      const conn = editingConn();
      const currentId = conn.id;
      await props.onTest(conn);
      setTestResult({ success: true, message: "Connection successful!" });
      triggerAutoDetect(conn, currentId);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || "Connection failed" });
    }
  };

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/25 backdrop-blur-[12px] p-4 animate-in fade-in duration-300 select-none" onClick={props.onCancel}>
        <div
          class="flex h-auto max-h-[calc(100vh-2rem)] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-native-elevated shadow-[0_25px_80px_rgba(0,0,0,0.35),0_10px_30px_rgba(0,0,0,0.2)] animate-in zoom-in-95 duration-200 sm:h-[520px] sm:flex-row select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sidebar */}
          <div class="flex max-h-[180px] w-full flex-none flex-col border-b border-native bg-native-sidebar/50 sm:max-h-none sm:w-[220px] sm:border-b-0 sm:border-r">
            <div class="p-4 border-b border-native flex items-center justify-between">
              <h2 class="text-[11px] font-bold text-native-tertiary tracking-tight">Connections</h2>
              <button
                onMouseDown={handleAdd}
                title="Add Connection"
                class="w-6 h-6 flex items-center justify-center rounded-md text-native-tertiary hover:text-toolbar-icon hover:bg-[var(--toolbar-icon)]/10 transition-all duration-150"
              >
                <Plus size={14} strokeWidth={2.5} />
              </button>
            </div>

            <div class="flex-1 overflow-y-auto p-2 space-y-0.5">
              <For each={connectionStore.connections}>
                {(conn) => {
                  const [showMenu, setShowMenu] = createSignal(false);
                  const [menuPos, setMenuPos] = createSignal({ x: 0, y: 0 });

                  const handleContextMenu = (e: MouseEvent) => {
                    e.preventDefault();
                    setMenuPos({ x: e.clientX, y: e.clientY });
                    setShowMenu(true);
                  };

                  onMount(() => {
                    const closeMenu = () => setShowMenu(false);
                    window.addEventListener("click", closeMenu);
                    onCleanup(() => window.removeEventListener("click", closeMenu));
                  });

                  return (
                    <div
                      onMouseDown={() => setConnectionStore("editingId", conn.id)}
                      onContextMenu={handleContextMenu}
                      class={`group relative flex items-center gap-3 px-3 py-2 rounded-md cursor-default transition-all duration-200 outline-none ${
                        connectionStore.editingId === conn.id ? "bg-[var(--accent)]/10 shadow-none" : "text-native-secondary hover:bg-native-content/60 hover:text-native-primary"
                      }`}
                    >
                      <Show when={showMenu()}>
                        <div class="context-menu fixed pointer-events-auto shadow-2xl" style={{ left: `${menuPos().x}px`, top: `${menuPos().y}px` }} onClick={(e) => e.stopPropagation()}>
                          <div
                            class="context-menu-item"
                            onClick={() => {
                              setConnectionStore("editingId", conn.id);
                              setShowMenu(false);
                            }}
                          >
                            <Plus size={12} class="text-toolbar-icon" /> Edit
                          </div>
                          <div class="context-menu-separator" />
                          <div
                            class="context-menu-item text-red-500 hover:bg-red-500 hover:text-white"
                            onClick={(e) => {
                              handleDelete(conn.id, e);
                              setShowMenu(false);
                            }}
                          >
                            <Trash2 size={12} /> Delete
                          </div>
                        </div>
                      </Show>

                      <Show when={connectionStore.editingId === conn.id}>
                        <div class="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[var(--accent)] animate-in fade-in slide-in-from-left-2 duration-300" />
                      </Show>

                      <Server size={14} strokeWidth={2} class={`shrink-0 transition-colors ${connectionStore.editingId === conn.id ? "text-[var(--accent)]" : "text-native-tertiary"}`} />

                      <div class="flex flex-col min-w-0 flex-1 leading-tight">
                        <div class="flex items-center gap-1.5 min-w-0">
                          <span class={`text-[12px] font-semibold truncate ${connectionStore.editingId === conn.id ? "text-[var(--accent)]" : "text-native-primary"}`}>{conn.name || "Untitled"}</span>
                          <Show when={activeConnection().id === conn.id && props.isConnected}>
                            <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.3)] animate-pulse" />
                          </Show>
                        </div>
                        <span class={`text-[10px] truncate font-medium ${connectionStore.editingId === conn.id ? "text-[var(--accent)]/70" : "text-native-tertiary"}`}>
                          {conn.type === "cloud" ? conn.cloudHost || "Helix Cloud" : `${conn.host || "127.0.0.1"}:${conn.port || "6969"}`}
                        </span>
                      </div>

                      <Show when={connectionStore.connections.length > 1}>
                        <button
                          onMouseDown={(e) => handleDelete(conn.id, e)}
                          title="Delete Connection"
                          class="shrink-0 w-5 h-5 flex items-center justify-center rounded text-native-quaternary sm:opacity-40 group-hover:opacity-100 hover:text-red-500 hover:bg-red-500/10 transition-all duration-150"
                        >
                          <Trash2 size={12} strokeWidth={2} />
                        </button>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>

            <div class="h-[52px] border-t border-native flex items-center justify-center select-none">
              <div class="flex items-center gap-2 text-[11px] text-native-quaternary font-medium">
                <ShieldCheck size={15} />
                <span>Helix Explorer Secured</span>
              </div>
            </div>
          </div>

          {/* Right Content */}
          <div class="flex-1 flex flex-col bg-native-content/30 relative">
            <Show when={editingConn()}>
              <div
                class="flex-1 overflow-y-auto p-8"
                ref={(el) => {
                  createEffect(() => {
                    if (testResult() !== null || props.error) {
                      setTimeout(() => {
                        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
                      }, 50);
                    }
                  });
                }}
              >
                <div class="mb-6">
                  <h2 class="text-sm font-semibold text-native-primary tracking-tight">Connection Settings</h2>
                  <p class="text-[11px] text-native-tertiary mt-0.5">Configure individual instance parameters.</p>
                </div>

                <div class="space-y-5">
                  <div class="space-y-2">
                    <label class="text-[11px] font-bold text-native-tertiary tracking-tight flex items-center gap-2">
                      <Server size={12} class="text-toolbar-icon" /> Connection Name
                    </label>
                    <Input fullWidth value={editingConn()!.name} onInput={(e) => updateEditing({ name: e.currentTarget.value })} placeholder="Production DB" />
                  </div>

                  <div class="space-y-2">
                    <label class="text-[11px] font-bold text-native-tertiary tracking-tight flex items-center gap-2">
                      <Activity size={12} class="text-toolbar-icon" /> Connection Type
                    </label>
                    <div class="grid grid-cols-2 gap-3">
                      {/* Local Card */}
                      <button
                        onMouseDown={() => !isModeLocked(editingConn()?.id) && updateEditing({ type: "local" })}
                        class={`
                          group relative flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left
                          transition-all duration-200 outline-none
                          ${
                            (editingConn()?.type || "local") === "local"
                              ? "[border-color:var(--control-selected-border)] [background:var(--control-selected-bg)] [box-shadow:var(--control-selected-shadow)]"
                              : "border-native bg-native-content/40 hover:border-native-secondary/40 hover:bg-native-content/70"
                          }
                          ${isModeLocked(editingConn()?.id) ? "opacity-60 cursor-not-allowed" : ""}
                        `}
                        title={isModeLocked(editingConn()?.id) ? "Mode cannot be changed for existing connections" : ""}
                      >
                        <div
                          class={`
                          w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all duration-200
                          ${(editingConn()?.type || "local") === "local" ? "bg-native-elevated border border-native-subtle" : "bg-native-content border border-native"}
                        `}
                        >
                          <Server size={11} strokeWidth={2} class={(editingConn()?.type || "local") === "local" ? "text-native-primary" : "text-native-tertiary"} />
                        </div>
                        <div class="flex flex-col">
                          <span class={`text-[12px] font-semibold transition-colors ${(editingConn()?.type || "local") === "local" ? "[color:var(--control-selected-text)]" : "text-native-primary"}`}>Local</span>
                          <Show when={isModeLocked(editingConn()?.id) && (editingConn()?.type || "local") === "local"}>
                            <span class="text-[9px] text-native-tertiary font-medium">Locked</span>
                          </Show>
                        </div>
                        <Show when={(editingConn()?.type || "local") === "local"}>
                          <div class="ml-auto shrink-0 w-3.5 h-3.5 rounded-full border flex items-center justify-center animate-in zoom-in-75 duration-150 [background:var(--checkbox-checked-bg)] [border-color:var(--checkbox-checked-border)]">
                            <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
                              <path d="M1.5 4L3 5.5L6.5 2" stroke="var(--checkbox-checked-icon)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                            </svg>
                          </div>
                        </Show>
                      </button>

                      {/* Cloud Card */}
                      <button
                        onMouseDown={() => !isModeLocked(editingConn()?.id) && updateEditing({ type: "cloud" })}
                        class={`
                          group relative flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left
                          transition-all duration-200 outline-none
                          ${
                            editingConn()?.type === "cloud"
                              ? "[border-color:var(--control-selected-border)] [background:var(--control-selected-bg)] [box-shadow:var(--control-selected-shadow)]"
                              : "border-native bg-native-content/40 hover:border-native-secondary/40 hover:bg-native-content/70"
                          }
                          ${isModeLocked(editingConn()?.id) ? "opacity-60 cursor-not-allowed" : ""}
                        `}
                        title={isModeLocked(editingConn()?.id) ? "Mode cannot be changed for existing connections" : ""}
                      >
                        <div
                          class={`
                          w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all duration-200
                          ${editingConn()?.type === "cloud" ? "bg-native-elevated border border-native-subtle" : "bg-native-content border border-native"}
                        `}
                        >
                          <Globe size={11} strokeWidth={2} class={editingConn()?.type === "cloud" ? "text-native-primary" : "text-native-tertiary"} />
                        </div>
                        <div class="flex flex-col">
                          <span class={`text-[12px] font-semibold transition-colors ${editingConn()?.type === "cloud" ? "[color:var(--control-selected-text)]" : "text-native-primary"}`}>Helix Cloud</span>
                          <Show when={isModeLocked(editingConn()?.id) && editingConn()?.type === "cloud"}>
                            <span class="text-[9px] text-native-tertiary font-medium">Locked</span>
                          </Show>
                        </div>
                        <Show when={editingConn()?.type === "cloud"}>
                          <div class="ml-auto shrink-0 w-3.5 h-3.5 rounded-full border flex items-center justify-center animate-in zoom-in-75 duration-150 [background:var(--checkbox-checked-bg)] [border-color:var(--checkbox-checked-border)]">
                            <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
                              <path d="M1.5 4L3 5.5L6.5 2" stroke="var(--checkbox-checked-icon)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                            </svg>
                          </div>
                        </Show>
                      </button>
                    </div>
                  </div>

                  <Show when={editingConn()?.type === "cloud"}>
                    <div class="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div class="space-y-2">
                        <label class="text-[11px] font-bold text-native-tertiary tracking-tight flex items-center gap-2">
                          <Globe size={12} class="text-toolbar-icon" /> Cloud URL
                        </label>
                        <div class="relative group/input">
                          <Input
                            placeholder="e.g. your-instance.railway.app"
                            value={editingConn()?.cloudHost || ""}
                            onInput={(e) => updateEditing({ cloudHost: e.currentTarget.value })}
                            fullWidth
                            class="h-9 pr-9"
                          />
                        </div>
                      </div>

                      <div class="space-y-2">
                        <label class="text-[11px] font-bold text-native-tertiary tracking-tight flex items-center gap-2">
                          <ShieldCheck size={12} class="text-toolbar-icon" /> API Key
                        </label>
                        <div class="relative group/input">
                          <Input
                            type="password"
                            placeholder="Enter your API key"
                            value={editingConn()?.apiKey || ""}
                            onInput={(e) => updateEditing({ apiKey: e.currentTarget.value })}
                            fullWidth
                            class="h-9 pr-9"
                          />
                        </div>
                      </div>

                      <div class="space-y-2 pt-2 border-t border-native">
                        <label class="text-[11px] font-bold text-native-tertiary tracking-tight flex items-center justify-between">
                          <span class="flex items-center gap-2">
                            <Database size={12} class="text-toolbar-icon" /> Link Local Workspace (Optional)
                          </span>
                        </label>
                        <div class="relative group/input">
                          <Input
                            placeholder="/path/to/your/helix-project"
                            value={editingConn()?.localPath || ""}
                            onInput={(e) => updateEditing({ localPath: e.currentTarget.value })}
                            onBlur={async (e) => {
                              const path = e.currentTarget.value.trim();
                              if (!path) return;
                              try {
                                await invoke("validate_helix_workspace", { path });
                              } catch (err: any) {
                                setTestResult({ success: false, message: err });
                              }
                            }}
                            fullWidth
                            class="h-9 pr-9"
                          />
                        </div>
                        <p class="text-[10px] text-native-quaternary leading-tight">Link a local replica to see statistics for this cloud connection.</p>
                      </div>
                    </div>
                  </Show>

                  <Show when={(editingConn()?.type || "local") === "local"}>
                    <div class="space-y-5 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div class="grid grid-cols-3 gap-3">
                        <div class="col-span-2 space-y-2">
                          <label class="text-[11px] font-bold text-native-tertiary tracking-tight flex items-center gap-2">
                            <Globe size={12} class="text-toolbar-icon" /> Host
                          </label>
                          <Input fullWidth value={editingConn()?.host || ""} onInput={(e) => updateEditing({ host: e.currentTarget.value })} placeholder="127.0.0.1" />
                        </div>
                        <div class="space-y-2">
                          <label class="text-[11px] font-bold text-native-tertiary tracking-tight flex items-center gap-2">
                            <Hash size={12} class="text-toolbar-icon" /> Port
                          </label>
                          <Input fullWidth value={editingConn()?.port || ""} onInput={(e) => updateEditing({ port: e.currentTarget.value })} placeholder="6969" />
                        </div>
                      </div>

                      <div class="space-y-2">
                        <label class="text-[11px] font-bold text-native-tertiary tracking-tight flex items-center gap-2">
                          <Database size={12} class="text-toolbar-icon" /> Local Workspace Path
                        </label>
                        <div class="flex gap-2 w-full">
                          <div class="flex-1 px-3 py-1.5 min-h-[30px] flex items-center bg-[var(--bg-toolbar)] border border-native rounded-md text-[12px] text-native-secondary truncate cursor-default">
                            <Show when={editingConn()!.localPath} fallback={<span class="text-native-quaternary">Not configured (Auto-detected on Connection)</span>}>
                              <span class="font-mono">{editingConn()!.localPath}</span>
                            </Show>
                          </div>
                        </div>
                        <p class="text-[10px] text-native-quaternary leading-tight">Root directory of your Helix project (containing helix.toml). Used for syncing HQL queries.</p>
                      </div>
                    </div>
                  </Show>

                  <Show when={testResult() || props.error}>
                    <div
                      class={`mt-4 p-2.5 px-3.5 rounded-lg flex gap-2.5 items-center animate-in fade-in slide-in-from-top-2 duration-300 ${
                        testResult()?.loading
                          ? "bg-[var(--bg-toolbar)] text-native-tertiary border border-native-subtle"
                          : testResult()?.success
                            ? "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 border border-emerald-500/15"
                            : "bg-red-500/8 text-red-600 dark:text-red-400 border border-red-500/15"
                      }`}
                    >
                      <div class="shrink-0">
                        {testResult()?.loading ? (
                          <div class="w-3.5 h-3.5 border-[1.5px] border-native-tertiary/20 border-t-accent rounded-full animate-spin" />
                        ) : testResult()?.success ? (
                          <CircleCheck size={14} strokeWidth={2.5} class="text-emerald-500" />
                        ) : (
                          <CircleAlert size={14} strokeWidth={2.5} class="text-red-500" />
                        )}
                      </div>
                      <span class="text-[11px] font-medium leading-tight">{testResult()?.message || props.error}</span>
                    </div>
                  </Show>
                </div>
              </div>

              {/* Footer Action Bar */}
              <div class="h-[52px] px-5 border-t border-native bg-native-elevated/95 backdrop-blur-sm flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <button
                    onMouseDown={handleTest}
                    class="group h-7 px-3 flex items-center gap-2 rounded-md text-[11px] font-medium text-native-secondary hover:text-native-primary hover:bg-[var(--bg-hover)] active:bg-[var(--bg-active)] transition-all duration-150"
                  >
                    <Zap size={12} strokeWidth={2.5} class="text-toolbar-icon transition-colors duration-150" />
                    Test Connection
                  </button>

                  <Show when={testResult() && !testResult()?.loading}>
                    <div
                      class="flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full animate-in fade-in slide-in-from-left-2 duration-200"
                      classList={{
                        "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400": testResult()?.success,
                        "bg-red-500/12 text-red-600 dark:text-red-400": !testResult()?.success,
                      }}
                    >
                      <div
                        class="w-1.5 h-1.5 rounded-full"
                        classList={{
                          "bg-emerald-500": testResult()?.success,
                          "bg-red-500": !testResult()?.success,
                        }}
                      />
                      {testResult()?.success ? "OK" : "Failed"}
                    </div>
                  </Show>
                </div>

                <div class="flex items-center gap-2">
                  <Button
                    onMouseDown={props.onCancel}
                    variant="default"
                    size="md"
                    class="h-7 px-3.5 font-medium"
                  >
                    Cancel
                  </Button>

                  <Show
                    when={activeConnection().id === editingConn()?.id && props.isConnected}
                    fallback={
                      <Button
                        disabled={props.isConnecting}
                        variant="primary"
                        size="md"
                        onMouseDown={async () => {
                          setTestResult(null);
                          const conn = editingConn()!;
                          const currentId = conn.id;
                          triggerAutoDetect(conn, currentId);
                          props.onConnect(conn);
                        }}
                        class="h-7 px-4 font-semibold"
                      >
                        {props.isConnecting && <div class="w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />}
                        {props.isConnecting ? "Connecting…" : "Connect"}
                      </Button>
                    }
                  >
                    <Show
                      when={props.mode === "link"}
                      fallback={
                        <Button
                          onMouseDown={props.onDisconnect}
                          variant="destructive"
                          size="md"
                          class="h-7 px-4 font-semibold"
                        >
                          Disconnect
                        </Button>
                      }
                    >
                      <Button
                        onMouseDown={() => props.onUpdate(editingConn()!)}
                        variant="primary"
                        size="md"
                        class="h-7 px-4 font-semibold"
                      >
                        Save
                      </Button>
                    </Show>
                  </Show>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
};
