import { createSignal, createMemo, Show, Index, onCleanup } from "solid-js";
import { HelixApi } from "../lib/api";
import { reconcile } from "solid-js/store";
import { DraftingCompass, Share2, Database, Zap } from "lucide-solid";
import { ProEntityCard } from "./modeler/entity-card";
import { HqlCodeGen, EntityDef } from "../lib/codegen";
import { CodePanel } from "./modeler/code-panel";
import { ToolbarLayout } from "./ui/toolbar-layout";
import { EmptyState } from "./ui/empty-state";
import { Button } from "./ui/button";
import { modelerStore, setModelerStore } from "../stores/modeler";

interface ModelerProps {
  api: HelixApi;
  onExecute: (endpointName?: string, params?: Record<string, any>) => Promise<void>;
  isExecuting: boolean;
  isConnected: boolean;
  onConnect: () => void;
}

export const Modeler = (_props: ModelerProps) => {
  // Layout State
  const [isResizing, setIsResizing] = createSignal(false);

  const filteredNodes = createMemo(() => modelerStore.entities.filter((e) => e.kind === "Node"));
  const filteredEdges = createMemo(() => modelerStore.entities.filter((e) => e.kind === "Edge"));
  const filteredVectors = createMemo(() => modelerStore.entities.filter((e) => e.kind === "Vector"));

  const diagnostics = createMemo(() => HqlCodeGen.validate(modelerStore.entities));

  const nodeNames = createMemo(() => filteredNodes().map((e) => e.name));

  // Compilation State - Now using global modelerStore
  const handleCompile = async () => {
    setModelerStore({ isCompiling: true, lastError: null });

    // Artificial delay for UX feel
    await new Promise((r) => setTimeout(r, 400));

    try {
      // 1. Validate
      const errors = diagnostics().filter((d) => d.level === "error");
      if (errors.length > 0) {
        throw new Error(`${errors.length} error(s) found. Please fix highlighted fields.`);
      }

      // 2. Generate
      const s = HqlCodeGen.generateSchema(modelerStore.entities);
      const q = HqlCodeGen.generateQueries(modelerStore.entities, modelerStore.queryConfig);

      setModelerStore({
        schemaCode: s,
        queryCode: q,
        isDirty: false,
      });
    } catch (e: any) {
      setModelerStore("lastError", e.message);
    } finally {
      setModelerStore("isCompiling", false);
    }
  };

  const markDirty = () => setModelerStore("isDirty", true);

  const addEntity = (kind: "Node" | "Edge" | "Vector") => {
    markDirty();
    const id = Math.random().toString(36).substring(7);
    const newEntity: EntityDef = {
      id,
      name: `New${kind}`,
      kind,
      properties: [],
      from: kind === "Edge" ? nodeNames()[0] || "" : undefined,
      to: kind === "Edge" ? nodeNames()[0] || "" : undefined,
    };
    setModelerStore("entities", modelerStore.entities.length, newEntity);
  };

  const updateEntity = (id: string, updates: Partial<EntityDef> | ((prev: EntityDef) => Partial<EntityDef>)) => {
    markDirty();
    const index = modelerStore.entities.findIndex((e) => e.id === id);
    if (index !== -1) {
      const prev = modelerStore.entities[index];
      const up = typeof updates === "function" ? updates(prev) : updates;

      // Handle cascading rename for Nodes
      if (prev.kind === "Node" && up.name && up.name !== prev.name) {
        const oldName = prev.name;
        const newName = up.name;

        // Update all Edges referencing this Node
        modelerStore.entities.forEach((entity, idx) => {
          if (entity.kind === "Edge") {
            if (entity.from === oldName) {
              setModelerStore("entities", idx, "from", newName);
            }
            if (entity.to === oldName) {
              setModelerStore("entities", idx, "to", newName);
            }
          }
        });
      }

      setModelerStore("entities", index, up);
    }
  };

  const deleteEntity = (id: string) => {
    markDirty();
    setModelerStore("entities", reconcile(modelerStore.entities.filter((e) => e.id !== id)));
  };

  const applyTemplate = (type: string) => {
    let t: EntityDef[] = [];
    switch (type) {
      case "Social":
        t = [
          {
            id: "s1",
            name: "User",
            kind: "Node",
            properties: [
              { name: "name", type: "String", isIndex: true },
              { name: "age", type: "I32" },
            ],
          },
          {
            id: "s2",
            name: "Post",
            kind: "Node",
            properties: [
              { name: "content", type: "String" },
              { name: "likes", type: "I32" },
            ],
          },
          {
            id: "s3",
            name: "Follow",
            kind: "Edge",
            from: "User",
            to: "User",
            properties: [{ name: "since", type: "Date" }],
          },
          {
            id: "s4",
            name: "Created",
            kind: "Edge",
            from: "User",
            to: "Post",
            properties: [{ name: "at", type: "Date" }],
          },
          {
            id: "s5",
            name: "UserBio",
            kind: "Vector",
            properties: [{ name: "profile_embedding", type: "F32", isArray: true }],
            description: "Vector index for semantic user discovery",
          },
        ];
        break;
      case "Ecom":
        t = [
          {
            id: "e1",
            name: "Customer",
            kind: "Node",
            properties: [
              { name: "name", type: "String" },
              { name: "tier", type: "String" },
            ],
          },
          {
            id: "e2",
            name: "Product",
            kind: "Node",
            properties: [
              { name: "title", type: "String", isIndex: true },
              { name: "price", type: "F64" },
            ],
          },
          {
            id: "e3",
            name: "Category",
            kind: "Node",
            properties: [{ name: "name", type: "String", isUnique: true }],
          },
          {
            id: "e4",
            name: "Purchase",
            kind: "Edge",
            from: "Customer",
            to: "Product",
            properties: [{ name: "date", type: "Date" }],
          },
          {
            id: "e5",
            name: "BelongsTo",
            kind: "Edge",
            from: "Product",
            to: "Category",
            properties: [],
          },
          {
            id: "e6",
            name: "ProductDesc",
            kind: "Vector",
            properties: [{ name: "embedding", type: "F32", isArray: true }],
            description: "Semantic search for product recommendations",
          },
        ];
        break;
      case "Wiki":
        t = [
          {
            id: "1",
            name: "Concept",
            kind: "Node",
            properties: [{ name: "name", type: "String", isUnique: true }],
          },
          {
            id: "2",
            name: "RelatedTo",
            kind: "Edge",
            from: "Concept",
            to: "Concept",
            properties: [{ name: "weight", type: "F64" }],
          },
          {
            id: "3",
            name: "ConceptVector",
            kind: "Vector",
            properties: [{ name: "vec", type: "F32", isArray: true }],
            description: "Knowledge graph similarity index",
          },
        ];
        break;
    }
    setModelerStore("entities", reconcile(t));
    markDirty();
  };

  // Restore Resize Handler
  const startResizing = (e: MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = modelerStore.sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.min(Math.max(startWidth + deltaX, 300), 800);
      setModelerStore("sidebarWidth", newWidth);
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

  return (
    <div class="flex h-full bg-[var(--bg-content)] text-[var(--text-primary)] font-[system-ui] selection:bg-[var(--selected-bg)]" classList={{ "cursor-col-resize": isResizing() }}>
      {/* Left Column: Modeler */}
      <div class="flex-1 flex flex-col min-w-0">
        {/* macOS style toolbar */}
        <ToolbarLayout>
          <div class="flex items-center gap-2">
            {/* Primary Action Button */}
            <Button
              variant="toolbar"
              onMouseDown={(e) => {
                e.preventDefault();
                addEntity("Node");
              }}
              class="flex items-center gap-1.5 transition-all duration-75"
            >
              <DraftingCompass size={13} strokeWidth={2.5} class="text-accent" /> New Node
            </Button>

            {/* Secondary Action Button */}
            <Button
              variant="toolbar"
              onMouseDown={(e) => {
                e.preventDefault();
                addEntity("Edge");
              }}
              class="flex items-center gap-1.5 transition-all duration-75"
            >
              <Share2 size={13} strokeWidth={2.5} class="text-accent" /> New Edge
            </Button>

            {/* Vector Action Button */}
            <Button
              variant="toolbar"
              onMouseDown={(e) => {
                e.preventDefault();
                addEntity("Vector");
              }}
              class="flex items-center gap-1.5 transition-all duration-75"
            >
              <Zap size={13} strokeWidth={2.5} class="text-accent" /> New Vector
            </Button>
          </div>
        </ToolbarLayout>

        {/* Main content area */}
        <main class="flex-1 overflow-y-auto relative bg-[var(--bg-content)]">
          {/* Subtle grid pattern - much lighter */}
          <div class="absolute inset-0 opacity-[0.02] dark:opacity-[0.03] pointer-events-none" style="background-image: radial-gradient(#000 0.5px, transparent 0.5px); background-size: 24px 24px;" />

          <div class="max-w-6xl mx-auto px-6 pt-5 pb-24 relative z-10 space-y-8">
            <Show
              when={modelerStore.entities.length > 0}
              fallback={
                <div class="flex flex-col items-center">
                  <EmptyState icon={DraftingCompass} title="Empty Modeler" description="Start building your graph schema by adding nodes, edges, or vectors from the toolbar." class="mt-20" />
                  <div class="mt-12 flex flex-col items-center gap-6">
                    <span class="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-widest opacity-60">Quick Start Templates</span>
                    <div class="flex gap-4">
                      <button
                        onClick={() => applyTemplate("Social")}
                        class="group flex flex-col items-center gap-3 p-4 rounded-[1.25rem] bg-native-sidebar/40 border border-native hover:border-blue-500/30 hover:bg-blue-500/[0.04] transition-all duration-300 w-36 text-center shadow-sm hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-1"
                      >
                        <div class="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:bg-blue-500/20 group-hover:scale-110 transition-all duration-300">
                          <Share2 size={20} />
                        </div>
                        <div class="flex flex-col gap-0.5">
                          <span class="text-[13px] font-semibold text-native-primary">Social Network</span>
                          <span class="text-[10px] text-native-tertiary font-medium">Nodes & Edges</span>
                        </div>
                      </button>

                      <button
                        onClick={() => applyTemplate("Ecom")}
                        class="group flex flex-col items-center gap-3 p-4 rounded-[1.25rem] bg-native-sidebar/40 border border-native hover:border-orange-500/30 hover:bg-orange-500/[0.04] transition-all duration-300 w-36 text-center shadow-sm hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-1"
                      >
                        <div class="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500 group-hover:bg-orange-500/20 group-hover:scale-110 transition-all duration-300">
                          <Database size={20} />
                        </div>
                        <div class="flex flex-col gap-0.5">
                          <span class="text-[13px] font-semibold text-native-primary">E-commerce</span>
                          <span class="text-[10px] text-native-tertiary font-medium">Orders & Logistics</span>
                        </div>
                      </button>

                      <button
                        onClick={() => applyTemplate("Wiki")}
                        class="group flex flex-col items-center gap-3 p-4 rounded-[1.25rem] bg-native-sidebar/40 border border-native hover:border-purple-500/30 hover:bg-purple-500/[0.04] transition-all duration-300 w-36 text-center shadow-sm hover:shadow-xl hover:shadow-purple-500/10 hover:-translate-y-1"
                      >
                        <div class="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500 group-hover:bg-purple-500/20 group-hover:scale-110 transition-all duration-300">
                          <Zap size={20} />
                        </div>
                        <div class="flex flex-col gap-0.5">
                          <span class="text-[13px] font-semibold text-native-primary">Knowledge Graph</span>
                          <span class="text-[10px] text-native-tertiary font-medium">Concepts & Logic</span>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              }
            >
              {/* Nodes Section */}
              <section class="space-y-4">
                <div class="flex items-center gap-2 px-1">
                  <Database size={14} class="text-[var(--text-tertiary)]" strokeWidth={2} />
                  <h3 class="text-[12px] font-semibold text-[var(--text-secondary)]">Nodes</h3>
                  <div class="flex-1 h-px bg-[var(--border-subtle)] ml-2" />
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Index each={filteredNodes()}>
                    {(entity) => (
                      <ProEntityCard entity={entity()} onUpdate={updateEntity} onDelete={deleteEntity} nodeNames={nodeNames()} diagnostics={diagnostics().filter((d) => d.entityId === entity().id)} />
                    )}
                  </Index>
                </div>
              </section>

              {/* Edges Section */}
              <Show when={filteredEdges().length > 0}>
                <section class="space-y-4">
                  <div class="flex items-center gap-2 px-1">
                    <Share2 size={14} class="text-[var(--text-tertiary)]" strokeWidth={2} />
                    <h3 class="text-[12px] font-semibold text-[var(--text-secondary)]">Edges</h3>
                    <div class="flex-1 h-px bg-[var(--border-subtle)] ml-2" />
                  </div>
                  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Index each={filteredEdges()}>
                      {(entity) => (
                        <ProEntityCard
                          entity={entity()}
                          onUpdate={updateEntity}
                          onDelete={deleteEntity}
                          nodeNames={nodeNames()}
                          diagnostics={diagnostics().filter((d) => d.entityId === entity().id)}
                        />
                      )}
                    </Index>
                  </div>
                </section>
              </Show>

              {/* Vectors Section */}
              <Show when={filteredVectors().length > 0}>
                <section class="space-y-4">
                  <div class="flex items-center gap-2 px-1">
                    <Zap size={14} class="text-[var(--text-tertiary)]" strokeWidth={2} />
                    <h3 class="text-[12px] font-semibold text-[var(--text-secondary)]">Vectors</h3>
                    <div class="flex-1 h-px bg-[var(--border-subtle)] ml-2" />
                  </div>
                  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Index each={filteredVectors()}>
                      {(entity) => (
                        <ProEntityCard
                          entity={entity()}
                          onUpdate={updateEntity}
                          onDelete={deleteEntity}
                          nodeNames={nodeNames()}
                          diagnostics={diagnostics().filter((d) => d.entityId === entity().id)}
                        />
                      )}
                    </Index>
                  </div>
                </section>
              </Show>
            </Show>
          </div>
        </main>
      </div>

      {/* Resize Handle - macOS style */}
      <div class="w-px h-full flex-none relative group z-50 bg-[var(--border-subtle)]" onMouseDown={startResizing}>
        <div
          class="absolute inset-y-0 w-[3px] -left-[1px] cursor-col-resize hover:bg-[#007AFF]/10 dark:hover:bg-[#0A84FF]/10 transition-colors"
          classList={{ "bg-[#007AFF]/20 dark:bg-[#0A84FF]/20": isResizing() }}
        />
      </div>

      <div style={{ width: `${modelerStore.sidebarWidth}px` }}>
        <CodePanel
          schemaCode={modelerStore.schemaCode}
          queryCode={modelerStore.queryCode}
          isDirty={modelerStore.isDirty}
          isCompiling={modelerStore.isCompiling}
          lastError={modelerStore.lastError}
          onCompile={handleCompile}
          config={modelerStore.queryConfig}
          onConfigChange={(newConfig) => {
            setModelerStore("queryConfig", newConfig);
            markDirty();
          }}
          activeTab={modelerStore.activeTab}
          onTabChange={(tab) => setModelerStore("activeTab", tab)}
        />
      </div>
    </div>
  );
};
