import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { TopNav } from "./components/layout/top-nav";
import { Modeler } from "./components/modeler";
import { SplashScreen } from "./components/splash";
import { Schema } from "./components/schema";
import { Queries } from "./components/queries";
import { Graph } from "./components/graph";
import { HQL } from "./components/hql";
import { ThemeSettings, initTheme } from "./components/ui/theme";
import { Connection } from "./components/connection";
import { createConnection } from "./hooks/connection";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { Vectors } from "./components/vectors";
import { EmptyState } from "./components/ui/empty-state";
import { Button } from "./components/ui/button";
import { CircleAlert, Database, Network, Zap, SquareCode, VectorSquare } from "lucide-solid";

function App() {
  const connection = createConnection();

  const [showSplash, setShowSplash] = createSignal(true);

  const [currentView, setCurrentView] = createSignal("hql");
  const [isExecuting, setIsExecuting] = createSignal(false);
  const [wbExecute, setWbExecute] = createSignal<(() => Promise<void>) | undefined>();

  const [showThemeSettings, setShowThemeSettings] = createSignal(false);

  const [showExitModal, setShowExitModal] = createSignal(false);
  let allowedToClose = false;

  let unlistenSettings: UnlistenFn | undefined;
  let unlistenClose: UnlistenFn | undefined;

  onMount(async () => {
    initTheme();

    unlistenSettings = await listen("open-settings", () => {
      setShowThemeSettings(true);
    });
    try {
      const appWindow = getCurrentWindow();
      unlistenClose = await appWindow.onCloseRequested(async (event) => {
        if (!allowedToClose) {
          event.preventDefault();
          setShowExitModal(true);
        }
      });
    } catch (e) {
      console.warn("Failed to set exit listener", e);
    }
  });

  onCleanup(() => {
    if (unlistenSettings) unlistenSettings();
    if (unlistenClose) unlistenClose();
  });

  const handleFinalExit = async () => {
    try {
      await invoke("terminate_app");
    } catch (e) {
      console.error("Failed to terminate app", e);
      const appWindow = getCurrentWindow();
      await appWindow.destroy();
    }
  };

  const executeQuery = async (_endpointName?: string, _params?: Record<string, any>) => {
    if (!connection.isConnected()) {
      connection.openSettings();
      return;
    }

    setIsExecuting(true);

    try {
      if (currentView() === "queries") {
        const executeFn = wbExecute();
        if (executeFn) {
          await executeFn();
        }
      }
    } catch (error) {
      console.error("Query Error:", error);
      alert("Execution Failed: " + String(error));
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <>
      <Show when={showSplash()}>
        <SplashScreen onComplete={() => setShowSplash(false)} minDuration={2200} />
      </Show>
      <Show when={showExitModal()}>
        <div class="fixed inset-0 bg-black/40 backdrop-blur-sm z-[20000] flex items-center justify-center animate-in fade-in duration-200">
          <div class="w-[320px] bg-native-elevated border border-native rounded-2xl shadow-macos-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div class="p-6 text-center">
              <div class="w-14 h-14 bg-amber-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
                <CircleAlert size={28} class="text-amber-500" />
              </div>
              <h3 class="text-base font-bold text-native-primary mb-2">Are you sure you want to exit?</h3>
              <p class="text-[13px] text-native-tertiary leading-relaxed mb-6">All unsaved model designs and HQL queries in memory will be lost.</p>

              <div class="grid grid-cols-2 gap-3">
                <Button variant="default" onClick={() => setShowExitModal(false)} class="h-9 font-semibold">
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleFinalExit} class="h-9 font-semibold">
                  Exit Anyway
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Show>

      <div class="h-screen flex flex-col overflow-hidden bg-transparent">
        <TopNav activeView={currentView()} onSelectView={setCurrentView} isConnected={connection.isConnected()} onOpenSettings={connection.openSettings} />

        <main class="flex-1 flex flex-col overflow-hidden bg-native-content relative">
          <div class="flex-1 overflow-hidden flex flex-col relative">
            <div class="flex-1 flex flex-col overflow-hidden" classList={{ hidden: currentView() !== "editor", "view-enter": currentView() === "editor" }}>
              <Modeler api={connection.apiClient()} onExecute={executeQuery} isExecuting={isExecuting()} isConnected={connection.isConnected()} onConnect={connection.openSettings} />
            </div>

            <div class="flex-1 flex flex-col overflow-hidden" classList={{ hidden: currentView() !== "schema", "view-enter": currentView() === "schema" }}>
              <Schema api={connection.apiClient()} isConnected={connection.isConnected()} onConnect={connection.openSettings} />
            </div>

            <div class="flex-1 flex flex-col overflow-hidden" classList={{ hidden: currentView() !== "queries", "view-enter": currentView() === "queries" }}>
              <Queries
                api={connection.apiClient()}
                isExecuting={isExecuting()}
                onRegisterExecute={(fn) => setWbExecute(() => fn)}
                isConnected={connection.isConnected()}
                onConnect={connection.openSettings}
              />
            </div>

            <Show when={currentView() === "graph"}>
              <div class="flex-1 flex flex-col overflow-hidden view-enter">
                <Graph api={connection.apiClient()} isConnected={connection.isConnected()} onConnect={connection.openSettings} />
              </div>
            </Show>

            <div class="flex-1 flex flex-col overflow-hidden" classList={{ hidden: currentView() !== "hql", "view-enter": currentView() === "hql" }}>
              <HQL isConnected={connection.isConnected()} onConnect={connection.openSettings} />
            </div>

            <Show when={currentView() === "vectors"}>
              <div class="flex-1 flex flex-col overflow-hidden view-enter">
                <Vectors api={connection.apiClient()} isConnected={connection.isConnected()} onConnect={connection.openSettings} />
              </div>
            </Show>
          </div>

          <Show when={!connection.isConnected() && ["schema", "queries", "graph", "hql", "vectors"].includes(currentView())}>
            <div class="absolute inset-0 flex items-center justify-center bg-native-content z-[100]">
              <Show when={currentView() === "schema"}>
                <EmptyState icon={Database} title="Database Schema" description="Connect to your HelixDB instance to explore schema structure.">
                  <Button variant="primary" size="lg" onClick={connection.openSettings}>
                    Connect Now
                  </Button>
                </EmptyState>
              </Show>
              <Show when={currentView() === "queries"}>
                <EmptyState icon={Zap} title="Queries Workbench" description="Connect to see and execute your specific database queries.">
                  <Button variant="primary" size="lg" onClick={connection.openSettings}>
                    Connect Now
                  </Button>
                </EmptyState>
              </Show>
              <Show when={currentView() === "graph"}>
                <EmptyState icon={Network} title="Graph Explorer" description="Visualize your database as an interactive network. Start by connecting to an instance.">
                  <Button variant="primary" size="lg" onClick={connection.openSettings}>
                    Connect Now
                  </Button>
                </EmptyState>
              </Show>
              <Show when={currentView() === "hql"}>
                <EmptyState icon={SquareCode} title="HQL Editor" description="Write and execute Helix Query Language statements against your database.">
                  <Button variant="primary" size="lg" onClick={connection.openSettings}>
                    Connect Now
                  </Button>
                </EmptyState>
              </Show>
              <Show when={currentView() === "vectors"}>
                <EmptyState icon={VectorSquare} title="Vector Space" description="Visualize and search high-dimensional vector embeddings in 2D space.">
                  <Button variant="primary" size="lg" onClick={connection.openSettings}>
                    Connect Now
                  </Button>
                </EmptyState>
              </Show>
            </div>
          </Show>
        </main>

        <Connection
          isOpen={connection.showSettings()}
          isConnected={connection.isConnected()}
          isConnecting={connection.isConnecting()}
          error={connection.error()}
          onConnect={connection.handleConnect}
          onDisconnect={connection.disconnect}
          onTest={connection.testConnection}
          onEditingIdChange={() => connection.setError(null)}
          onCancel={connection.closeSettings}
        />

        <ThemeSettings isOpen={showThemeSettings()} onClose={() => setShowThemeSettings(false)} />
      </div>
    </>
  );
}

export default App;
