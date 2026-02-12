import { createSignal, onMount, onCleanup, For, Show } from "solid-js";

interface SplashScreenProps {
  onComplete?: () => void;
  minDuration?: number;
}

interface CodeLine {
  keyword?: string;
  text: string;
  indent?: number;
}

interface CodeExample {
  title: string;
  code: CodeLine[];
  schema?: string;
}

// Dynamic code examples showcasing different HelixQL features
const CODE_EXAMPLES: CodeExample[] = [
  // CRUD Operations
  {
    title: "Creating Nodes",
    code: [
      { keyword: "QUERY", text: "CreateUser(name: String, email: String, active: Boolean) =>" },
      { text: "user <- Create<User> ({", indent: 1 },
      { text: "name: name,", indent: 3 },
      { text: "email: email,", indent: 3 },
      { text: "active: active,", indent: 3 },
      { text: "})" },
      { keyword: "RETURN", text: "user", indent: 1 },
    ],
    schema: "N::User { name: String, email: String, active: Boolean }",
  },
];

export const SplashScreen = (props: SplashScreenProps) => {
  const [loadingProgress, setLoadingProgress] = createSignal(0);
  const [showContent] = createSignal(true);
  const [active, setActive] = createSignal(true);

  // Select a random code example
  const selectedExample = CODE_EXAMPLES[Math.floor(Math.random() * CODE_EXAMPLES.length)];

  // Preloading status
  const [currentLoadingTask, setCurrentLoadingTask] = createSignal("Initializing...");

  onMount(async () => {
    // Show window after content is ready (prevents black flash)
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const appWindow = getCurrentWindow();
      await appWindow.show();
    } catch {
      // Not in Tauri environment (e.g., web dev mode)
    }

    // Define preloading tasks
    interface PreloadTask {
      name: string;
      description: string;
      weight: number;
      loader: () => Promise<void>;
    }

    const preloadTasks: PreloadTask[] = [
      {
        name: "theme",
        description: "Initializing theme system...",
        weight: 10,
        loader: async () => {
          // Theme is already imported in App.tsx, simulate delay
          await new Promise((resolve) => setTimeout(resolve, 100));
        },
      },
      {
        name: "components",
        description: "Loading core components...",
        weight: 40,
        loader: async () => {
          // Preload main components
          await Promise.all([
            import("./modeler").catch(() => {}),
            import("./schema").catch(() => {}),
            import("./queries").catch(() => {}),
            import("./graph").catch(() => {}),
            import("./hql").catch(() => {}),
          ]);
        },
      },
      {
        name: "stores",
        description: "Preparing data stores...",
        weight: 20,
        loader: async () => {
          await Promise.all([
            import("../stores/modeler").catch(() => {}),
            import("../stores/hql").catch(() => {}),
            import("../stores/workbench").catch(() => {}),
            import("../stores/connection").catch(() => {}),
          ]);
        },
      },
      {
        name: "utilities",
        description: "Loading utilities...",
        weight: 15,
        loader: async () => {
          await Promise.all([import("../lib/api").catch(() => {}), import("../lib/hql-formatter").catch(() => {}), import("../lib/hql-syntax").catch(() => {})]);
        },
      },
      {
        name: "finalize",
        description: "Finalizing setup...",
        weight: 15,
        loader: async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
        },
      },
    ];

    // Calculate total weight
    const totalWeight = preloadTasks.reduce((sum, task) => sum + task.weight, 0);
    let completedWeight = 0;

    // Execute preloading tasks sequentially for better UX
    for (const task of preloadTasks) {
      setCurrentLoadingTask(task.description);

      const endProgress = ((completedWeight + task.weight) / totalWeight) * 100;

      // Animate progress smoothly during task execution
      const progressInterval = setInterval(() => {
        setLoadingProgress((prev) => {
          const next = prev + 1;
          return next > endProgress ? endProgress : next;
        });
      }, 30);

      try {
        await task.loader();
      } catch (error) {
        console.warn(`Failed to preload ${task.name}:`, error);
      }

      clearInterval(progressInterval);
      completedWeight += task.weight;
      setLoadingProgress(endProgress);
    }

    // Ensure we reach 100%
    setLoadingProgress(100);
    setCurrentLoadingTask("Ready to explore");

    // Keyboard listener for Enter
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && loadingProgress() === 100) {
        handleEnter();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  const handleEnter = () => {
    setActive(false);
    setTimeout(() => {
      if (props.onComplete) {
        props.onComplete();
      }
    }, 500);
  };

  // Helper for random positions
  const getRandomPos = () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    duration: 8 + Math.random() * 10,
  });

  const particles = Array.from({ length: 5 }, (_) => getRandomPos());

  return (
    <div class="splash-screen fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden transition-opacity duration-500" style={{ opacity: active() ? 1 : 0 }}>
      {/* Background Grid */}
      <div class="absolute inset-0 splash-grid-overlay">
        <div class="absolute inset-0 splash-grid" />
      </div>

      {/* Dynamic Background Particles */}
      <Show when={showContent()}>
        <For each={particles}>
          {(p, i) => (
            <div
              class="absolute w-1 h-1 bg-orange-500 rounded-full opacity-30 animate-float-particle"
              style={{
                left: `${p.x}px`,
                top: `${p.y}px`,
                "animation-duration": `${p.duration}s`,
                "animation-delay": `${i() * 0.5}s`,
              }}
            />
          )}
        </For>
      </Show>

      {/* Main Content Container */}
      <div class="relative z-10 flex flex-col items-center gap-6">
        {/* Logo and Brand Region */}
        <div class="flex flex-col items-center gap-6  mb-4">
          {/* Brand Name */}
          <div
            class="flex flex-col items-center gap-1.5 transition-all duration-700 ease-out"
            style={{
              opacity: showContent() ? 1 : 0,
              transform: showContent() ? "translateY(0)" : "translateY(20px)",
              "transition-delay": "0.3s",
            }}
          >
            <h2 class="text-5xl font-light splash-title tracking-wider">HelixQL</h2>
            <p class="text-xs splash-subtitle tracking-widest uppercase opacity-70">Database Modeling & Query Tool</p>
          </div>
        </div>

        {/* Premium Code Snippet Card */}
        <div
          class="relative w-[640px] p-1 rounded-2xl transition-all duration-1000 ease-out"
          style={{
            opacity: showContent() ? 1 : 0,
            transform: showContent() ? "translateY(0)" : "translateY(40px)",
            "transition-delay": "0.5s",
          }}
        >
          {/* Card Glow Background */}
          <div class="absolute inset-0 bg-gradient-to-br from-orange-500/20 to-blue-500/20 blur-2xl opacity-50 animate-pulse-slow" />

          {/* Actual Card */}
          <div class="relative splash-code-card backdrop-blur-xl rounded-xl overflow-hidden shadow-2xl">
            {/* Window Header */}
            <div class="flex items-center justify-between px-4 py-3 splash-code-header">
              <div class="flex gap-1.5">
                <div class="w-2.5 h-2.5 rounded-full bg-red-500/60 transition-opacity hover:opacity-100" />
                <div class="w-2.5 h-2.5 rounded-full bg-amber-500/60 transition-opacity hover:opacity-100" />
                <div class="w-2.5 h-2.5 rounded-full bg-emerald-500/60 transition-opacity hover:opacity-100" />
              </div>
              <span class="text-[10px] font-medium splash-code-label uppercase tracking-widest">{selectedExample.title}</span>
            </div>

            {/* Code Content */}
            <div class="p-6 font-mono text-[13px] leading-relaxed select-none">
              <div class="space-y-1.5">
                <For each={selectedExample.code}>
                  {(line) => {
                    const paddingLeft = `${(line.indent || 0) * 4}ch`;

                    return (
                      <div class="flex" style={{ "padding-left": paddingLeft }}>
                        <Show when={line.keyword}>
                          <span
                            class="text-orange-500 flex-shrink-0 font-semibold"
                            classList={{
                              "w-[7.5ch]": line.keyword === "QUERY",
                              "w-[8.5ch]": line.keyword === "RETURN",
                            }}
                          >
                            {line.keyword}
                          </span>
                        </Show>
                        <span class="splash-code-text" classList={{ "pl-[8ch]": !line.keyword && (line.indent || 0) === 0 }}>
                          {/* Render text with syntax highlighting */}
                          <span
                            innerHTML={line.text
                              .replace(/\[F32\]|\[I32\]|String|Boolean|DateTime|Id|I32/g, '<span class="text-blue-400">$&</span>')
                              .replace(/=>/g, '<span class="text-orange-500">=&gt;</span>')
                              .replace(/<-/g, '<span class="text-orange-500">&lt;-</span>')
                              .replace(/(SearchV|Read|Traverse|Match|Count|Avg|Filter|Now)/g, '<span class="text-orange-500 font-semibold">$&</span>')
                              .replace(/<([A-Z][a-zA-Z]*)>/g, '&lt;<span class="text-blue-400">$1</span>&gt;')}
                          />
                        </span>
                      </div>
                    );
                  }}
                </For>
              </div>

              <Show when={selectedExample.schema}>
                <div class="mt-6 pt-5 splash-code-divider">
                  <div class="flex">
                    <span class="text-blue-400 flex-shrink-0 font-semibold w-[8ch] mr-[2ch]">{selectedExample.schema!.split(" ")[0]}</span>
                    <span class="splash-code-text">{selectedExample.schema!.substring(selectedExample.schema!.indexOf(" "))}</span>
                  </div>
                </div>
              </Show>
            </div>

            {/* Reflection Effect */}
            <div class="absolute inset-0 splash-reflection pointer-events-none" />
          </div>
        </div>

        {/* Progress Bar */}
        <div
          class="w-96 space-y-3 transition-all duration-500 mt-4"
          style={{
            opacity: showContent() ? 1 : 0,
            transform: showContent() ? "scale(1)" : "scale(0.9)",
            "transition-delay": "0.6s",
          }}
        >
          <div class="h-1.5 splash-progress-bg rounded-full overflow-hidden shadow-inner">
            <div
              class="h-full bg-gradient-to-r from-orange-600 to-orange-500 rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(234,88,12,0.5)]"
              style={{ width: `${loadingProgress()}%` }}
            />
          </div>

          <div class="flex items-center justify-between text-[11px] splash-subtitle font-medium tracking-tight px-1">
            <span class="transition-opacity duration-300">{currentLoadingTask()}</span>
            <span class="tabular-nums font-semibold splash-progress-number">{loadingProgress()}%</span>
          </div>
        </div>

        {/* Explore Button */}
        <div
          class="transition-all duration-1000 ease-out"
          style={{
            opacity: showContent() ? 1 : 0,
            transform: showContent() ? "translateY(0)" : "translateY(20px)",
            "transition-delay": "0.7s",
          }}
        >
          <button
            onClick={() => loadingProgress() === 100 && handleEnter()}
            class="group relative px-10 py-3 font-bold rounded-xl transition-all duration-300 shadow-xl overflow-hidden splash-explore-btn"
            classList={{
              "splash-explore-btn-active cursor-pointer hover:scale-105 active:scale-95": loadingProgress() === 100,
              "splash-explore-btn-disabled cursor-not-allowed opacity-60": loadingProgress() < 100,
            }}
          >
            {/* Shimmer Effect - Only visible at 100% */}
            <Show when={loadingProgress() === 100}>
              <div class="absolute inset-0 pointer-events-none">
                <div class="shimmer-line absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12" />
              </div>
            </Show>

            {/* Hover Glow Background */}
            <div
              class="absolute inset-0 transition-opacity duration-300 rounded-xl bg-orange-600/10 opacity-0 group-hover:opacity-100"
              style={{ display: loadingProgress() === 100 ? "block" : "none" }}
            />

            <span class="relative flex items-center gap-3 tracking-[0.08em] text-xs uppercase">
              <span
                class="transition-colors font-bold splash-explore-text"
                classList={{
                  "splash-explore-text-active": loadingProgress() === 100,
                  "splash-explore-text-disabled": loadingProgress() < 100,
                }}
              >
                Explore
              </span>

              <div class="relative w-5 h-5 flex items-center justify-center bg-orange-600 rounded-full transition-transform duration-300 group-hover:translate-x-1">
                {/* Pulse Glow for Icon */}
                <Show when={loadingProgress() === 100}>
                  <div class="absolute inset-0 bg-orange-500/30 rounded-full scale-100 group-hover:scale-150 transition-all duration-500 opacity-0 group-hover:opacity-100 pointer-events-none" />
                </Show>

                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="transition-all duration-300 text-white"
                  classList={{
                    "opacity-100": loadingProgress() === 100,
                    "opacity-40": loadingProgress() < 100,
                  }}
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </span>

            {/* Border Accent Hover */}
            <div
              class="absolute inset-0 border-2 border-orange-500/0 group-hover:border-orange-500/50 transition-all duration-300 rounded-xl pointer-events-none"
              style={{ display: loadingProgress() === 100 ? "block" : "none" }}
            />
          </button>
        </div>

        {/* Footer - Fixed at bottom */}
        <div
          class="flex items-center gap-2.5 text-xs transition-all duration-1000 -mt-4"
          style={{
            opacity: showContent() ? 0.5 : 0,
            "transition-delay": "0.9s",
          }}
        >
          <div class="w-3 h-3 border-2 rounded-full animate-spin splash-spinner" />
          <span class="splash-subtitle font-medium">Powered by HelixDB</span>
        </div>
      </div>

      <style>{`
        /* ========================================
           Splash Screen Theme-Aware Styles
           ======================================== */
        
        /* Background */
        .splash-screen {
          background-color: var(--bg-content);
        }

        /* Grid */
        .splash-grid-overlay {
          opacity: 0.08;
        }
        .splash-grid {
          background-image:
            linear-gradient(to right, var(--border-color) 1px, transparent 1px),
            linear-gradient(to bottom, var(--border-color) 1px, transparent 1px);
          background-size: 50px 50px;
        }

        /* Typography */
        .splash-title {
          color: var(--text-primary);
          text-shadow: 0 2px 10px rgba(234, 88, 12, 0.1);
        }
        .splash-subtitle {
          color: var(--text-secondary);
        }
        .splash-progress-number {
          color: var(--text-primary);
        }

        /* Code Card - Theme-aware with premium feel */
        .splash-code-card {
          background: rgba(13, 13, 13, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 
            0 25px 50px -12px rgba(0, 0, 0, 0.5),
            0 0 0 1px rgba(255, 255, 255, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.03);
        }
        .splash-code-header {
          background: rgba(255, 255, 255, 0.03);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .splash-code-label {
          color: #9ca3af;
          font-weight: 600;
        }
        .splash-code-text {
          color: #e5e7eb;
        }
        .splash-code-divider {
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
        .splash-reflection {
          background: linear-gradient(135deg, transparent 40%, rgba(255, 255, 255, 0.04) 50%, transparent 60%);
        }

        /* Light theme adjustments for code card container */
        @media (prefers-color-scheme: light) {
          .splash-code-card {
            box-shadow: 
              0 25px 50px -12px rgba(0, 0, 0, 0.25),
              0 0 0 1px rgba(0, 0, 0, 0.08),
              inset 0 1px 0 rgba(255, 255, 255, 0.1);
          }
        }

        /* Progress Bar */
        .splash-progress-bg {
          background-color: var(--border-subtle);
        }

        /* Explore Button */
        .splash-explore-btn {
          background-color: var(--bg-elevated);
          border: 1px solid var(--border-color);
          box-shadow: var(--shadow-md);
        }
        .splash-explore-btn-active:hover {
          box-shadow: 
            0 20px 25px -5px rgba(234, 88, 12, 0.1),
            0 10px 10px -5px rgba(234, 88, 12, 0.04),
            var(--shadow-md);
        }
        .splash-explore-btn-disabled {
          border: 1px solid var(--border-subtle);
        }
        .splash-explore-text-active {
          color: #ea580c; /* orange-600 */
        }
        .splash-explore-text-disabled {
          color: var(--text-quaternary);
        }

        /* Spinner */
        .splash-spinner {
          border-color: var(--text-tertiary);
          border-top-color: transparent;
        }

        /* ========================================
           Animations
           ======================================== */
        
        @keyframes float-particle {
          0%, 100% { transform: translate(0, 0); opacity: 0.1; }
          33% { transform: translate(100px, -50px); opacity: 0.3; }
          66% { transform: translate(-50px, 100px); opacity: 0.1; }
        }
        
        @keyframes pulse-glow {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.15); opacity: 0.6; }
        }

        @keyframes pulse-slow {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.3; }
        }
        
        .animate-float-particle {
          animation: float-particle linear infinite;
        }

        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }

        .shimmer-line {
          animation: shimmer 3.5s ease-in-out infinite;
          left: -100%;
        }

        @keyframes shimmer {
          0% { left: -100%; }
          25% { left: 100%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  );
};
