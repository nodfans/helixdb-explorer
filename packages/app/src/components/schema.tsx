import { createSignal, createEffect, Show, For, batch, createResource, createMemo, Component, JSX, onMount, onCleanup } from "solid-js";
import { NodeType, EdgeType, VectorType } from "../lib/types";
import { Input } from "./ui/input";
import { HelixApi } from "../lib/api";
import { Button } from "./ui/button";
import { Database, Network, Zap, ArrowRight, RefreshCw, ChevronsUpDown, ChevronsDownUp, ChevronDown, ChevronRight } from "lucide-solid";
import { ToolbarLayout } from "./ui/toolbar-layout";
import { EmptyState } from "./ui/empty-state";

interface PropertyListProps {
  properties: Record<string, string>;
}

const formatName = (name: string) => {
  if (!name) return "";
  // If it's all uppercase, convert it to Capitalized
  if (name === name.toUpperCase()) {
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }
  return name;
};

const PropertyList = (props: PropertyListProps) => (
  <div class="mt-2.5">
    <div class="flex items-center gap-1.5 px-0.5 mb-1.5">
      <span class="text-[10px] uppercase font-bold text-native-quaternary tracking-wider">Properties</span>
    </div>
    <div class="rounded-md border border-native-subtle overflow-hidden shadow-sm">
      <For each={Object.entries(props.properties || {})}>
        {([key, type]) => (
          <div class="flex justify-between items-center px-3 py-2 bg-native-sidebar/30 border-b border-native-subtle last:border-0 hover:bg-native-sidebar/50 transition-colors">
            <span class="font-mono text-[11px] text-native-secondary font-medium">{key}</span>
            <span class="font-mono text-[10px] text-native-tertiary px-1.5 py-0.5 rounded border border-native-subtle bg-native-content/50">{type}</span>
          </div>
        )}
      </For>
    </div>
  </div>
);

interface CardProps {
  title: string;
  icon: Component<{ size?: number; class?: string }>;
  iconColorClass: string;
  iconBgClass: string;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
  extraHeader?: JSX.Element;
  children?: JSX.Element;
  hasProperties?: boolean;
}

const Card = (props: CardProps) => {
  return (
    <div
      class={`rounded-lg border overflow-hidden transition-colors ${props.expanded ? "bg-native-content border-native shadow-sm" : "bg-native-elevated border-native-subtle hover:border-native hover:shadow-sm"}`}
    >
      <button class="w-full p-3 text-left transition-colors hover:bg-hover active:bg-active" onClick={() => props.onToggle()}>
        <div class="flex items-center justify-between mb-0">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class={`flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${props.iconBgClass}`}>
              <props.icon size={14} class={props.iconColorClass} />
            </div>
            <div class="min-w-0">
              <h3 class="text-[12px] font-semibold text-native-primary truncate">{props.title}</h3>
            </div>
          </div>
          <div class="flex items-center gap-2.5 flex-shrink-0">
            <Show when={props.count !== undefined}>
              <span class="text-[10px] font-medium text-native-tertiary tabular-nums">{props.count}</span>
            </Show>
            {props.expanded ? <ChevronDown size={13} class="text-native-tertiary" /> : <ChevronRight size={13} class="text-native-tertiary" />}
          </div>
        </div>

        <Show when={props.extraHeader}>
          <div class="mt-2.5">{props.extraHeader}</div>
        </Show>
      </button>

      <Show when={props.expanded}>
        <div class="px-3 pb-3 border-t border-native-subtle">
          <Show when={props.hasProperties !== false} fallback={props.children}>
            <Show when={props.hasProperties} fallback={<div class="text-[11px] text-native-tertiary italic py-3">No properties</div>}>
              {props.children}
            </Show>
          </Show>
        </div>
      </Show>
    </div>
  );
};

interface SchemaProps {
  api: HelixApi;
  isConnected: boolean;
  onConnect: () => void;
}

const NodeCard = (props: { node: NodeType; expanded: boolean; onToggle: () => void }) => {
  const hasProperties = () => Object.keys(props.node.properties || {}).length > 0;

  return (
    <Card
      title={formatName(props.node.name)}
      icon={Database}
      iconColorClass="text-emerald-500"
      iconBgClass="bg-emerald-500/10"
      count={Object.keys(props.node.properties || {}).length}
      expanded={props.expanded}
      onToggle={props.onToggle}
      hasProperties={hasProperties()}
    >
      <PropertyList properties={props.node.properties} />
    </Card>
  );
};

const EdgeCard = (props: { edge: EdgeType; expanded: boolean; onToggle: () => void }) => {
  const hasProperties = () => Object.keys(props.edge.properties || {}).length > 0;

  return (
    <Card
      title={formatName(props.edge.name)}
      icon={Network}
      iconColorClass="text-blue-500"
      iconBgClass="bg-blue-500/10"
      count={Object.keys(props.edge.properties || {}).length}
      expanded={props.expanded}
      onToggle={props.onToggle}
      hasProperties={hasProperties()}
      extraHeader={
        <div class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md bg-native-content/30 italic">
          <span class="text-[9px] uppercase font-bold text-native-quaternary/70 not-italic">From</span>
          <span class="text-[11px] font-medium text-emerald-600 truncate max-w-[80px]">{props.edge.from_node}</span>
          <ArrowRight size={10} class="text-native-quaternary shrink-0" />
          <span class="text-[9px] uppercase font-bold text-native-quaternary/70 not-italic">To</span>
          <span class="text-[11px] font-medium text-emerald-600 truncate max-w-[80px]">{props.edge.to_node}</span>
        </div>
      }
    >
      <PropertyList properties={props.edge.properties} />
    </Card>
  );
};

