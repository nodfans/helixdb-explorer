import { ParentProps, Show, For, JSX } from "solid-js";
import { ChevronRight } from "lucide-solid";

export function SidebarLayout(props: ParentProps<{ class?: string; style?: JSX.CSSProperties }>) {
  return (
    <div class={`border-r border-native overflow-y-auto flex-shrink-0 bg-native-sidebar ${props.class || ""}`} style={typeof props.style === "object" ? props.style : {}}>
      {props.children}
    </div>
  );
}

export function SidebarSection(props: { title?: string; children: any }) {
  return (
    <div class="py-2">
      <Show when={props.title}>
        <div class="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-native-tertiary">{props.title}</div>
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
        class="w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-left group transition-all"
        classList={{
          "bg-accent text-white shadow-sm": props.selected,
          "bg-transparent text-native-primary hover:bg-hover": !props.selected,
        }}
      >
        <Show when={hasChildren()}>
          <ChevronRight class={`w-3.5 h-3.5 transition-transform ${props.expanded ? "rotate-90" : ""} text-native-secondary`} />
        </Show>
        <Show when={props.icon}>
          <span class="flex-shrink-0">{props.icon}</span>
        </Show>
        <span class="flex-1 text-[13px] truncate">{props.label}</span>
        <Show when={props.count !== undefined}>
          <span class="text-[11px] px-1.5 rounded text-native-secondary">{props.count}</span>
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
