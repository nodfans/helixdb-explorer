import { createSignal, createEffect, createMemo, onCleanup, onMount, Show, For } from "solid-js";
import { HelixApi } from "../lib/api";
import ForceGraphFactory from "force-graph";
import { Database, Network, RefreshCw, ChevronRight, X, Sparkles, Maximize, Layers, Check } from "lucide-solid";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ToolbarLayout } from "./ui/toolbar-layout";

interface GraphProps {
  api: HelixApi;
  isConnected: boolean;
  onConnect: () => void;
}

interface GraphNode {
  id: string;
  name?: string;
  label?: string;
  type?: string;
  val?: number;
  color?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
  [key: string]: any;
}

interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  label?: string;
  [key: string]: any;
}

// Color palette - Professional blue inspired by Navicat
const TYPE_COLORS: Record<string, string> = {
  User: "#10b981", // emerald
  Post: "#3b82f6", // blue
  Comment: "#818cf8", // indigo (lavender-blue)
  Entity: "#10b981", // emerald
  default: "#94a3b8", // gray
};

// Generate color from hash for unknown types - aurora palette
const hashColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash;
  }
  // Professional blue-based palette
  const colors = ["#3b82f6", "#60a5fa", "#67e8f9", "#fcd34d", "#4ade80", "#fb7185", "#fdba74", "#93c5fd", "#f472b6", "#38bdf8", "#facc15", "#34d399", "#2dd4bf", "#22d3ee", "#fbbf24"];
  return colors[Math.abs(hash) % colors.length];
};

const getNodeColor = (node: GraphNode): string => {
  const type = node.type || node.label || "default";
  return TYPE_COLORS[type] || hashColor(type);
};

// Robust Name Resolution
const resolveNodeName = (node: any, fallbackId?: string): string => {
  const id = node.id || fallbackId || "";

  // Potential name fields in order of preference for "friendly" names
  const candidates = [node.display_name, node.name, node.username, node.title, node.label];

  for (const val of candidates) {
    if (val && typeof val === "string" && val.length > 0 && val !== id && !id.startsWith(val)) {
      return val;
    }
  }

  // Final fallback: Use title or name even if it's the ID, or short ID
  return node.name || node.title || (id.length > 8 ? id.slice(0, 8) : id);
};

const getRenderMode = (scale: number, _nodeCount: number): { mode: "simple" | "detailed"; scale: number } => {
  return {
    mode: scale > 1.5 ? "detailed" : "simple",
    scale,
  };
};

