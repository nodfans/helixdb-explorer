import { createSignal, createEffect, Show, For, createMemo, onCleanup } from "solid-js";
import { HelixApi } from "../lib/api";
import { Button } from "./ui/button";
import { RefreshCw, ChevronDown, ChevronUp, Terminal, Clock, Globe, Database, HardDrive, Activity, Search, Sparkles, Ghost, Radio } from "lucide-solid";
import { SchemaQuery, LocalStorageStats } from "../lib/types";
import { ToolbarLayout } from "./ui/toolbar-layout";
import { EmptyState } from "./ui/empty-state";
import * as echarts from "echarts";

// ─── Color Palette ───
const MODERN_PALETTE = ["#6366f1", "#14b8a6", "#f59e0b", "#ec4899", "#8b5cf6", "#3b82f6", "#10b981", "#f43f5e", "#f97316", "#06b6d4", "#84cc16", "#eab308", "#d946ef", "#a855f7", "#0ea5e9", "#ef4444"];

const getHSLColor = (index: number) => {
  if (index < MODERN_PALETTE.length) return MODERN_PALETTE[index];
  const hue = (index * 137.508) % 360;
  return `hsl(${hue}, 65%, 55%)`;
};

const parseCountResult = (res: any): number => {
  const raw = res?.count || res?.Count?.[""]?.count || res?.[0]?.count || res?.[0] || 0;
  return typeof raw === "number" ? raw : parseInt(String(raw), 10) || 0;
};

const buildCountHql = (prefix: string, typeName: string) => `QUERY Count${prefix}${typeName}() =>\n  count <- ${prefix}<${typeName}>::COUNT\n  RETURN count`;

// ─── Stagger Animation Wrapper ───
const Stagger = (p: { index: number; step?: number; class?: string; children: any }) => (
  <div class={`stagger-in ${p.class || ""}`} style={{ "animation-delay": `${p.index * (p.step ?? 60)}ms` }}>
    {p.children}
  </div>
);

// ─── KPI Strip ───
const KpiStrip = (p: { nodes: number; edges: number; vectors: number; queries: number; loading?: boolean }) => {
  const items = [
    { label: "Nodes", value: () => p.nodes, sub: "vertices", color: "#6366f1" },
    { label: "Edges", value: () => p.edges, sub: "relationships", color: "#14b8a6" },
    { label: "Vectors", value: () => p.vectors, sub: "embeddings", color: "#f59e0b" },
    { label: "Queries", value: () => p.queries, sub: "HQL endpoints", color: "#ec4899" },
  ];

  return (
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-px p-px bg-native-subtle rounded-xl overflow-hidden shadow-sm">
      <For each={items}>
        {(item, i) => (
          <Stagger index={i()}>
            <div class="flex flex-col gap-2 px-6 py-5 bg-native-elevated group hover:bg-native-content transition-colors duration-150">
              <div class="flex items-center gap-2">
                <div class="w-1.5 h-1.5 rounded-full" style={{ "background-color": item.color }} />
                <span class="text-[10px] font-bold tracking-tight text-native-tertiary">{item.label}</span>
              </div>
              <Show when={!p.loading} fallback={<div class="animate-pulse h-8 w-20 rounded bg-native/10" />}>
                <span class="text-[28px] font-semibold tracking-tight text-native-primary leading-none tabular-nums">
                  {item.value() > 9999 ? (item.value() / 1000).toFixed(1) + "k" : item.value().toLocaleString()}
                </span>
              </Show>
              <span class="text-[10px] text-native-tertiary">{item.sub}</span>
            </div>
          </Stagger>
        )}
      </For>
    </div>
  );
};

