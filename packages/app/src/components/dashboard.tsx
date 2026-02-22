import { createSignal, createEffect, Show, For, createMemo, onCleanup } from "solid-js";
import { HelixApi } from "../lib/api";
import { Button } from "./ui/button";
import { RefreshCw, ChevronDown, ChevronUp, Terminal, Clock, Globe, Database, HardDrive, Activity } from "lucide-solid";
import { SchemaQuery, LocalStorageStats } from "../lib/types";
import { ToolbarLayout } from "./ui/toolbar-layout";

// A modern, subtle, and premium color palette
const MODERN_PALETTE = [
  "#6366f1", // Indigo
  "#14b8a6", // Teal
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#8b5cf6", // Purple
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f43f5e", // Rose
  "#f97316", // Orange
  "#06b6d4", // Cyan
  "#84cc16", // Lime
  "#eab308", // Yellow
  "#d946ef", // Fuchsia
  "#a855f7", // Violet
  "#0ea5e9", // Sky
  "#ef4444", // Red
];

// ─── Utilities ───
const getHSLColor = (index: number) => {
  if (index < MODERN_PALETTE.length) return MODERN_PALETTE[index];
  // Procedural generation using Golden Angle (approx 137.5 degrees) for infinite distinct highlights
  const hue = (index * 137.508) % 360;
  return `hsl(${hue}, 65%, 55%)`;
};

// ─── Stagger Animation Wrapper ───
const Stagger = (p: { index: number; step?: number; children: any }) => (
  <div class="stagger-in" style={{ "animation-delay": `${p.index * (p.step ?? 60)}ms` }}>
    {p.children}
  </div>
);

// ─── Stat Card ───
const StatCard = (p: { label: string; value: number; sublabel: string; loading?: boolean }) => (
  <div class="relative flex flex-col gap-3 p-5 rounded-xl bg-native-elevated border border-native-subtle shadow-sm overflow-hidden group hover:border-native hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
    <div class="flex items-center justify-between">
      <span class="text-[11px] font-bold tracking-widest text-native-tertiary uppercase opacity-80">{p.label}</span>
    </div>

    <div class="flex flex-col gap-1 mt-1">
      <Show when={!p.loading} fallback={<div class="animate-pulse h-8 w-24 rounded-md bg-native/10" />}>
        <div class="flex items-baseline gap-2">
          <span class="text-3xl font-semibold font-mono tracking-tight text-native-primary leading-none">{p.value.toLocaleString()}</span>
        </div>
      </Show>
      <span class="text-[11px] text-native-tertiary opacity-60 font-medium">{p.sublabel}</span>
    </div>
  </div>
);

import * as echarts from "echarts";

// ─── Donut Chart (ECharts) ───
const DonutChart = (p: { items: { type: string; count: number; queries: SchemaQuery[]; color?: string }[]; total: number }) => {
  let chartRef!: HTMLDivElement;

  createEffect(() => {
    if (!chartRef || p.items.length === 0) return;

    const chart = echarts.init(chartRef);

    const validItems = p.items.filter((i) => i.count > 0);

    const data = validItems.map((item, idx) => ({
      value: item.count,
      name: item.type,
      // Use provided color or fallback to our modern palette
      itemStyle: { color: item.color || getHSLColor(idx) },
    }));

    const option = {
      tooltip: {
        trigger: "item",
        formatter: '<div style="font-family: ui-sans-serif, system-ui, sans-serif;"><b>{b}</b>: {c} <span style="opacity: 0.6; font-size: 11px;">({d}%)</span></div>',
        backgroundColor: "rgba(23, 23, 23, 0.9)", // Very dark gray, almost black
        borderColor: "rgba(255, 255, 255, 0.08)",
        borderWidth: 1,
        textStyle: { color: "#f3f4f6", fontSize: 12 },
        padding: [8, 12],
        borderRadius: 6,
        extraCssText: "box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3); backdrop-filter: blur(4px);",
      },
      series: [
        {
          type: "pie",
          radius: ["80%", "95%"], // Thinner ring for a much sleeker look
          center: ["50%", "50%"],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 4, // Subtle rounded corners
            borderWidth: 0, // Removed borders completely
          },
          label: {
            show: false,
          },
          emphasis: {
            scale: false, // Disables the scale enlargement completely
            itemStyle: {
              shadowBlur: 0,
              shadowColor: "transparent",
            },
          },
          data: data,
        },
      ],
    };

    chart.setOption(option);

    // Responsive handling
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(chartRef);

    onCleanup(() => {
      resizeObserver.disconnect();
      chart.dispose();
    });
  });

  return (
    <div class="relative flex items-center justify-center">
      {/* Container must have explicit dimensions for ECharts */}
      <div ref={chartRef} style={{ width: "100px", height: "100px" }} />
      <div class="absolute flex flex-col items-center justify-center pointer-events-none">
        <span class="text-[14px] font-bold font-mono text-native-primary tabular-nums">{p.total > 9999 ? (p.total / 1000).toFixed(1) + "k" : p.total}</span>
      </div>
    </div>
  );
};

