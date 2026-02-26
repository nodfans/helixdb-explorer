import { JSX, splitProps, Show } from "solid-js";

interface IconProps extends JSX.SvgSVGAttributes<SVGSVGElement> {
  size?: number | string;
  theme?: "light" | "dark";
  connected?: boolean;
}

export const ConnectionIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "connected", "class"]);
  const size = () => local.size || 28;
  const isDark = () => local.theme !== "light";

  const teal = () => (isDark() ? "#34d399" : "#059669");
  const cyan = () => (isDark() ? "#22d3ee" : "#0891b2");

  return (
    <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" class={local.class} {...others}>
      <Show
        when={local.connected}
        fallback={
          <>
            <path d="m19 5 3-3" stroke={teal()} stroke-width="1.8" opacity="0.4" />
            <path d="m2 22 3-3" stroke={teal()} stroke-width="1.8" opacity="0.4" />
            <path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z" fill={teal()} />
            <path d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z" fill={cyan()} />
            {/* Glossy highlights */}
            <path d="M6 16.5 L9 13.5" stroke="white" stroke-width="1.5" stroke-opacity="0.3" stroke-linecap="round" />
            <path d="M14.5 9.5 L17.5 6.5" stroke="white" stroke-width="1.5" stroke-opacity="0.3" stroke-linecap="round" />
          </>
        }
      >
        <>
          <path d="M12 22v-5" stroke={teal()} stroke-width="2" />
          <path d="M15 8V2" stroke={cyan()} stroke-width="2" />
          <path d="M9 8V2" stroke={teal()} stroke-width="2" />
          {/* Plug body */}
          <path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z" fill={teal()} fill-opacity="0.2" stroke={teal()} stroke-width="2.2" />
          {/* Highlight dot */}
          <circle cx="12" cy="11.5" r="1.5" fill="white" fill-opacity="0.35" />
        </>
      </Show>
    </svg>
  );
};

export const DashboardIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const size = () => local.size || 28;
  const isDark = () => local.theme !== "light";

  const blue = () => (isDark() ? "#3b82f6" : "#2563eb");
  const green = () => (isDark() ? "#10b981" : "#059669");
  const amber = () => (isDark() ? "#f59e0b" : "#d97706");

  return (
    <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none" class={local.class} {...others}>
      {/* top bar: blue */}
      <rect x="3" y="3.5" width="18" height="6.5" rx="2" fill={blue()} />
      {/* bottom-left: green */}
      <rect x="3" y="11.5" width="6" height="9" rx="2" fill={green()} />
      {/* bottom-right: amber */}
      <rect x="11" y="11.5" width="10" height="9" rx="2" fill={amber()} />
      {/* white highlights */}
      <rect x="4.5" y="5" width="5" height="2" rx="1" fill="white" fill-opacity="0.25" />
      <circle cx="5" cy="15.5" r="1.1" fill="white" fill-opacity="0.35" />
      <circle cx="14" cy="15.5" r="1.1" fill="white" fill-opacity="0.35" />
    </svg>
  );
};

export const HQLIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const size = () => local.size || 28;
  const isDark = () => local.theme !== "light";

  const orange = () => (isDark() ? "#fb923c" : "#f97316");
  const purple = () => (isDark() ? "#a78bfa" : "#8b5cf6");

  return (
    <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none" class={local.class} {...others}>
      <rect x="2" y="3" width="20" height="18" rx="3" fill="white" stroke={isDark() ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)"} stroke-width="1" />
      <path d="M2 6 a3 3 0 0 1 3-3 h14 a3 3 0 0 1 3 3 v4 H2 V6 z" fill={orange()} />
      <circle cx="6" cy="6.5" r="1.3" fill="white" fill-opacity="0.8" />
      <circle cx="10" cy="6.5" r="1.3" fill="white" fill-opacity="0.4" />
      <circle cx="14" cy="6.5" r="1.3" fill="white" fill-opacity="0.2" />
      <path d="M7 13.5 l3 2 -3 2" stroke={orange()} stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      <rect x="12" y="14.5" width="5" height="2" rx="1" fill={purple()} />
      {/* Light glow on terminal body */}
      <rect x="4" y="12" width="16" height="7" rx="1" fill="white" fill-opacity={isDark() ? "0.03" : "0.5"} />
    </svg>
  );
};

