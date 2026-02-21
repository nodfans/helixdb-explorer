import { createSignal, createEffect, Show } from "solid-js";
import { HelixApi } from "../lib/api";
import { RefreshCw, Share2, CircleDot, Zap, Link2, ChevronDown, ChevronUp, Terminal, PanelTopDashed } from "lucide-solid";
import { Button } from "./ui/button";
import { ToolbarLayout } from "./ui/toolbar-layout";
import { SchemaQuery } from "../lib/types";

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

        // Helper to get queries associated with a type
        const getAssociatedQueries = (typeName: string) => {
          if (!schema.queries) return [];
          const lowerType = typeName.toLowerCase();
          const singularType = lowerType.endsWith("s") ? lowerType.slice(0, -1) : lowerType;

          return schema.queries.filter((q) => {
            const name = q.name.toLowerCase();
            const returns = (q.returns || []).map((r) => r.toLowerCase());

            // Heuristic match: type name in query name OR return label
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
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (props.isConnected) loadStats();
  });

  const StatCard = (p: { label: string; value: number; colorClass: string; icon: any; sublabel: string }) => (
    <div class="relative flex flex-col gap-3 p-5 rounded-xl bg-native-elevated/60 backdrop-blur-md border border-native/10 shadow-sm overflow-hidden group hover:border-native/20 transition-all">
      <div class="flex items-center justify-between">
        <div class={`flex items-center justify-center w-8 h-8 rounded-lg ${p.colorClass.replace("text-", "bg-").replace("-500", "-500/10")}`}>
          <p.icon size={16} class={`${p.colorClass}`} />
        </div>
        <span class="text-[11px] font-medium tracking-wide text-native-tertiary uppercase">{p.label}</span>
      </div>

      <div class="flex flex-col gap-1 mt-1">
        <div class="flex items-baseline gap-2">
          <span class="text-3xl font-bold font-mono tracking-tight text-native-primary leading-none">{loading() ? "—" : p.value.toLocaleString()}</span>
        </div>
        <span class="text-[11px] text-native-tertiary opacity-70">{p.sublabel}</span>
      </div>
    </div>
  );

  const DistCard = (p: { title: string; subtitle: string; icon: any; accentClass: string; bgClass: string; items: { type: string; count: number; queries: SchemaQuery[] }[] }) => {
    const [expandedType, setExpandedType] = createSignal<string | null>(null);

    return (
      <div class="flex flex-col gap-4 p-5 rounded-xl bg-native-elevated/60 backdrop-blur-md border border-native/10 shadow-sm min-h-[260px] max-h-[500px]">
        {/* header */}
        <div class="flex items-center gap-2.5 pb-2 border-b border-native/10">
          <p.icon size={14} class={`flex-shrink-0 ${p.accentClass}`} />
          <div class="flex-1">
            <div class="text-[13px] font-semibold text-native-primary">{p.title}</div>
            <div class="text-[11px] text-native-tertiary">{p.subtitle}</div>
          </div>
        </div>

        {/* rows */}
        <div class="flex flex-col gap-3 overflow-y-auto flex-1 pr-2 scrollbar-thin">
          {loading() ? (
            <span class="text-xs text-native-tertiary pt-2">Loading...</span>
          ) : p.items.length === 0 ? (
            <span class="text-xs text-native-tertiary pt-2">No data</span>
          ) : (
            p.items.map((item) => {
              const max = p.items.reduce((m, x) => Math.max(m, x.count), 0);
              const pct = Math.max(2, (item.count / (max || 1)) * 100);
              const isExpanded = () => expandedType() === item.type;

              return (
                <div class="flex flex-col gap-2 group">
                  <div class="flex flex-col gap-1.5 cursor-pointer" onClick={() => setExpandedType(isExpanded() ? null : item.type)}>
                    <div class="flex justify-between items-center">
                      <div class="flex items-center gap-2">
                        <span class={`text-xs font-mono transition-colors ${isExpanded() ? "text-native-primary font-bold" : "text-native-secondary group-hover:text-native-primary"}`}>
                          {item.type}
                        </span>
                        <Show when={item.queries.length > 0}>
                          <div class="flex items-center gap-1 text-[10px] text-native-tertiary opacity-60">
                            {isExpanded() ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                            <span>{item.queries.length}</span>
                          </div>
                        </Show>
                      </div>
                      <span class="text-xs font-semibold text-native-primary font-mono">{item.count.toLocaleString()}</span>
                    </div>
                    {/* track */}
                    <div class="h-[3px] bg-native/5 rounded-sm overflow-hidden">
                      <div class={`h-full rounded-sm opacity-75 transition-all duration-700 ease-out ${p.bgClass}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  {/* expanded queries */}
                  <Show when={isExpanded() && item.queries.length > 0}>
                    <div class="flex flex-col gap-1.5 pl-2 border-l-2 border-native/10 my-1 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div class="text-[10px] uppercase font-bold text-native-quaternary tracking-wider mb-1">Associated Queries</div>
                      <div class="flex flex-wrap gap-1.5">
                        {item.queries.map((q) => (
                          <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-native/5 border border-native/10 hover:bg-native/15 hover:border-native/20 transition-all group/query">
                            <Terminal size={10} class="text-native-tertiary group-hover/query:text-native-primary transition-colors" />
                            <span class="text-[10px] font-mono text-native-secondary group-hover/query:text-native-primary transition-colors">{q.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Show>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div class="flex flex-col h-full w-full bg-graph text-native-primary overflow-hidden">
      {/* Header */}
      <ToolbarLayout class="justify-between">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2 px-2 py-1 rounded-md bg-rose-500/10 border border-rose-500/10">
            <PanelTopDashed size={14} class="text-rose-500" strokeWidth={2.5} />
            <span class="text-[12px] font-bold text-rose-500 uppercase tracking-wider">Dashboard</span>
          </div>

          <div class="w-px h-4 bg-native/10" />

          <div class="flex items-center gap-1.5 text-[11px] text-native-tertiary font-medium">
            <Link2 size={12} class="opacity-60" />
            <span>{props.api?.baseUrl || "Not Connected"}</span>
          </div>
        </div>
        <Button variant="toolbar" onClick={loadStats} disabled={loading()} class="flex items-center gap-1.5 transition-all">
          <RefreshCw size={12} strokeWidth={2.5} class={`${loading() ? "animate-spin" : ""} text-accent`} />
          <span>Refresh</span>
        </Button>
      </ToolbarLayout>

      {/* Body */}
      <div class="flex-1 overflow-y-auto p-7 flex flex-col gap-5 z-0">
        <Show when={error()}>
          <div class="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-xs flex items-center gap-2">
            <RefreshCw size={14} />
            {error()}
          </div>
        </Show>

        {/* KPI row */}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Nodes" value={totalNodes()} colorClass="text-emerald-500" icon={CircleDot} sublabel="Vertex records in graph" />
          <StatCard label="Total Edges" value={totalEdges()} colorClass="text-blue-500" icon={Share2} sublabel="Relationship records in graph" />
          <StatCard label="Total Vectors" value={totalVectors()} colorClass="text-amber-500" icon={Zap} sublabel="Embedding records stored" />
          <StatCard label="Total Queries" value={totalQueries()} colorClass="text-purple-500" icon={Terminal} sublabel="Available HQL endpoints" />
        </div>

        {/* Distribution row */}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
          <DistCard title="Node Types" subtitle="Count by label" icon={CircleDot} accentClass="text-emerald-500" bgClass="bg-emerald-500" items={nodeTypes()} />
          <DistCard title="Edge Types" subtitle="Count by label" icon={Share2} accentClass="text-blue-500" bgClass="bg-blue-500" items={edgeTypes()} />
          <DistCard title="Vector Types" subtitle="Count by label" icon={Zap} accentClass="text-amber-500" bgClass="bg-amber-500" items={vectorTypes()} />
        </div>
      </div>
    </div>
  );
};
