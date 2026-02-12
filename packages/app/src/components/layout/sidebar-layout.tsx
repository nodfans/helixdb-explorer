import { ParentProps, Show, For, JSX } from "solid-js";
import { ChevronRight } from "lucide-solid";

export function SidebarLayout(props: ParentProps<{ class?: string; style?: JSX.CSSProperties }>) {
  return (
    <div
      class={`border-r overflow-y-auto flex-shrink-0 ${props.class || ""}`}
      style={{
        "background-color": "var(--macos-sidebar-bg)",
        "border-color": "var(--macos-border-medium)",
        ...(typeof props.style === "object" ? props.style : {}),
      }}
    >
      {props.children}
    </div>
  );
}

export function SidebarSection(props: { title?: string; children: any }) {
  return (
    <div class="py-2">
      <Show when={props.title}>
        <div class="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--macos-text-tertiary)" }}>
          {props.title}
        </div>
      </Show>
      <div class="px-2">{props.children}</div>
    </div>
  );
}

interface SidebarItemProps {
  icon?: any;
  label: string;
  selected?: boolean;
  count?: number;
  onClick?: () => void;
  children?: SidebarItemProps[];
  expanded?: boolean;
  onToggle?: () => void;
}

export function SidebarItem(props: SidebarItemProps) {
  const hasChildren = () => props.children && props.children.length > 0;

  return (
    <div>
      <button
        onClick={hasChildren() ? props.onToggle : props.onClick}
        class="w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-left group"
        style={{
          "background-color": props.selected ? "var(--macos-blue)" : "transparent",
          color: props.selected ? "#ffffff" : "var(--macos-text-primary)",
        }}
        onMouseEnter={(e) => {
          if (!props.selected) {
            e.currentTarget.style.backgroundColor = "var(--macos-hover-bg)";
          }
        }}
        onMouseLeave={(e) => {
          if (!props.selected) {
            e.currentTarget.style.backgroundColor = "transparent";
          }
        }}
      >
        <Show when={hasChildren()}>
          <ChevronRight class={`w-3.5 h-3.5 transition-transform ${props.expanded ? "rotate-90" : ""}`} style={{ color: "var(--macos-text-secondary)" }} />
        </Show>
        <Show when={props.icon}>
          <span class="flex-shrink-0">{props.icon}</span>
        </Show>
        <span class="flex-1 text-[13px] truncate">{props.label}</span>
        <Show when={props.count !== undefined}>
          <span class="text-[11px] px-1.5 rounded" style={{ color: "var(--macos-text-secondary)" }}>
            {props.count}
          </span>
        </Show>
      </button>

      <Show when={hasChildren() && props.expanded}>
        <div class="ml-3 mt-0.5">
          <For each={props.children}>{(child) => <SidebarItem {...child} />}</For>
        </div>
      </Show>
    </div>
  );
}
