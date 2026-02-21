import { createSignal, createEffect, For, Show, createMemo, batch, onCleanup } from "solid-js";
import { reconcile } from "solid-js/store";
import { HelixApi } from "../lib/api";
import { EndpointConfig } from "../lib/types";
import { workbenchState, setWorkbenchState, queryStateCache } from "../stores/workbench";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Copy, Check, ChevronRight, CircleAlert, Plus, Minus, Play, LoaderCircle, X, Table, Braces, Search, Link, MessageSquareCode } from "lucide-solid";
import { ResultTable } from "./ui/result-table";
import { ToolbarLayout } from "./ui/toolbar-layout";
import { EmptyState } from "./ui/empty-state";
import { extractMultiTableData } from "../lib/result-helper";

interface QueriesProps {
  api: HelixApi;
  isExecuting: boolean;
  onRegisterExecute: (fn: (() => Promise<void>) | undefined) => void;
  isConnected: boolean;
  onConnect: () => void;
}

export const Queries = (props: QueriesProps) => {
  const endpoints = () => workbenchState.endpoints;
  const setEndpoints = (v: any) => setWorkbenchState("endpoints", v);

  const loading = () => workbenchState.loading;
  const setLoading = (v: boolean) => setWorkbenchState("loading", v);

  const selectedEndpoint = () => workbenchState.selectedEndpoint;
  const setSelectedEndpoint = (v: any) => setWorkbenchState("selectedEndpoint", v);

  const params = () => workbenchState.params;
  const setParams = (v: any) => setWorkbenchState("params", v);

  const result = () => workbenchState.result;
  const setResult = (v: any) => setWorkbenchState("result", v);

  const rawResult = () => workbenchState.rawResult;
  const setRawResult = (v: any) => setWorkbenchState("rawResult", v);

  const viewMode = () => workbenchState.viewMode;
  const setViewMode = (v: any) => setWorkbenchState("viewMode", v);

  const sidebarWidth = () => workbenchState.sidebarWidth;
  const setSidebarWidth = (v: any) => setWorkbenchState("sidebarWidth", v);

  const rightSidebarWidth = () => workbenchState.rightSidebarWidth;
  const setRightSidebarWidth = (v: any) => setWorkbenchState("rightSidebarWidth", v);

  const error = () => workbenchState.error;
  const setError = (v: any) => setWorkbenchState("error", v);

  const searchQuery = () => workbenchState.searchQuery;
  const setSearchQuery = (v: any) => setWorkbenchState("searchQuery", v);

  const resultSearchQuery = () => workbenchState.resultSearchQuery;
  const setResultSearchQuery = (v: any) => setWorkbenchState("resultSearchQuery", v);

  const showParamsSidebar = () => workbenchState.showParamsSidebar;
  const setShowParamsSidebar = (v: any) => setWorkbenchState("showParamsSidebar", v);

  const [selectedRows, setSelectedRows] = createSignal<any[]>([]);
  const [isResizing, setIsResizing] = createSignal(false);
  const [isResizingRight, setIsResizingRight] = createSignal(false);
  const [isCopied, setIsCopied] = createSignal(false);
  const [searchFocused, setSearchFocused] = createSignal(false);
  const [isRunning, setIsRunning] = createSignal(false);

  const hasParams = () => {
    const ep = selectedEndpoint();
    return ep?.params && ep.params.length > 0;
  };

  createEffect(() => {
    if (selectedEndpoint()) {
      props.onRegisterExecute(executeQuery);
    } else {
      props.onRegisterExecute(undefined);
    }
  });

  // Fetch endpoints when connected (reactive to connection state changes)
  createEffect(async () => {
    if (props.isConnected && endpoints().length === 0) {
      try {
        setLoading(true);
        const endpointsData = await props.api.fetchEndpoints();
        setEndpoints(Object.values(endpointsData));
      } catch (err) {
        console.error("Failed to fetch workbench data", err);
      } finally {
        setLoading(false);
      }
    }
  });

  const deepClone = (v: any) => (v ? JSON.parse(JSON.stringify(v)) : v);

  const handleSelect = (endpoint: EndpointConfig) => {
    batch(() => {
      const currentEndpoint = selectedEndpoint();
      if (currentEndpoint) {
        queryStateCache.set(currentEndpoint.id, {
          params: deepClone(params()),
          result: result(),
          rawResult: deepClone(rawResult()),
          error: error(),
          viewMode: viewMode(),
        });
      }

      const cached = queryStateCache.get(endpoint.id);

      // Select NEW endpoint
      setSelectedEndpoint(deepClone(endpoint));

      // Auto-show/hide params sidebar
      if (endpoint.params && endpoint.params.length > 0) {
        setShowParamsSidebar(true);
      } else {
        setShowParamsSidebar(false);
      }

      if (cached) {
        // Restore this endpoint's own cached state
        setParams(deepClone(cached.params));
        setResult(cached.result);
        setRawResult(reconcile(deepClone(cached.rawResult)));
        setError(cached.error);
        setViewMode(cached.viewMode);
        setSelectedRows([]);
      } else {
        // Never run before — show empty state
        const initialParams: Record<string, any> = {};
        if (endpoint.params) {
          endpoint.params.forEach((p) => {
            if (p.param_type.toLowerCase() === "boolean" || p.param_type.toLowerCase() === "bool") {
              initialParams[p.name] = false;
            } else {
              initialParams[p.name] = "";
            }
          });
        }
        setParams(initialParams);
        setResult(null);
        setRawResult(null);
        setError(null);
        setSelectedRows([]);
      }
    });
  };

  const handleCopy = async () => {
    const text = result();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy result:", err);
    }
  };

  const [runId, setRunId] = createSignal(0);

  const executeQuery = async () => {
    const endpoint = selectedEndpoint();
    if (!endpoint) return;

    const targetEndpointId = endpoint.id;

    const currentRunId = runId() + 1;
    setRunId(currentRunId);

    setIsRunning(true);
    setResult(null);
    setRawResult(null);
    setSelectedRows([]);
    setError(null);

    try {
      const res = await props.api.executeEndpoint(endpoint, params());

      // GUARD 1: If user switched endpoints while waiting, DISCARD the result
      if (selectedEndpoint()?.id !== targetEndpointId) {
        console.warn(`[Workbench] Discarding stale result for endpoint: ${targetEndpointId}`);
        return;
      }

      // GUARD 2: If a newer request was started, DISCARD this stale result
      if (runId() !== currentRunId) {
        console.warn(`[Workbench] Discarding stale run #${currentRunId} (latest: ${runId()})`);
        return;
      }

      setRawResult(reconcile(res));
      setResult(JSON.stringify(res, null, 2));

      setViewMode("table");

      if (Array.isArray(res) && res.length > 0) {
        setSelectedRows([res[0]]);
      } else if (typeof res === "object" && res !== null) {
        setSelectedRows([res]);
      }

      // Clear parameters on success
      if (endpoint.params) {
        const clearedParams: Record<string, any> = {};
        endpoint.params.forEach((p) => {
          if (p.param_type.toLowerCase() === "boolean" || p.param_type.toLowerCase() === "bool") {
            clearedParams[p.name] = false;
          } else {
            clearedParams[p.name] = "";
          }
        });
        setParams(clearedParams);
      }
    } catch (err: any) {
      // GUARD: If user switched endpoints or started new run, DISCARD the error
      if (selectedEndpoint()?.id !== targetEndpointId || runId() !== currentRunId) return;
      setError(err.message || "Query execution failed");
    } finally {
      setIsRunning(false);
    }
  };

  const startResizing = (e: MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = sidebarWidth();

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      const newWidth = Math.min(Math.max(startWidth + delta, 200), 480);
      setSidebarWidth(newWidth);
    };

    const stopResizing = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", stopResizing);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", stopResizing);

    onCleanup(stopResizing);
  };

  const startResizingRight = (e: MouseEvent) => {
    e.preventDefault();
    setIsResizingRight(true);

    const startX = e.clientX;
    const startWidth = rightSidebarWidth();

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startX - e.clientX;
      const newWidth = Math.min(Math.max(startWidth + delta, 240), 480);
      setRightSidebarWidth(newWidth);
    };

    const stopResizing = () => {
      setIsResizingRight(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", stopResizing);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", stopResizing);

    onCleanup(stopResizing);
  };

  const canExecute = createMemo(() => {
    const endpoint = selectedEndpoint();
    if (!endpoint) return false;
    if (!endpoint.params || endpoint.params.length === 0) return true;

    return endpoint.params.every((p) => {
      const val = params()[p.name];
      return val !== undefined && val !== null && String(val).trim() !== "";
    });
  });

  const multiTableData = createMemo(() => {
    const raw = rawResult();
    if (!raw) return {};

    const extracted = extractMultiTableData(raw);
    const query = resultSearchQuery().trim().toLowerCase();

    if (!query) return extracted;

    // Apply search filtering to each table
    const filtered: Record<string, any[]> = {};
    for (const [key, rows] of Object.entries(extracted)) {
      filtered[key] = rows.filter((row) => {
        return Object.entries(row).some(([k, val]) => {
          if (k === "__original") return false;
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(query);
        });
      });
    }
    return filtered;
  });

  const filteredEndpoints = () => {
    const query = searchQuery().toLowerCase();
    return endpoints()
      .filter((ep) => ep.name.toLowerCase().includes(query) || ep.description?.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  return (
    <div class="flex h-full overflow-hidden bg-[var(--bg-workbench)]">
      <div class="flex h-full overflow-hidden relative w-full" classList={{ "cursor-col-resize": isResizing() }}>
        <Show when={props.isConnected}>
          <div class="w-[200px] flex-none flex flex-col border-r border-native relative macos-vibrant-sidebar overflow-hidden" style={{ width: `${sidebarWidth()}px` }}>
            <div class="px-3 py-4 flex-none border-b border-native">
              <div class="flex items-center justify-between mb-3 px-1">
                <h2 class="text-[12px] font-semibold text-native-secondary/80 flex items-center gap-2">Workbench</h2>
              </div>

              <div class="w-full">
                <Input variant="search" placeholder="Search queries..." value={searchQuery()} onInput={(e) => setSearchQuery(e.currentTarget.value)} fullWidth class="h-8" />
              </div>
            </div>

            <div class="flex-1 overflow-y-auto py-2 scrollbar-thin">
              <For each={filteredEndpoints()}>
                {(endpoint) => (
                  <button
                    class="w-full text-left px-3 py-2 hover:bg-native-sidebar/50 transition-all duration-150 group relative border-l-2 border-transparent hover:border-accent/20"
                    classList={{
                      "bg-native-active border-accent": selectedEndpoint()?.name === endpoint.name,
                      "text-native-primary": selectedEndpoint()?.name === endpoint.name,
                      "text-native-secondary": selectedEndpoint()?.name !== endpoint.name,
                    }}
                    onClick={() => handleSelect(endpoint)}
                  >
                    <div class="flex items-center gap-2.5">
                      <span
                        class="text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0 w-[38px] text-center uppercase tracking-wide"
                        classList={{
                          "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400": endpoint.method.toUpperCase() === "GET",
                          "bg-blue-500/15 text-blue-600 dark:text-blue-400": endpoint.method.toUpperCase() === "POST",
                          "bg-amber-500/15 text-amber-600 dark:text-amber-400": endpoint.method.toUpperCase() === "PUT",
                          "bg-red-500/15 text-red-600 dark:text-red-400": endpoint.method.toUpperCase() === "DELETE",
                          "bg-purple-500/15 text-purple-600 dark:text-purple-400": endpoint.method.toUpperCase() === "PATCH",
                        }}
                      >
                        {endpoint.method.slice(0, 4)}
                      </span>
                      <span class="text-[12px] font-medium truncate flex-1 min-w-0">{endpoint.name}</span>
                    </div>

                    <ChevronRight
                      size={12}
                      class={`absolute right-2.5 top-1/2 -translate-y-1/2 text-native-tertiary opacity-0 group-hover:opacity-100 transition-opacity ${
                        selectedEndpoint()?.name === endpoint.name ? "opacity-100" : ""
                      }`}
                    />
                  </button>
                )}
              </For>

              <Show when={props.isConnected && filteredEndpoints().length === 0 && !loading()}>
                <div class="px-4 py-8 text-center flex flex-col items-center gap-3">
                  <Search size={28} class="text-native-quaternary opacity-25" />
                  <p class="text-xs font-medium text-native-quaternary">No queries found</p>
                </div>
              </Show>
            </div>
          </div>

          <div class="w-px h-full flex-none relative group z-50 bg-[var(--border-subtle)]">
            <div
              class="absolute inset-y-0 w-[3px] -left-[1px] cursor-col-resize hover:bg-[#007AFF]/10 dark:hover:bg-[#0A84FF]/10 transition-colors"
              classList={{ "bg-[#007AFF]/20 dark:bg-[#0A84FF]/20": isResizing() }}
              onMouseDown={startResizing}
            />
          </div>
        </Show>

        <div class="flex-1 flex flex-col overflow-hidden bg-[var(--bg-workbench-content)]">
          <Show
            when={selectedEndpoint()}
            fallback={<EmptyState icon={MessageSquareCode} title="Select a query to start" description="Choose a registered query from the sidebar to begin exploring your data." />}
          >
            <ToolbarLayout class="justify-between items-center pl-1">
              <div class="flex items-center gap-4 min-w-0">
                <Show when={selectedEndpoint()} fallback={<span class="text-[10px] font-semibold text-native-quaternary tracking-wider uppercase">Overview</span>}>
                  <div
                    class="flex items-center gap-1.5 cursor-pointer hover:bg-native-hover/60 px-1.5 py-0.5 rounded transition-colors group/path"
                    onClick={() => {
                      const ep = selectedEndpoint();
                      if (!ep) return;
                      const host = (window as any).getConnectionUrl();
                      const fullUrl = `${host}/${ep.name}`;
                      navigator.clipboard.writeText(fullUrl);
                    }}
                    title="Click to copy full API URL"
                  >
                    <code class="text-[11px] text-native-tertiary font-mono truncate max-w-[240px] group-hover/path:text-native-secondary transition-colors">/{selectedEndpoint()?.name}</code>
                    <Link size={10} class="text-native-quaternary opacity-0 group-hover/path:opacity-100 transition-opacity" />
                  </div>
                </Show>

                <div class="w-px h-3.5 bg-native opacity-30 shrink-0" />

                <button
                  disabled={props.isExecuting || !canExecute()}
                  onClick={executeQuery}
                  title="Run (⌘+Enter)"
                  class="h-7 w-7 flex items-center justify-center rounded-md hover:bg-native-content/50 active:bg-native-content transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Show when={!props.isExecuting} fallback={<LoaderCircle size={14} class="animate-spin text-emerald-500" strokeWidth={2.5} />}>
                    <Play size={14} class="text-emerald-500" strokeWidth={2.5} fill="currentColor" />
                  </Show>
                </button>

                <button
                  disabled={!hasParams()}
                  onClick={() => setShowParamsSidebar(!showParamsSidebar())}
                  class="h-7 w-7 flex items-center justify-center rounded-md hover:bg-native-content/50 active:bg-native-content transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={!hasParams() ? "No parameters" : showParamsSidebar() ? "Close Parameters" : "Add Parameters"}
                >
                  <Show when={showParamsSidebar()} fallback={<Plus size={18} class="text-accent" strokeWidth={3} />}>
                    <Minus size={18} class="text-red-500" strokeWidth={3} />
                  </Show>
                </button>
              </div>

              <div class="flex items-center gap-3">
                <Show when={rawResult()}>
                  <span class="text-[10px] text-native-tertiary tabular-nums font-medium">{Object.values(multiTableData()).reduce((acc, rows) => acc + rows.length, 0)} results</span>
                  <div class="w-px h-3.5 bg-native-subtle opacity-30" />
                </Show>

                <div class="relative group/search">
                  <Search size={12} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-native-quaternary group-focus-within/search:text-accent transition-colors" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={resultSearchQuery()}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    onInput={(e) => setResultSearchQuery(e.currentTarget.value)}
                    class="h-7 pl-8 pr-7 bg-native-content/50 border border-native rounded-md text-[11px] text-native-primary placeholder:text-native-quaternary focus:outline-none focus:border-accent/40 focus:bg-native-content transition-all duration-300 ease-out"
                    style={{ width: searchFocused() || resultSearchQuery() ? "180px" : "110px" }}
                  />
                  <Show when={resultSearchQuery()}>
                    <button
                      onClick={() => setResultSearchQuery("")}
                      class="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 hover:bg-native-content/80 rounded-md text-native-quaternary hover:text-native-primary transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </Show>
                </div>

                <div class="flex items-center gap-1.5">
                  <Button variant="toolbar" size="sm" active={viewMode() === "table"} onClick={() => setViewMode("table")} class="flex items-center gap-1.5 transition-all duration-75">
                    <Table size={13} class={viewMode() === "table" ? "text-accent" : "text-[#007AFF] dark:text-[#0A84FF]"} />
                    Table
                  </Button>

                  <Button variant="toolbar" size="sm" active={viewMode() === "json"} onClick={() => setViewMode("json")} class="flex items-center gap-1.5 transition-all duration-75">
                    <Braces size={13} class={viewMode() === "json" ? "text-accent" : "text-[#007AFF] dark:text-[#0A84FF]"} />
                    Json
                  </Button>
                </div>
              </div>
            </ToolbarLayout>

            <div class="flex-1 flex overflow-hidden">
              <div class="flex-1 flex flex-col overflow-hidden relative">
                <Show when={props.isExecuting || isRunning()}>
                  <div class="flex-1 flex items-center justify-center">
                    <div class="flex flex-col items-center gap-4">
                      <div class="w-6 h-6 border-2 border-accent/20 border-t-accent rounded-full animate-spin"></div>
                      <span class="text-[12px] font-semibold text-native-tertiary uppercase tracking-wide">Executing...</span>
                    </div>
                  </div>
                </Show>

                <Show when={error()}>
                  <div class="flex-1 flex items-center justify-center p-6 bg-[var(--bg-workbench-content)]">
                    <div class="max-w-md text-center">
                      <div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-status-error/10 border border-status-error/20 flex items-center justify-center shadow-sm">
                        <CircleAlert class="w-7 h-7 text-status-error" />
                      </div>
                      <p class="text-[14px] font-semibold text-native-primary mb-2">Query Failed</p>
                      <p class="text-[12px] text-native-secondary font-mono bg-native-sidebar px-4 py-3 rounded-lg border border-native">{error()}</p>
                    </div>
                  </div>
                </Show>

                <Show when={rawResult() && !error() && !props.isExecuting && !isRunning()}>
                  <Show
                    when={viewMode() === "table"}
                    fallback={
                      <div class="flex-1 overflow-auto bg-[var(--bg-table-row)] scrollbar-thin relative group">
                        <div class="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <button
                            onClick={handleCopy}
                            class="w-5 h-5 flex items-center justify-center bg-native-sidebar/80 backdrop-blur-md border border-native rounded-md shadow-sm hover:bg-hover transition-all"
                            title="Copy JSON"
                          >
                            <Show when={isCopied()} fallback={<Copy size={11} class="text-native-tertiary" />}>
                              <Check size={11} class="text-[#34c759]" />
                            </Show>
                          </button>
                        </div>
                        <pre class="px-5 py-3 m-0 font-mono text-[12px] text-native-primary whitespace-pre-wrap select-text cursor-text leading-relaxed">{result()}</pre>
                      </div>
                    }
                  >
                    <div class="flex-1 overflow-auto h-full space-y-5 px-0.5 py-2 scrollbar-thin flex flex-col">
                      <For each={Object.entries(multiTableData())}>
                        {([name, rows]) => {
                          const tableCount = () => Object.keys(multiTableData()).length;
                          return (
                            <div class="flex flex-col gap-2" classList={{ "flex-1 min-h-[200px]": tableCount() === 1 }}>
                              <div class="flex items-center gap-2 px-1">
                                <Table size={12} class="text-accent" />
                                <span class="text-[11px] font-bold uppercase tracking-wider text-native-secondary">{name}</span>
                                <span class="text-[10px] text-native-quaternary tabular-nums">({rows.length})</span>
                              </div>
                              <div
                                class="border border-native rounded-sm overflow-hidden bg-native-sidebar/20 flex flex-col"
                                classList={{
                                  "max-h-[400px]": tableCount() > 1,
                                  "flex-1": tableCount() === 1,
                                }}
                              >
                                <ResultTable data={rows} onSelect={setSelectedRows} selectedRows={selectedRows()} />
                              </div>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </Show>

                <Show when={!rawResult() && !error() && !props.isExecuting && !isRunning()}>
                  <EmptyState icon={MessageSquareCode} title="Ready to query" description={hasParams() ? "Click the green + button above to add parameters" : "Click run to execute this query"} />
                </Show>
              </div>

              <Show when={showParamsSidebar()}>
                <div class="w-px h-full flex-none relative group z-50 bg-[var(--border-subtle)]">
                  <div
                    class="absolute inset-y-0 w-[3px] -left-[1px] cursor-col-resize hover:bg-[#007AFF]/10 dark:hover:bg-[#0A84FF]/10 transition-colors"
                    classList={{ "bg-[#007AFF]/20 dark:bg-[#0A84FF]/20": isResizingRight() }}
                    onMouseDown={startResizingRight}
                  />
                </div>

                <div class="w-[260px] flex-none flex flex-col border-l border-native macos-vibrant-sidebar overflow-hidden" style={{ width: `${rightSidebarWidth()}px` }}>
                  <div class="h-[44px] px-4 border-b border-native flex items-center justify-between macos-vibrant-sidebar">
                    <h3 class="text-[12px] font-semibold text-native-primary">Parameters</h3>
                    <button
                      onClick={() => setShowParamsSidebar(false)}
                      class="p-1.5 hover:bg-native-content rounded-md text-native-tertiary hover:text-native-primary transition-all active:scale-95"
                      title="Close (Esc)"
                    >
                      <X size={14} stroke-width={2} />
                    </button>
                  </div>

                  <div class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                    <For each={selectedEndpoint()?.params}>
                      {(param) => (
                        <div class="space-y-2">
                          <label class="flex items-center gap-2 text-[11px] font-medium text-native-secondary">
                            <span>{param.name}</span>

                            <span class="text-[9px] uppercase font-semibold text-native-quaternary bg-native-content/40 px-1.5 py-0.5 rounded tracking-wide">{param.param_type}</span>

                            <Show when={!params()[param.name] && params()[param.name] !== false}>
                              <span class="text-[#ff9500] text-[10px] font-bold">required</span>
                            </Show>
                          </label>

                          <Show
                            when={param.param_type.toLowerCase() !== "boolean" && param.param_type.toLowerCase() !== "bool"}
                            fallback={
                              <label class="flex items-center gap-2.5 cursor-pointer group h-8 px-3 bg-native-content border border-native rounded-md hover:border-accent/50 transition-all">
                                <div class="relative flex items-center justify-center w-3.5 h-3.5">
                                  <input
                                    type="checkbox"
                                    checked={params()[param.name] === true}
                                    onChange={(e) =>
                                      setParams({
                                        ...params(),
                                        [param.name]: e.currentTarget.checked,
                                      })
                                    }
                                    class="peer absolute inset-0 w-full h-full appearance-none rounded border border-[var(--border-medium)] bg-[var(--bg-elevated)] checked:bg-accent checked:border-accent transition-all cursor-pointer"
                                  />
                                  <Check size={9} strokeWidth={3} class="z-10 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" />
                                </div>
                                <span class="text-[12px] text-native-secondary font-medium tabular-nums">{params()[param.name] ? "true" : "false"}</span>
                              </label>
                            }
                          >
                            <input
                              type="text"
                              placeholder={`Enter ${param.param_type.toLowerCase()}...`}
                              value={params()[param.name] ?? ""}
                              onInput={(e) =>
                                setParams({
                                  ...params(),
                                  [param.name]: e.currentTarget.value,
                                })
                              }
                              class="w-full h-8 px-3 bg-native-content border border-native rounded-md text-[12px] text-native-primary placeholder:text-native-quaternary outline-none focus:outline-none focus:border-accent/50 transition-all"
                            />
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>

                  <div class="p-4 border-t border-native bg-native-sidebar/80 backdrop-blur-sm">
                    <Button onClick={executeQuery} disabled={props.isExecuting || !canExecute()} variant="primary" class="w-full h-9 font-semibold shadow-sm">
                      <Show
                        when={!props.isExecuting}
                        fallback={
                          <div class="flex items-center gap-2">
                            <div class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Running...</span>
                          </div>
                        }
                      >
                        Run Query
                      </Show>
                    </Button>
                  </div>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};
