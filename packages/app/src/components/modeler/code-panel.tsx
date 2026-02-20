import { createSignal, Show, createEffect, onCleanup } from "solid-js";
import { FileCode, Copy, CircleCheck, Zap, CircleAlert, Settings2, Database, Terminal, Check } from "lucide-solid";
import { QueryGenerationConfig } from "../../lib/codegen";
import { HQLEditor } from "../ui/hql-editor";
import { Button } from "../ui/button";

import { hqlLanguage } from "../../lib/hql-syntax";

interface CodePanelProps {
  schemaCode: string;
  queryCode: string;
  isDirty: boolean;
  isCompiling: boolean;
  lastError: string | null;
  onCompile: () => void;
  config: QueryGenerationConfig;
  onConfigChange: (config: QueryGenerationConfig) => void;
  activeTab: "schema" | "queries";
  onTabChange: (tab: "schema" | "queries") => void;
}

export const CodePanel = (props: CodePanelProps) => {
  const [copied, setCopied] = createSignal(false);
  const [showConfig, setShowConfig] = createSignal(false);
  let configContainerRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (!showConfig()) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (configContainerRef && !configContainerRef.contains(e.target as Node)) {
        setShowConfig(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    onCleanup(() => document.removeEventListener("mousedown", handleClickOutside));
  });

  const handleCopy = () => {
    const code = props.activeTab === "schema" ? props.schemaCode : props.queryCode;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getActiveCode = () => {
    switch (props.activeTab) {
      case "schema":
        return props.schemaCode;
      case "queries":
        return props.queryCode;
      default:
        return "";
    }
  };

  return (
    <div class="flex-none flex flex-col h-full bg-native-sidebar border-l border-native-subtle">
      {/* Top Toolbar */}
      <header class="h-12 flex-none border-b border-native-subtle bg-native-sidebar-vibrant flex items-center justify-between px-4">
        <div class="flex items-center gap-2">
          <FileCode size={14} class="text-accent" strokeWidth={2} />
          <span class="text-[12px] font-semibold text-native-primary">HQL Generation</span>
        </div>

        <div class="flex items-center gap-2">
          {/* Error Badge */}
          <Show when={props.lastError}>
            <div class="flex items-center gap-1.5 px-2 py-1 bg-error/10 rounded-md">
              <CircleAlert size={12} class="text-error" strokeWidth={2} />
              <span class="text-[10px] font-semibold text-error">Error</span>
            </div>
          </Show>

          {/* Compile Button */}
          <Button
            variant={props.isDirty ? "primary" : "toolbar"}
            onMouseDown={(e) => {
              e.preventDefault();
              if (!props.isCompiling) props.onCompile();
            }}
            disabled={props.isCompiling}
            class="flex items-center gap-1.5 transition-all duration-75"
          >
            <Show when={props.isCompiling} fallback={<Zap size={11} strokeWidth={2} class={props.isDirty ? "fill-current" : ""} />}>
              <div class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </Show>
            {props.isCompiling ? "Generating..." : "Generate"}
          </Button>
        </div>
      </header>

      {/* Tab Bar - macOS Style */}
      <div class="h-10 flex-none border-b border-native-subtle bg-native-sidebar/50 flex items-center px-2 gap-1 relative">
        <Button
          variant="toolbar"
          size="sm"
          active={props.activeTab === "schema"}
          onMouseDown={(e) => {
            e.preventDefault();
            props.onTabChange("schema");
          }}
          class="h-7 px-3"
        >
          <Database size={13} strokeWidth={2} />
          Schema
        </Button>
        <Button
          variant="toolbar"
          size="sm"
          active={props.activeTab === "queries"}
          onMouseDown={(e) => {
            e.preventDefault();
            props.onTabChange("queries");
          }}
          class="h-7 px-3"
        >
          <Terminal size={13} strokeWidth={2} />
          Queries
        </Button>

        {/* Config Toggle & Popover Container */}
        <div class="relative" ref={configContainerRef}>
          <Button
            variant="toolbar"
            size="sm"
            active={showConfig()}
            onMouseDown={(e) => {
              e.preventDefault();
              setShowConfig(!showConfig());
            }}
            class="h-7 px-3"
            title="Configure Query Generation"
          >
            <Settings2 size={13} strokeWidth={2} />
            Customize
          </Button>

          {/* Configuration Popover */}
          <Show when={showConfig()}>
            <div class="absolute top-full left-0 mt-2 z-50 w-64 bg-native-elevated dark:bg-native-sidebar-vibrant backdrop-blur-xl rounded-xl shadow-macos-lg border border-native/50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-left">
              <div class="max-h-[calc(100vh-160px)] overflow-y-auto p-3">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-[12px] font-bold text-native-primary">Generation Options</h3>
                  <span class="text-[9px] text-native-tertiary bg-native-active px-1.5 py-0.5 rounded">HQL</span>
                </div>

                {/* Search Section */}
                <div class="space-y-1.5">
                  <h4 class="text-[10px] font-bold text-native-tertiary tracking-wider mb-2 uppercase">Search Intelligence</h4>
                  <div class="grid grid-cols-1 gap-2 pl-1">
                    <ConfigToggle
                      label="Keyword Search"
                      description="Search for specific words (BM25)"
                      checked={props.config?.discovery?.keyword_search ?? false}
                      onChange={(v) => props.onConfigChange({ ...props.config, discovery: { ...props.config.discovery, keyword_search: v } })}
                    />
                    <ConfigToggle
                      label="Semantic Search"
                      description="Search by meaning (AI / Vector)"
                      checked={props.config?.discovery?.vector_search ?? false}
                      onChange={(v) => props.onConfigChange({ ...props.config, discovery: { ...props.config.discovery, vector_search: v } })}
                    />
                    <ConfigToggle
                      label="Vector Store"
                      description="Templates for saving AI embeddings"
                      checked={props.config?.discovery?.vector_upsert ?? false}
                      onChange={(v) => props.onConfigChange({ ...props.config, discovery: { ...props.config.discovery, vector_upsert: v } })}
                    />
                  </div>
                </div>

                <div class="h-px bg-native-subtle opacity-30 my-3" />

                {/* Graph Insight */}
                <div class="space-y-1.5">
                  <h4 class="text-[10px] font-bold text-native-tertiary tracking-wider mb-2 uppercase">Graph Insight</h4>
                  <div class="grid grid-cols-1 gap-2 pl-1">
                    <ConfigToggle
                      label="Network Hop"
                      description="Expand 2 steps (friends of friends)"
                      checked={props.config?.discovery?.multi_hop ?? false}
                      onChange={(v) => props.onConfigChange({ ...props.config, discovery: { ...props.config.discovery, multi_hop: v } })}
                    />
                    <ConfigToggle
                      label="Mutual Friends"
                      description="Identify shared connections"
                      checked={props.config?.discovery?.mutual_connections ?? false}
                      onChange={(v) => props.onConfigChange({ ...props.config, discovery: { ...props.config.discovery, mutual_connections: v } })}
                    />
                  </div>
                </div>

                <div class="h-px bg-native-subtle opacity-30 my-3" />

                {/* Smart Views */}
                <div class="space-y-1.5">
                  <h4 class="text-[10px] font-bold text-native-tertiary tracking-wider mb-2 uppercase">Smart Views & Testing</h4>
                  <div class="grid grid-cols-1 gap-2 pl-1">
                    <ConfigToggle
                      label="Deep Detail"
                      description="Item info + related counts"
                      checked={props.config?.intelligence?.rich_detail ?? false}
                      onChange={(v) => props.onConfigChange({ ...props.config, intelligence: { ...props.config.intelligence, rich_detail: v } })}
                    />
                  </div>
                </div>

                <div class="h-px bg-native-subtle opacity-30 my-3" />

                {/* CRUD Section */}
                <div class="space-y-1.5">
                  <h4 class="text-[10px] font-bold text-native-tertiary tracking-wider mb-2 uppercase">Data Operations</h4>
                  <div class="grid grid-cols-1 gap-2 pl-1">
                    <ConfigToggle
                      label="Basic Queries"
                      description="Fetch item by ID or list all"
                      checked={props.config?.crud?.basic ?? true}
                      onChange={(v) => props.onConfigChange({ ...props.config, crud: { ...props.config.crud, basic: v } })}
                    />
                    <ConfigToggle
                      label="Pro Control"
                      description="Sorting & Pagination logic"
                      checked={props.config?.crud?.pro_control ?? true}
                      onChange={(v) => props.onConfigChange({ ...props.config, crud: { ...props.config.crud, pro_control: v } })}
                    />
                    <ConfigToggle
                      label="Mutations"
                      description="Creating and connecting data"
                      checked={props.config?.crud?.mutation ?? true}
                      onChange={(v) => props.onConfigChange({ ...props.config, crud: { ...props.config.crud, mutation: v } })}
                    />
                    <ConfigToggle
                      label="Upserts"
                      description="Update existing or create new"
                      checked={props.config?.crud?.upsert ?? true}
                      onChange={(v) => props.onConfigChange({ ...props.config, crud: { ...props.config.crud, upsert: v } })}
                    />
                    <ConfigToggle
                      label="Destructive"
                      description="Permanently delete information"
                      checked={props.config?.crud?.drop ?? true}
                      onChange={(v) => props.onConfigChange({ ...props.config, crud: { ...props.config.crud, drop: v } })}
                    />
                  </div>
                </div>

                <div class="h-px bg-native-subtle opacity-30 my-3" />

                {/* Pathfinding Section */}
                <div class="space-y-1.5">
                  <h4 class="text-[10px] font-bold text-native-tertiary tracking-wider mb-2 uppercase">Logic & Paths</h4>
                  <div class="grid grid-cols-1 gap-2 pl-1">
                    <ConfigToggle
                      label="Shortest Path"
                      description="Fastest way between two records"
                      checked={props.config?.pathfinding?.bfs ?? false}
                      onChange={(v) => props.onConfigChange({ ...props.config, pathfinding: { ...props.config.pathfinding, bfs: v } })}
                    />
                    <ConfigToggle
                      label="Weighted Search"
                      description="Find best path based on score"
                      checked={props.config?.pathfinding?.dijkstra ?? false}
                      onChange={(v) => props.onConfigChange({ ...props.config, pathfinding: { ...props.config.pathfinding, dijkstra: v } })}
                    />
                  </div>
                </div>

                <div class="h-px bg-native-subtle opacity-30 my-3" />

                <div class="space-y-1.5">
                  <h4 class="text-[10px] font-bold text-native-tertiary tracking-wider mb-2 uppercase">Stats & Analytics</h4>
                  <div class="grid grid-cols-1 gap-2 pl-1">
                    <ConfigToggle
                      label="Aggregations"
                      description="Calculate Sums, Totals or Averages"
                      checked={props.config?.analytics?.aggregation ?? true}
                      onChange={(v) => props.onConfigChange({ ...props.config, analytics: { ...props.config.analytics, aggregation: v } })}
                    />
                    <ConfigToggle
                      label="Grouping"
                      description="Cluster data into categories"
                      checked={props.config?.analytics?.grouping ?? true}
                      onChange={(v) => props.onConfigChange({ ...props.config, analytics: { ...props.config.analytics, grouping: v } })}
                    />
                  </div>
                </div>
              </div>
            </div>
          </Show>
        </div>

        <div class="flex-1" />

        {/* Copy Button */}
        <Button
          variant="toolbar"
          size="sm"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCopy();
          }}
          class="h-7 px-3"
        >
          <Show when={copied()} fallback={<Copy size={12} strokeWidth={2} />}>
            <CircleCheck size={12} strokeWidth={2} class="text-emerald-500 animate-in fade-in zoom-in duration-200" />
          </Show>
          <span>{copied() ? "Copied" : "Copy"}</span>
        </Button>
      </div>

      {/* Code Display Area */}
      <div class="flex-1 overflow-hidden bg-native-content relative">
        <HQLEditor code={getActiveCode() || ""} readOnly={true} language={hqlLanguage} />
      </div>
    </div>
  );
};

const ConfigToggle = (props: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label class="flex items-start justify-between cursor-pointer group">
    <div class="flex flex-col">
      <span class="text-[11px] font-medium text-native-primary group-hover:text-accent transition-colors text-left">{props.label}</span>
      <span class="text-[9px] text-native-tertiary mt-0.5 leading-tight text-left">{props.description}</span>
    </div>
    <div class="relative mt-0.5 w-3.5 h-3.5 flex items-center justify-center">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
        class="peer absolute inset-0 h-full w-full appearance-none rounded border border-native bg-native-elevated checked:bg-accent checked:border-accent transition-all cursor-pointer"
      />
      <Check size={9} strokeWidth={3} class="z-10 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" />
    </div>
  </label>
);