export const Graph = (props: GraphProps) => {
  let containerRef: HTMLDivElement | undefined;
  let graphInstance: any = null;

  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [allNodes, setAllNodes] = createSignal<GraphNode[]>([]);
  const [allEdges, setAllEdges] = createSignal<GraphEdge[]>([]);
  const [selectedNode, setSelectedNode] = createSignal<GraphNode | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = createSignal<string | null>(null);

  // Track previous showDetailPanel state to avoid unnecessary resize
  let prevShowDetailPanel = true;

  // Timer handles for cleanup
  const timers: number[] = [];
  const clearTimers = () => {
    while (timers.length) {
      const t = timers.pop();
      if (t) clearTimeout(t);
    }
  };

  const [nodeLimit, setNodeLimit] = createSignal(5);
  const [showDetailPanel, setShowDetailPanel] = createSignal(true);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = createSignal("");
  const [rankingMode, setRankingMode] = createSignal(false);
  const [hiddenTypes, setHiddenTypes] = createSignal<Set<string>>(new Set());
  const [showLegend, setShowLegend] = createSignal(false);

  // Debounce search query
  createEffect(() => {
    const query = searchQuery();
    const timeout = setTimeout(() => {
      setDebouncedSearchQuery(query);
    }, 200);
    onCleanup(() => clearTimeout(timeout));
  });

  // Derived data
  // Pre-calculate metrics to avoid O(N) work in every reactive update
  const nodeMetrics = createMemo(() => {
    const degreeMap = new Map<string, number>();
    const nodes = allNodes();
    const edges = allEdges();

    edges.forEach((e) => {
      const s = typeof e.source === "object" ? (e.source as any).id : e.source;
      const t = typeof e.target === "object" ? (e.target as any).id : e.target;
      if (s) degreeMap.set(s, (degreeMap.get(s) || 0) + 1);
      if (t) degreeMap.set(t, (degreeMap.get(t) || 0) + 1);
    });

    const sortedHubIds = nodes.map((n) => n.id).sort((a, b) => (degreeMap.get(b) || 0) - (degreeMap.get(a) || 0));

    return { degreeMap, sortedHubIds };
  });

  const nodeTypes = createMemo(() => {
    const types = new Map<string, number>();
    allNodes().forEach((n) => {
      const type = n.type || n.label || "default";
      types.set(type, (types.get(type) || 0) + 1);
    });
    return Array.from(types.entries())
      .map(([type, count]) => ({ type, count, color: getNodeColor({ type } as any) }))
      .sort((a, b) => b.count - a.count);
  });

  const graphData = createMemo(() => {
    const { degreeMap, sortedHubIds } = nodeMetrics();
    let nodesToDisplay: GraphNode[] = [];
    let linksToDisplay: any[] = [];

    // 1. Handle Ranking Mode (Hub Analysis)
    if (rankingMode()) {
      const hubIds = new Set(sortedHubIds.slice(0, nodeLimit()));

      // Select ALL edges connected to at least one hub
      const hubLinks = allEdges().filter((e) => {
        const s = typeof e.source === "object" ? (e.source as any).id : e.source;
        const t = typeof e.target === "object" ? (e.target as any).id : e.target;
        return hubIds.has(s) || hubIds.has(t);
      });

      // Collect all node IDs (Hubs + their neighbors)
      const visibleNodeIds = new Set<string>();
      hubLinks.forEach((e) => {
        const s = typeof e.source === "object" ? (e.source as any).id : e.source;
        const t = typeof e.target === "object" ? (e.target as any).id : e.target;
        if (s) visibleNodeIds.add(s);
        if (t) visibleNodeIds.add(t);
      });
      // Ensure all hubs are included even if isolated (unlikely but possible)
      hubIds.forEach((id) => visibleNodeIds.add(id));

      const existingNodeMap = new Map<string, GraphNode>();
      allNodes().forEach((n) => existingNodeMap.set(n.id, n));

      visibleNodeIds.forEach((id) => {
        const n = existingNodeMap.get(id);
        if (n) {
          nodesToDisplay.push({
            ...n,
            color: getNodeColor(n),
            degree: degreeMap.get(n.id) || 0,
            val: hubIds.has(n.id) ? 3 : 1, // Visually distinguish hubs
          });
        } else {
          // Placeholder for missing neighbor
          nodesToDisplay.push({
            id,
            name: id.slice(0, 8) + "...",
            label: "Entity",
            type: "Entity",
            color: "#94a3b8",
            degree: degreeMap.get(id) || 0,
            val: 1,
          } as any);
        }
      });

      linksToDisplay = hubLinks.map((e) => ({
        ...e,
        source: typeof e.source === "object" ? (e.source as any).id : e.source,
        target: typeof e.target === "object" ? (e.target as any).id : e.target,
      }));
    } else {
      // 3. Normal Mode (Full Connectivity)
      const nodeMap = new Map<string, GraphNode>();
      allNodes().forEach((n) => nodeMap.set(n.id, n));

      // In full mode, we show all connected nodes or everything?
      // Following previous pattern: show nodes that have edges or are in allNodes
      nodesToDisplay = allNodes().map((n) => ({
        ...n,
        color: getNodeColor(n),
        degree: degreeMap.get(n.id) || 0,
      }));

      linksToDisplay = allEdges().map((e) => ({
        ...e,
        source: typeof e.source === "object" ? (e.source as any).id : e.source,
        target: typeof e.target === "object" ? (e.target as any).id : e.target,
      }));
    }

    // 2. Filter by hidden types
    const hidden = hiddenTypes();
    nodesToDisplay = nodesToDisplay.filter((n) => !hidden.has(n.type || n.label || "default"));

    // 4. Global Search Filter
    const search = debouncedSearchQuery().trim();
    if (search) {
      const query = search.toLowerCase();
      nodesToDisplay = nodesToDisplay.filter((n) => n.name?.toLowerCase().includes(query) || n.id.toLowerCase().includes(query) || n.type?.toLowerCase().includes(query));
    }

    // 5. Final Link Filtering (Ensures no dangling links)
    const activeIds = new Set(nodesToDisplay.map((n) => n.id));
    linksToDisplay = linksToDisplay.filter((l) => activeIds.has(l.source) && activeIds.has(l.target));

    return { nodes: nodesToDisplay, links: linksToDisplay };
  });

  const stats = createMemo(() => ({
    nodeCount: graphData().nodes.length,
    edgeCount: graphData().links.length,
    totalNodes: allNodes().length,
    totalEdges: allEdges().length,
  }));

  // Load basic data from API
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await props.api.fetchNodesAndEdges();

      // Capture existing positions before loading new data
      const existingNodeMap = new Map<string, GraphNode>();
      allNodes().forEach((n) => existingNodeMap.set(n.id, n));

      const nodes: GraphNode[] = data.data.nodes.map((n) => {
        // Fallback-rich name resolution
        const name = resolveNodeName(n);
        const typeFallback = n.label || n.type || "Entity";

        // Preserve position if node already exists
        const existing = existingNodeMap.get(n.id);
        const x = existing?.x ?? (Math.random() - 0.5) * 50;
        const y = existing?.y ?? (Math.random() - 0.5) * 50;

        // Preserve velocity and fixed position states for smooth transition
        const vx = existing?.vx;
        const vy = existing?.vy;
        const fx = existing?.fx;
        const fy = existing?.fy;

        return {
          ...n,
          name,
          label: typeFallback,
          type: typeFallback,
          x,
          y,
          vx,
          vy,
          fx,
          fy,
        };
      });

      const edges: GraphEdge[] = data.data.edges.map((e) => {
        // Robust source/target detection
        const source = e.from_node || e.from || e.source;
        const target = e.to_node || e.to || e.target;

        return {
          ...e,
          source,
          target,
          label: e.label || e.name || e.relationship || "",
        };
      });

      setAllNodes(nodes);
      setAllEdges(edges);
    } catch (err: any) {
      console.error("Failed to load graph data:", err);
      setError(err.message || "Failed to load graph data");
    } finally {
      setLoading(false);
    }
  };

  // Lazy fetch details when needed - updates selectedNode directly to avoid graph recomputation
  const fetchNodeDetails = async (nodeId: string) => {
    try {
      const details = await props.api.fetchNodeDetails(nodeId);

      let nodeData: any = null;
      if (details.found && details.node) {
        nodeData = details.node;
      } else if (details.data) {
        nodeData = details.data;
      } else {
        nodeData = details;
      }

      // Update selectedNode directly with fetched details (not allNodes)
      // This prevents graphData recomputation and graph re-render
      setSelectedNode((prev: GraphNode | null) => {
        if (!prev || prev.id !== nodeId) return prev;

        return {
          ...prev,
          ...nodeData,
          name: resolveNodeName(nodeData, prev.id),
        };
      });
    } catch (err) {
      console.error("Failed to fetch node details:", err);
    }
  };

  // Custom node renderer with semantic zoom
  const drawNode = (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const isHovered = node.id === hoveredNodeId();
    const isSelected = selectedNode()?.id === node.id;
    const { mode } = getRenderMode(globalScale, allNodes().length);

    const color = (node as any).color || "#a5b4fc"; // Use the color property added in graphData memo

    // Node size based on hover/selection - explicit and non-cumulative
    const BASE_NODE_SIZE = 7;
    let size = BASE_NODE_SIZE;
    if (isHovered) size = BASE_NODE_SIZE * 1.5;
    else if (isSelected) size = BASE_NODE_SIZE * 1.3;

    // Outer Bloom/Glow
    if (isHovered || isSelected) {
      const glowScale = isHovered ? 4 : 3;
      const gradient = ctx.createRadialGradient(node.x!, node.y!, size, node.x!, node.y!, size * glowScale);
      gradient.addColorStop(0, color + "60");
      gradient.addColorStop(1, color + "00");

      ctx.beginPath();
      ctx.arc(node.x!, node.y!, size * glowScale, 0, 2 * Math.PI);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Node Core
    ctx.beginPath();
    ctx.arc(node.x!, node.y!, size, 0, 2 * Math.PI);

    // Core color
    ctx.fillStyle = color;

    // Shadow bloom center
    ctx.shadowBlur = isHovered ? 20 : isSelected ? 15 : 8;
    ctx.shadowColor = color;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Inner Ring (Glass accent)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Outer Border (Focus accent)
    if (isHovered || isSelected) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Label Rendering (Always shown if zoomed in, or on hover)
    if (mode === "detailed" || isHovered) {
      const label = node.id;
      const fontSize = isHovered ? 11 : 9;
      ctx.font = `${isHovered ? "bold" : "normal"} ${fontSize}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;

      const textWidth = ctx.measureText(label).width;
      const paddingX = 6;
      const paddingY = 3;
      const labelX = node.x! + size + 8;
      const labelY = node.y! + 4;

      // Subtle backdrop for text contrast
      ctx.fillStyle = "rgba(9, 9, 11, 0.7)";
      ctx.fillRect(labelX - paddingX, labelY - fontSize, textWidth + paddingX * 2, fontSize + paddingY * 2);

      ctx.fillStyle = isHovered ? "#ffffff" : "rgba(255, 255, 255, 0.8)";
      ctx.textAlign = "left";
      ctx.fillText(label, labelX, labelY);
    }
  };

  // Initialize 2D graph
  const initGraph = () => {
    if (!containerRef) return;

    try {
      const ForceGraph = ForceGraphFactory();
      graphInstance = ForceGraph(containerRef);

      // Set dimensions
      graphInstance.width(containerRef.clientWidth);
      graphInstance.height(containerRef.clientHeight);

      // Background - deep space
      graphInstance.backgroundColor("#09090b");

      // Custom node rendering
      graphInstance.nodeCanvasObject((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        drawNode(node, ctx, globalScale);
      });

      // Hit area for interaction - Circle based
      graphInstance.nodePointerAreaPaint((node: any, color: string, ctx: CanvasRenderingContext2D) => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 14, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
      });

      // Disable default tooltip (nodeLabel) to avoid duplicate hover effect
      graphInstance.nodeLabel(() => "");

      // Events
      graphInstance.onNodeHover((node: any) => {
        setHoveredNodeId(node ? node.id : null);
        containerRef!.style.cursor = node ? "grab" : "default";
      });

      graphInstance.onNodeClick((node: any) => {
        setSelectedNode(node);
        // Lazy fetch details on click if not already enriched
        if (node.id) {
          fetchNodeDetails(node.id);
        }
      });

      // Enable node dragging!
      graphInstance.enableNodeDrag(true);
      graphInstance.onNodeDrag((_node: any) => {
        containerRef!.style.cursor = "grabbing";
      });
      graphInstance.onNodeDragEnd((node: any) => {
        containerRef!.style.cursor = "grab";
        // Persistent positioning: fix the node where it's dropped
        node.fx = node.x;
        node.fy = node.y;
      });

      // Link styling - subtle and consistent
      graphInstance.linkColor(() => "rgba(59, 130, 246, 0.25)"); // subtle blue
      graphInstance.linkWidth(1.5);
      graphInstance.linkDirectionalArrowLength(6);
      graphInstance.linkDirectionalArrowRelPos(1);

      // Particles flowing on links connected to selected/hovered node
      graphInstance.linkDirectionalParticles((link: any) => {
        const hovered = hoveredNodeId();
        const selected = selectedNode();
        const sourceId = typeof link.source === "object" ? link.source.id : link.source;
        const targetId = typeof link.target === "object" ? link.target.id : link.target;

        // Show particles on hovered node's links
        if (hovered && (sourceId === hovered || targetId === hovered)) {
          return 4;
        }
        // Show particles on selected node's links
        if (selected && (sourceId === selected.id || targetId === selected.id)) {
          return 3;
        }
        return 0;
      });
      graphInstance.linkDirectionalParticleWidth(5);
      graphInstance.linkDirectionalParticleSpeed(0.006); // Slower, smoother flow
      graphInstance.linkDirectionalParticleColor(() => "#3b82f6"); // matched blue

      // Physics - Loose deck feeling that fans out
      graphInstance.d3AlphaDecay(0.02);
      graphInstance.d3VelocityDecay(0.3);
      graphInstance.warmupTicks(100); // Pre-settle a bit
      graphInstance.cooldownTicks(100);

      // Forces to create the fan-out effect
      graphInstance.d3Force("charge").strength(-120); // Stronger repulsion for fan-out
      graphInstance.d3Force("link").distance(80).strength(1); // Link strength
      graphInstance.d3Force("center").strength(0.05); // Centering
      graphInstance.d3Force("collide", () => 30); // Prevent overlapping

      // Disable auto-alpha reheat on data changes to prevent jumpiness
      graphInstance.dagMode(null);

      // Set data
      updateGraphData();

      // Better default scale - Zoom to Fit
      const zoomTimeout = setTimeout(() => {
        if (graphInstance && allNodes().length > 0) {
          graphInstance.zoomToFit(800, 80);
        }
      }, 300); // Slightly longer delay to allow physics to breathe
      timers.push(zoomTimeout as any);
    } catch (err) {
      console.error("Failed to initialize graph:", err);
      setError("Failed to initialize visualization");
    }
  };

  // Update graph with current filtered data
  const updateGraphData = (reheat = true) => {
    if (!graphInstance) return;
    const data = graphData();
    graphInstance.graphData(data);
    if (reheat) {
      graphInstance.d3ReheatSimulation();
    }
  };

  // Effect: update graph when data changes
  createEffect(() => {
    const data = graphData();
    if (!graphInstance) return;

    // Check if the set size changed to decide on reheat
    const currentData = graphInstance.graphData();
    const countChanged = data.nodes.length !== currentData.nodes.length || data.links.length !== currentData.links.length;

    // Standard data update (non-destructive if references match)
    graphInstance.graphData(data);

    if (countChanged || (data.nodes.length > 0 && currentData.nodes.length === 0)) {
      // Reheat on structural changes OR when recovering from empty state
      graphInstance.d3ReheatSimulation();
    }
  });

  // Resize handler
  const handleResize = () => {
    if (graphInstance && containerRef) {
      graphInstance.width(containerRef.clientWidth);
      graphInstance.height(containerRef.clientHeight);
    }
  };

  onMount(() => {
    window.addEventListener("resize", handleResize);
  });

  // Load data when connected (reactive to connection state changes)
  createEffect(() => {
    if (props.isConnected) {
      loadData().then(() => {
        initGraph();
        handleResize();
      });
    }
  });

  onCleanup(() => {
    window.removeEventListener("resize", handleResize);
    clearTimers();
    if (graphInstance && containerRef) {
      containerRef.innerHTML = "";
    }
  });

  // Effect: handle panel toggle - only resize when panel visibility actually changes
  createEffect(() => {
    const current = showDetailPanel();
    if (current !== prevShowDetailPanel) {
      prevShowDetailPanel = current;
      const resizeTimeout = setTimeout(handleResize, 50);
      timers.push(resizeTimeout as any);
    }
  });

  // Effect: force redraw when selection or hover changes
  // force-graph doesn't auto-redraw when external state changes, so we trigger it manually
  createEffect(() => {
    // Track these signals to trigger the effect
    const selected = selectedNode();
    const hovered = hoveredNodeId();

    if (graphInstance) {
      // Re-apply particle settings when selection/hover changes
      graphInstance.linkDirectionalParticles((link: any) => {
        const sourceId = typeof link.source === "object" ? link.source.id : link.source;
        const targetId = typeof link.target === "object" ? link.target.id : link.target;

        // Show particles on hovered node's links
        if (hovered && (sourceId === hovered || targetId === hovered)) {
          return 6;
        }
        // Show particles on selected node's links
        if (selected && (sourceId === selected.id || targetId === selected.id)) {
          return 5;
        }
        return 0;
      });

      // Force a canvas refresh using a micro zoom nudge
      const currentZoom = graphInstance.zoom();
      graphInstance.zoom(currentZoom * 1.0000001, 0);
    }
  });

  const toggleHiddenType = (type: string) => {
    const hidden = new Set(hiddenTypes());
    if (hidden.has(type)) {
      hidden.delete(type);
    } else {
      hidden.add(type);
    }
    setHiddenTypes(hidden);
  };

  const refresh = () => {
    setHoveredNodeId(null);
    setSelectedNode(null);
    loadData();
  };

  return (
    <div class="flex flex-col h-full w-full bg-graph text-native-primary overflow-hidden">
      {/* Header & Controls */}
      <div class="flex-none">
        {/* Main Toolbar */}
        <ToolbarLayout class="justify-between">
          <div class="flex items-center gap-3">
            {/* Search */}
            <Input variant="search" placeholder="Search nodes..." value={searchQuery()} onInput={(e) => setSearchQuery(e.currentTarget.value)} class="w-64 h-7" />

            <div class="w-px h-5" style={{ "background-color": "var(--macos-border-light)" }} />

            {/* Top N & Limit Group */}
            {/* Top N & Limit Group */}
            <div class="flex items-center">
              <Button variant="toolbar" active={rankingMode()} onClick={() => setRankingMode(!rankingMode())} class="flex items-center gap-1.5 rounded-r-none border-r-0 h-7 transition-all">
                <span class="font-medium text-[11px]">Top N</span>
              </Button>

              <div
                class={`flex items-center h-7 border border-[var(--macos-border-light)] rounded-r-md transition-all px-1.5 ${
                  rankingMode() ? "bg-[var(--accent)]/5 border-l-[var(--macos-border-light)]" : "opacity-30 grayscale pointer-events-none bg-transparent"
                }`}
              >
                <input
                  type="number"
                  min="1"
                  max="50"
                  step="1"
                  value={nodeLimit()}
                  onInput={(e) => {
                    let val = parseInt(e.currentTarget.value) || 1;
                    val = Math.max(1, Math.min(50, val));
                    setNodeLimit(val);
                  }}
                  class="w-7 bg-transparent text-[11px] font-bold text-native-primary text-center focus:outline-none tabular-nums"
                />
              </div>
            </div>

            <div class="w-px h-5" style={{ "background-color": "var(--macos-border-light)" }} />

            <Button variant="toolbar" active={showLegend()} onClick={() => setShowLegend(!showLegend())} class="flex items-center gap-1.5 h-7 transition-all">
              <Layers size={13} class={showLegend() ? "text-accent" : "text-native-tertiary"} />
              <span class="font-medium text-[11px]">Legend</span>
            </Button>
          </div>

          {/* Center: Stats (Desktop Only) */}
          <div class="hidden xl:flex items-center gap-2">
            <div class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/8 border border-emerald-500/10">
              <Database size={11} class="text-emerald-500" />
              <span class="text-[10px] font-semibold text-native-secondary tabular-nums">{stats().nodeCount}</span>
            </div>
            <div class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/8 border border-blue-500/10">
              <Network size={11} class="text-blue-500" />
              <span class="text-[10px] font-semibold text-native-secondary tabular-nums">{stats().edgeCount}</span>
            </div>
            <Show when={loading() && props.isConnected}>
              <div class="flex items-center gap-1.5 ml-2 text-native-tertiary">
                <RefreshCw size={11} class="animate-spin" />
                <span class="text-[10px] font-medium">Syncing...</span>
              </div>
            </Show>
          </div>

          {/* Right: Actions */}
          <div class="flex items-center gap-2">
            <Button
              variant="toolbar"
              onClick={() => {
                if (graphInstance) {
                  graphInstance.centerAt(0, 0, 400);
                  graphInstance.zoom(1.4, 400);
                }
              }}
              class="flex items-center gap-1.5 transition-all group active:scale-95"
              title="Center View"
            >
              <Maximize size={12} strokeWidth={2.5} class="text-accent group-hover:scale-110 transition-transform" />
              <span class="font-medium">Center</span>
            </Button>

            <Button variant="toolbar" onClick={refresh} disabled={loading()} class="flex items-center gap-1.5 transition-all group active:scale-95">
              <RefreshCw size={12} strokeWidth={2.5} class={`${loading() ? "animate-spin" : "group-hover:rotate-180"} transition-transform text-accent`} />
              <span class="font-medium">Refresh</span>
            </Button>

            <div class="w-px h-5" style={{ "background-color": "var(--macos-border-light)" }} />

            <button
              onClick={() => setShowDetailPanel(!showDetailPanel())}
              class="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--macos-border-light)] hover:bg-native-content/50 transition-colors"
              title={showDetailPanel() ? "Hide Details" : "Show Details"}
            >
              <ChevronRight size={14} class={`text-native-tertiary transition-transform ${showDetailPanel() ? "rotate-180" : ""}`} />
            </button>
          </div>
        </ToolbarLayout>
      </div>

      {/* Main Content */}
      <div class="flex-1 flex overflow-hidden relative">
        {/* Graph Canvas */}
        <div ref={containerRef} class="flex-1 relative overflow-hidden" style={{ transition: "width 0.2s ease" }} />

        {/* Schema Legend Panel */}
        <Show when={showLegend()}>
          <div class="absolute top-4 left-4 z-40 w-56 bg-native-elevated/95 backdrop-blur-xl rounded-xl border border-native shadow-macos-lg flex flex-col max-h-[calc(100%-2rem)] overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-left-4">
            <div class="flex-none p-3 border-b border-native flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Layers size={14} class="text-accent" />
                <span class="text-[12px] font-bold text-native-primary">Legend</span>
              </div>
              <button onClick={() => setShowLegend(false)} class="p-1 hover:bg-native-content/10 rounded-md transition-colors text-native-tertiary hover:text-native-primary">
                <X size={14} />
              </button>
            </div>

            <div class="flex-1 overflow-y-auto p-2 space-y-0.5 scrollbar-thin">
              <For each={nodeTypes()}>
                {(item) => (
                  <div
                    class={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                      hiddenTypes().has(item.type) ? "opacity-50 grayscale bg-transparent" : "hover:bg-native-content/5"
                    }`}
                    onClick={() => toggleHiddenType(item.type)}
                  >
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div class="w-3 h-3 rounded-full flex-none shadow-sm" style={{ "background-color": item.color }} />
                      <div class="flex flex-col min-w-0">
                        <span class="text-[11px] font-semibold text-native-primary truncate leading-tight">{item.type}</span>
                        <span class="text-[9px] text-native-tertiary tabular-nums font-medium">{item.count} nodes</span>
                      </div>
                    </div>

                    <div
                      class={`w-4 h-4 rounded border transition-all flex items-center justify-center ${
                        hiddenTypes().has(item.type) ? "border-native bg-transparent" : "border-accent bg-accent shadow-[0_0_8px_rgba(var(--macos-accent-rgb),0.3)]"
                      }`}
                    >
                      <Show when={!hiddenTypes().has(item.type)}>
                        <Check size={11} class="text-white" />
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>

            <div class="flex-none p-2 border-t border-native bg-native-content/5">
              <div class="text-[9px] text-center text-native-quaternary font-medium uppercase tracking-wider">Toggle types to filter view</div>
            </div>
          </div>
        </Show>

        {/* Detail Panel */}
        <Show when={showDetailPanel()}>
          <div class="w-[280px] flex-none border-l border-native overflow-hidden flex flex-col bg-native-sidebar-vibrant">
            <Show
              when={selectedNode()}
              fallback={
                <div class="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <div class="w-10 h-10 rounded-full bg-native-content/30 flex items-center justify-center mb-3">
                    <Network size={28} class="text-native-quaternary" />
                  </div>
                  <p class="text-[11px] text-native-tertiary">Select a node to view details</p>
                </div>
              }
            >
              {(node) => (
                <div class="flex-1 overflow-y-auto scrollbar-thin">
                  <div class="p-3">
                    <div class="text-[9px] font-medium text-native-quaternary uppercase tracking-wide mb-2">Properties</div>

                    <div class="space-y-1">
                      <For each={Object.entries(node()).filter(([k]) => !["x", "y", "vx", "vy", "index", "__indexColor", "fx", "fy", "val", "color"].includes(k))}>
                        {([key, value]) => (
                          <div class="group rounded-md bg-native-content/5 hover:bg-native-content/10 transition-all p-2 border border-transparent hover:border-native-subtle">
                            <div class="text-[10px] font-normal text-native-tertiary uppercase tracking-wider mb-1 opacity-70 group-hover:opacity-100 transition-opacity">{key}</div>
                            <div class="text-[11px] font-sans text-native-primary break-all select-text leading-relaxed">
                              {value === null || value === undefined ? (
                                <span class="text-native-quaternary italic">null</span>
                              ) : typeof value === "object" ? (
                                <pre class="text-[10px] font-mono text-native-tertiary bg-native-content/5 p-1.5 rounded border border-native-subtle mt-1 overflow-x-auto">
                                  {JSON.stringify(value, null, 2)}
                                </pre>
                              ) : (
                                <span class={typeof value === "number" ? "tabular-nums" : ""}>{String(value)}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </div>
              )}
            </Show>
          </div>
        </Show>

        {/* Loading Overlay - Smoother Transition */}
        <div
          class="absolute inset-0 flex items-center justify-center pointer-events-none z-50 transition-all duration-300 ease-in-out"
          style={{
            opacity: loading() ? 1 : 0,
            "backdrop-filter": loading() ? "blur(4px)" : "blur(0px)",
            "background-color": loading() ? "rgba(9, 9, 11, 0.4)" : "rgba(9, 9, 11, 0)",
          }}
        >
          <div class="flex flex-col items-center gap-3 scale-90 transition-transform duration-300" style={{ transform: loading() ? "scale(1)" : "scale(0.95)" }}>
            <div class="relative">
              <div class="w-10 h-10 rounded-full border-2 border-accent/20 border-t-accent animate-spin" />
              <Sparkles size={16} class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-accent" />
            </div>
            <span class="text-[11px] font-medium text-native-secondary tracking-tight">Updating graph...</span>
          </div>
        </div>

        {/* Error Overlay */}
        <Show when={error()}>
          <div class="absolute inset-0 flex items-center justify-center bg-native-content/60 backdrop-blur-sm z-50">
            <div class="bg-native-elevated rounded-2xl p-8 max-w-sm text-center border border-native shadow-macos-lg">
              <div class="w-14 h-14 rounded-full bg-status-error/10 flex items-center justify-center mx-auto mb-5">
                <X size={28} class="text-status-error" />
              </div>
              <h3 class="text-base font-bold text-native-primary mb-2">Synchronization Failed</h3>
              <p class="text-native-tertiary text-sm mb-6 leading-relaxed">{error()}</p>
              <Button variant="primary" size="md" onClick={refresh} class="w-full">
                <span>Retry Connection</span>
              </Button>
            </div>
          </div>
        </Show>
      </div>

      {/* Status Bar */}
      <footer class="h-9 border-t border-native bg-native-content/50 backdrop-blur-md flex items-center justify-between px-5 flex-none select-none">
        <div class="flex items-center gap-3 text-[11px] text-native-tertiary font-medium">
          <Show when={props.isConnected}>
            <span class="tabular-nums">{stats().nodeCount} nodes</span>
            <div class="w-px h-3" style={{ "background-color": "var(--macos-border-light)" }} />
            <span class="tabular-nums">{stats().edgeCount} edges</span>
          </Show>
        </div>

        <div class="flex items-center gap-2">
          <Show when={selectedNode()}>
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/20">
              <span class="text-[11px] font-semibold text-blue-400 tracking-wide">Selected:</span>
              <span class="text-[11px] font-semibold text-blue-500">{(selectedNode() as any).id}</span>
            </div>

            <div class="w-px h-5" style={{ "background-color": "var(--macos-border-light)" }} />

            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
              <Network size={11} class="text-emerald-500" />
              <span class="text-[11px] font-semibold text-emerald-500 tabular-nums">
                {
                  allEdges().filter((e) => {
                    const node = selectedNode()!;
                    const sId = typeof e.source === "string" ? e.source : (e.source as any).id;
                    const tId = typeof e.target === "string" ? e.target : (e.target as any).id;
                    return sId === node.id || tId === node.id;
                  }).length
                }
              </span>
              <span class="text-[10px] text-emerald-400 font-medium">edges</span>
            </div>
          </Show>
        </div>
      </footer>
    </div>
  );
};
