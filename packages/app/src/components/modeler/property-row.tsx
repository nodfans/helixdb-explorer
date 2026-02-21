import { createEffect, createSignal, Show, For, onCleanup } from "solid-js";
import { Type, Hash, FingerprintPattern, Calendar, ChevronDown, Trash2, Settings2 } from "lucide-solid";
import { PropertyDef, HqlType, HQL_TYPES } from "../../lib/codegen";
import { Badge } from "../ui/badge";

interface PropertyRowProps {
  property: PropertyDef;
  index: number;
  onUpdate: (updates: Partial<PropertyDef>) => void;
  onDelete: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
  isFocused: boolean;
  onFocusConsumed: () => void;
  diagnostics: any[];
}

export const PropertyRow = (props: PropertyRowProps) => {
  const [isExpanded, setIsExpanded] = createSignal(false);
  let nameInputRef: HTMLInputElement | undefined;
  let rootRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (props.isFocused) {
      nameInputRef?.focus();
      props.onFocusConsumed();
    }
  });

  // Handle click outside to close
  createEffect(() => {
    if (!isExpanded()) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef && !rootRef.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    onCleanup(() => document.removeEventListener("click", handleClickOutside));
  });

  const getHqlTypeIcon = (type: HqlType) => {
    switch (type) {
      case "String":
        return <Type size={12} class="text-accent" />;
      case "ID":
        return <FingerprintPattern size={12} class="text-purple-500" />;
      case "Date":
        return <Calendar size={12} class="text-error" />;
      case "Boolean":
        return <Hash size={12} class="text-warning" />;
      default:
        return <Hash size={12} class="text-success" />;
    }
  };

  return (
    <div
      ref={rootRef}
      class="flex flex-col border-b border-native-subtle last:border-b-0 transition-all duration-200"
      classList={{
        "bg-hover/30": isExpanded(),
      }}
    >
      {/* Primary Row */}
      <div class="flex items-center gap-3 px-4 py-1.5 group/row min-h-[32px]">
        {/* Type Icon */}
        <div class="flex-none w-4 flex justify-center opacity-70">{getHqlTypeIcon(props.property.type)}</div>

        {/* Name Input - Flexible filling of left space */}
        <input
          ref={nameInputRef}
          value={props.property.name}
          spellcheck={false}
          autocorrect="off"
          autocapitalize="off"
          autocomplete="off"
          class="bg-transparent border-none focus:ring-0 text-[12px] p-0 flex-1 min-w-[30px] placeholder:text-native-tertiary outline-none"
          placeholder="attribute_name"
          onInput={(e) => props.onUpdate({ name: e.currentTarget.value })}
          onKeyDown={props.onKeyDown}
          classList={{
            "text-error": props.diagnostics.length > 0,
            "text-native-primary": true,
          }}
        />

        {/* Unified Metadata & Actions Group - Dynamic space */}
        <div class="flex-none flex items-center gap-3 ml-2 shrink-0">
          {/* Type Selector - Compact dropdown */}
          <div class="relative group/type">
            <select
              class="bg-transparent border-none text-[10px] font-mono text-native-tertiary hover:text-native-primary appearance-none outline-none cursor-pointer transition-colors pr-3.5 text-right w-[60px]"
              value={props.property.type}
              onChange={(e) => props.onUpdate({ type: e.currentTarget.value as HqlType })}
            >
              <For each={HQL_TYPES}>{(t) => <option value={t}>{t.toLowerCase()}</option>}</For>
            </select>
            <ChevronDown size={10} class="absolute right-0 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
          </div>

          {/* Badges Column - Flexible display */}
          <div class="hidden sm:flex items-center justify-end gap-1.5 shrink-0">
            <Show when={props.property.isUnique}>
              <Badge size="xs" variant="warning" class="w-4 h-4 !p-0 flex items-center justify-center text-[9px] font-bold">
                U
              </Badge>
            </Show>
            <Show when={props.property.isIndex}>
              <Badge size="xs" variant="success" class="w-4 h-4 !p-0 flex items-center justify-center text-[9px] font-bold">
                I
              </Badge>
            </Show>
            <Show when={props.property.isArray}>
              <Badge size="xs" variant="info" class="w-4 h-4 !p-0 flex items-center justify-center text-[8px] font-bold">
                A
              </Badge>
            </Show>
          </div>

          {/* Actions Column */}
          <div class="flex items-center justify-end gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => setIsExpanded(!isExpanded())}
              class={`p-1 rounded hover:bg-hover transition-colors ${isExpanded() ? "text-accent bg-accent/10" : "text-native-tertiary"}`}
              title="Configure field"
            >
              <Settings2 size={13} />
            </button>
            <button onClick={props.onDelete} class="p-1 rounded hover:bg-error/10 text-native-tertiary hover:text-error transition-colors" title="Remove field">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Secondary/Settings Panel */}
      <Show when={isExpanded()}>
        <div class="px-3 pb-3 pt-1 space-y-3 bg-native-sidebar/50 border-t border-native-subtle animate-in fade-in slide-in-from-top-1 duration-200">
          <div class="grid grid-cols-2 gap-3">
            {/* Default Value */}
            <div class="space-y-1">
              <label class="text-[9px] uppercase font-bold tracking-wider text-native-tertiary ml-0.5">Default Value</label>
              <input
                value={props.property.defaultValue || ""}
                class="w-full h-7 bg-native-content border border-native rounded px-2 text-[11px] font-mono outline-none focus:border-accent/50 transition-colors"
                placeholder="None..."
                onInput={(e) =>
                  props.onUpdate({
                    defaultValue: e.currentTarget.value || undefined,
                  })
                }
              />
            </div>
            {/* Description */}
            <div class="space-y-1">
              <label class="text-[9px] uppercase font-bold tracking-wider text-native-tertiary ml-0.5">Description</label>
              <input
                value={props.property.description || ""}
                class="w-full h-7 bg-native-content border border-native rounded px-2 text-[11px] outline-none focus:border-accent/50 transition-colors"
                placeholder="Optional description..."
                onInput={(e) =>
                  props.onUpdate({
                    description: e.currentTarget.value || undefined,
                  })
                }
              />
            </div>
          </div>

          {/* Toggles */}
          <div class="flex flex-wrap items-center gap-2">
            <Toggle
              label="Unique"
              active={!!props.property.isUnique}
              onChange={(v) =>
                props.onUpdate({
                  isUnique: v,
                  isIndex: false,
                })
              }
            />
            <Toggle
              label="Index"
              active={!!props.property.isIndex}
              onChange={(v) =>
                props.onUpdate({
                  isIndex: v,
                  isUnique: false,
                })
              }
            />
            <Toggle label="Array" active={!!props.property.isArray} onChange={(v) => props.onUpdate({ isArray: v })} />
          </div>
        </div>
      </Show>
    </div>
  );
};

const Toggle = (props: { label: string; active: boolean; onChange: (v: boolean) => void }) => (
  <button
    onClick={() => props.onChange(!props.active)}
    class={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all duration-200 ${
      props.active ? "bg-accent/10 border-accent/30 text-accent" : "bg-transparent border-native text-native-tertiary hover:border-native"
    }`}
  >
    <div class={`w-2 h-2 rounded-full ${props.active ? "bg-current shadow-[0_0_4px_currentColor]" : "bg-native"}`} />
    <span class="text-[10px] font-semibold tracking-tight">{props.label}</span>
  </button>
);
