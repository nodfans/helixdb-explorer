import { For } from "solid-js";

import { activeConnection } from "../../stores/connection";
import { ConnectionIcon, DashboardIcon, HQLIcon, QueriesIcon, ModelerIcon, SchemaIcon, GraphIcon } from "../ui/icons";

interface TopNavProps {
  activeView: string;
  onSelectView: (view: string) => void;
  isConnected: boolean;
  onOpenSettings: () => void;
}

const NAV_ITEMS = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: DashboardIcon,
    size: 24,
    color: "text-rose-500",
    glow: "rgba(244,63,94,0.1)",
    activeGlow: "rgba(244,63,94,0.25)",
  },
  {
    id: "hql",
    label: "HQL",
    icon: HQLIcon,
    size: 24,
    color: "text-emerald-500",
    glow: "rgba(16,185,129,0.1)",
    activeGlow: "rgba(16,185,129,0.25)",
  },
  {
    id: "queries",
    label: "Queries",
    icon: QueriesIcon,
    size: 24,
    color: "text-amber-500",
    glow: "rgba(245,158,11,0.1)",
    activeGlow: "rgba(245,158,11,0.25)",
  },
  {
    id: "editor",
    label: "Modeler",
    icon: ModelerIcon,
    size: 24,
    color: "text-orange-500",
    glow: "rgba(249,115,22,0.1)",
    activeGlow: "rgba(249,115,22,0.25)",
  },
  {
    id: "schema",
    label: "Schema",
    icon: SchemaIcon,
    size: 24,
    color: "text-indigo-500",
    glow: "rgba(99,102,241,0.1)",
    activeGlow: "rgba(99,102,241,0.25)",
  },
  {
    id: "graph",
    label: "Graph",
    icon: GraphIcon,
    size: 24,
    color: "text-purple-500",
    glow: "rgba(168,85,247,0.1)",
    activeGlow: "rgba(168,85,247,0.25)",
  },
] as const;

const ConnectionButton = (props: { isConnected: boolean; onClick: () => void }) => {
  const active = activeConnection();

  return (
    <div class="relative">
      <button
        onClick={() => props.onClick()}
        class="flex flex-col items-center justify-center min-w-[72px] h-[52px] pb-px transition-all duration-300 group relative outline-none select-none tap-highlight-transparent"
        style={{ "-webkit-tap-highlight-color": "transparent" }}
        title={props.isConnected ? `Connected to ${active.name} - Click to disconnect` : "Disconnected - Click to configure"}
      >
        <div class="relative w-12 h-9 flex items-center justify-center">
          <ConnectionIcon
            connected={props.isConnected}
            size={24}
            class={`transition-all duration-300 ${props.isConnected ? "scale-105 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "text-native-tertiary grayscale"} group-hover:scale-110`}
          />
        </div>
        <span
          class={`text-[12px] font-medium leading-tight transition-colors duration-300 ${props.isConnected ? "text-emerald-500 font-semibold" : "text-native-tertiary"} group-hover:text-native-primary`}
        >
          Connection
        </span>
      </button>
    </div>
  );
};

const NavButton = (props: { label: string; icon: any; color: string; glow: string; activeGlow: string; size?: number; isActive: boolean; onClick: () => void }) => {
  return (
    <button
      onClick={props.onClick}
      class="flex flex-col items-center justify-center min-w-[72px] h-[52px] pb-px transition-all group relative outline-none select-none"
      style={{ "-webkit-tap-highlight-color": "transparent" }}
    >
      <div
        class={`relative w-12 h-9 flex items-center justify-center transition-all duration-300 ${props.isActive ? "text-accent scale-110" : props.color + " group-hover:scale-110"}`}
        style={{
          filter: `drop-shadow(0 2px ${props.isActive ? "6px" : "3px"} ${props.isActive ? props.activeGlow : props.glow})`,
        }}
      >
        <props.icon size={props.size || 24} theme={props.isActive ? "dark" : "light"} />
      </div>

      <span
        class={`text-[12px] font-medium tracking-tight leading-tight transition-colors duration-300 ${props.isActive ? "text-accent font-semibold" : "text-native-secondary group-hover:text-native-primary"}`}
      >
        {props.label}
      </span>
    </button>
  );
};

const Divider = () => <div class="w-px h-8 mx-1 shrink-0 bg-native-subtle" />;

export const TopNav = (props: TopNavProps) => {
  return (
    <div
      class="h-[96px] flex flex-col select-none border-b border-native shrink-0 backdrop-blur-[30px] saturate-[180%]"
      style={{
        "background-color": "var(--bg-toolbar)",
      }}
    >
      {/* Title Bar Area (Draggable) */}
      <div class="h-7 flex items-center justify-center relative shrink-0" data-tauri-drag-region style={{ "-webkit-app-region": "drag" }}>
        <span class="text-[12px] font-bold text-native-primary dark:text-white/60 antialiased select-none tracking-tight pointer-events-none">HelixDB Explorer</span>
      </div>

      {/* Main Toolbar */}
      <div class="flex-1 flex items-center px-3 gap-2">
        {/* Connection Button */}
        <ConnectionButton isConnected={props.isConnected} onClick={props.onOpenSettings} />

        <Divider />

        {/* View Switchers */}
        <div class="flex items-center gap-0.5">
          <For each={NAV_ITEMS}>
            {(item) => (
              <NavButton
                label={item.label}
                icon={item.icon}
                color={item.color}
                glow={item.glow}
                activeGlow={item.activeGlow}
                size={item.size}
                isActive={props.activeView === item.id}
                onClick={() => props.onSelectView(item.id)}
              />
            )}
          </For>
        </div>
      </div>
    </div>
  );
};
