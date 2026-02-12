import { For } from "solid-js";
import { Plug, DraftingCompass, Database, Zap, Network, ChevronDown, SquareCode } from "lucide-solid";
import { activeConnection } from "../../stores/connection";

interface TopNavProps {
  activeView: string;
  onSelectView: (view: string) => void;
  isConnected: boolean;
  onOpenSettings: () => void;
}

const NAV_ITEMS = [
  {
    id: "hql",
    label: "HQL",
    icon: SquareCode,
    color: "text-emerald-500",
  },
  {
    id: "editor",
    label: "Modeler",
    icon: DraftingCompass,
    color: "text-orange-500",
  },
  {
    id: "schema",
    label: "Schema",
    icon: Database,
    color: "text-blue-500",
  },
  {
    id: "queries",
    label: "Queries",
    icon: Zap,
    color: "text-yellow-500",
  },
  {
    id: "graph",
    label: "Graph",
    icon: Network,
    color: "text-purple-500",
  },
] as const;

const ConnectionButton = (props: { isConnected: boolean; onClick: () => void }) => {
  const active = activeConnection();

  return (
    <div class="relative">
      <button
        onClick={() => props.onClick()}
        class="flex flex-col items-center justify-center min-w-[72px] h-[52px] transition-all duration-300 group relative outline-none select-none tap-highlight-transparent"
        style={{ "-webkit-tap-highlight-color": "transparent" }}
        title={props.isConnected ? `Connected to ${active.name} - Click to disconnect` : "Disconnected - Click to configure"}
      >
        <div class="relative">
          <Plug size={22} class={`transition-all duration-300 ${props.isConnected ? "text-emerald-500 scale-105" : "text-native-tertiary"} group-hover:scale-110`} />
          <div
            class={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 transition-colors duration-500 ${props.isConnected ? "bg-emerald-500" : "bg-status-error"}`}
            style={{ "border-color": "var(--macos-toolbar-bg)" }}
          />
        </div>
        <span
          class={`text-[11px] mt-1 font-medium leading-tight transition-colors duration-300 ${props.isConnected ? "text-emerald-500 font-semibold" : "text-native-tertiary"} group-hover:text-native-primary`}
        >
          Connection
        </span>
      </button>
    </div>
  );
};

const NavButton = (props: { label: string; icon: any; color: string; isActive: boolean; onClick: () => void }) => {
  return (
    <button
      onClick={props.onClick}
      class="flex flex-col items-center justify-center min-w-[72px] h-[52px] transition-all group relative outline-none select-none"
      style={{ "-webkit-tap-highlight-color": "transparent" }}
    >
      <div class={`transition-all duration-300 ${props.isActive ? "text-accent scale-110" : props.color + " group-hover:scale-110"}`}>
        <props.icon size={22} strokeWidth={props.isActive ? 2.5 : 2} />
      </div>

      <span
        class={`text-[11px] mt-1 font-medium tracking-tight leading-tight transition-colors duration-300 ${props.isActive ? "text-accent font-semibold" : "text-native-secondary group-hover:text-native-primary"}`}
      >
        {props.label}
      </span>
    </button>
  );
};

const Divider = () => <div class="w-px h-8 mx-1 shrink-0" style={{ "background-color": "var(--macos-border-light)" }} />;

export const TopNav = (props: TopNavProps) => {
  return (
    <div
      class="h-[84px] flex flex-col select-none border-b shrink-0"
      style={{
        "background-color": "var(--macos-toolbar-bg)",
        "border-color": "var(--macos-border-medium)",
        "backdrop-filter": "blur(30px) saturate(180%)",
        "-webkit-backdrop-filter": "blur(30px) saturate(180%)",
      }}
    >
      {/* Title Bar Area (Draggable) */}
      <div class="h-7 flex items-center justify-center relative shrink-0" data-tauri-drag-region>
        <span class="text-[12px] font-bold text-native-primary dark:text-white/60 antialiased select-none tracking-tight">HelixDB Explorer</span>
      </div>

      {/* Main Toolbar */}
      <div class="flex-1 flex items-center px-2 gap-1">
        {/* Connection Button */}
        <ConnectionButton isConnected={props.isConnected} onClick={props.onOpenSettings} />

        <Divider />

        {/* View Switchers */}
        <For each={NAV_ITEMS}>{(item) => <NavButton label={item.label} icon={item.icon} color={item.color} isActive={props.activeView === item.id} onClick={() => props.onSelectView(item.id)} />}</For>

        <Divider />

        {/* Others (Disabled) */}
        <div class="flex flex-col items-center justify-center min-w-[72px] h-[52px] opacity-25 cursor-not-allowed grayscale">
          <div class="flex items-end gap-0.5 text-native-tertiary mb-1">
            <div class="w-1.5 h-3.5 bg-current rounded-sm" />
            <div class="w-1.5 h-2.5 bg-current rounded-sm" />
            <ChevronDown size={12} class="mb-0.5" />
          </div>
          <span class="text-[11px] font-medium text-native-secondary">Others</span>
        </div>
      </div>
    </div>
  );
};
