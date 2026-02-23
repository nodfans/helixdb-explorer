import { JSX, splitProps } from "solid-js";

interface IconProps extends JSX.SvgSVGAttributes<SVGSVGElement> {
  size?: number | string;
  theme?: "light" | "dark";
  connected?: boolean;
}

const getColors = (type: string, isDark: boolean) => {
  const colorMap: Record<string, { primary: string; secondary: string }> = {
    connection: { primary: isDark ? "#34d399" : "#10b981", secondary: isDark ? "#6ee7b7" : "#059669" },
    dashboard: { primary: isDark ? "#60a5fa" : "#3b82f6", secondary: isDark ? "#93c5fd" : "#2563eb" },
    hql: { primary: isDark ? "#4ade80" : "#22c55e", secondary: isDark ? "#86efac" : "#16a34a" },
    queries: { primary: isDark ? "#fbbf24" : "#f59e0b", secondary: isDark ? "#fcd34d" : "#d97706" },
    modeler: { primary: isDark ? "#fb923c" : "#f97316", secondary: isDark ? "#fdba74" : "#ea580c" },
    schema: { primary: isDark ? "#818cf8" : "#6366f1", secondary: isDark ? "#a5b4fc" : "#4f46e5" },
    graph: { primary: isDark ? "#c084fc" : "#a855f7", secondary: isDark ? "#d8b4fe" : "#9333ea" },
    others: { primary: isDark ? "#94a3b8" : "#64748b", secondary: isDark ? "#cbd5e1" : "#475569" },
  };
  return colorMap[type] || colorMap.others;
};

export const ConnectionIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "connected", "class"]);
  const isDark = () => local.theme === "dark" || (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const colors = () => getColors("connection", isDark());
  const size = () => local.size || 24;
  const secondaryOpacity = () => (isDark() ? 0.3 : 0.15);

  return (
    <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none" class={local.class} {...others}>
      <circle cx="5" cy="12" r="3.5" fill={colors().primary} fill-opacity={secondaryOpacity()} />
      <circle cx="19" cy="12" r="3.5" fill={colors().primary} fill-opacity={secondaryOpacity()} />
      <circle cx="5" cy="12" r="3" stroke={colors().primary} stroke-width="2" fill="none" />
      <circle cx="19" cy="12" r="3" stroke={colors().primary} stroke-width="2" fill="none" />
      <path d="M8 12h8" stroke={colors().secondary} stroke-width="2.5" stroke-linecap="round" />
      <circle cx="5" cy="12" r="1.5" fill={colors().secondary} />
      <circle cx="19" cy="12" r="1.5" fill={colors().secondary} />
    </svg>
  );
};

export const DashboardIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const isDark = () => local.theme === "dark" || (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const colors = () => getColors("dashboard", isDark());
  const size = () => local.size || 24;
  const secondaryOpacity = () => (isDark() ? 0.3 : 0.15);

  return (
    <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none" class={local.class} {...others}>
      <rect x="3" y="3" width="8" height="8" rx="2" fill={colors().primary} fill-opacity={secondaryOpacity()} />
      <rect x="13" y="3" width="8" height="8" rx="2" fill={colors().primary} fill-opacity={secondaryOpacity() * 0.7} />
      <rect x="3" y="13" width="8" height="8" rx="2" fill={colors().primary} fill-opacity={secondaryOpacity() * 0.7} />
      <rect x="13" y="13" width="8" height="8" rx="2" fill={colors().primary} fill-opacity={secondaryOpacity() * 0.5} />
      <rect x="3" y="3" width="8" height="8" rx="2" stroke={colors().primary} stroke-width="2" fill="none" />
      <rect x="13" y="3" width="8" height="8" rx="2" stroke={colors().primary} stroke-width="2" fill="none" />
      <rect x="3" y="13" width="8" height="8" rx="2" stroke={colors().primary} stroke-width="2" fill="none" />
      <rect x="13" y="13" width="8" height="8" rx="2" stroke={colors().primary} stroke-width="2" fill="none" />
    </svg>
  );
};