export const QueriesIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const size = () => local.size || 28;
  const isDark = () => local.theme !== "light";

  const indigo = () => (isDark() ? "#818cf8" : "#6366f1");
  const pink = () => (isDark() ? "#f472b6" : "#ec4899");
  const highlight = () => (isDark() ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.6)");

  return (
    <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none" class={local.class} {...others}>
      {/* document body: indigo */}
      <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h5" fill={indigo()} />
      {/* folded corner: deeper indigo */}
      <path d="M14 3v6h6" fill={indigo()} fill-opacity="0.75" />
      {/* lines */}
      <rect x="6" y="10" width="5" height="1.5" rx="0.5" fill="white" fill-opacity="0.3" />
      <rect x="6" y="13" width="3.5" height="1.5" rx="0.5" fill="white" fill-opacity="0.3" />
      {/* search magnifier: pink */}
      <circle cx="16" cy="16" r="4" fill={pink()} />
      <circle cx="16" cy="16" r="1.8" fill="white" fill-opacity="0.3" />
      <path d="M19 19 L21.5 21.5" stroke={pink()} stroke-width="2.5" stroke-linecap="round" />
      {/* Specular highlight */}
      <path d="M6.5 4.5 Q8 3.5 10 4.5" stroke={highlight()} stroke-width="0.8" opacity="0.5" />
    </svg>
  );
};

export const ModelerIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const size = () => local.size || 28;
  const isDark = () => local.theme !== "light";

  const violet = () => (isDark() ? "#a78bfa" : "#8b5cf6");
  const fuchsia = () => (isDark() ? "#e879f9" : "#d946ef");
  const pink = () => (isDark() ? "#f472b6" : "#ec4899");

  return (
    <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none" class={local.class} {...others}>
      {/* Layered sheets: Violet -> Fuchsia -> Pink */}
      <path d="M12 2 L2 7 l10 5 10-5 z" fill={violet()} />
      <path d="M2 11.5 l10 5 10-5 -10-3 z" fill={fuchsia()} fill-opacity="0.8" />
      <path d="M2 16.5 l10 5 10-5 -10-3 z" fill={pink()} fill-opacity="0.7" />
      {/* Reflection highlight */}
      <path d="M11 4.5 L13 3.5" stroke="white" stroke-width="1.2" stroke-opacity="0.4" stroke-linecap="round" />
      <circle cx="12" cy="7" r="1.2" fill="white" fill-opacity="0.3" />
    </svg>
  );
};

export const SchemaIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const size = () => local.size || 28;

  return (
    <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none" class={local.class} {...others}>
      <defs>
        <linearGradient id="schema-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#06b6d4" />
          <stop offset="100%" stop-color="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="18" height="18" rx="3" fill="url(#schema-grad)" opacity="0.15" />
      <rect x="3" y="3" width="18" height="5" rx="3" fill="url(#schema-grad)" opacity="0.3" />
      <rect x="3" y="10" width="5" height="11" fill="url(#schema-grad)" opacity="0.2" />
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="url(#schema-grad)" stroke-width="2" />
      <line x1="3" y1="10" x2="21" y2="10" stroke="url(#schema-grad)" stroke-width="2" />
      <line x1="10" y1="10" x2="10" y2="21" stroke="url(#schema-grad)" stroke-width="2" />
    </svg>
  );
};

export const GraphIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const size = () => local.size || 28;

  return (
    <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none" class={local.class} {...others}>
      <line x1="9" y1="12" x2="15" y2="6.5" stroke="#06b6d4" stroke-width="2.5" />
      <line x1="9" y1="12" x2="15" y2="17.5" stroke="#8b5cf6" stroke-width="2.5" />
      <circle cx="18" cy="6" r="4.5" fill="#ef6060ff" />
      <circle cx="6" cy="12" r="4.5" fill="#10b981" />
      <circle cx="18" cy="18" r="4.5" fill="#f59e0b" />
      <circle cx="18" cy="6" r="2" fill="white" fill-opacity="0.4" />
      <circle cx="6" cy="12" r="2" fill="white" fill-opacity="0.4" />
      <circle cx="18" cy="18" r="2" fill="white" fill-opacity="0.4" />
    </svg>
  );
};

export const OthersIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const size = () => local.size || 28;
  const isDark = () => local.theme !== "light";

  const base = () => (isDark() ? "#475569" : "#cbd5e1");
  const dot = () => (isDark() ? "#94a3b8" : "#475569");

  return (
    <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none" class={local.class} {...others}>
      <rect x="4" y="4" width="16" height="16" rx="4" fill={base()} fill-opacity="0.25" stroke={base()} stroke-width="2" />
      <circle cx="9" cy="9" r="1.5" fill={dot()} />
      <circle cx="15" cy="9" r="1.5" fill={dot()} />
      <circle cx="9" cy="15" r="1.5" fill={dot()} />
      <circle cx="15" cy="15" r="1.5" fill={dot()} />
      <path d="M5 19 L7 17" stroke="white" stroke-width="1.2" stroke-opacity="0.2" stroke-linecap="round" />
    </svg>
  );
};
