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
  const [appVersion, setAppVersion] = createSignal("");

  // Code lines for typewriter effect
  const codeLines = [
    {
      tokens: [
        { text: "QUERY", type: "keyword" },
        { text: " CreateUser ", type: "default" },
        { text: "(", type: "punc" },
        { text: "name", type: "param" },
        { text: ": ", type: "default" },
        { text: "String", type: "type" },
        { text: ", ", type: "punc" },
        { text: "age", type: "param" },
        { text: ": ", type: "default" },
        { text: "U8", type: "type" },
        { text: ", ", type: "punc" },
        { text: "active", type: "param" },
        { text: ": ", type: "default" },
        { text: "Boolean", type: "type" },
        { text: ") ", type: "punc" },
        { text: "=>", type: "operator" },
      ],
    },
    {
      tokens: [
        { text: "    user ", type: "default" },
        { text: "<-", type: "operator" },
        { text: " AddN", type: "fn" },
        { text: "<", type: "punc" },
        { text: "User", type: "type" },
        { text: ">({", type: "punc" },
      ],
    },
    {
      tokens: [
        { text: "      name", type: "param" },
        { text: ": ", type: "default" },
        { text: "name", type: "default" },
        { text: ",", type: "punc" },
      ],
    },
    {
      tokens: [
        { text: "      age", type: "param" },
        { text: ": ", type: "default" },
        { text: "age", type: "default" },
        { text: ",", type: "punc" },
      ],
    },
    {
      tokens: [
        { text: "      active", type: "param" },
        { text: ": ", type: "default" },
        { text: "active", type: "default" },
      ],
    },
    { tokens: [{ text: "    })", type: "punc" }] },
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

    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      setAppVersion(await getVersion());
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
      {/* Gradient background layers */}
      <div class="splash-bg-base" />
      <div class="splash-bg-glow" />
      <div class="splash-noise" />

      {/* Content */}
      <div class="splash-content">
        {/* Brand */}
        <div class="splash-brand splash-fade-in" style={{ "--delay": "0.1s" } as any}>
          <div class="splash-helix-icon">
            <svg viewBox="0 0 40 40" fill="none">
              <path d="M12 6c0 0 4 6 8 14s8 14 8 14" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" opacity="0.85" />
              <path d="M28 6c0 0-4 6-8 14s-8 14-8 14" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" opacity="0.5" />
              <line x1="14" y1="13" x2="26" y2="13" stroke="var(--accent)" stroke-width="1" opacity="0.12" />
              <line x1="13" y1="20" x2="27" y2="20" stroke="var(--accent)" stroke-width="1" opacity="0.12" />
              <line x1="14" y1="27" x2="26" y2="27" stroke="var(--accent)" stroke-width="1" opacity="0.12" />
            </svg>
          </div>
          <div class="splash-brand-text">
            <span class="splash-brand-helix">Helix</span>
            <span class="splash-brand-db">DB</span>
          </div>
          <span class="splash-brand-sub">Intelligent Explorer</span>
          <span class="splash-brand-version">v{appVersion()}</span>
        </div>

        {/* macOS Editor Window */}
        <div class="splash-window splash-fade-in" style={{ "--delay": "0.35s" } as any}>
          {/* Title bar */}
          <div class="splash-titlebar">
            <div class="splash-traffic-lights">
              <span class="splash-dot splash-dot-red" />
              <span class="splash-dot splash-dot-yellow" />
              <span class="splash-dot splash-dot-green" />
            </div>
            <span class="splash-titlebar-text">query.hql</span>
            <div class="splash-titlebar-spacer" />
          </div>

          {/* Editor body */}
          <div class="splash-editor">
            <For each={codeLines}>
              {(line, i) => (
                <div class="splash-code-line" classList={{ "splash-code-line-visible": i() < visibleLines() }} style={{ "--line-delay": `${i() * 0.08}s` } as any}>
                  <span class="splash-line-num">{i() + 1}</span>
                  <span class="splash-line-content">
                    <For each={line.tokens}>{(token) => <span class={`splash-token-${token.type}`}>{token.text}</span>}</For>
                  </span>
                </div>
              )}
            </For>
            <div class="splash-cursor" classList={{ "splash-cursor-hidden": visibleLines() >= codeLines.length }} />
          </div>
        </div>

        {/* Progress region */}
        <div class="splash-progress-region splash-fade-in" style={{ "--delay": "0.55s" } as any}>
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
              Continue
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="splash-enter-arrow">
                <path d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            </button>
          </Show>
        </div>
      </div>

      <style>{`
        /* ===== Root ===== */
        .splash-root {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          overflow: hidden;
          transition: opacity 0.7s cubic-bezier(0.4, 0, 0, 1),
                      transform 0.7s cubic-bezier(0.4, 0, 0, 1),
                      filter 0.7s cubic-bezier(0.4, 0, 0, 1);
        }
        .splash-exit {
          opacity: 0;
          transform: scale(0.98) translateY(-10px);
          filter: blur(12px);
        }

        /* ===== Background layers ===== */
        .splash-bg-base {
          position: absolute; inset: 0;
          background: var(--bg-content);
        }
        .splash-bg-glow {
          position: absolute; inset: 0;
          background:
            radial-gradient(ellipse 600px 400px at 50% 40%, color-mix(in srgb, var(--accent) 4%, transparent), transparent),
            radial-gradient(ellipse 400px 300px at 30% 70%, color-mix(in srgb, var(--accent) 2%, transparent), transparent),
            radial-gradient(ellipse 400px 300px at 70% 60%, color-mix(in srgb, var(--color-purple, #bf5af2) 2%, transparent), transparent);
          animation: glow-drift 12s ease-in-out infinite alternate;
        }
        @keyframes glow-drift {
          0% { opacity: 0.6; transform: scale(1); }
          100% { opacity: 1; transform: scale(1.05); }
        }
        .splash-noise {
          position: absolute; inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          opacity: 0.025;
          mix-blend-mode: soft-light;
          pointer-events: none;
        }

        /* ===== Content ===== */
        .splash-content {
          position: relative; z-index: 10;
          display: flex; flex-direction: column; align-items: center;
          gap: 40px;
          max-width: 560px; width: 100%;
          padding: 0 20px;
        }

        /* ===== Fade-in ===== */
        .splash-fade-in {
          opacity: 0;
          transform: translateY(16px);
          animation: splash-reveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          animation-delay: var(--delay, 0s);
        }
        @keyframes splash-reveal {
          to { opacity: 1; transform: translateY(0); }
        }

        /* ===== Brand ===== */
        .splash-brand {
          display: flex; flex-direction: column; align-items: center; gap: 6px;
        }
        .splash-helix-icon {
          width: 44px; height: 44px;
          margin-bottom: 10px;
          opacity: 0.9;
        }
        .splash-brand-text {
          display: flex; align-items: baseline; gap: 1px;
          font-size: 36px; font-weight: 300;
          letter-spacing: 0.12em;
          color: var(--text-primary);
          font-family: var(--font-sans);
        }
        .splash-brand-helix {
          font-weight: 300;
        }
        .splash-brand-db {
          font-weight: 700;
          color: var(--accent);
        }
        .splash-brand-sub {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5em;
          color: var(--text-tertiary);
          font-weight: 500;
          margin-top: 2px;
        }
        .splash-brand-version {
          font-size: 10px;
          color: var(--text-quaternary);
          font-weight: 500;
          font-family: var(--font-mono);
          margin-top: 4px;
          letter-spacing: 0.05em;
        }

        /* ===== macOS Editor Window ===== */
        .splash-window {
          width: 100%;
          border-radius: 10px;
          overflow: hidden;
          background: var(--bg-elevated);
          border: 1px solid var(--border-color);
          box-shadow:
            0 1px 1px rgba(0,0,0,0.02),
            0 4px 8px rgba(0,0,0,0.04),
            0 12px 24px rgba(0,0,0,0.06),
            0 24px 48px rgba(0,0,0,0.08);
        }

        /* Title bar */
        .splash-titlebar {
          height: 36px;
          display: flex; align-items: center;
          padding: 0 14px;
          background: var(--bg-toolbar);
          border-bottom: 1px solid var(--border-subtle);
          user-select: none;
        }
        .splash-traffic-lights {
          display: flex; gap: 7px;
          align-items: center;
        }
        .splash-dot {
          width: 11px; height: 11px;
          border-radius: 50%;
          position: relative;
        }
        .splash-dot::after {
          content: '';
          position: absolute; inset: 0;
          border-radius: 50%;
          box-shadow: inset 0 -0.5px 0.5px rgba(0,0,0,0.12);
        }
        .splash-dot-red { background: #ff5f57; }
        .splash-dot-yellow { background: #febc2e; }
        .splash-dot-green { background: #28c840; }
        .splash-titlebar-text {
          flex: 1;
          text-align: center;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-tertiary);
          font-family: var(--font-sans);
        }
        .splash-titlebar-spacer {
          width: 54px; /* balance traffic lights width */
        }

        /* Editor body */
        .splash-editor {
          padding: 18px 20px 20px 1px;
          font-family: var(--font-mono);
          font-size: 12.5px;
          line-height: 1.85;
          position: relative;
          min-height: 160px;
        }
        .splash-code-line {
          display: flex;
          opacity: 0;
          transform: translateX(-6px);
          transition: opacity 0.4s ease, transform 0.4s ease;
          transition-delay: var(--line-delay, 0s);
        }
        .splash-code-line-visible {
          opacity: 1;
          transform: translateX(0);
        }
        .splash-line-num {
          width: 28px;
          text-align: right;
          color: var(--text-quaternary);
          font-size: 11px;
          margin-right: 14px;
          user-select: none;
          flex-shrink: 0;
          opacity: 0.6;
        }
        .splash-line-content {
          white-space: pre;
        }

        /* Cursor */
        .splash-cursor {
          display: inline-block;
          width: 1.5px; height: 1.3em;
          background: var(--accent);
          margin-left: 46px;
          animation: cursor-blink 1s step-end infinite;
          vertical-align: middle;
          opacity: 0.8;
        }
        .splash-cursor-hidden { opacity: 0; }
        @keyframes cursor-blink {
          0%, 50% { opacity: 0.8; }
          51%, 100% { opacity: 0; }
        }

        /* Token colors - Sync with reference image (Tokyo Night) */
        .splash-token-keyword { color: #ff9e64; font-weight: 600; } /* Orange */
        .splash-token-type { color: #bb9af7; } /* Purple */
        .splash-token-operator { color: #ff9e64; } /* Orange (<-) */
        .splash-token-fn { color: #7aa2f7; font-weight: 500; } /* Blue (CreateUser, AddN) */
        .splash-token-param { color: #c0caf5; } /* Foreground blue-white */
        .splash-token-punc { color: #89ddff; } /* Light cyan (brackets, commas) */
        .splash-token-default { color: #c0caf5; }
        .splash-token-builtin { color: #7dcfff; } /* Cyan (String, I32) */

        /* ===== Progress ===== */
        .splash-progress-region {
          display: flex; flex-direction: column; align-items: center;
          gap: 16px; width: 240px;
        }
        .splash-progress-track {
          width: 100%; height: 3px;
          background: var(--border-subtle);
          border-radius: 2px;
          overflow: hidden;
          position: relative;
        }
        .splash-progress-fill {
          position: absolute; top: 0; left: 0; height: 100%;
          border-radius: 2px;
          background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #64b5f6));
          transition: width 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .splash-status {
          display: flex; align-items: center; gap: 8px;
        }
        .splash-status-dot {
          width: 4px; height: 4px;
          border-radius: 50%;
          background: var(--accent);
          animation: status-pulse 1.5s ease-in-out infinite;
        }
        @keyframes status-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        .splash-status span {
          font-size: 11px;
          letter-spacing: 0.02em;
          color: var(--text-tertiary);
          font-weight: 500;
        }

        /* ===== Continue Button (macOS pill) ===== */
        .splash-enter-btn {
          display: inline-flex; align-items: center; gap: 6px;
          height: 28px;
          padding: 0 14px 0 16px;
          border-radius: 6px;
          background: var(--accent);
          border: none;
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          font-family: var(--font-sans);
          cursor: pointer;
          transition: all 0.2s ease;
          animation: splash-reveal 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          box-shadow: 0 0.5px 1px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06);
          letter-spacing: 0.01em;
        }
        .splash-enter-btn:hover {
          filter: brightness(1.1);
          box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08);
        }
        .splash-enter-btn:active {
          filter: brightness(0.95);
          transform: scale(0.98);
        }
        .splash-enter-arrow {
          width: 13px; height: 13px;
          opacity: 0.85;
        }
      `}</style>
    </div>
  );
};
