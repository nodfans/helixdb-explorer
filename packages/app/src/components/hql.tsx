import { createEffect, createMemo, createSignal, For, onMount, Show, onCleanup } from "solid-js";
import { reconcile } from "solid-js/store";
import { Play, Plus, X, FileCode, Sparkles, Check, Upload, ChevronDown, PanelTopDashed } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { hqlStore, setHqlStore, type HqlTab } from "../stores/hql";
import { HQLEditor } from "./ui/hql-editor";

import { HelixApi } from "../lib/api";
import { activeConnection, getConnectionUrl, setConnectionStore, saveConnections } from "../stores/connection";
import { HqlPanel, SyncConfirmationOverlay } from "./ui/hql-panel";
import { extractTableData, extractMultiTableData } from "../lib/result-helper";
import { hqlLanguage } from "../lib/hql-syntax";

// --- HQL Page Component ---
export interface HQLProps {
  isConnected: boolean;
  onConnect: () => void;
}

export const HQL = (props: HQLProps) => {
  const [executing, setExecuting] = createSignal(false);
  const [syncing, setSyncing] = createSignal(false);
  const resultsHeight = () => hqlStore.resultsHeight;
  const setResultsHeight = (val: number) => setHqlStore("resultsHeight", val);
  const [isResizing, setIsResizing] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const [formatted, setFormatted] = createSignal(false);
  const [gutterWidth, setGutterWidth] = createSignal(40);
  const [selectedText, setSelectedText] = createSignal("");
  const [pendingSync, setPendingSync] = createSignal<any>(null);

  const logEntry = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    updateActiveTab({ logs: (activeTab().logs || "") + `\n[${timestamp}] ${msg}` });
  };

  const minDelay = <T,>(promise: Promise<T>, ms: number = 800): Promise<T> => {
    return Promise.all([promise, new Promise((resolve) => setTimeout(resolve, ms))]).then(([val]) => val);
  };

  const activeTab = createMemo(() => hqlStore.tabs.find((t) => t.id === hqlStore.activeTabId) || hqlStore.tabs[0]);

  onMount(async () => {
    const active = activeConnection();
    if (active && active.host) {
      const api = new HelixApi(getConnectionUrl(active), null);
      try {
        const schema = await api.fetchSchema();
        setHqlStore("schema", schema);
      } catch (err) {
        console.warn("Failed to pre-fetch schema for auto-completion", err);
      }
    }
  });

  createEffect((prevConnected) => {
    if (props.isConnected && prevConnected === false) {
      clearResults();
    }
    return props.isConnected;
  }, props.isConnected);

  const startResizing = (e: MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startY = e.clientY;
    const startHeight = resultsHeight();
    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.max(100, Math.min(startHeight + deltaY, window.innerHeight * 0.8));
      setResultsHeight(newHeight);
    };
    const stopResizing = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizing);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResizing);
    onCleanup(stopResizing);
  };

  const addTab = () => {
    const id = crypto.randomUUID();
    const newTab: HqlTab = {
      id,
      name: `Query ${hqlStore.tabs.length + 1}`,
      code: "",
      output: "",
      rawOutput: null,
      status: "idle",
      queryStatus: "idle",
      syncStatus: "idle",
      params: {},
      viewMode: "table",
    };
    setHqlStore("tabs", [...hqlStore.tabs, newTab]);
    setHqlStore("activeTabId", id);
  };

  const closeTab = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    if (hqlStore.tabs.length === 1) return;
    const newTabs = hqlStore.tabs.filter((t) => t.id !== id);
    setHqlStore("tabs", newTabs);
    if (activeTab().id === id) {
      setHqlStore("activeTabId", newTabs[newTabs.length - 1].id);
    }
  };

  const updateActiveTab = (updates: Partial<HqlTab>) => {
    setHqlStore("tabs", (t) => t.id === hqlStore.activeTabId, updates);
  };

  const clearResults = () => {
    setHqlStore("tabs", () => true, {
      status: "idle",
      queryStatus: "idle",
      syncStatus: "idle",
      output: "",
      rawOutput: null,
      executionTime: undefined,
      logs: "",
      diagnostics: [],
    });
  };

  const handleConnect = () => {
    props.onConnect();
  };

  const executeHql = async (codeOverride?: string) => {
    const targetTabId = hqlStore.activeTabId;
    const currentTab = hqlStore.tabs.find((t) => t.id === targetTabId) || activeTab();
    const codeToProcess = selectedText().trim() || codeOverride || currentTab.code;

    const updateTargetTab = (updates: Partial<HqlTab>) => {
      setHqlStore("tabs", (t) => t.id === targetTabId, updates);
    };

    if (!codeToProcess.trim()) {
      updateTargetTab({ status: "error", output: "⚠️ Please enter HQL code before executing" });
      setHqlStore("showResults", true);
      return;
    }

    const conn = activeConnection();
    if (!conn.host || !props.isConnected) {
      updateTargetTab({
        status: "error",
        output: !conn.host ? "❌ No active connection. Please add one in 'Connections' tab." : "❌ Disconnected. Please connect to the database first.",
      });
      setHqlStore("showResults", true);
      if (!props.isConnected) handleConnect();
      return;
    }

    setExecuting(true);
    updateTargetTab({
      status: "loading",
      queryStatus: "loading",
      output: "⏳ Compiling and executing HQL...\nThis may take a moment.",
      rawOutput: null,
      diagnostics: [],
    });
    setHqlStore("showResults", true);

    const startTime = performance.now();
    try {
      const result: any = await invoke("execute_dynamic_hql", {
        url: getConnectionUrl(activeConnection()),
        code: codeToProcess,
        params: currentTab.params,
      });

      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);
      const tableData = extractTableData(result);
      const isTable = tableData !== null && tableData.length > 0;

      updateTargetTab({
        status: "success",
        queryStatus: "success",
        rawOutput: reconcile(result),
        output: JSON.stringify(result, null, 2),
        executionTime: duration,
        tableData: isTable ? tableData : undefined,
        multiTableData: extractMultiTableData(result),
        logs: `[${new Date().toLocaleTimeString()}] Query executed in ${duration}ms\nSize: ${result ? JSON.stringify(result).length : 0} bytes`,
      });
    } catch (err: any) {
      let errorMsg = err.toString();
      if (errorMsg.includes("connection")) {
        errorMsg = `Connection Error: Couldn't connect to ${getConnectionUrl(activeConnection())}. (Original: ${err})`;
      } else {
        errorMsg = `Execution Failed: ${err}`;
      }

      let diagnostics: any[] = [];
      const lineMatch = errorMsg.match(/line\s+(\d+)/i) || errorMsg.match(/At: \((\d+)/i) || errorMsg.match(/-->\s+(\d+):/);
      if (lineMatch) {
        try {
          const lineOneBased = parseInt(lineMatch[1]);
          if (!isNaN(lineOneBased) && lineOneBased > 0) {
            const lines = currentTab.code.split(/\r?\n/);
            if (lineOneBased <= lines.length) {
              let from = 0;
              for (let i = 0; i < lineOneBased - 1; i++) {
                from += lines[i].length + 1;
              }
              const lineContent = lines[lineOneBased - 1];
              diagnostics.push({ from: from, to: from + lineContent.length, severity: "error", message: errorMsg });
            }
          }
        } catch (e) {}
      }
      updateTargetTab({ status: "error", queryStatus: "error", output: `❌ ${errorMsg}`, diagnostics });
    } finally {
      setExecuting(false);
    }
  };

  const copyOutput = () => {
    const text = activeTab().viewMode === "log" ? activeTab().logs : activeTab().output;
    navigator.clipboard.writeText(text || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const beautifyCode = async () => {
    try {
      const formattedCode = await invoke<string>("format_hql", { code: activeTab().code });
      updateActiveTab({ code: formattedCode });
      setFormatted(true);
      setTimeout(() => setFormatted(false), 800);
    } catch (err) {
      console.error("Format error:", err);
      updateActiveTab({ status: "error", output: `❌ Format Error: ${err}` });
      setHqlStore("showResults", true);
    }
  };

  return (
    <div class="flex-1 flex flex-col bg-native-content min-h-0 min-w-0 overflow-hidden" classList={{ "cursor-row-resize": isResizing() }}>
      <div class="flex items-center h-9 bg-native-sidebar-vibrant/40 border-b border-native px-5 gap-1.5 overflow-x-auto scrollbar-hide shrink-0">
        <For each={hqlStore.tabs}>
          {(tab) => (
            <div
              onClick={() => setHqlStore("activeTabId", tab.id)}
              class={`group relative flex items-center gap-1.5 px-2.5 h-[26px] text-[11px] font-medium rounded-md cursor-pointer transition-all select-none min-w-[100px] max-w-[180px] border ${
                tab.id === hqlStore.activeTabId
                  ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-subtle)] shadow-sm"
                  : "bg-transparent text-[var(--text-tertiary)] border-transparent hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
              }`}
            >
              <div class="flex-shrink-0">
                <FileCode size={13} strokeWidth={2.5} class={tab.id === hqlStore.activeTabId ? "text-accent" : "text-native-quaternary"} />
              </div>
              <span class="truncate pr-4 text-[12px]">{tab.name}</span>
              <Show when={hqlStore.tabs.length > 1}>
                <button
                  onClick={(e) => closeTab(e, tab.id)}
                  class="absolute right-1 text-native-quaternary hover:text-red-500 opacity-0 group-hover:opacity-100 p-0.5 rounded-sm hover:bg-red-500/10 transition-all"
                >
                  <X size={10} />
                </button>
              </Show>
            </div>
          )}
        </For>
        <button onClick={addTab} class="p-1 px-1.5 text-native-tertiary hover:text-accent hover:bg-native-content transition-all rounded-md">
          <Plus size={14} />
        </button>
      </div>

      <div class="h-9 border-b border-native bg-native-sidebar-vibrant/40 flex items-center px-5 gap-2 shrink-0">
        <div
          onClick={handleConnect}
          class="flex items-center h-[26px] bg-[var(--bg-input)] border border-native rounded-md px-2 gap-2 hover:border-native-active transition-colors min-w-[160px] max-w-[240px] group cursor-default select-none"
        >
          <div class="flex items-center justify-center w-4 h-4 bg-accent/10 rounded p-0.5">
            <PanelTopDashed size={11} strokeWidth={2.5} class="text-accent" />
          </div>
          <span class="flex-1 text-[11px] text-native-primary font-medium truncate">
            {activeConnection().host}:{activeConnection().port}
          </span>
        </div>
        <div class="w-px h-3.5 bg-[var(--border-subtle)]" />
        <button onClick={beautifyCode} class="h-7 w-7 p-0 flex items-center justify-center rounded-md transition-colors" title="Format Query">
          <Show when={formatted()} fallback={<Sparkles size={16} class="text-purple-500" strokeWidth={2} />}>
            <Check size={16} class="text-emerald-500 animate-in fade-in zoom-in duration-200" strokeWidth={2} />
          </Show>
        </button>
        <button
          onClick={() => executeHql()}
          disabled={executing() || !activeTab().code.trim()}
          class="h-7 w-7 p-0 flex items-center justify-center rounded-md transition-colors disabled:opacity-40"
          title={executing() ? "Running..." : selectedText().trim() ? "Run Selection" : "Run Query"}
        >
          <Show when={executing()} fallback={<Play size={16} class={selectedText().trim() ? "text-accent" : "text-emerald-500"} strokeWidth={2} fill="currentColor" />}>
            <div class="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          </Show>
        </button>
        <button
          onClick={async () => {
            const conn = activeConnection();
            if (!conn.host || !props.isConnected) {
              updateActiveTab({ status: "error", syncStatus: "error", output: !conn.host ? "❌ No active connection." : "❌ Disconnected.", viewMode: "log" });
              setHqlStore("showResults", true);
              if (!props.isConnected) handleConnect();
              return;
            }
            const codeToSync = selectedText() || activeTab().code;
            setPendingSync(null);
            setSyncing(true);
            try {
              let workshopPath = conn.localPath;
              if (!workshopPath) {
                workshopPath = await invoke<string>("detect_workspace_path");
                setConnectionStore("connections", (c) => c.id === conn.id, { localPath: workshopPath });
                saveConnections();
              }
              updateActiveTab({ status: "loading", syncStatus: "loading", logs: "⏳ Syncing...", viewMode: "log" });
              setHqlStore("showResults", true);
              const response = await minDelay(invoke<any>("sync_hql_to_project", { code: codeToSync, localPath: workshopPath, force: false }));
              if (response.type === "Success") {
                updateActiveTab({ status: "success", syncStatus: "success", logs: response.data, viewMode: "log" });
              } else {
                setPendingSync({ items: response.data, workshopPath, fullCode: codeToSync });
                updateActiveTab({ status: "idle", viewMode: "log" });
              }
            } catch (err: any) {
              logEntry(`❌ Sync Failed: ${err}`);
              updateActiveTab({ status: "idle", syncStatus: "error", viewMode: "log" });
            } finally {
              setSyncing(false);
            }
          }}
          disabled={!activeTab().code.trim() || syncing()}
          class="h-7 w-7 p-0 flex items-center justify-center rounded-md transition-colors disabled:opacity-40"
        >
          <Show when={syncing()} fallback={<Upload size={16} class={activeConnection().localPath ? "text-accent" : "text-native-quaternary"} strokeWidth={2} />}>
            <div class="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          </Show>
        </button>
        <div class="flex-1" />
      </div>

      <div class="flex-1 flex flex-col min-h-0 relative">
        <div class="flex-1 min-h-0 bg-[var(--bg-content)]" style={{ "padding-bottom": hqlStore.showResults ? `${resultsHeight()}px` : "0" }}>
          <HQLEditor
            code={activeTab().code}
            onCodeChange={(code) => updateActiveTab({ code })}
            onExecute={executeHql}
            onFormat={beautifyCode}
            onSelectionChange={setSelectedText}
            onGutterWidthChange={setGutterWidth}
            diagnostics={activeTab().diagnostics || []}
            language={hqlLanguage}
            schema={hqlStore.schema}
          />
        </div>
        <Show when={hqlStore.showResults}>
          <div class="absolute left-0 right-0 h-px bg-[var(--border-subtle)] group z-50" style={{ bottom: `${resultsHeight()}px` }}>
            <div class="absolute inset-x-0 h-[3px] -top-[1px] cursor-row-resize hover:bg-accent/10 transition-colors" classList={{ "bg-accent/20": isResizing() }} onMouseDown={startResizing} />
          </div>
        </Show>
        <HqlPanel
          activeTab={activeTab()}
          isConnected={props.isConnected}
          onConnect={handleConnect}
          updateActiveTab={updateActiveTab}
          copyOutput={copyOutput}
          copied={copied}
          showResults={() => hqlStore.showResults}
          setShowResults={(val) => setHqlStore("showResults", val)}
          resultsHeight={resultsHeight}
          isResizing={isResizing}
          startResizing={startResizing}
          gutterWidth={gutterWidth}
          pendingSync={pendingSync}
          setPendingSync={setPendingSync}
          setSyncing={setSyncing}
          logEntry={logEntry}
        />
        <Show when={!hqlStore.showResults}>
          <div class="absolute bottom-4 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ left: `${gutterWidth()}px`, transform: "translateX(-50%)" }}>
            <button onClick={() => setHqlStore("showResults", true)} class="p-1 hover:bg-black/5 dark:hover:bg-white/2 rounded transition-colors text-native-tertiary group" title="Show Results Panel">
              <ChevronDown size={14} class="rotate-180 transition-transform duration-200 group-hover:text-accent" />
            </button>
          </div>
        </Show>
      </div>
      <Show when={pendingSync()}>
        <SyncConfirmationOverlay pendingSync={pendingSync} setPendingSync={setPendingSync} setSyncing={setSyncing} logEntry={logEntry} updateActiveTab={updateActiveTab} />
      </Show>
    </div>
  );
};

export { HQL as default };