// ─── Donut Chart (ECharts) ───
const DonutChart = (p: { items: { type: string; count: number; queries: SchemaQuery[]; color?: string }[]; total: number }) => {
  let chartRef!: HTMLDivElement;

  createEffect(() => {
    if (!chartRef || p.items.length === 0) return;
    const chart = echarts.init(chartRef);
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches || document.documentElement.classList.contains("dark");

    chart.setOption({
      tooltip: {
        trigger: "item",
        confine: true,
        formatter:
          "<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif;\"><b>{b}</b>: {c} <span style=\"opacity:0.6;font-size:11px;\">({d}%)</span></div>",
        backgroundColor: isDark ? "rgba(23,23,23,0.9)" : "rgba(255,255,255,0.95)",
        borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
        borderWidth: 1,
        textStyle: { color: isDark ? "#f3f4f6" : "#1f2937", fontSize: 12 },
        padding: [8, 12],
        borderRadius: 6,
        extraCssText: "box-shadow:0 4px 6px -1px rgba(0,0,0,0.3);backdrop-filter:blur(4px);",
      },
      series: [
        {
          type: "pie",
          radius: ["78%", "94%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 2, borderWidth: 0 },
          label: { show: false },
          emphasis: { scale: false, itemStyle: { shadowBlur: 0, shadowColor: "transparent" } },
          data: p.items
            .filter((i) => i.count > 0)
            .map((item, idx) => ({
              value: item.count,
              name: item.type,
              itemStyle: { color: item.color || getHSLColor(idx) },
            })),
        },
      ],
    });

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(chartRef);
    onCleanup(() => {
      ro.disconnect();
      chart.dispose();
    });
  });

  return (
    <div class="relative flex items-center justify-center flex-shrink-0">
      <div ref={chartRef} style={{ width: "88px", height: "88px" }} />
      <div class="absolute flex flex-col items-center justify-center pointer-events-none">
        <span class="text-[13px] font-bold text-native-primary tabular-nums">{p.total > 9999 ? (p.total / 1000).toFixed(1) + "k" : p.total}</span>
      </div>
    </div>
  );
};

// ─── Distribution Card ───
type TypeDistItem = { type: string; count: number; queries: SchemaQuery[] };

const DistCard = (p: {
  title: string;
  subtitle: string;
  totalCount: number;
  items: TypeDistItem[];
  loading?: boolean;
  onSelectQuery?: (q: SchemaQuery) => void;
  emptyTitle?: string;
  emptySubtitle?: string;
}) => {
  const [expandedType, setExpandedType] = createSignal<string | null>(null);

  const processedItems = createMemo(() => {
    const sorted = [...p.items].filter((i) => i.count > 0).sort((a, b) => b.count - a.count);
    if (sorted.length <= 16) return sorted.map((item, idx) => ({ ...item, color: getHSLColor(idx) }));
    const top15 = sorted.slice(0, 15).map((item, idx) => ({ ...item, color: getHSLColor(idx) }));
    const others = sorted.slice(15);
    return [
      ...top15,
      {
        type: `Other (${others.length})`,
        count: others.reduce((s, i) => s + i.count, 0),
        queries: [] as SchemaQuery[],
        color: "#64748b",
      },
    ];
  });

  const isEmpty = () => !p.loading && p.items.every((i) => i.count === 0);

  return (
    <div class="flex flex-col gap-4 p-5 rounded-xl bg-native-elevated border border-native-subtle shadow-sm">
      {/* Header */}
      <div class="flex flex-col pb-3 border-b border-native-subtle">
        <div class="text-[13px] font-semibold text-native-primary">{p.title}</div>
        <div class="text-[11px] text-native-tertiary">{p.subtitle}</div>
      </div>

      {/* Empty state */}
      <Show when={isEmpty()}>
        <div class="flex flex-col items-center justify-center gap-2 py-6 text-center select-none">
          <div class="w-9 h-9 rounded-full bg-native/10 flex items-center justify-center">
            <Ghost size={15} class="text-native-quaternary opacity-40" />
          </div>
          <span class="text-[12px] text-native-tertiary opacity-50">{p.emptyTitle || "No data yet"}</span>
        </div>
      </Show>

      {/* Content */}
      <Show when={!isEmpty()}>
        <div class="flex flex-col gap-5">
          {/* Donut + total */}
          <div class="flex items-center gap-5">
            <Show when={!p.loading} fallback={<div class="w-[88px] h-[88px] rounded-full animate-pulse bg-native/10 flex-shrink-0" />}>
              <DonutChart items={processedItems()} total={p.totalCount} />
            </Show>
            <div class="flex flex-col gap-1">
              <Show when={!p.loading} fallback={<div class="h-8 w-24 animate-pulse bg-native/10 rounded" />}>
                <div class="text-[22px] font-bold text-native-primary tracking-tight leading-none">{p.totalCount.toLocaleString()}</div>
                <div class="text-[10px] items-center font-bold text-native-tertiary tracking-tight mt-1">Total Records</div>
              </Show>
            </div>
          </div>

          {/* Type list */}
          <div class="max-h-[300px] overflow-y-auto pr-1">
            <Show
              when={!p.loading}
              fallback={
                <div class="flex flex-col gap-3 animate-pulse">
                  <div class="h-5 w-full bg-native/10 rounded" />
                  <div class="h-5 w-4/5 bg-native/10 rounded" />
                </div>
              }
            >
              <div class="flex flex-col gap-3">
                <For each={processedItems()}>
                  {(item) => {
                    const pct = Math.round((item.count / (p.totalCount || 1)) * 100);
                    const isExpanded = () => expandedType() === item.type;
                    const canExpand = item.queries.length > 0;

                    return (
                      <div class="flex flex-col gap-1.5 group">
                        <div class={canExpand ? "cursor-pointer" : ""} onClick={() => canExpand && setExpandedType(isExpanded() ? null : item.type)}>
                          <div class="flex justify-between items-center mb-1">
                            <div class="flex items-center gap-2">
                              <div class="w-1.5 h-3 rounded-full flex-shrink-0" style={{ "background-color": item.color }} />
                              <span
                                class={`text-[12px] font-medium transition-colors truncate max-w-[120px] ${isExpanded() ? "text-native-primary font-semibold" : "text-native-secondary group-hover:text-native-primary"}`}
                              >
                                {item.type}
                              </span>
                              <Show when={item.queries.length > 0}>
                                <span class="text-[10px] text-native-quaternary opacity-40">{isExpanded() ? <ChevronUp size={10} /> : <ChevronDown size={10} />}</span>
                              </Show>
                            </div>
                            <div class="flex items-center gap-2 flex-shrink-0">
                              <span class="text-[10px] text-native-tertiary">{pct}%</span>
                              <span class="text-[12px] font-bold text-native-primary tabular-nums">{item.count.toLocaleString()}</span>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div class="w-full h-[2px] bg-native/10 rounded-full overflow-hidden">
                            <div class="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, "background-color": item.color }} />
                          </div>
                        </div>

                        <Show when={isExpanded() && item.queries.length > 0}>
                          <div class="flex flex-col gap-1.5 pl-3.5 border-l-2 border-native-subtle mt-1 mb-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                            <div class="text-[9px] font-bold text-native-tertiary tracking-tight mb-0.5">Associated Queries</div>
                            <div class="flex flex-wrap gap-1.5">
                              {item.queries.map((q) => (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    p.onSelectQuery?.(q);
                                  }}
                                  class="flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] bg-native-content border border-native-subtle hover:bg-hover hover:border-accent/40 active:scale-95 transition-all cursor-pointer group/q"
                                >
                                  <Terminal size={10} class="text-native-tertiary group-hover/q:text-accent transition-colors" />
                                  <span class="text-[10px] font-mono text-native-secondary group-hover/q:text-native-primary transition-colors">{q.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
};

// ─── Storage Panel ───
const StoragePanel = (p: { stats: LocalStorageStats; loading?: boolean }) => {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const usagePct = () => Math.min(100, (p.stats.disk_size_bytes / p.stats.env_info.map_size) * 100);
  const dbEntries = () => Object.entries(p.stats.core_dbs).sort((a, b) => b[1].entries - a[1].entries);

  return (
    <div class="rounded-xl bg-native-elevated border border-native-subtle shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* ── Top section: 3 metric columns ── */}
      <div class="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-native-subtle">
        {/* Physical Storage */}
        <div class="flex flex-col gap-3 p-5">
          <div class="flex items-center gap-2 text-native-tertiary">
            <HardDrive size={13} class="text-accent" />
            <span class="text-[10px] font-bold tracking-tight">Physical Storage</span>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class="text-[22px] font-bold text-native-primary tracking-tight leading-none">{formatBytes(p.stats.disk_size_bytes)}</span>
            <span class="text-[10px] text-native-tertiary">data.mdb on disk</span>
          </div>
          <div class="flex flex-col gap-1.5 mt-1">
            <div class="flex justify-between text-[10px]">
              <span class="text-native-tertiary">Env max</span>
              <span class="text-native-tertiary">{formatBytes(p.stats.env_info.map_size)}</span>
            </div>
            <div class="w-full bg-native/10 h-1 rounded-full overflow-hidden">
              <div class="bg-accent h-full transition-all duration-700" style={{ width: `${usagePct()}%` }} />
            </div>
            <span class="text-[10px] text-native-tertiary">{usagePct().toFixed(1)}% used</span>
          </div>
        </div>

        {/* Engine Health */}
        <div class="flex flex-col gap-3 p-5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-native-tertiary">
              <Activity size={13} class="text-emerald-500" />
              <span class="text-[10px] font-bold tracking-tight">Engine Health</span>
            </div>
            <div class="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500">
              <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Healthy
            </div>
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-3 mt-1">
            <div>
              <div class="text-[9px] text-native-tertiary font-bold tracking-tight mb-0.5">Last Txn ID</div>
              <div class="text-[15px] font-bold text-native-primary">{p.stats.env_info.last_txnid.toLocaleString()}</div>
            </div>
            <div>
              <div class="text-[9px] text-native-tertiary font-bold tracking-tight mb-0.5">Active Readers</div>
              <div class="text-[15px] font-bold text-native-primary">
                {p.stats.env_info.num_readers}
                <span class="text-native-tertiary text-[11px] font-normal"> / {p.stats.env_info.max_readers}</span>
              </div>
            </div>
            <div>
              <div class="text-[9px] text-native-tertiary font-bold tracking-tight mb-0.5">Last Page</div>
              <div class="text-[15px] font-bold text-native-primary">{p.stats.env_info.last_pgno.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Core Subscriptions */}
        <div class="flex flex-col gap-3 p-5">
          <div class="flex items-center gap-2 text-native-tertiary">
            <Database size={13} class="text-indigo-400" />
            <span class="text-[10px] font-bold tracking-tight">Core Subscriptions</span>
          </div>
          <div class="flex flex-col gap-2 overflow-y-auto max-h-[140px] pr-1">
            <For each={dbEntries()}>
              {([name, stat]) => (
                <div class="flex justify-between items-center group">
                  <span class="text-[11px] text-native-tertiary font-medium group-hover:text-native-secondary transition-colors truncate mr-3">{name}</span>
                  <span class="text-[11px] font-bold text-native-primary flex-shrink-0">{stat.entries.toLocaleString()}</span>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>

      {/* ── Bottom section: BM25 + HNSW (only if present) ── */}
      <Show when={p.stats.bm25_stats || p.stats.hnsw_stats}>
        <div class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-native-subtle border-t border-native-subtle">
          {/* BM25 */}
          <Show when={p.stats.bm25_stats}>
            <div class="flex flex-col gap-3 p-5">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Search size={13} class="text-pink-400" />
                  <span class="text-[10px] font-bold tracking-tight text-native-tertiary">BM25 Search Index</span>
                </div>
                <span class="text-[9px] text-native-tertiary tracking-tight">Full-Text</span>
              </div>
              <div class="flex flex-col gap-2">
                <For each={Object.entries(p.stats.bm25_stats!)}>
                  {([field, stat]) => (
                    <div class="flex flex-col gap-1 pb-2 border-b border-native-subtle last:border-0 last:pb-0">
                      <div class="flex justify-between items-center">
                        <span class="text-[11px] text-native-secondary truncate mr-2">{field.replace("bm25_metadata_", "")}</span>
                        <span class="text-[11px] font-bold text-native-primary flex-shrink-0">{stat.total_docs.toLocaleString()} docs</span>
                      </div>
                      <div class="flex items-center gap-3 text-[10px] text-native-tertiary">
                        <span>avgdl: {Math.round(stat.avgdl)}</span>
                        <span>k1: {stat.k1.toFixed(1)}</span>
                        <span>b: {stat.b.toFixed(1)}</span>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* HNSW */}
          <Show when={p.stats.hnsw_stats}>
            <div class="flex flex-col gap-3 p-5">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Sparkles size={13} class="text-amber-400" />
                  <span class="text-[10px] font-bold tracking-tight text-native-tertiary">HNSW Vector Index</span>
                </div>
                <span class="text-[9px] text-native-tertiary tracking-tight">Embeddings</span>
              </div>
              <div class="grid grid-cols-3 gap-4 mt-1">
                <div>
                  <div class="text-[9px] text-native-tertiary font-bold tracking-tight mb-0.5">Vectors</div>
                  <div class="text-[18px] font-bold text-native-primary">{p.stats.hnsw_stats!.vector_count.toLocaleString()}</div>
                </div>
                <div>
                  <div class="text-[9px] text-native-tertiary font-bold tracking-tight mb-0.5">Graph Nodes</div>
                  <div class="text-[18px] font-bold text-native-primary">{p.stats.hnsw_stats!.vector_data_count.toLocaleString()}</div>
                </div>
                <div>
                  <div class="text-[9px] text-native-tertiary font-bold tracking-tight mb-0.5">Graph Edges</div>
                  <div class="text-[18px] font-bold text-native-primary">{p.stats.hnsw_stats!.out_nodes_count.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

// ─── Fetch helpers ───
const fetchTypeCounts = async (
  api: HelixApi,
  types: { name: string }[],
  prefix: string,
  getAssociatedQueries: (typeName: string) => SchemaQuery[]
): Promise<{ total: number; dist: TypeDistItem[] }> => {
  const results = await Promise.allSettled(
    types
      .filter((t) => t.name && t.name !== "Unknown")
      .map(async (t) => {
        const res = await api.executeHQL(buildCountHql(prefix, t.name));
        const count = parseCountResult(res);
        return { type: t.name, count, queries: getAssociatedQueries(t.name) };
      })
  );

  let total = 0;
  const dist: TypeDistItem[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      total += r.value.count;
      dist.push(r.value);
    } else {
      console.warn(`[Dashboard] Failed to count ${prefix} type:`, r.reason);
    }
  }
  return { total, dist: dist.sort((a, b) => b.count - a.count) };
};

// ─── Dashboard ───
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
  const [nodeTypes, setNodeTypes] = createSignal<TypeDistItem[]>([]);
  const [edgeTypes, setEdgeTypes] = createSignal<TypeDistItem[]>([]);
  const [vectorTypes, setVectorTypes] = createSignal<TypeDistItem[]>([]);
  const [totalQueries, setTotalQueries] = createSignal(0);
  const [lastUpdated, setLastUpdated] = createSignal<Date | null>(null);
  const [storageStats, setStorageStats] = createSignal<LocalStorageStats | null>(null);

  let inFlightRequest: string | null = null;

  const loadStats = async () => {
    if (loading()) return;
    if (!props.isConnected) {
      props.onConnect();
      return;
    }

    const currentUrl = props.api.baseUrl;
    if (inFlightRequest === currentUrl) return;
    inFlightRequest = currentUrl;

    setLoading(true);
    setError(null);
    try {
      const schema = await props.api.fetchSchema();
      setTotalQueries(schema.queries?.length || 0);

      const getAssociatedQueries = (typeName: string): SchemaQuery[] => {
        if (!schema.queries) return [];
        const lower = typeName.toLowerCase();
        const singular = lower.endsWith("s") ? lower.slice(0, -1) : lower;
        return schema.queries.filter((q) => {
          const name = q.name.toLowerCase();
          const returns = (q.returns || []).map((r) => r.toLowerCase());
          return name.includes(lower) || name.includes(singular) || returns.some((r) => r.includes(lower) || r.includes(singular));
        });
      };

      const [nodeResult, edgeResult, vectorResult, storageResult] = await Promise.allSettled([
        fetchTypeCounts(props.api, schema.nodes || [], "N", getAssociatedQueries),
        fetchTypeCounts(props.api, schema.edges || [], "E", getAssociatedQueries),
        fetchTypeCounts(props.api, schema.vectors || [], "V", getAssociatedQueries),
        props.dbPath ? props.api.getLocalDbStats(props.dbPath) : Promise.resolve(null),
      ]);

      if (nodeResult.status === "fulfilled") {
        let { total, dist } = nodeResult.value;
        if (total === 0) {
          try {
            const res = await props.api.executeHQL(`QUERY CountAllN() =>\n count <- N::COUNT\n RETURN count`);
            total = parseCountResult(res);
          } catch (e) {
            console.warn("[Dashboard] Fallback N::COUNT failed:", e);
          }
        }
        setTotalNodes(total);
        setNodeTypes(dist);
      }

      if (edgeResult.status === "fulfilled") {
        let { total, dist } = edgeResult.value;
        if (total === 0) {
          try {
            const res = await props.api.executeHQL(`QUERY CountAllE() =>\n count <- E::COUNT\n RETURN count`);
            total = parseCountResult(res);
          } catch (e) {
            console.warn("[Dashboard] Fallback E::COUNT failed:", e);
          }
        }
        setTotalEdges(total);
        setEdgeTypes(dist);
      }

      if (vectorResult.status === "fulfilled") {
        setTotalVectors(vectorResult.value.total);
        setVectorTypes(vectorResult.value.dist);
      }

      if (storageResult.status === "fulfilled" && storageResult.value) {
        setStorageStats(storageResult.value as LocalStorageStats);
      } else if (storageResult.status === "rejected") {
        console.warn("[Dashboard] Failed to fetch storage stats:", storageResult.reason);
      }

      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
      inFlightRequest = null;
    }
  };

  createEffect(() => {
    const isConnected = props.isConnected;
    const url = props.api.baseUrl;
    if (isConnected && url) {
      loadStats();
    }
  });

  const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  return (
    <div class="flex-1 flex flex-col overflow-y-scroll bg-native-content">
      {/* Toolbar */}
      <ToolbarLayout class="justify-between items-center">
        <div class="flex items-center gap-3">
          <div
            class="flex items-center gap-1.5 px-2 py-0.5 rounded-[8px] transition-colors"
            classList={{
              "bg-accent/10 border border-accent/20": props.isConnected,
              "bg-native-content/50 border border-native-subtle": !props.isConnected,
            }}
          >
            <Globe size={10} class={props.isConnected ? "text-accent" : "text-native-quaternary"} />
            <span
              class="text-[10px] font-bold tracking-tighter truncate max-w-[200px]"
              classList={{
                "text-accent": props.isConnected,
                "text-native-quaternary": !props.isConnected,
              }}
            >
              {props.isConnected ? props.api.baseUrl : "Disconnected"}
            </span>
          </div>
          <Show when={lastUpdated()}>
            <div class="flex items-center gap-1.5 text-[11px] text-native-tertiary">
              <Clock size={10} class="opacity-60" />
              <span>Updated {formatTime(lastUpdated()!)}</span>
            </div>
          </Show>
          <Show when={loading() && !lastUpdated()}>
            <span class="text-[11px] text-native-tertiary animate-pulse">Loading statistics…</span>
          </Show>
        </div>
        <Button variant="toolbar" onClick={loadStats} disabled={loading()} class="flex items-center gap-1.5 transition-all group active:scale-95">
          <RefreshCw size={12} strokeWidth={2.5} class={`${loading() ? "animate-spin" : "group-hover:rotate-180"} transition-transform text-accent`} />
          <span class="font-medium">Refresh</span>
        </Button>
      </ToolbarLayout>

      <div class="flex-1 flex flex-col px-5 py-5 gap-5 w-full">
        <Show
          when={props.isConnected}
          fallback={
            <div class="flex-1 flex items-center justify-center min-h-[400px]">
              <EmptyState icon={Radio} title="Welcome to Helix Explorer" description="Connect to your HelixDB instance to see system-wide statistics, storage health, and data distribution.">
                <Button variant="primary" size="lg" onClick={props.onConnect}>
                  Connect Now
                </Button>
              </EmptyState>
            </div>
          }
        >
          {/* Error */}
          <Show when={error()}>
            <div class="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-lg text-xs flex items-center gap-2.5">
              <div class="w-6 h-6 rounded-full bg-error/10 flex items-center justify-center flex-shrink-0">
                <span class="text-[11px] font-bold">!</span>
              </div>
              <span class="font-medium">{error()}</span>
            </div>
          </Show>

          {/* KPI Strip */}
          <Stagger index={0}>
            <KpiStrip nodes={totalNodes()} edges={totalEdges()} vectors={totalVectors()} queries={totalQueries()} loading={loading()} />
          </Stagger>

          {/* Storage Panel */}
          <Show when={storageStats()}>
            <Stagger index={1}>
              <StoragePanel stats={storageStats()!} loading={loading()} />
            </Stagger>
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
              <DistCard
                title="Vector Types"
                subtitle="Count by label"
                totalCount={totalVectors()}
                items={vectorTypes()}
                loading={loading()}
                onSelectQuery={props.onSelectQuery}
                emptyTitle="Vector count PR is merging..."
              />
            </Stagger>
          </div>
        </Show>
      </div>
    </div>
  );
};
