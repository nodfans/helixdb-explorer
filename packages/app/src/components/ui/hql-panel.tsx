import { Show, Switch, Match, type Accessor, Index, createSignal, For } from "solid-js";
import { Table, Copy, ChevronDown, Loader2, X, Database, FileCode, CheckCircle2, Info } from "lucide-solid";
import { Button } from "./button";
import { ResultTable } from "./result-table";
import type { HqlTab } from "../../stores/hql";
import { invoke } from "@tauri-apps/api/core";

export interface HqlPanelProps {
  activeTab: HqlTab;
  isConnected: boolean;
  onConnect: () => void;
  updateActiveTab: (updates: Partial<HqlTab>) => void;
  copyOutput: () => void;
  copied: Accessor<boolean>;
  showResults: Accessor<boolean>;
  setShowResults: (v: boolean) => void;
  resultsHeight: Accessor<number>;
  isResizing: Accessor<boolean>;
  startResizing: (e: MouseEvent) => void;
  gutterWidth: Accessor<number>;
  pendingSync: Accessor<{
    items: Array<{
      query_name: string;
      old_code: string;
      new_code: string;
      sync_type: string;
    }>;
    workshopPath: string;
    fullCode: string;
  } | null>;
  setPendingSync: (v: any) => void;
  setSyncing: (v: boolean) => void;
  logEntry: (msg: string) => void;
}

