import { createSignal, onMount, onCleanup, createEffect, For, Show, createMemo } from "solid-js";
import { HelixApi } from "../lib/api";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { RefreshCw, RotateCcw, ChevronRight, Sparkles, Maximize, Layers, Check, X, Crosshair, Radio } from "lucide-solid";
import { ToolbarLayout } from "./ui/toolbar-layout";
import { EmptyState } from "./ui/empty-state";

interface VectorsProps {
  api: HelixApi;
  isConnected: boolean;
  onConnect: () => void;
}

interface VectorNode {
  id: string;
  name?: string;
  label?: string;
  vector?: number[];
  x?: number;
  y?: number;
  color?: string;
  [key: string]: any;
}

// Persistent store for cross-page navigation
interface PersistentState {
  nodes: VectorNode[];
  selectedNodeId: string | null;
  showDetailPanel: boolean;
  showLabels: boolean;
  selectedIndex: string;
  availableIndices: string[];
  hasFetched: boolean;
  showIndexPanel: boolean;
  searchQuery: string;
  isSemantic: boolean;
  camera: { zoom: number; offset: { x: number; y: number } } | null;
}
let persistentStore: PersistentState | null = null;

function generateColors(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const hue = (i * 360) / count;
    return `hsl(${hue}, 70%, 60%)`;
  });
}

function colorToAlpha(color: string, alpha: number): string {
  if (color.startsWith("hsl")) {
    return color.replace("hsl", "hsla").replace(")", `, ${alpha})`);
  }
  if (color.startsWith("#")) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(nodeColorToHex(color).slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

function nodeColorToHex(color: string): string {
  if (color.startsWith("#")) return color;
  // Simple HSL to HEX if needed, but for alpha we can use hsla
  return color;
}

function performKMeans(points: number[][], k: number, iterations = 20): number[] {
  if (points.length === 0) return [];
  if (points.length <= k) return points.map((_, i) => i);

  let centroids = points.slice(0, k);
  let assignments = new Array(points.length).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < points.length; i++) {
      let minDist = Infinity;
      let cluster = 0;
      for (let j = 0; j < k; j++) {
        const d = Math.pow(points[i][0] - centroids[j][0], 2) + Math.pow(points[i][1] - centroids[j][1], 2);
        if (d < minDist) {
          minDist = d;
          cluster = j;
        }
      }
      assignments[i] = cluster;
    }

    const newCentroids = Array.from({ length: k }, () => [0, 0, 0]);
    for (let i = 0; i < points.length; i++) {
      const c = assignments[i];
      newCentroids[c][0] += points[i][0];
      newCentroids[c][1] += points[i][1];
      newCentroids[c][2]++;
    }

    for (let j = 0; j < k; j++) {
      if (newCentroids[j][2] > 0) {
        centroids[j] = [newCentroids[j][0] / newCentroids[j][2], newCentroids[j][1] / newCentroids[j][2]];
      }
    }
  }

  return assignments;
}

