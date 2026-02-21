import { createSignal, createEffect, Show, For, createMemo } from "solid-js";
import { HelixApi } from "../lib/api";
import { Button } from "./ui/button";
import { RefreshCw, ChevronDown, ChevronUp, Terminal, Clock } from "lucide-solid";
import { SchemaQuery } from "../lib/types";

// ─── Utilities ───
const getHSLColor = (index: number) => `hsl(${(index * 137.5) % 360}, 65%, 55%)`;

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

// ─── Donut Chart ───
const DonutChart = (p: { items: { type: string; count: number; queries: SchemaQuery[]; color?: string }[]; total: number }) => {
  const size = 100;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  const validItems = createMemo(() => p.items.filter((i) => i.count > 0));
  const totalCount = createMemo(() => p.total || validItems().reduce((sum: number, i) => sum + i.count, 0) || 1);

  const slices = createMemo(() => {
    let cumulativePercent = 0;
    const gap = 0.01;
    const itemCount = validItems().length;

    return validItems().map((item, idx) => {
      const percent = item.count / totalCount();
      const offset = cumulativePercent * circumference;
      cumulativePercent += percent;
      const drawPercent = itemCount > 1 ? Math.max(0.01, percent - gap) : percent;

      return {
        ...item,
        dashArray: `${drawPercent * circumference} ${circumference}`,
        dashOffset: -offset,
        color: item.color || getHSLColor(idx),
      };
    });
  });

  return (
    <div class="relative flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} class="transform -rotate-90">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" stroke-width={strokeWidth} class="text-native/5" />
        <For each={slices()}>
          {(slice) => (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={slice.color}
              stroke-width={strokeWidth}
              stroke-dasharray={slice.dashArray}
              stroke-dashoffset={slice.dashOffset}
              stroke-linecap="round"
              class="transition-all duration-1000 ease-out z-10"
              style={{ filter: "drop-shadow(0 0 2px rgba(0,0,0,0.1))" }}
            />
          )}
        </For>
      </svg>
      <div class="absolute flex flex-col items-center justify-center">
        <span class="text-[14px] font-bold font-mono text-native-primary tabular-nums">{p.total > 9999 ? (p.total / 1000).toFixed(1) + "k" : p.total}</span>
      </div>
    </div>
  );
};

// ─── Distribution Card ───
const DistCard = (p: { title: string; subtitle: string; totalCount: number; items: { type: string; count: number; queries: SchemaQuery[] }[]; loading?: boolean }) => {
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
                              <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-native-content border border-native-subtle hover:bg-hover hover:border-native transition-all group/query">
                                <Terminal size={10} class="text-native-tertiary group-hover/query:text-native-primary transition-colors" />
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

interface DashboardProps {
  api: HelixApi;
  isConnected: boolean;
  onConnect: () => void;
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

  // ─── Distribution row ───
  const DistRow = () => (
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      <DistCard title="Node Types" subtitle="Count by label" totalCount={totalNodes()} items={nodeTypes()} loading={loading()} />
      <DistCard title="Edge Types" subtitle="Count by label" totalCount={totalEdges()} items={edgeTypes()} loading={loading()} />
      <DistCard title="Vector Types" subtitle="Count by label" totalCount={totalVectors()} items={vectorTypes()} loading={loading()} />
    </div>
  );

  return (
    <div class="flex-1 flex flex-col overflow-y-scroll scrollbar-thin bg-native-content">
      <div class="flex-1 flex flex-col p-4 gap-6 max-w-[1400px] mx-auto w-full">
        {/* Page Header */}
        <div class="flex items-center justify-between">
          <div class="flex flex-col gap-1">
            <h1 class="text-[14px] font-bold text-native-primary tracking-tight">Instance Overview</h1>
            <Show
              when={lastUpdated()}
              fallback={
                <Show when={loading()}>
                  <span class="text-[11px] text-native-tertiary">Loading statistics…</span>
                </Show>
              }
            >
              <div class="flex items-center gap-1.5 text-[11px] text-native-quaternary">
                <Clock size={10} class="opacity-60" />
                <span>Updated {formatTime(lastUpdated()!)}</span>
              </div>
            </Show>
          </div>
          <Button variant="toolbar" onClick={loadStats} disabled={loading() || !props.isConnected} class="transition-all">
            <RefreshCw size={12} strokeWidth={2.5} class={`${loading() ? "animate-spin" : ""} text-accent`} />
            <span>Refresh</span>
          </Button>
        </div>

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
          <StatCard label="Total Nodes" value={totalNodes()} sublabel="Vertex records" loading={loading()} />
          <StatCard label="Total Edges" value={totalEdges()} sublabel="Relationship records" loading={loading()} />
          <StatCard label="Total Vectors" value={totalVectors()} sublabel="Embedding records" loading={loading()} />
          <StatCard label="Total Queries" value={totalQueries()} sublabel="HQL endpoints" loading={loading()} />
        </div>

        <DistRow />
      </div>
    </div>
  );
};