const VectorCard = (props: { vector: VectorType; expanded: boolean; onToggle: () => void }) => {
  const hasProperties = () => Object.keys(props.vector.properties || {}).length > 0;

  return (
    <Card
      title={formatName(props.vector.name)}
      icon={Zap}
      iconColorClass="text-amber-500"
      iconBgClass="bg-amber-500/10"
      count={Object.keys(props.vector.properties || {}).length}
      expanded={props.expanded}
      onToggle={props.onToggle}
      hasProperties={hasProperties()}
    >
      <PropertyList properties={props.vector.properties} />
    </Card>
  );
};

export const Schema = (props: SchemaProps) => {
  const [schemaData, { refetch }] = createResource(
    () => (props.isConnected ? props.api : null),
    async (api) => {
      if (!api) return null;
      try {
        const data = await api.fetchSchema();
        return data;
      } catch (e) {
        console.error("Schema fetch failed", e);
        throw e;
      }
    }
  );

  const schema = () => schemaData() || null;
  const loading = () => schemaData.loading;
  const error = () => (schemaData.error ? schemaData.error.message || "Failed to fetch schema" : null);

  const [activeTab, setActiveTab] = createSignal<"nodes" | "relationships" | "vectors">("nodes");
  const [searchQuery, setSearchQuery] = createSignal("");
  const [expandedCards, setExpandedCards] = createSignal<Record<string, boolean>>({});

  // Responsive column count — driven by container width via ResizeObserver,
  // so it correctly handles sidebars and other layout shifts.
  let gridContainerRef: HTMLDivElement | undefined;
  const [colCount, setColCount] = createSignal(3);

  const calcCols = (width: number) => {
    if (width >= 1400) return 5;
    if (width >= 1100) return 4;
    if (width >= 768) return 3;
    if (width >= 480) return 2;
    return 1;
  };

  onMount(() => {
    if (!gridContainerRef) return;
    const ro = new ResizeObserver(([entry]) => {
      setColCount(calcCols(entry.contentRect.width));
    });
    ro.observe(gridContainerRef);
    onCleanup(() => ro.disconnect());
  });

  const distributeItems = (items: any[]) => {
    const count = colCount();
    const cols: any[][] = Array.from({ length: count }, () => []);
    items.forEach((item, i) => {
      cols[i % count].push(item);
    });
    return cols;
  };

  createEffect(() => {
    const data = schema();
    if (data) {
      // Schema updated
    }
  });

  const toggleCard = (key: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const expandAll = () => {
    if (!schema()) return;
    batch(() => {
      const newExpanded: Record<string, boolean> = {};
      schema()?.nodes.forEach((n) => (newExpanded["node-" + n.name] = true));
      schema()?.edges.forEach((e) => (newExpanded[`edge-${e.name}-${e.from_node}-${e.to_node}`] = true));
      schema()?.vectors.forEach((v) => (newExpanded["vector-" + v.name] = true));
      setExpandedCards(newExpanded);
    });
  };

  const collapseAll = () => {
    setExpandedCards({});
  };

  const filteredNodes = createMemo(() => {
    const query = searchQuery().toLowerCase();
    const nodes = schema()?.nodes || [];
    const filtered = nodes.filter((n) => (n.name || "").toLowerCase().includes(query));
    return [...filtered].reverse();
  });

  const filteredEdges = createMemo(() => {
    const query = searchQuery().toLowerCase();
    const edges = schema()?.edges || [];
    const filtered = edges.filter((e) => (e.name || "").toLowerCase().includes(query));
    return [...filtered].reverse();
  });

  const filteredVectors = createMemo(() => {
    const query = searchQuery().toLowerCase();
    const vectors = schema()?.vectors || [];
    const filtered = vectors.filter((v) => (v.name || "").toLowerCase().includes(query));
    return [...filtered].reverse();
  });

  return (
    <div class="flex flex-col h-full overflow-hidden bg-native-content">
      <div class="flex-none">
        {/* Top Row: Primary Toolbar */}
        <ToolbarLayout class="justify-between">
          <div class="flex items-center gap-3">
            <Input variant="search" placeholder={`Search ${activeTab()}...`} value={searchQuery()} onInput={(e) => setSearchQuery(e.currentTarget.value)} class="w-64 h-7" />

            <div class="w-px h-5 bg-native-subtle" />
            <Button variant="toolbar" onClick={() => refetch()} disabled={loading()} class="flex items-center gap-1.5 transition-all">
              <RefreshCw size={12} strokeWidth={2.5} class={`${loading() ? "animate-spin" : ""} text-accent`} />
              <span>Refresh</span>
            </Button>
          </div>

          {/* Right: Expand/Collapse */}
          <div class="flex items-center gap-2">
            <Button variant="toolbar" onClick={() => expandAll()} class="flex items-center gap-1.5 transition-all duration-75">
              <ChevronsUpDown size={13} strokeWidth={2} class="text-accent" />
              Expand All
            </Button>
            <Button variant="toolbar" onClick={() => collapseAll()} class="flex items-center gap-1.5 transition-all duration-75">
              <ChevronsDownUp size={13} strokeWidth={2} class="text-accent" />
              Collapse All
            </Button>
          </div>
        </ToolbarLayout>

        {/* Tab Row (Secondary Toolbar) */}
        <div class="h-11 border-b border-native-subtle bg-native-sidebar-vibrant/50 flex items-center px-5">
          <div class="inline-flex items-center p-0.5 rounded-lg bg-native-content/50 border border-native-subtle">
            {[
              {
                id: "nodes",
                label: "Nodes",
                icon: Database,
                count: schema()?.nodes?.length || 0,
                color: "text-emerald-500",
              },
              {
                id: "relationships",
                label: "Edges",
                icon: Network,
                count: schema()?.edges?.length || 0,
                color: "text-blue-500",
              },
              {
                id: "vectors",
                label: "Vectors",
                icon: Zap,
                count: schema()?.vectors?.length || 0,
                color: "text-amber-500",
              },
            ].map((tab) => (
              <button
                onClick={() => setActiveTab(tab.id as any)}
                class={`flex items-center gap-1.5 px-3 h-7 rounded-md text-[11px] font-medium transition-all ${
                  activeTab() === tab.id ? "bg-native-elevated shadow-sm text-native-primary" : "text-native-tertiary hover:text-native-secondary"
                }`}
              >
                <tab.icon size={12} strokeWidth={2.5} class={activeTab() === tab.id ? tab.color : "opacity-40 grayscale"} />
                {tab.label}
                <span class={`text-[10px] tabular-nums ${activeTab() === tab.id ? "text-native-secondary" : "text-native-quaternary/70"}`}>{tab.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ref 绑在这里，ResizeObserver 监听的是这个容器的实际宽度 */}
      <div ref={gridContainerRef} class="flex-1 overflow-y-auto px-5 py-5 scrollbar-thin">
        <Show when={!loading() && error()}>
          <div class="bg-status-error/10 border border-status-error/20 text-status-error px-4 py-3 rounded-lg flex items-center gap-3">
            <div class="w-6 h-6 rounded-full bg-status-error/10 flex items-center justify-center text-[12px] font-bold">!</div>
            <div class="text-[13px] font-medium">{error()}</div>
          </div>
        </Show>

        <Show
          when={!loading() && schema()}
          fallback={
            <EmptyState
              icon={Database}
              title={loading() ? "Analyzing Schema..." : "No Schema Data"}
              description={loading() ? "Fetching your database structure. This might take a moment." : "Failed to load schema information."}
            />
          }
        >
          <div>
            <Show when={activeTab() === "nodes"}>
              <div class="grid gap-3 items-start" style={{ "grid-template-columns": `repeat(${colCount()}, minmax(0, 1fr))` }}>
                <Show when={filteredNodes().length > 0}>
                  <For each={distributeItems(filteredNodes())}>
                    {(columnItems) => (
                      <div class="flex flex-col gap-3">
                        <For each={columnItems}>
                          {(node) => {
                            const cardKey = "node-" + node.name;
                            return <NodeCard node={node} expanded={expandedCards()[cardKey] ?? false} onToggle={() => toggleCard(cardKey)} />;
                          }}
                        </For>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </Show>

            <Show when={activeTab() === "relationships"}>
              <div class="grid gap-3 items-start" style={{ "grid-template-columns": `repeat(${colCount()}, minmax(0, 1fr))` }}>
                <Show when={filteredEdges().length > 0}>
                  <For each={distributeItems(filteredEdges())}>
                    {(columnItems) => (
                      <div class="flex flex-col gap-3">
                        <For each={columnItems}>
                          {(edge) => {
                            const cardKey = `edge-${edge.name}-${edge.from_node}-${edge.to_node}`;
                            return <EdgeCard edge={edge} expanded={expandedCards()[cardKey] ?? false} onToggle={() => toggleCard(cardKey)} />;
                          }}
                        </For>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </Show>

            <Show when={activeTab() === "vectors"}>
              <div class="grid gap-3 items-start" style={{ "grid-template-columns": `repeat(${colCount()}, minmax(0, 1fr))` }}>
                <For each={distributeItems(filteredVectors())}>
                  {(columnItems) => (
                    <div class="flex flex-col gap-3">
                      <For each={columnItems}>
                        {(vector) => {
                          const cardKey = "vector-" + vector.name;
                          return <VectorCard vector={vector} expanded={expandedCards()[cardKey] ?? false} onToggle={() => toggleCard(cardKey)} />;
                        }}
                      </For>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
};