export const Vectors = (props: VectorsProps) => {
  const [nodes, setNodes] = createSignal<VectorNode[]>(persistentStore?.nodes ?? []);
  const [isLoading, setIsLoading] = createSignal(false);
  const [selectedNodeId, setSelectedNodeId] = createSignal<string | null>(persistentStore?.selectedNodeId ?? null);
  const [hoveredNodeId, setHoveredNodeId] = createSignal<string | null>(null);
  const [showDetailPanel, setShowDetailPanel] = createSignal(persistentStore?.showDetailPanel ?? false);
  const [showLabels, setShowLabels] = createSignal(persistentStore?.showLabels ?? false);

  const selectedNode = createMemo(() => nodes().find((n) => n.id === selectedNodeId()));

  const [selectedIndex, setSelectedIndex] = createSignal(persistentStore?.selectedIndex ?? "");
  const [lastIndex, setLastIndex] = createSignal(persistentStore?.selectedIndex ?? "");
  const [availableIndices, setAvailableIndices] = createSignal<string[]>(persistentStore?.availableIndices ?? []);
  const [hasFetched, setHasFetched] = createSignal(persistentStore?.hasFetched ?? false);
  const [showIndexPanel, setShowIndexPanel] = createSignal(persistentStore?.showIndexPanel ?? false);
  const [searchQuery, setSearchQuery] = createSignal(persistentStore?.searchQuery ?? "");
  const [isSemantic, setIsSemantic] = createSignal(persistentStore?.isSemantic ?? false);
  const [semanticResults, setSemanticResults] = createSignal<string[]>([]);

  const filteredNodes = createMemo(() => {
    const query = searchQuery().trim().toLowerCase();
    if (!query) return nodes();

    // If semantic search is on, we only filter if we have explicit results
    if (isSemantic() && semanticResults().length > 0) {
      return nodes().filter((n) => semanticResults().includes(n.id));
    }

    return nodes().filter((n) => {
      const name = String(n.name || n.label || n.product_name || n.id).toLowerCase();
      return name.includes(query) || n.id.toLowerCase().includes(query);
    });
  });

  const fetchAvailableIndices = async () => {
    try {
      const schema = await props.api.fetchSchema();
      const indices = schema.vectors.map((v) => v.name);
      setAvailableIndices(indices);
      if (indices.length > 0 && !selectedIndex()) {
        setSelectedIndex(indices[0]);
      }
    } catch (e) {
      console.warn("[Vectors] Failed to fetch available indices:", e);
      setAvailableIndices(["User"]);
      if (!selectedIndex()) setSelectedIndex("User");
    }
  };

  let canvasRef: HTMLCanvasElement | undefined;
  const [zoom, setZoom] = createSignal(persistentStore?.camera?.zoom ?? 1);
  const [offset, setOffset] = createSignal(persistentStore?.camera?.offset ?? { x: 0, y: 0 });
  const [isPanning, setIsPanning] = createSignal(false);
  const [lastMousePos, setLastMousePos] = createSignal({ x: 0, y: 0 });
  let didPan = false;

  const autoFitNodes = (currentNodes: VectorNode[]) => {
    if (currentNodes.length === 0 || !canvasRef) return;

    const scaleFactor = 100;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    currentNodes.forEach((n) => {
      const x = n.x! * scaleFactor;
      const y = n.y! * scaleFactor;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });

    const padding = 60;
    const cloudW = maxX - minX || 1;
    const cloudH = maxY - minY || 1;
    const canvasW = canvasRef.clientWidth;
    const canvasH = canvasRef.clientHeight;
    const zoomX = (canvasW - padding * 2) / cloudW;
    const zoomY = (canvasH - padding * 2) / cloudH;
    const newZoom = Math.min(zoomX, zoomY, 1.5);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setZoom(newZoom);
    setOffset({ x: -centerX * newZoom, y: -centerY * newZoom });
  };

  const panToNode = (nodeId: string) => {
    const node = nodes().find((n) => n.id === nodeId);
    if (!node || !canvasRef) return;

    const scaleFactor = 100;

    const nx = node.x! * scaleFactor;
    const ny = node.y! * scaleFactor;

    const targetOffset = {
      x: -nx * zoom(),
      y: -ny * zoom(),
    };

    animateCamera(targetOffset, zoom());
  };

  let animationId: number | null = null;
  const animateCamera = (targetOffset: { x: number; y: number }, targetZoom: number) => {
    if (animationId) cancelAnimationFrame(animationId);

    const startOffset = { ...offset() };
    const startZoom = zoom();
    const duration = 400; // Snappier duration, matches force-graph defaults
    const startTime = performance.now();

    const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutQuart(progress);

      setZoom(startZoom + (targetZoom - startZoom) * eased);
      setOffset({
        x: startOffset.x + (targetOffset.x - startOffset.x) * eased,
        y: startOffset.y + (targetOffset.y - startOffset.y) * eased,
      });

      if (progress < 1) {
        animationId = requestAnimationFrame(animate);
      } else {
        animationId = null;
      }
    };

    animationId = requestAnimationFrame(animate);
  };

  const fetchData = async (forceInit = false) => {
    if (!props.isConnected || !selectedIndex()) return;

    // Skip remote fetch if cache exists and we aren't forcing
    if (persistentStore && !forceInit && nodes().length > 0) {
      console.log("[Vectors] Using persistent cache for index:", selectedIndex());
      return;
    }

    console.log(`[Vectors] Fetching data for index: ${selectedIndex()} (forceInit: ${forceInit})`);
    setIsLoading(true);
    setHasFetched(true);
    try {
      const rawNodes = await props.api.fetchVectorNodes(selectedIndex());
      console.log(`[Vectors] Fetched ${rawNodes.length} raw nodes`);

      if (rawNodes.length === 0) {
        setNodes([]);
        setLastIndex(selectedIndex());
        return;
      }

      const extractVector = (n: any) => {
        const v = n.data || n.embedding || n.vector || n.vec || n.values;
        if (Array.isArray(v) && v.length > 0) return v;
        for (const val of Object.values(n)) {
          if (Array.isArray(val) && (val as any[]).length >= 8 && typeof (val as any[])[0] === "number") {
            return val;
          }
        }
        return null;
      };

      const vectorsToProject = rawNodes.map(extractVector).filter((v) => v !== null);
      console.log(`[Vectors] Projecting ${vectorsToProject.length} valid vectors`);

      if (vectorsToProject.length > 0) {
        const projections = await invoke<number[][]>("get_vector_projections", { vectors: vectorsToProject });
        const k = Math.min(8, vectorsToProject.length);
        const clusters = performKMeans(projections, k, 20);
        const clusterColors = generateColors(k);

        let projIdx = 0;
        const enrichedNodes = rawNodes
          .map((n: any) => {
            const v = extractVector(n);
            if (v) {
              const [x, y] = projections[projIdx];
              const clusterId = clusters[projIdx];
              projIdx++;
              return { ...n, x, y, color: clusterColors[clusterId % clusterColors.length] };
            }
            return n;
          })
          .filter((n: any) => n.x !== undefined);

        setNodes(enrichedNodes);
        setLastIndex(selectedIndex());
        autoFitNodes(enrichedNodes);
      } else {
        console.warn("[Vectors] No valid embeddings found in fetched nodes");
        setNodes([]);
        setLastIndex(selectedIndex());
      }
    } catch (e) {
      console.error("[Vectors] Failed to fetch or project vector data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSemanticSearch = async () => {
    const query = searchQuery().trim();
    if (!query || !isSemantic() || !selectedIndex()) return;

    setIsLoading(true);
    try {
      const results = await props.api.searchVectors(query, selectedIndex(), 50);
      const ids = results.map((r: any) => r.id);
      setSemanticResults(ids);

      // If we found something, let's pan to the first result
      if (ids.length > 0) {
        panToNode(ids[0]);
      }
    } catch (e) {
      console.warn("[Vectors] Semantic search failed:", e);
    } finally {
      setIsLoading(false);
    }
  };

  onMount(() => {
    if (canvasRef) {
      const resizeObserver = new ResizeObserver(() => draw());
      resizeObserver.observe(canvasRef);
      onCleanup(() => {
        resizeObserver.disconnect();
      });
    }
  });

  onCleanup(() => {
    // Save state to persistence before unmounting
    persistentStore = {
      nodes: nodes(),
      selectedNodeId: selectedNodeId(),
      showDetailPanel: showDetailPanel(),
      showLabels: showLabels(),
      selectedIndex: selectedIndex(),
      availableIndices: availableIndices(),
      hasFetched: hasFetched(),
      showIndexPanel: showIndexPanel(),
      searchQuery: searchQuery(),
      isSemantic: isSemantic(),
      camera: {
        zoom: zoom(),
        offset: offset(),
      },
    };
  });

  createEffect(() => {
    if (props.isConnected && availableIndices().length === 0) {
      fetchAvailableIndices();
    }
  });

  createEffect(() => {
    if (props.isConnected && selectedIndex() && !hasFetched() && !isLoading()) {
      fetchData(false);
    }
  });

  createEffect(() => {
    const label = selectedIndex();
    const currentLast = lastIndex();
    if (props.isConnected && hasFetched() && label && label !== currentLast) {
      fetchData(true);
    }
  });

  const draw = () => {
    if (!canvasRef) return;
    const ctx = canvasRef.getContext("2d");
    if (!ctx) return;

    const width = canvasRef.clientWidth;
    const height = canvasRef.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    const targetW = width * dpr;
    const targetH = height * dpr;
    if (canvasRef.width !== targetW || canvasRef.height !== targetH) {
      canvasRef.width = targetW;
      canvasRef.height = targetH;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2 + offset().x, height / 2 + offset().y);
    ctx.scale(zoom(), zoom());

    const scaleFactor = 100;

    nodes().forEach((node) => {
      // Optimization: still iterate all nodes for context, but dim if filtered out by search
      const query = searchQuery().trim().toLowerCase();
      const isFilteredOut =
        query &&
        (isSemantic()
          ? !semanticResults().includes(node.id)
          : !String(node.name || node.label || node.product_name || node.id)
              .toLowerCase()
              .includes(query) && !node.id.toLowerCase().includes(query));

      const nx = node.x! * scaleFactor;
      const ny = node.y! * scaleFactor;
      const isSelected = selectedNodeId() === node.id;
      const isHovered = hoveredNodeId() === node.id;
      const color = node.color || "#3b82f6";

      // Node size logic (1:1 with Graph.tsx) - Hover beats selection
      const BASE_NODE_SIZE = 7;
      let size = BASE_NODE_SIZE;
      if (isHovered) size = BASE_NODE_SIZE * 1.5;
      else if (isSelected) size = BASE_NODE_SIZE * 1.3;

      // Only show bloom/glow on SELECTED or HOVERED node (Matching Graph.tsx)
      if (isSelected || isHovered) {
        const glowScale = isHovered ? 4.0 : 3.0; // Hover glow is bigger
        const gradient = ctx.createRadialGradient(nx, ny, size, nx, ny, size * glowScale);

        // Multi-stop soft bloom (Syncing high-fidelity quality with Graph.tsx)
        // Deepened center for more "punch" per user feedback
        gradient.addColorStop(0, colorToAlpha(color, 0.7));
        gradient.addColorStop(0.4, colorToAlpha(color, 0.25));
        gradient.addColorStop(1, colorToAlpha(color, 0));

        ctx.beginPath();
        ctx.arc(nx, ny, size * glowScale, 0, 2 * Math.PI);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(nx, ny, size, 0, Math.PI * 2);
      ctx.fillStyle = isFilteredOut ? colorToAlpha(color, 0.2) : color;
      ctx.shadowBlur = isHovered ? 20 : isSelected ? 15 : isFilteredOut ? 0 : 8; // Bit-for-bit sync
      ctx.shadowColor = color;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = isFilteredOut ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();

      if (isSelected || isHovered) {
        ctx.strokeStyle = isFilteredOut ? "rgba(255, 255, 255, 0.5)" : "#ffffff";
        ctx.lineWidth = 2; // Precise matching of selection border
        ctx.stroke();
      }

      // Tooltip-style Labels (Matching Graph.tsx refinement)
      if ((isSelected || isHovered || showLabels()) && !isFilteredOut) {
        const labelText = String(node.name || node.product_name || node.label || node.id);
        const displayLabel = labelText.length > 14 ? labelText.slice(0, 14) + "..." : labelText;

        ctx.font = `${isHovered ? "bold " : ""}${11 / zoom()}px Inter, system-ui, sans-serif`;
        const textWidth = ctx.measureText(displayLabel).width;
        const padding = 6 / zoom();
        const rectW = textWidth + padding * 2;
        const rectH = 18 / zoom();
        const rectX = nx - rectW / 2;
        const rectY = ny + size + 10 / zoom(); // Position below node

        // Label Background
        ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, rectW, rectH, 4 / zoom());
        ctx.fill();

        // Label Border
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = 0.5 / zoom();
        ctx.stroke();

        // Text
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(displayLabel, nx, rectY + rectH / 2);
      }
    });

    ctx.restore();
  };

  createEffect(() => draw());

  const handleMouseDown = (e: MouseEvent) => {
    setIsPanning(true);
    didPan = false;
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isPanning()) {
      const dx = e.clientX - lastMousePos().x;
      const dy = e.clientY - lastMousePos().y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPan = true;
      setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }

    if (canvasRef) {
      const rect = canvasRef.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const scaleFactor = 100;
      const worldX = (mx - rect.width / 2 - offset().x) / zoom() / scaleFactor;
      const worldY = (my - rect.height / 2 - offset().y) / zoom() / scaleFactor;
      const hitRadius = Math.min(10 / zoom() / scaleFactor, 0.15);

      // Hit testing should consider searching filtering (don't hover dimmed nodes)
      const hitNode = filteredNodes().find((n) => {
        const dist = Math.sqrt((n.x! - worldX) ** 2 + (n.y! - worldY) ** 2);
        return dist < hitRadius;
      });
      setHoveredNodeId(hitNode?.id || null);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    if (!didPan && hoveredNodeId()) {
      const id = hoveredNodeId()!;
      setSelectedNodeId(id);
      setShowDetailPanel(true);
      panToNode(id);
    }
  };

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!canvasRef) return;
    const rect = canvasRef.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.002);
    const newZoom = Math.min(Math.max(zoom() * factor, 0.01), 20);
    const dx = mx - rect.width / 2;
    const dy = my - rect.height / 2;
    const newOffsetX = dx - (dx - offset().x) * (newZoom / zoom());
    const newOffsetY = dy - (dy - offset().y) * (newZoom / zoom());
    setZoom(newZoom);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  const resetView = () => autoFitNodes(nodes());
  const refresh = () => fetchData(true);

  return (
    <div class="flex flex-col h-full w-full bg-graph text-native-primary overflow-hidden">
      <div class="flex-none bg-native-content/80 backdrop-blur-md border-b border-native">
        <ToolbarLayout class="justify-between">
          <div class="flex items-center gap-2">
            {/* Search */}
            <div class="relative flex items-center">
              <Input
                variant="search"
                placeholder={isSemantic() ? "Semantic search (AI)..." : "Search ID or Label..."}
                value={searchQuery()}
                onInput={(e) => {
                  setSearchQuery(e.currentTarget.value);
                  if (!isSemantic()) setSemanticResults([]);
                }}
                onKeyDown={(e) => e.key === "Enter" && isSemantic() && handleSemanticSearch()}
                class={`w-48 h-7 pr-8 transition-all ${isSemantic() ? "border-accent/50 bg-accent/5 shadow-[0_0_10px_rgba(59,130,246,0.1)]" : ""}`}
              />
              <button
                onClick={() => {
                  setIsSemantic(!isSemantic());
                  if (!isSemantic()) setSemanticResults([]);
                }}
                class={`absolute right-2 p-1 rounded transition-colors ${isSemantic() ? "text-accent hover:bg-accent/10" : "text-native-tertiary hover:bg-native-content/10"}`}
                title="Toggle Semantic Search (AI)"
              >
                <Sparkles size={12} class={isSemantic() ? "animate-pulse" : ""} />
              </button>
            </div>

            <div class="w-px h-3.5 bg-native-subtle mx-1" />

            <Button variant="toolbar" active={showIndexPanel()} onClick={() => setShowIndexPanel(!showIndexPanel())} class="flex items-center gap-1.5 h-7">
              <Sparkles size={12} class={showIndexPanel() ? "text-accent" : "text-native-tertiary"} />
              <span class="text-[11px] font-medium">Indices</span>
            </Button>

            <div class="w-px h-3.5 bg-native-subtle mx-1" />

            <Button variant="toolbar" active={showLabels()} onClick={() => setShowLabels(!showLabels())} class="flex items-center gap-1.5 h-7">
              <Layers size={12} class={showLabels() ? "text-accent" : "text-native-tertiary"} />
              <span class="text-[11px] font-medium">Show Labels</span>
            </Button>
          </div>

          <div class="flex items-center gap-2">
            <Button variant="toolbar" onClick={refresh} disabled={isLoading()} class="flex items-center gap-1.5 h-7 transition-all group active:scale-95">
              <RefreshCw size={12} class={`${isLoading() ? "animate-spin" : "group-hover:rotate-180"} transition-transform text-accent`} />
              <span class="text-[11px] font-medium">Refresh</span>
            </Button>

            <div class="w-px h-3.5 bg-native-subtle mx-1" />

            <Button variant="toolbar" onClick={resetView} class="flex items-center gap-1.5 h-7">
              <RotateCcw size={12} class="text-native-tertiary" />
              <span class="text-[11px] font-medium">Reset</span>
            </Button>

            <div class="w-px h-3.5 bg-native-subtle mx-1" />

            <button
              onClick={() => setShowDetailPanel(!showDetailPanel())}
              class="w-7 h-7 flex items-center justify-center rounded-md hover:bg-native-hover active:scale-95 transition-all outline-none group/detail"
              title={showDetailPanel() ? "Hide Details" : "Show Details"}
            >
              <ChevronRight size={16} class={`text-native-tertiary group-hover/detail:text-native-primary transition-all duration-300 ${showDetailPanel() ? "rotate-0" : "rotate-180"}`} />
            </button>
          </div>
        </ToolbarLayout>
      </div>

      <div class="flex-1 flex overflow-hidden relative">
        <Show
          when={props.isConnected}
          fallback={
            <div class="flex-1 flex items-center justify-center bg-native-content/50 z-10 backdrop-blur-sm">
              <EmptyState icon={Radio} title="Vector Space" description="Visualize and search high-dimensional vector embeddings in 2D space. Start by connecting to an instance.">
                <Button variant="primary" size="lg" onClick={props.onConnect}>
                  Connect Now
                </Button>
              </EmptyState>
            </div>
          }
        >
          <div class="flex-1 relative overflow-hidden bg-[#09090b]">
            <canvas
              ref={canvasRef}
              class="w-full h-full cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onWheel={handleWheel}
            />

            {/* Index Selection Panel - Legend style alignment with Graph.tsx */}
            <Show when={showIndexPanel()}>
              <div class="absolute top-4 left-4 z-40 w-56 bg-native-elevated/95 backdrop-blur-xl rounded-xl border border-native shadow-macos-lg flex flex-col max-h-[calc(100%-2rem)] overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-left-4">
                <div class="flex-none p-3 border-b border-native flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Sparkles size={14} class="text-accent" />
                    <span class="text-[12px] font-bold text-native-primary">Indices</span>
                  </div>
                  <button onClick={() => setShowIndexPanel(false)} class="p-1 hover:bg-native-content/10 rounded-md transition-colors text-native-tertiary hover:text-native-primary">
                    <X size={14} />
                  </button>
                </div>

                <div class="flex-1 overflow-y-auto p-2 space-y-0.5">
                  <For each={availableIndices()}>
                    {(index) => (
                      <div
                        class={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${selectedIndex() === index ? "bg-accent/10" : "hover:bg-native-content/5"}`}
                        onClick={() => setSelectedIndex(index)}
                      >
                        <div class="flex items-center gap-2.5 min-w-0">
                          <div class={`w-3 h-3 rounded-full flex-none shadow-sm ${selectedIndex() === index ? "bg-accent" : "bg-native-tertiary/20"}`} />
                          <span
                            class={`text-[11px] font-semibold truncate leading-tight ${selectedIndex() === index ? "text-native-primary" : "text-native-tertiary group-hover:text-native-secondary"}`}
                          >
                            {index}
                          </span>
                        </div>

                        <div class={`w-4 h-4 rounded border transition-all flex items-center justify-center ${selectedIndex() === index ? "border-accent bg-accent" : "border-native bg-transparent"}`}>
                          <Show when={selectedIndex() === index}>
                            <Check size={11} class="text-white" />
                          </Show>
                        </div>
                      </div>
                    )}
                  </For>
                </div>

                <div class="flex-none p-2 border-t border-native bg-native-content/5">
                  <div class="text-[9px] text-center text-native-quaternary font-medium tracking-wider">Select a vector record to visualize</div>
                </div>
              </div>
            </Show>

            <Show when={isLoading()}>
              <div class="absolute inset-0 flex items-center justify-center bg-[#09090b]/40 backdrop-blur-sm z-50 transition-all duration-300">
                <div class="flex flex-col items-center gap-3 animate-in zoom-in-95 duration-300">
                  <div class="relative">
                    <div class="w-10 h-10 rounded-full border-2 border-accent/20 border-t-accent animate-spin" />
                    <Sparkles size={16} class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-accent" />
                  </div>
                  <span class="text-[10px] font-bold tracking-[0.2em] text-native-tertiary animate-pulse">Normalizing Space</span>
                </div>
              </div>
            </Show>
          </div>

          <Show when={showDetailPanel()}>
            <div class="w-72 flex-none bg-native-sidebar-vibrant backdrop-blur-xl border-l border-native animate-in slide-in-from-right duration-300 flex flex-col shadow-macos-lg">
              <div class="flex-none p-3 border-b border-native flex items-center justify-between">
                <span class="text-[11px] font-bold text-native-primary tracking-tight">Properties</span>
              </div>

              <Show
                when={selectedNode()}
                fallback={
                  <div class="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
                    <div class="w-12 h-12 rounded-full bg-native-content/10 flex items-center justify-center mb-4 border border-native-subtle">
                      <Maximize size={24} class="text-native-tertiary" />
                    </div>
                    <div class="space-y-1">
                      <p class="text-[11px] text-native-primary font-bold tracking-tight">No Selection</p>
                      <p class="text-[10px] text-native-tertiary font-medium max-w-[140px] mx-auto leading-relaxed">Select a vector node in the space to inspect its rich metadata.</p>
                    </div>
                  </div>
                }
              >
                {(node) => (
                  <div class="flex-1 overflow-y-auto p-4 space-y-3">
                    <For each={Object.entries(node()).filter(([key]) => !["x", "y", "embedding", "color", "vector", "data"].includes(key))}>
                      {([key, value]) => (
                        <div class="flex flex-col gap-1 border-b border-native-subtle/20 pb-2 last:border-0 border-transparent hover:border-native-subtle transition-colors group">
                          <span class="text-[11px] font-bold text-native-tertiary tracking-wider group-hover:text-accent transition-colors">{key}</span>
                          <div class="text-[10px] text-native-primary font-medium break-all leading-normal py-1">
                            {typeof value === "object" && value !== null ? JSON.stringify(value) : String(value)}
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                )}
              </Show>
            </div>
          </Show>
        </Show>
      </div>

      <footer class="h-9 border-t border-native bg-native-content/50 backdrop-blur-md flex items-center justify-between px-5 flex-none select-none">
        <div class="flex items-center gap-3 text-[11px]">
          <Show when={props.isConnected}>
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1.5 font-semibold text-[11px]">
                <span class="text-native-primary tabular-nums">{nodes().length}</span>
                <span class="text-native-tertiary">vectors</span>
              </div>
            </div>
          </Show>
        </div>

        <div class="flex items-center gap-2">
          <Show when={selectedNodeId()}>
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/20">
              <span class="text-[11px] font-semibold text-blue-400 tracking-wide">Selected:</span>
              <span class="text-[11px] font-semibold text-blue-500">{selectedNodeId()}</span>
            </div>

            <div class="w-px h-3.5 bg-native-subtle mx-1" />

            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
              <Crosshair size={11} class="text-emerald-500" />
              <span class="text-[11px] font-semibold text-emerald-500 tabular-nums">{selectedNode()?.embedding?.length || 0}</span>
              <span class="text-[10px] text-emerald-400 font-medium">dims</span>
            </div>
          </Show>
        </div>
      </footer>
    </div>
  );
};