export const HQLIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const isDark = () => local.theme === "dark" || (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const colors = () => getColors("hql", isDark());
  const size = () => local.size || 24;
  const secondaryOpacity = () => (isDark() ? 0.3 : 0.15);

  return (
    <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none" class={local.class} {...others}>
      <path d="M7 3L3 12l4 9M17 3l4 9-4 9" stroke={colors().primary} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity={secondaryOpacity()} />
      <path d="M7 3L3 12l4 9" stroke={colors().primary} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      <path d="M17 3l4 9-4 9" stroke={colors().primary} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      <path d="M13 6l-3 6h3l-3 6" stroke={colors().secondary} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
};

export const QueriesIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const isDark = () => local.theme === "dark" || (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const colors = () => getColors("queries", isDark());
  const size = () => local.size || 24;
  const secondaryOpacity = () => (isDark() ? 0.3 : 0.15);

  return (
    <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none" class={local.class} {...others}>
      <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z" fill={colors().primary} fill-opacity={secondaryOpacity()} />
      <circle cx="16" cy="16" r="4" fill={colors().secondary} fill-opacity={secondaryOpacity() * 1.5} />
      <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h5" stroke={colors().primary} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M14 3v6h6" stroke={colors().primary} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="16" cy="16" r="3" stroke={colors().secondary} stroke-width="2" fill="none" />
      <path d="M18.5 18.5L21 21" stroke={colors().secondary} stroke-width="2" stroke-linecap="round" />
      <path d="M8 13h2M8 17h1" stroke={colors().primary} stroke-width="1.5" stroke-linecap="round" opacity="0.5" />
    </svg>
  );
};

export const ModelerIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const isDark = () => local.theme === "dark" || (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const colors = () => getColors("modeler", isDark());
  const size = () => local.size || 24;
  const secondaryOpacity = () => (isDark() ? 0.3 : 0.15);

  return (
    <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none" class={local.class} {...others}>
      <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" fill={colors().primary} fill-opacity={secondaryOpacity()} />
      <path d="M12 2L4 7l8 5 8-5-8-5z" stroke={colors().primary} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      <path d="M12 22V12" stroke={colors().primary} stroke-width="2" stroke-linecap="round" />
      <path d="M4 7v10l8 5" stroke={colors().primary} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M20 7v10l-8 5" stroke={colors().primary} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="12" cy="2" r="1.5" fill={colors().secondary} />
      <circle cx="12" cy="12" r="1.5" fill={colors().secondary} />
      <circle cx="4" cy="7" r="1.5" fill={colors().secondary} />
      <circle cx="20" cy="7" r="1.5" fill={colors().secondary} />
    </svg>
  );
};

export const SchemaIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const isDark = () => local.theme === "dark" || (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const colors = () => getColors("schema", isDark());
  const size = () => local.size || 24;
  const secondaryOpacity = () => (isDark() ? 0.3 : 0.15);

  return (
    <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none" class={local.class} {...others}>
      <rect x="3" y="4" width="18" height="4" rx="1" fill={colors().primary} fill-opacity={secondaryOpacity()} />
      <rect x="3" y="10" width="18" height="4" rx="1" fill={colors().primary} fill-opacity={secondaryOpacity() * 0.7} />
      <rect x="3" y="16" width="18" height="4" rx="1" fill={colors().primary} fill-opacity={secondaryOpacity() * 0.5} />
      <rect x="3" y="4" width="18" height="4" rx="1" stroke={colors().primary} stroke-width="2" fill="none" />
      <rect x="3" y="10" width="18" height="4" rx="1" stroke={colors().primary} stroke-width="2" fill="none" />
      <rect x="3" y="16" width="18" height="4" rx="1" stroke={colors().primary} stroke-width="2" fill="none" />
      <path d="M7 6h10M7 12h10M7 18h10" stroke={colors().secondary} stroke-width="1.5" stroke-linecap="round" opacity="0.6" />
      <circle cx="5.5" cy="6" r="0.5" fill={colors().secondary} />
      <circle cx="5.5" cy="12" r="0.5" fill={colors().secondary} />
      <circle cx="5.5" cy="18" r="0.5" fill={colors().secondary} />
    </svg>
  );
};

export const GraphIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const isDark = () => local.theme === "dark" || (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const colors = () => getColors("graph", isDark());
  const size = () => local.size || 24;
  const secondaryOpacity = () => (isDark() ? 0.3 : 0.15);

  return (
    <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none" class={local.class} {...others}>
      <circle cx="12" cy="12" r="2.5" fill={colors().primary} fill-opacity={secondaryOpacity() * 2} />
      <circle cx="6" cy="6" r="2" fill={colors().primary} fill-opacity={secondaryOpacity()} />
      <circle cx="18" cy="6" r="2" fill={colors().primary} fill-opacity={secondaryOpacity()} />
      <circle cx="6" cy="18" r="2" fill={colors().primary} fill-opacity={secondaryOpacity()} />
      <circle cx="18" cy="18" r="2" fill={colors().primary} fill-opacity={secondaryOpacity()} />
      <path d="M7.5 7.5L10.5 10.5M16.5 7.5L13.5 10.5M7.5 16.5L10.5 13.5M16.5 16.5L13.5 13.5" stroke={colors().secondary} stroke-width="1.5" stroke-linecap="round" opacity="0.4" />
      <circle cx="12" cy="12" r="2.5" stroke={colors().primary} stroke-width="2" fill="none" />
      <circle cx="6" cy="6" r="2" stroke={colors().primary} stroke-width="2" fill="none" />
      <circle cx="18" cy="6" r="2" stroke={colors().primary} stroke-width="2" fill="none" />
      <circle cx="6" cy="18" r="2" stroke={colors().primary} stroke-width="2" fill="none" />
      <circle cx="18" cy="18" r="2" stroke={colors().primary} stroke-width="2" fill="none" />
      <circle cx="12" cy="12" r="1" fill={colors().secondary} />
    </svg>
  );
};

export const OthersIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const isDark = () => local.theme === "dark" || (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const colors = () => getColors("others", isDark());
  const size = () => local.size || 24;
  const secondaryOpacity = () => (isDark() ? 0.3 : 0.15);

  return (
    <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none" class={local.class} {...others}>
      <rect x="4" y="4" width="16" height="16" rx="3" fill={colors().primary} fill-opacity={secondaryOpacity()} />
      <rect x="4" y="4" width="16" height="16" rx="3" stroke={colors().primary} stroke-width="2" fill="none" />
      <circle cx="9" cy="9" r="1.5" fill={colors().secondary} />
      <circle cx="15" cy="9" r="1.5" fill={colors().secondary} />
      <circle cx="9" cy="15" r="1.5" fill={colors().secondary} />
      <circle cx="15" cy="15" r="1.5" fill={colors().secondary} />
    </svg>
  );
};