// ─── Distribution Card ───
const DistCard = (p: {
  title: string;
  subtitle: string;
  totalCount: number;
  items: { type: string; count: number; queries: SchemaQuery[] }[];
  loading?: boolean;
  onSelectQuery?: (q: SchemaQuery) => void;
}) => {
  const [expandedType, setExpandedType] = createSignal<string | null>(null);

  // Grouping logic: Top 15 + "Other"
  const processedItems = createMemo(() => {
    // 1. Filter out zeros and sort descending
    const sorted = [...p.items].filter((i) => i.count > 0).sort((a, b) => b.count - a.count);

    if (sorted.length <= 16) {
      return sorted.map((item, idx) => ({ ...item, color: getHSLColor(idx) }));
    }

    // 2. Slice Top 15
    const top15 = sorted.slice(0, 15).map((item, idx) => ({ ...item, color: getHSLColor(idx) }));
    const others = sorted.slice(15);
    const otherCount = others.reduce((sum, item) => sum + item.count, 0);

    return [
      ...top15,
      {
        type: `Other (${others.length})`,
        count: otherCount,
        queries: [],
        color: "#64748b", // Neutral slate for "Other"
      },
    ];
  });

  return (
    <div class="flex flex-col gap-4 p-5 rounded-xl bg-native-elevated border border-native-subtle shadow-sm">
      <div class="flex flex-col pb-3 border-b border-native-subtle">
        <div class="text-[13px] font-semibold text-native-primary">{p.title}</div>
        <div class="text-[11px] text-native-tertiary">{p.subtitle}</div>
      </div>

      <div class="flex flex-col gap-5">
        <div class="flex items-center gap-6 py-2">
          <Show when={!p.loading} fallback={<div class="w-[100px] h-[100px] rounded-full animate-pulse bg-native/10" />}>
            <DonutChart items={processedItems()} total={p.totalCount} />
          </Show>
          <div class="flex-1 flex flex-col gap-2.5">
            <Show when={!p.loading} fallback={<div class="h-10 w-full animate-pulse bg-native/10 rounded-md" />}>
              <div class="text-[20px] font-bold font-mono text-native-primary tracking-tight leading-none">{p.totalCount.toLocaleString()}</div>
              <div class="text-[10px] uppercase font-bold text-native-quaternary tracking-wider">Total Records</div>
            </Show>
          </div>
        </div>

        <div class="flex flex-col gap-3 overflow-y-scroll flex-1 pr-1 scrollbar-thin max-h-[280px]">
          <Show
            when={!p.loading}
            fallback={
              <div class="flex flex-col gap-3 py-1 animate-pulse">
                <div class="h-6 w-full bg-native/10 rounded" />
                <div class="h-6 w-4/5 bg-native/10 rounded" />
              </div>
            }
          >
            <Show when={processedItems().length > 0} fallback={<span class="text-xs text-native-tertiary italic py-3">No types defined</span>}>
              <For each={processedItems()}>
                {(item) => {
                  const pct = Math.round((item.count / (p.totalCount || 1)) * 100);
                  const isExpanded = () => expandedType() === item.type;
                  const canExpand = item.queries.length > 0;

                  return (
                    <div class="flex flex-col gap-2 group">
                      <div class={`flex flex-col gap-1.5 ${canExpand ? "cursor-pointer" : ""}`} onClick={() => canExpand && setExpandedType(isExpanded() ? null : item.type)}>
                        <div class="flex justify-between items-center">
                          <div class="flex items-center gap-2">
                            <div class="w-1.5 h-3 rounded-full" style={{ "background-color": item.color }} />
                            <span class={`text-[12px] font-medium transition-colors ${isExpanded() ? "text-native-primary font-bold" : "text-native-secondary group-hover:text-native-primary"}`}>
                              {item.type}
                            </span>
                            <Show when={item.queries.length > 0}>
                              <div class="flex items-center gap-1 text-[10px] text-native-tertiary opacity-40">
                                {isExpanded() ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                <span>{item.queries.length}</span>
                              </div>
                            </Show>
                          </div>
                          <div class="flex items-center gap-2">
                            <span class="text-[10px] font-mono text-native-tertiary opacity-60">{pct}%</span>
                            <span class="text-[12px] font-bold font-mono text-native-primary tabular-nums">{item.count.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      <Show when={isExpanded() && item.queries.length > 0}>
                        <div class="flex flex-col gap-1.5 pl-3 border-l-2 border-native-subtle my-1 animate-in fade-in slide-in-from-top-1 duration-200">
                          <div class="text-[9px] uppercase font-bold text-native-quaternary tracking-widest mb-0.5">Associated Queries</div>
                          <div class="flex flex-wrap gap-1.5">
                            {item.queries.map((q) => (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  p.onSelectQuery?.(q);
                                }}
                                class="flex items-center gap-1.5 px-2 py-0.5 rounded-[8px] bg-native-content border border-native-subtle hover:bg-hover hover:border-accent/40 active:scale-95 transition-all group/query cursor-pointer"
                              >
                                <Terminal size={10} class="text-native-tertiary group-hover/query:text-accent transition-colors" />
                                <span class="text-[10px] font-mono text-native-secondary group-hover/query:text-native-primary transition-colors">{q.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
};

// ─── Storage Info & Health ───
const StorageStats = (p: { stats: LocalStorageStats; loading?: boolean }) => {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const dbEntries = () => Object.entries(p.stats.core_dbs).sort((a, b) => b[1].entries - a[1].entries);

  return (
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Disk Usage */}
      <div class="flex flex-col gap-4 p-5 rounded-xl bg-native-elevated border border-native-subtle shadow-sm">
        <div class="flex items-center justify-between border-b border-native-subtle pb-3">
          <div class="flex items-center gap-2">
            <HardDrive size={16} class="text-accent" />
            <span class="text-[13px] font-semibold text-native-primary">Physical Storage</span>
          </div>
          <span class="text-[10px] font-mono text-native-tertiary uppercase tracking-wider">Disk Info</span>
        </div>
        <div class="flex flex-col gap-1">
          <div class="text-2xl font-bold font-mono text-native-primary tracking-tight">{formatBytes(p.stats.disk_size_bytes)}</div>
          <div class="text-[11px] text-native-tertiary opacity-60">Total data.mdb size</div>
        </div>
        <div class="flex flex-col gap-2 pt-1">
          <div class="flex justify-between text-[11px]">
            <span class="text-native-tertiary">Environment Max</span>
            <span class="text-native-secondary font-mono">{formatBytes(p.stats.env_info.map_size)}</span>
          </div>
          <div class="w-full bg-native/10 h-1 rounded-full overflow-hidden">
            <div class="bg-accent h-full transition-all duration-500" style={{ width: `${Math.min(100, (p.stats.disk_size_bytes / p.stats.env_info.map_size) * 100)}%` }} />
          </div>
        </div>
      </div>

      {/* Database Activity */}
      <div class="flex flex-col gap-4 p-5 rounded-xl bg-native-elevated border border-native-subtle shadow-sm">
        <div class="flex items-center justify-between border-b border-native-subtle pb-3">
          <div class="flex items-center gap-2">
            <Activity size={16} class="text-emerald-500" />
            <span class="text-[13px] font-semibold text-native-primary">Engine Health</span>
          </div>
          <span class="text-[10px] font-mono text-native-tertiary uppercase tracking-wider">Environment</span>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-0.5">
            <div class="text-[10px] text-native-quaternary uppercase font-bold tracking-tight">Last Txn ID</div>
            <div class="text-lg font-mono font-bold text-native-primary">{p.stats.env_info.last_txnid.toLocaleString()}</div>
          </div>
          <div class="flex flex-col gap-0.5">
            <div class="text-[10px] text-native-quaternary uppercase font-bold tracking-tight">Active Readers</div>
            <div class="text-lg font-mono font-bold text-native-primary">
              {p.stats.env_info.num_readers} / {p.stats.env_info.max_readers}
            </div>
          </div>
          <div class="flex flex-col gap-0.5">
            <div class="text-[10px] text-native-quaternary uppercase font-bold tracking-tight">Last Page ID</div>
            <div class="text-lg font-mono font-bold text-native-primary">{p.stats.env_info.last_pgno.toLocaleString()}</div>
          </div>
          <div class="flex flex-col gap-0.5">
            <div class="text-[10px] text-native-quaternary uppercase font-bold tracking-tight">Status</div>
            <div class="text-lg font-bold text-emerald-500 flex items-center gap-1.5">
              <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Healthy
            </div>
          </div>
        </div>
      </div>

      {/* Core DBs breakdown */}
      <div class="flex flex-col gap-4 p-5 rounded-xl bg-native-elevated border border-native-subtle shadow-sm">
        <div class="flex items-center justify-between border-b border-native-subtle pb-3">
          <div class="flex items-center gap-2">
            <Database size={16} class="text-indigo-500" />
            <span class="text-[13px] font-semibold text-native-primary">Core Subscriptions</span>
          </div>
          <span class="text-[10px] font-mono text-native-tertiary uppercase tracking-wider">DB Entry Counts</span>
        </div>
        <div class="flex flex-col gap-2 max-h-[120px] overflow-y-auto pr-1 scrollbar-thin">
          <For each={dbEntries()}>
            {([name, stat]) => (
              <div class="flex justify-between items-center text-[11px] group">
                <span class="text-native-secondary font-medium group-hover:text-native-primary transition-colors underline decoration-dotted decoration-native-tertiary underline-offset-2">
                  {name}
                </span>
                <span class="text-native-primary font-mono font-bold bg-native/5 px-1.5 py-0.5 rounded">{stat.entries.toLocaleString()}</span>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};

interface DashboardProps {
  api: HelixApi;
  isConnected: boolean;
  dbPath?: string;
  onConnect: () => void;
  onSelectQuery?: (q: SchemaQuery) => void;
}

export const Dashboard = (props: DashboardProps) => {
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const [totalNodes, setTotalNodes] = createSignal(0);
  const [totalEdges, setTotalEdges] = createSignal(0);
  const [totalVectors, setTotalVectors] = createSignal(0);
  const [nodeTypes, setNodeTypes] = createSignal<{ type: string; count: number; queries: SchemaQuery[] }[]>([]);
  const [edgeTypes, setEdgeTypes] = createSignal<{ type: string; count: number; queries: SchemaQuery[] }[]>([]);
  const [vectorTypes, setVectorTypes] = createSignal<{ type: string; count: number; queries: SchemaQuery[] }[]>([]);
  const [totalQueries, setTotalQueries] = createSignal(0);
  const [lastUpdated, setLastUpdated] = createSignal<Date | null>(null);
  const [storageStats, setStorageStats] = createSignal<LocalStorageStats | null>(null);

  const loadStats = async () => {
    if (!props.isConnected) return;
    setLoading(true);
    setError(null);
    try {
      let nodes = 0;
      let edges = 0;
      let vectors = 0;
      const nodeDist: { type: string; count: number; queries: SchemaQuery[] }[] = [];
      const edgeDist: { type: string; count: number; queries: SchemaQuery[] }[] = [];
      const vectorDist: { type: string; count: number; queries: SchemaQuery[] }[] = [];

      try {
        const schema = await props.api.fetchSchema();

        setTotalQueries(schema.queries?.length || 0);

        const getAssociatedQueries = (typeName: string) => {
          if (!schema.queries) return [];
          const lowerType = typeName.toLowerCase();
          const singularType = lowerType.endsWith("s") ? lowerType.slice(0, -1) : lowerType;
          return schema.queries.filter((q) => {
            const name = q.name.toLowerCase();
            const returns = (q.returns || []).map((r) => r.toLowerCase());
            return name.includes(lowerType) || name.includes(singularType) || returns.some((r) => r.includes(lowerType) || r.includes(singularType));
          });
        };

        for (const n of schema.nodes || []) {
          const typeName = n.name || "Unknown";
          if (typeName === "Unknown") continue;
          try {
            const hql = `QUERY CountN${typeName}() =>\n  count <- N<${typeName}>::COUNT\n  RETURN count`;
            const res = await props.api.executeHQL(hql);
            const countStr = res?.count || res?.Count?.[""]?.count || res?.[0]?.count || res?.[0] || 0;
            const count = typeof countStr === "number" ? countStr : parseInt(countStr as string, 10) || 0;
            nodes += count;
            nodeDist.push({ type: typeName, count, queries: getAssociatedQueries(typeName) });
          } catch (e) {}
        }

        for (const e of schema.edges || []) {
          const typeName = e.name || "Unknown";
          if (typeName === "Unknown") continue;
          try {
            const hql = `QUERY CountE${typeName}() =>\n  count <- E<${typeName}>::COUNT\n  RETURN count`;
            const res = await props.api.executeHQL(hql);
            const countStr = res?.count || res?.Count?.[""]?.count || res?.[0]?.count || res?.[0] || 0;
            const count = typeof countStr === "number" ? countStr : parseInt(countStr as string, 10) || 0;
            edges += count;
            edgeDist.push({ type: typeName, count, queries: getAssociatedQueries(typeName) });
          } catch (e) {}
        }

        for (const v of schema.vectors || []) {
          const typeName = v.name || "Unknown";
          if (typeName === "Unknown") continue;
          try {
            const hql = `QUERY CountV${typeName}() =>\n  count <- V<${typeName}>::COUNT\n  RETURN count`;
            const res = await props.api.executeHQL(hql);
            const countStr = res?.count || res?.Count?.[""]?.count || res?.[0]?.count || res?.[0] || 0;
            const count = typeof countStr === "number" ? countStr : parseInt(countStr as string, 10) || 0;
            vectors += count;
            vectorDist.push({ type: typeName, count, queries: getAssociatedQueries(typeName) });
          } catch (e) {}
        }

        if (nodes === 0) {
          try {
            const res = await props.api.executeHQL(`QUERY CountAllN() =>\n count <- N::COUNT\n RETURN count`);
            const c = res?.count || res?.[0] || 0;
            nodes += typeof c === "number" ? c : parseInt(String(c), 10) || 0;
          } catch (e) {}
        }
        if (edges === 0) {
          try {
            const res = await props.api.executeHQL(`QUERY CountAllE() =>\n count <- E::COUNT\n RETURN count`);
            const c = res?.count || res?.[0] || 0;
            edges += typeof c === "number" ? c : parseInt(String(c), 10) || 0;
          } catch (e) {}
        }

        // Fetch Local Storage Stats if path is available
        if (props.dbPath) {
          try {
            const stats = await props.api.getLocalDbStats(props.dbPath);
            setStorageStats(stats);
          } catch (e) {
            console.warn("Failed to fetch local storage stats", e);
          }
        }
      } catch (e) {
        console.warn("Failed to fetch schema for distribution", e);
      }

      setTotalNodes(nodes);
      setTotalEdges(edges);
      setTotalVectors(vectors);
      setNodeTypes(nodeDist.sort((a, b) => b.count - a.count));
      setEdgeTypes(edgeDist.sort((a, b) => b.count - a.count));
      setVectorTypes(vectorDist.sort((a, b) => b.count - a.count));
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (props.isConnected) loadStats();
  });

  const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  return (
    <div class="flex-1 flex flex-col overflow-y-scroll scrollbar-thin bg-native-content">
      {/* Page Header with ToolbarLayout */}
      <ToolbarLayout class="justify-between items-center">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-[8px] bg-accent/10 border border-accent/20">
            <Globe size={10} class="text-accent" />
            <span class="text-[10px] font-mono font-bold text-accent uppercase tracking-wider">{props.api.baseUrl}</span>
          </div>
          <Show when={lastUpdated()}>
            <div class="flex items-center gap-1.5 text-[11px] text-native-quaternary">
              <Clock size={10} class="opacity-60" />
              <span>Updated {formatTime(lastUpdated()!)}</span>
            </div>
          </Show>
          <Show when={loading() && !lastUpdated()}>
            <span class="text-[11px] text-native-tertiary animate-pulse">Loading statistics…</span>
          </Show>
        </div>
        <Button variant="toolbar" onClick={loadStats} disabled={loading() || !props.isConnected} class="transition-all">
          <RefreshCw size={12} strokeWidth={2.5} class={`${loading() ? "animate-spin" : ""} text-accent`} />
          <span>Refresh</span>
        </Button>
      </ToolbarLayout>

      <div class="flex-1 flex flex-col px-5 py-5 gap-6 w-full">
        {/* Error */}
        <Show when={error()}>
          <div class="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-lg text-xs flex items-center gap-2.5">
            <div class="w-6 h-6 rounded-full bg-error/10 flex items-center justify-center flex-shrink-0">
              <span class="text-[11px] font-bold">!</span>
            </div>
            <span class="font-medium">{error()}</span>
          </div>
        </Show>

        {/* KPI row */}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stagger index={0}>
            <StatCard label="Total Nodes" value={totalNodes()} sublabel="Vertex records" loading={loading()} />
          </Stagger>
          <Stagger index={1}>
            <StatCard label="Total Edges" value={totalEdges()} sublabel="Relationship records" loading={loading()} />
          </Stagger>
          <Stagger index={2}>
            <StatCard label="Total Vectors" value={totalVectors()} sublabel="Embedding records" loading={loading()} />
          </Stagger>
          <Stagger index={3}>
            <StatCard label="Total Queries" value={totalQueries()} sublabel="HQL endpoints" loading={loading()} />
          </Stagger>
        </div>

        {/* Storage Stats row */}
        <Show when={storageStats()}>
          <StorageStats stats={storageStats()!} loading={loading()} />
        </Show>

        {/* Distribution row */}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <Stagger index={0} step={80}>
            <DistCard title="Node Types" subtitle="Count by label" totalCount={totalNodes()} items={nodeTypes()} loading={loading()} onSelectQuery={props.onSelectQuery} />
          </Stagger>
          <Stagger index={1} step={80}>
            <DistCard title="Edge Types" subtitle="Count by label" totalCount={totalEdges()} items={edgeTypes()} loading={loading()} onSelectQuery={props.onSelectQuery} />
          </Stagger>
          <Stagger index={2} step={80}>
            <DistCard title="Vector Types" subtitle="Count by label" totalCount={totalVectors()} items={vectorTypes()} loading={loading()} onSelectQuery={props.onSelectQuery} />
          </Stagger>
        </div>
      </div>
    </div>
  );
};