export const HqlPanel = (props: HqlPanelProps) => {
  return (
    <div class="absolute left-0 right-0 bottom-0 bg-[var(--bg-elevated)] border-t border-native flex flex-col z-40" style={{ height: props.showResults() ? `${props.resultsHeight()}px` : "0" }}>
      {/* Resizer Handle */}
      <Show when={props.showResults()}>
        <div class="absolute inset-x-0 h-1 -top-0.5 cursor-row-resize z-[60] group" onMouseDown={props.startResizing}>
          <div class="absolute inset-x-0 h-px bg-[var(--border-subtle)] group-hover:bg-accent/40" />
        </div>
      </Show>

      {/* Panel Header */}
      <div class="h-9 border-b border-native flex items-center justify-between bg-native-sidebar-vibrant/40 shrink-0 relative overflow-hidden">
        {/* Left Side: Toggle & Status */}
        <div class="flex items-center min-w-0 flex-1 h-full pl-0">
          <div
            class="absolute flex items-center justify-center top-0 bottom-0 z-50"
            style={{
              left: `${props.gutterWidth()}px`,
              width: "20px",
              transform: "translateX(-50%)",
            }}
          >
            <button
              onClick={() => props.setShowResults(!props.showResults())}
              class="p-1 hover:bg-native-content/50 rounded transition-colors text-native-tertiary"
              title={props.showResults() ? "Hide Panel" : "Show Panel"}
            >
              <ChevronDown size={14} class={`transition-transform duration-200 ${props.showResults() ? "" : "rotate-180"}`} />
            </button>
          </div>

          <Show when={!props.activeTab.viewMode || props.activeTab.viewMode === "table"}>
            <div class="flex items-center gap-2.5 h-full" style={{ "padding-left": `${props.gutterWidth() + 20}px` }}>
              <Switch>
                <Match when={props.activeTab.queryStatus === "loading"}>
                  <div class="flex items-center gap-1.5">
                    <Loader2 size={11} class="animate-spin text-accent" />
                    <span class="text-[10px] text-accent font-medium">Running...</span>
                  </div>
                </Match>
                <Match when={props.activeTab.queryStatus === "success"}>
                  <div class="flex items-center gap-1.5">
                    <CheckCircle2 size={11} class="text-emerald-500" />
                    <span class="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Success</span>
                    <Show when={props.activeTab.rawOutput}>
                      <div class="w-[3.5px] h-[3.5px] rounded-full bg-[var(--text-tertiary)] mx-1.5 shrink-0 opacity-60" />
                      <span class="text-[10px] text-native-tertiary font-mono">
                        {(() => {
                          const multi = props.activeTab.multiTableData;
                          const count = multi ? Object.values(multi).reduce((acc: number, rows: any[]) => acc + rows.length, 0) : 0;
                          return `${count} ${count === 1 ? "result" : "results"}`;
                        })()}
                      </span>
                    </Show>
                    <Show when={props.activeTab.executionTime}>
                      <div class="w-[3.5px] h-[3.5px] rounded-full bg-[var(--text-tertiary)] mx-1.5 shrink-0 opacity-60" />
                      <span class="text-[10px] text-native-tertiary font-mono">{props.activeTab.executionTime}ms</span>
                    </Show>
                  </div>
                </Match>
                <Match when={props.activeTab.queryStatus === "error"}>
                  <div class="flex items-center gap-1.5">
                    <X size={11} class="text-red-500" />
                    <span class="text-[10px] font-medium text-red-600 dark:text-red-400">Error</span>
                  </div>
                </Match>
              </Switch>
            </div>
          </Show>
        </div>

        {/* Center: View Toggle */}
        <div class="flex items-center gap-1 shrink-0 z-10 px-2">
          <Button variant="toolbar" size="sm" active={!props.activeTab.viewMode || props.activeTab.viewMode === "table"} onMouseDown={() => props.updateActiveTab({ viewMode: "table" })}>
            Table
          </Button>
          <Button variant="toolbar" size="sm" active={props.activeTab.viewMode === "json"} onMouseDown={() => props.updateActiveTab({ viewMode: "json" })}>
            Json
          </Button>
          <Button variant="toolbar" size="sm" active={props.activeTab.viewMode === "log"} onMouseDown={() => props.updateActiveTab({ viewMode: "log" })}>
            Logs
          </Button>
        </div>

        {/* Right Side: Actions */}
        <div class="flex items-center gap-2 flex-1 justify-end pr-4 min-w-0">
          <Show when={props.activeTab.output}>
            <Button variant="toolbar" size="sm" onMouseDown={props.copyOutput} class="flex items-center gap-1.5">
              <Show when={props.copied()} fallback={<Copy size={11} />}>
                <CheckCircle2 size={11} class="text-emerald-500" />
              </Show>
              <span>{props.copied() ? "Copied" : "Copy"}</span>
            </Button>
          </Show>
        </div>
      </div>

      {/* Panel Content */}
      <div class="flex-1 min-h-0 bg-[var(--bg-content)] relative overflow-hidden flex flex-col">
        <Switch>
          {/* 1. Disconnected State */}
          <Match when={!props.isConnected}>
            <div class="h-full flex flex-col items-center justify-center p-8 bg-native-sidebar/10">
              <Database size={24} class="text-native-tertiary mb-3" />
              <p class="text-[11px] text-native-tertiary mb-4">Connect to HelixDB to see query results here.</p>
              <Button variant="primary" size="sm" onClick={props.onConnect}>
                Connect Now
              </Button>
            </div>
          </Match>

          {/* 3. Loading (Initial) */}
          <Match when={props.activeTab.status === "loading" && !props.activeTab.rawOutput && props.activeTab.viewMode !== "log"}>
            <div class="h-full flex flex-col items-center justify-center">
              <Loader2 size={24} class="animate-spin text-accent mb-2" />
              <div class="text-[12px] text-native-primary font-medium">Executing HQL...</div>
            </div>
          </Match>

          {/* 4. Results Display */}
          <Match when={props.activeTab.status !== "idle" || props.activeTab.logs}>
            <div class="flex-1 min-h-0 flex flex-col">
              <Switch>
                <Match when={props.activeTab.viewMode === "log"}>
                  <div class="flex-1 overflow-auto p-3 text-native-primary font-mono text-[12px] whitespace-pre-wrap select-text leading-relaxed">{props.activeTab.logs || "No logs available."}</div>
                </Match>
                <Match when={props.activeTab.viewMode === "json"}>
                  <div class="flex-1 overflow-auto overscroll-behavior-y-contain min-h-0 select-text bg-[var(--bg-workbench-content)]">
                    <div class="p-3 text-native-primary font-mono text-[12px] whitespace-pre-wrap leading-relaxed">{props.activeTab.output || "No output available."}</div>
                  </div>
                </Match>
                <Match when={true}>
                  <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
                    <Switch>
                      <Match when={props.activeTab.queryStatus === "error"}>
                        <div class="flex-1 overflow-auto overscroll-behavior-y-contain min-h-0 select-text">
                          <div class="p-3 text-native-primary font-mono text-[12px] whitespace-pre-wrap leading-relaxed">
                            {props.activeTab.output}
                            <SupportedOperationsHelp />
                          </div>
                        </div>
                      </Match>
                      <Match when={props.activeTab.multiTableData && Object.keys(props.activeTab.multiTableData).length > 0}>
                        <div class="flex-1 overflow-auto h-full space-y-5 px-0 pt-2 pb-0 scrollbar-thin flex flex-col">
                          <For each={Object.entries(props.activeTab.multiTableData || {})}>
                            {([name, rows]: [string, any[]]) => {
                              const tableCount = () => Object.keys(props.activeTab.multiTableData || {}).length;
                              return (
                                <div class="flex flex-col gap-2" classList={{ "flex-1 min-h-[200px]": tableCount() === 1 }}>
                                  <div class="flex items-center gap-2 px-1">
                                    <Table size={12} class="text-accent" />
                                    <span class="text-[11px] font-bold capitalize tracking-wider text-native-secondary">{name}</span>
                                    <span class="text-[10px] text-native-quaternary tabular-nums">({rows.length})</span>
                                  </div>
                                  <div
                                    class="border border-native rounded-sm overflow-hidden bg-native-sidebar/20 flex flex-col"
                                    classList={{
                                      "max-h-[400px]": tableCount() > 1,
                                      "flex-1": tableCount() === 1,
                                    }}
                                  >
                                    <ResultTable data={rows} onSelect={(rows) => props.updateActiveTab({ selectedRows: rows })} selectedRows={props.activeTab.selectedRows} />
                                  </div>
                                </div>
                              );
                            }}
                          </For>
                        </div>
                      </Match>
                      <Match when={props.activeTab.tableData || (Array.isArray(props.activeTab.rawOutput) ? props.activeTab.rawOutput : null)}>
                        <div class="flex-1 min-h-0 flex flex-col px-0.5 pt-2 pb-0">
                          <ResultTable
                            data={props.activeTab.tableData || props.activeTab.rawOutput}
                            selectedRows={props.activeTab.selectedRows}
                            onSelect={(rows) => props.updateActiveTab({ selectedRows: rows })}
                          />
                        </div>
                      </Match>
                      <Match when={true}>
                        <div class="flex-1 flex flex-col items-center justify-center text-native-quaternary opacity-50 select-none">
                          <Database size={24} class="mb-2" />
                          <span class="text-[11px]">No query results to display</span>
                        </div>
                      </Match>
                    </Switch>
                  </div>
                </Match>
              </Switch>
            </div>
          </Match>

          {/* 5. Idle State */}
          <Match when={true}>
            <div class="h-full flex flex-col items-center justify-center text-native-quaternary">
              <Database size={32} class="opacity-25 mb-3" />
              <span class="text-xs font-medium">Ready to execute HQL</span>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
};

export const SyncConfirmationOverlay = (props: {
  pendingSync: Accessor<any>;
  setPendingSync: (v: any) => void;
  setSyncing: (v: boolean) => void;
  logEntry: (msg: string) => void;
  updateActiveTab: (updates: Partial<HqlTab>) => void;
}) => {
  const p = props.pendingSync;
  const [processing, setProcessing] = createSignal(false);

  // Count types
  const conflicts = () => p()?.items.filter((i: any) => i.sync_type === "CONFLICT").length || 0;

  return (
    <div class="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200">
      <div
        class="max-w-5xl w-full max-h-[85vh] flex flex-col bg-[var(--bg-elevated)] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        style={{
          border: conflicts() > 0 ? "1px solid rgba(239, 68, 68, 0.25)" : "1px solid var(--border-color)",
        }}
      >
        <div class="p-6 flex flex-col gap-6 min-h-0">
          {/* Header */}
          <div class="flex items-start gap-4 shrink-0">
            <div class={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${conflicts() > 0 ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500"}`}>
              <Show when={conflicts() > 0} fallback={<Database size={20} />}>
                <FileCode size={20} />
              </Show>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-[14px] font-bold text-native-primary mb-1.5">{conflicts() > 0 ? "⚠️ Batch Sync Confirmation" : "Update Existing Queries?"}</h3>
              <p class="text-[12px] text-native-tertiary leading-relaxed">
                We found <span class="text-native-primary font-semibold">{p()?.items.length}</span> {p()?.items.length === 1 ? "query" : "queries"} that need your attention before syncing to{" "}
                <span class="font-mono text-[11px] bg-native-sidebar px-1.5 py-0.5 rounded">{p()?.workshopPath.split("/").pop()}</span>.
                <Show when={conflicts() > 0}>
                  {" "}
                  <span class="text-red-500 font-semibold">
                    {conflicts()} {conflicts() === 1 ? "has" : "have"} manual edits
                  </span>{" "}
                  that will be overwritten.
                </Show>
              </p>
            </div>
          </div>

          {/* Scrollable List of Diffs */}
          <div class="flex-1 min-h-0 overflow-y-auto space-y-6 pr-2 scrollbar-thin">
            <Index each={p()?.items}>
              {(item: any, index: number) => (
                <div class="flex flex-col gap-3 group">
                  {/* Query Header */}
                  <div class="flex items-center gap-2.5 px-1">
                    <span class="text-[10px] bg-native-sidebar-vibrant text-native-tertiary px-2 py-0.5 rounded font-mono font-semibold tabular-nums">#{String(index + 1).padStart(2, "0")}</span>
                    <span class="text-[12px] font-bold text-native-primary font-mono">{item().query_name}</span>
                    <span
                      class={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full ${
                        item().sync_type === "CONFLICT"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                          : "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                      }`}
                    >
                      {item().sync_type === "CONFLICT" ? "Modified" : "Exists"}
                    </span>
                  </div>

                  {/* Diff Container */}
                  <div class="flex flex-col gap-2 min-h-0">
                    {/* Labels */}
                    <div class="flex gap-4 shrink-0 px-2 text-[10px] uppercase font-semibold tracking-wide">
                      <div class="flex-1 text-rose-600/80 dark:text-rose-400/80">
                        <span class="opacity-60">← </span>Current (will be replaced)
                      </div>
                      <div class="flex-1 text-emerald-600/80 dark:text-emerald-400/80">
                        New from editor <span class="opacity-60">→</span>
                      </div>
                    </div>

                    {/* Code Diff */}
                    <div class="flex border rounded-lg overflow-hidden bg-[var(--bg-workbench-content)] shadow-sm transition-shadow hover:shadow-md" style={{ "border-color": "var(--border-color)" }}>
                      {/* Left: Old Code (Deletion) */}
                      <div class="flex-1 min-w-0 flex flex-col bg-rose-500/[0.06] dark:bg-rose-500/[0.08] border-r" style={{ "border-color": "var(--border-subtle)" }}>
                        <div class="p-4 overflow-x-auto">
                          <pre class="text-[11px] font-mono leading-relaxed text-rose-700 dark:text-rose-300 whitespace-pre">{item().old_code}</pre>
                        </div>
                      </div>

                      {/* Right: New Code (Addition) */}
                      <div class="flex-1 min-w-0 flex flex-col bg-emerald-500/[0.06] dark:bg-emerald-500/[0.08]">
                        <div class="p-4 overflow-x-auto">
                          <pre class="text-[11px] font-mono leading-relaxed text-emerald-700 dark:text-emerald-300 whitespace-pre">{item().new_code}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Index>
          </div>

          {/* Footer Actions */}
          <div class="flex items-center justify-between gap-3 pt-4 border-t shrink-0" style={{ "border-color": "var(--border-subtle)" }}>
            <div class="text-[11px] text-native-tertiary">
              <Show when={conflicts() > 0}>
                <span class="inline-flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-amber-500">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Manual edits will be overwritten
                </span>
              </Show>
            </div>

            <div class="flex items-center gap-3">
              <Button
                variant="toolbar"
                size="md"
                class="px-6"
                disabled={processing()}
                onMouseDown={(e: MouseEvent) => {
                  e.preventDefault();
                  props.logEntry(`[Sync] User cancelled batch sync.`);
                  props.setPendingSync(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                class={`px-8 ${conflicts() > 0 ? "bg-red-600 hover:bg-red-500 active:bg-red-700" : ""}`}
                loading={processing()}
                onMouseDown={async (e: MouseEvent) => {
                  e.preventDefault();
                  const data = p();
                  setProcessing(true);
                  props.setSyncing(true);
                  props.logEntry(`[Sync] User confirmed batch update for ${data.items.length} queries. Force syncing...`);

                  try {
                    const response = await invoke<any>("sync_hql_to_project", {
                      code: data.fullCode,
                      localPath: data.workshopPath,
                      force: true,
                    });

                    if (response.type === "Success") {
                      props.updateActiveTab({ status: "success", syncStatus: "success", logs: response.data });
                      props.setPendingSync(null);
                    } else {
                      throw new Error(`Unexpected response type: ${response.type}`);
                    }
                  } catch (err) {
                    const errStr = `❌ Sync Failed: ${err}`;
                    props.logEntry(errStr);
                    props.updateActiveTab({ status: "idle", syncStatus: "error", viewMode: "log" });
                  } finally {
                    setProcessing(false);
                    props.setSyncing(false);
                  }
                }}
              >
                {conflicts() > 0 ? "Override & Update All" : "Update All"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SupportedOperationsHelp = () => (
  <div class="mt-6 pt-4 border-t border-native-active/50">
    <div class="flex items-center gap-2 mb-3 text-native-secondary font-medium text-[11px]">
      <Info size={12} class="text-accent" />
      <span>Available Read-Only Operations</span>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-[11px] font-mono text-native-tertiary">
      <div class="flex gap-2">
        <span class="text-native-quaternary w-20 text-right">Graphs:</span> <span class="text-native-primary">N&lt;T&gt;, E&lt;T&gt;</span>
      </div>
      <div class="flex gap-2">
        <span class="text-native-quaternary w-20 text-right">Traversal:</span> <span class="text-native-primary">::Out&lt;L&gt;, ::In&lt;L&gt;</span>
      </div>
      <div class="flex gap-2">
        <span class="text-native-quaternary w-20 text-right">Edges:</span> <span class="text-native-primary">::OutE&lt;L&gt;, ::InE&lt;L&gt;</span>
      </div>
      <div class="flex gap-2">
        <span class="text-native-quaternary w-20 text-right">Filtering:</span> <span class="text-native-primary">::WHERE(...)</span>
      </div>
      <div class="flex gap-2">
        <span class="text-native-quaternary w-20 text-right">Sorting:</span> <span class="text-native-primary">::ORDER&lt;Asc/Desc&gt;</span>
      </div>
      <div class="flex gap-2">
        <span class="text-native-quaternary w-20 text-right">Aggregation:</span> <span class="text-native-primary">::COUNT, ::GROUP_BY</span>
      </div>
      <div class="flex gap-2">
        <span class="text-native-quaternary w-20 text-right">Pagination:</span> <span class="text-native-primary">::RANGE(s, e), ::FIRST</span>
      </div>
      <div class="flex gap-2">
        <span class="text-native-quaternary w-20 text-right">Search:</span> <span class="text-native-primary">SearchV(Text|Vector), SearchBM25</span>
      </div>
    </div>
  </div>
);
