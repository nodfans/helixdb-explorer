import { createSignal, onMount, onCleanup, For, Show } from "solid-js";

interface SplashScreenProps {
  onComplete?: () => void;
  minDuration?: number;
}

export const SplashScreen = (props: SplashScreenProps) => {
  const [loadingProgress, setLoadingProgress] = createSignal(0);
  const [active, setActive] = createSignal(true);
  const [phase, setPhase] = createSignal<"loading" | "ready">("loading");
  const [visibleLines, setVisibleLines] = createSignal(0);
  const [currentLoadingTask, setCurrentLoadingTask] = createSignal("Initializing");

  // Code lines for typewriter effect
  const codeLines = [
    {
      tokens: [
        { text: "QUERY", type: "keyword" },
        { text: " CreateUser (", type: "default" },
        { text: "name: String", type: "type" },
        { text: ", ", type: "default" },
        { text: "age: U8", type: "type" },
        { text: ", ", type: "default" },
        { text: "email: String", type: "type" },
        { text: ") ", type: "default" },
        { text: "=>", type: "operator" },
      ],
    },
    {
      tokens: [
        { text: "    user ", type: "default" },
        { text: "<-", type: "operator" },
        { text: " AddN", type: "fn" },
        { text: "<", type: "default" },
        { text: "User", type: "type" },
        { text: ">({", type: "default" },
      ],
    },
    {
      tokens: [
        { text: "        name: ", type: "default" },
        { text: "name", type: "param" },
        { text: ",", type: "default" },
      ],
    },
    {
      tokens: [
        { text: "        age: ", type: "default" },
        { text: "age", type: "param" },
        { text: ",", type: "default" },
      ],
    },
    {
      tokens: [
        { text: "        email: ", type: "default" },
        { text: "email", type: "param" },
      ],
    },
    { tokens: [{ text: "    })", type: "default" }] },
    { tokens: [] },
    {
      tokens: [
        { text: "    ", type: "default" },
        { text: "RETURN", type: "keyword" },
        { text: " user", type: "default" },
      ],
    },
  ];

  onMount(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().show();
    } catch {}

    // Typewriter: reveal lines progressively
    const lineInterval = setInterval(() => {
      setVisibleLines((v) => {
        if (v >= codeLines.length) {
          clearInterval(lineInterval);
          return v;
        }
        return v + 1;
      });
    }, 280);

    // Preload tasks
    const tasks = [
      { desc: "Loading modules", weight: 40, fn: () => Promise.all([import("./modeler"), import("./schema"), import("./queries"), import("./graph"), import("./hql")].map((p) => p.catch(() => {}))) },
      {
        desc: "Preparing stores",
        weight: 30,
        fn: () => Promise.all([import("../stores/modeler"), import("../stores/hql"), import("../stores/workbench"), import("../stores/connection")].map((p) => p.catch(() => {}))),
      },
      { desc: "Finalizing", weight: 30, fn: () => new Promise<void>((r) => setTimeout(r, 400)) },
    ];

    const total = tasks.reduce((s, t) => s + t.weight, 0);
    let done = 0;

    for (const task of tasks) {
      setCurrentLoadingTask(task.desc);
      const end = ((done + task.weight) / total) * 100;
      const iv = setInterval(() => setLoadingProgress((p) => Math.min(p + 0.8, end)), 16);
      try {
        await task.fn();
      } catch {}
      clearInterval(iv);
      done += task.weight;
      setLoadingProgress(end);
    }

    setLoadingProgress(100);
    setPhase("ready");

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && phase() === "ready") exit();
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  const exit = () => {
    setActive(false);
    setTimeout(() => props.onComplete?.(), 700);
  };

  return (
    <div class="splash-root" classList={{ "splash-exit": !active() }}>
      {/* Deep Obsidian ambient glow */}
      <div class="splash-orb splash-eclipse" />

      {/* Noise texture overlay */}
      <div class="splash-noise" />

      {/* Content */}
      <div class="splash-content">
        {/* Brand */}
        <div class="splash-brand splash-fade-in" style={{ "--delay": "0.1s" } as any}>
          <div class="splash-helix-icon">
            <svg viewBox="0 0 40 40" fill="none">
              <path d="M12 6c0 0 4 6 8 14s8 14 8 14" stroke="url(#g1)" stroke-width="2" stroke-linecap="round" />
              <path d="M28 6c0 0-4 6-8 14s-8 14-8 14" stroke="url(#g2)" stroke-width="2" stroke-linecap="round" />
              {/* Refined Bronze rungs */}
              <line x1="14" y1="13" x2="26" y2="13" stroke="rgba(255,160,10,0.15)" stroke-width="1" />
              <line x1="13" y1="20" x2="27" y2="20" stroke="rgba(255,160,10,0.15)" stroke-width="1" />
              <line x1="14" y1="27" x2="26" y2="27" stroke="rgba(255,160,10,0.15)" stroke-width="1" />
              <defs>
                <linearGradient id="g1" x1="12" y1="6" x2="28" y2="34" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#ff9f0a" />
                  <stop offset="1" stop-color="#644822" />
                </linearGradient>
                <linearGradient id="g2" x1="28" y1="6" x2="12" y2="34" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#ffcc00" />
                  <stop offset="1" stop-color="#332211" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div class="splash-brand-text">
            <span class="splash-brand-helix">Helix</span>
            <span class="splash-brand-db">DB</span>
          </div>
          <span class="splash-brand-sub">Intelligent Explorer</span>
        </div>

        {/* Code block with Obsidian theme */}
        <div class="splash-code splash-fade-in" style={{ "--delay": "0.4s" } as any}>
          <For each={codeLines}>
            {(line, i) => (
              <div class="splash-code-line" classList={{ "splash-code-line-visible": i() < visibleLines() }} style={{ "--line-delay": `${i() * 0.08}s` } as any}>
                <For each={line.tokens}>{(token) => <span class={`splash-token-${token.type}`}>{token.text}</span>}</For>
              </div>
            )}
          </For>
          <div class="splash-cursor" classList={{ "splash-cursor-hidden": visibleLines() >= codeLines.length }} />
        </div>

        {/* Progress region */}
        <div class="splash-progress-region splash-fade-in" style={{ "--delay": "0.6s" } as any}>
          <div class="splash-progress-track">
            <div class="splash-progress-fill" style={{ width: `${loadingProgress()}%` }} />
          </div>

          <Show
            when={phase() === "ready"}
            fallback={
              <div class="splash-status">
                <div class="splash-status-dot" />
                <span>{currentLoadingTask()}</span>
              </div>
            }
          >
            <button class="splash-enter-btn" onClick={exit}>
              <span class="splash-enter-text">Press Enter</span>
              <div class="splash-enter-ring">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </div>
            </button>
          </Show>
        </div>
      </div>

      <style>{`
        /* ===== Root - Obsidian Core ===== */
        .splash-root {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          background: #111111; /* Aligned with --graph-bg and --bg-content */
          overflow: hidden;
          transition: opacity 0.7s cubic-bezier(0.4, 0, 0, 1),
                      transform 0.7s cubic-bezier(0.4, 0, 0, 1),
                      filter 0.7s cubic-bezier(0.4, 0, 0, 1);
        }
        .splash-exit {
          opacity: 0;
          transform: translateY(-20px);
          filter: blur(20px) contrast(1.2);
        }

        /* ===== Ambient Glow ===== */
        .splash-orb {
          position: absolute; pointer-events: none;
          will-change: transform, opacity;
        }
        .splash-eclipse {
          width: 800px; height: 600px;
          background: radial-gradient(ellipse at center, rgba(255, 159, 10, 0.04) 0%, transparent 60%);
          bottom: -100px; left: 50%;
          transform: translateX(-50%);
          filter: blur(120px);
          animation: eclipse-pulse 10s ease-in-out infinite;
        }
        @keyframes eclipse-pulse {
          0%, 100% { opacity: 0.4; transform: translateX(-50%) translateY(0) scale(1.1); }
          50% { opacity: 0.8; transform: translateX(-50%) translateY(-30px) scale(0.9); }
        }

        /* ===== Noise ===== */
        .splash-noise {
          position: absolute; inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          opacity: 0.04;
          mix-blend-mode: soft-light;
          pointer-events: none;
        }

        /* ===== Content ===== */
        .splash-content {
          position: relative; z-index: 10;
          display: flex; flex-direction: column; align-items: center;
          gap: 54px;
          max-width: 580px; width: 100%;
        }

        /* ===== Fade-in utility ===== */
        .splash-fade-in {
          opacity: 0;
          transform: translateY(12px);
          animation: splash-reveal 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          animation-delay: var(--delay, 0s);
        }
        @keyframes splash-reveal {
          to { opacity: 1; transform: translateY(0); }
        }

        /* ===== Brand ===== */
        .splash-brand {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
        }
        .splash-helix-icon {
          width: 52px; height: 52px;
          margin-bottom: 12px;
          animation: helix-float 8s ease-in-out infinite;
        }
        @keyframes helix-float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-8px) rotate(5deg); }
        }
        .splash-brand-text {
          display: flex; align-items: baseline; gap: 2px;
          font-size: 48px; font-weight: 200;
          letter-spacing: 0.18em;
          color: #ffffff;
        }
        .splash-brand-db {
          font-weight: 700;
          color: #ff9f0a; /* --color-orange */
          text-shadow: 0 0 30px rgba(255, 159, 10, 0.3);
        }
        .splash-brand-sub {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.6em;
          color: rgba(255, 255, 255, 0.25);
          font-weight: 600;
        }

        /* ===== Code Block - Obsidian Glass ===== */
        .splash-code {
          width: 100%;
          padding: 32px 40px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.015);
          border: 1px solid rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(60px);
          font-family: var(--font-mono);
          font-size: 13px;
          line-height: 2;
          position: relative;
        }
        .splash-code::after {
          content: '';
          position: absolute; inset: 0;
          border-radius: 20px;
          box-shadow: inset 0 0 100px rgba(0,0,0,0.4);
          pointer-events: none;
        }
        .splash-code-line {
          opacity: 0;
          transform: translateX(-8px);
          transition: opacity 0.5s ease, transform 0.5s ease;
          transition-delay: var(--line-delay, 0s);
          white-space: pre;
        }
        .splash-code-line-visible {
          opacity: 1;
          transform: translateX(0);
        }
        .splash-cursor {
          display: inline-block;
          width: 1.5px; height: 1.4em;
          background: #ff9f0a;
          margin-left: 2px;
          animation: cursor-blink 1s step-end infinite;
          vertical-align: middle;
          box-shadow: 0 0 8px #ff9f0a;
        }
        .splash-cursor-hidden { opacity: 0; }
        @keyframes cursor-blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }

        /* Token colors - Monokai-ish but Obsidian flavored */
        .splash-token-keyword { color: #ff9f0a; font-weight: 700; }
        .splash-token-type { color: #60a5fa; }
        .splash-token-operator { color: #f59e0b; opacity: 0.9; }
        .splash-token-fn { color: #ffffff; font-weight: 600; }
        .splash-token-param { color: rgba(255, 255, 255, 0.5); }
        .splash-token-default { color: rgba(255, 255, 255, 0.4); }

        /* ===== Progress ===== */
        .splash-progress-region {
          display: flex; flex-direction: column; align-items: center;
          gap: 24px; width: 280px;
        }
        .splash-progress-track {
          width: 100%; height: 1px;
          background: rgba(255, 255, 255, 0.05);
          overflow: hidden;
          position: relative;
        }
        .splash-progress-fill {
          position: absolute; top: 0; left: 0; height: 100%;
          background: #ff9f0a;
          box-shadow: 0 0 20px rgba(255, 159, 10, 0.4);
          transition: width 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .splash-status {
          display: flex; align-items: center; gap: 10px;
          opacity: 0.4;
        }
        .splash-status-dot {
          width: 4px; height: 4px;
          border-radius: 50%;
          background: #ff9f0a;
          box-shadow: 0 0 8px #ff9f0a;
          animation: status-pulse 2s ease-in-out infinite;
        }
        @keyframes status-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        .splash-status span {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.35em;
          color: rgba(255, 255, 255, 0.6);
          font-weight: 600;
        }

        /* ===== Enter Button ===== */
        .splash-enter-btn {
          display: flex; align-items: center; gap: 14px;
          background: none; border: none;
          cursor: pointer;
          transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          animation: splash-reveal 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .splash-enter-btn:hover { transform: scale(1.08); }
        .splash-enter-text {
          font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.5em; color: rgba(255, 255, 255, 0.3);
          font-weight: 700; transition: color 0.3s;
        }
        .splash-enter-btn:hover .splash-enter-text { color: #ffffff; }
        .splash-enter-ring {
          width: 36px; height: 36px;
          border-radius: 50%;
          border: 1px solid rgba(255, 159, 10, 0.1);
          display: flex; align-items: center; justify-content: center;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .splash-enter-btn:hover .splash-enter-ring {
          border-color: #ff9f0a;
          background: rgba(255, 159, 10, 0.05);
          box-shadow: 0 0 20px rgba(255, 159, 10, 0.15);
        }
        .splash-enter-ring svg {
          width: 14px; height: 14px;
          color: rgba(255, 255, 255, 0.4);
          transition: all 0.3s;
        }
        .splash-enter-btn:hover .splash-enter-ring svg {
          color: #ff9f0a;
          transform: translateX(2px);
        }
      `}</style>
    </div>
  );
};
