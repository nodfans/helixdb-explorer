import { For, Show, createSignal, Index } from "solid-js";
import { Trash2, Plus, ArrowRight, ChevronDown } from "lucide-solid";
import { EntityDef, PropertyDef, Diagnostic } from "../../lib/codegen";
import { PropertyRow } from "./property-row";

interface ProCardProps {
  entity: EntityDef;
  onUpdate: (id: string, updates: Partial<EntityDef> | ((prev: EntityDef) => Partial<EntityDef>)) => void;
  onDelete: (id: string) => void;
  nodeNames: string[];
  diagnostics: Diagnostic[];
}

export const ProEntityCard = (props: ProCardProps) => {
  const [newFieldFocused, setNewFieldFocused] = createSignal<number | null>(null);

  const addField = () => {
    const newProp: PropertyDef = { name: "", type: "String" };
    props.onUpdate(props.entity.id, (prev) => ({
      properties: [...prev.properties, newProp],
    }));
    // Defer focus to ensure DOM update completes
    setTimeout(() => {
      setNewFieldFocused(props.entity.properties.length);
    }, 0);
  };

  const handlePropertyUpdate = (index: number, updates: Partial<PropertyDef>) => {
    props.onUpdate(props.entity.id, (prev) => {
      const properties = [...prev.properties];
      properties[index] = { ...properties[index], ...updates };
      return { properties };
    });
  };

  const deleteProperty = (index: number) => {
    props.onUpdate(props.entity.id, (prev) => ({
      properties: prev.properties.filter((_, i) => i !== index),
    }));
  };

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (index < props.entity.properties.length - 1) {
        setNewFieldFocused(index + 1);
      } else {
        addField();
      }
    } else if (e.key === "Tab") {
      // Implement Excel-like navigation
      if (!e.shiftKey && index < props.entity.properties.length - 1) {
        e.preventDefault();
        setNewFieldFocused(index + 1);
      } else if (e.shiftKey && index > 0) {
        e.preventDefault();
        setNewFieldFocused(index - 1);
      }
      // Leave default Tab behavior for first/last items (exit/enter component)
    } else if (e.key === "ArrowDown") {
      if (index < props.entity.properties.length - 1) {
        setNewFieldFocused(index + 1);
      }
    } else if (e.key === "ArrowUp") {
      if (index > 0) {
        setNewFieldFocused(index - 1);
      } else {
        (e.currentTarget as HTMLElement).closest(".pro-card-root")?.querySelector<HTMLInputElement>(".entity-name-input")?.focus();
      }
    }
  };

  return (
    <div class="w-full bg-native-content rounded-xl overflow-hidden shadow-sm border border-native-subtle transition-all duration-300 hover:shadow-md hover:border-native pro-card-root box-border">
      {/* Header */}
      <div class="px-4 py-2 bg-native-sidebar border-b border-native-subtle flex flex-wrap items-center justify-between gap-y-2">
        <div class="flex items-center gap-2 flex-1 min-w-[100px]">
          <input
            value={props.entity.name}
            spellcheck={false}
            autocorrect="off"
            autocapitalize="off"
            autocomplete="off"
            class="bg-transparent border-none focus:ring-0 text-[13px] font-bold text-native-primary p-0 flex-1 min-w-0 placeholder:text-native-tertiary outline-none entity-name-input"
            placeholder="Entity Name"
            onInput={(e) => {
              const name = e.currentTarget.value;
              props.onUpdate(props.entity.id, () => ({ name }));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "ArrowDown") {
                e.preventDefault();
                setNewFieldFocused(0);
              }
            }}
          />
        </div>

        <div class="flex items-center gap-0.5 ml-4">
          <Show when={props.entity.kind === "Edge"}>
            <button
              onClick={() => props.onUpdate(props.entity.id, (prev) => ({ isUniqueRelation: !prev.isUniqueRelation }))}
              class={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all border ${
                props.entity.isUniqueRelation ? "bg-accent/10 border-accent/30 text-accent" : "bg-transparent border-native text-native-tertiary hover:border-native"
              }`}
              title="Unique Edge"
            >
              Unique
            </button>
          </Show>
          <button onClick={addField} class="p-1.5 hover:bg-accent/10 active:bg-accent/20 rounded-md text-native-secondary hover:text-accent transition-all" title="Add Field">
            <Plus size={14} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => props.onDelete(props.entity.id)}
            class="p-1.5 hover:bg-error/10 active:bg-error/20 rounded-md text-native-secondary hover:text-error transition-all"
            title="Delete Entity"
          >
            <Trash2 size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <Show when={props.entity.kind === "Edge"}>
        <div class="px-4 py-2 bg-native-content border-b border-native-subtle flex items-center gap-3">
          <div class="flex-1 relative group/select">
            <select
              class="w-full bg-native-content border border-native rounded-md px-2.5 py-1 text-[11px] text-native-secondary appearance-none outline-none hover:border-accent/40 transition-all cursor-pointer"
              value={props.entity.from}
              onChange={(e) =>
                props.onUpdate(props.entity.id, () => ({
                  from: e.currentTarget.value,
                }))
              }
            >
              <option value="">Source...</option>
              <For each={props.nodeNames}>{(name) => <option value={name}>{name}</option>}</For>
            </select>
            <ChevronDown size={11} class="absolute right-2 top-1/2 -translate-y-1/2 text-native-tertiary pointer-events-none opacity-50" />
          </div>

          <ArrowRight size={12} class="text-native-tertiary opacity-30" />

          <div class="flex-1 relative group/select">
            <select
              class="w-full bg-native-content border border-native rounded-md px-2.5 py-1 text-[11px] text-native-secondary appearance-none outline-none hover:border-accent/40 transition-all cursor-pointer"
              value={props.entity.to}
              onChange={(e) =>
                props.onUpdate(props.entity.id, () => ({
                  to: e.currentTarget.value,
                }))
              }
            >
              <option value="">Target...</option>
              <For each={props.nodeNames}>{(name) => <option value={name}>{name}</option>}</For>
            </select>
            <ChevronDown size={11} class="absolute right-2 top-1/2 -translate-y-1/2 text-native-tertiary pointer-events-none opacity-50" />
          </div>
        </div>
      </Show>

      <Show when={props.entity.kind === "Vector"}>
        <div class="px-4 py-2 bg-native-content border-b border-native-subtle flex items-center gap-2">
          <span class="text-[10px] uppercase font-bold text-native-tertiary tracking-tight">Dimensions</span>
          <input
            type="number"
            value={props.entity.vectorDim || ""}
            class="w-16 bg-native-content border border-native rounded px-1.5 py-0.5 text-[11px] font-mono outline-none focus:border-accent/50 transition-colors dark:[color-scheme:dark]"
            placeholder="Auto"
            onInput={(e) =>
              props.onUpdate(props.entity.id, () => ({
                vectorDim: parseInt(e.currentTarget.value) || undefined,
              }))
            }
          />
        </div>
      </Show>

      {/* Properties List */}
      <div class="bg-native-content">
        <Index each={props.entity.properties}>
          {(prop, index) => (
            <PropertyRow
              property={prop()}
              index={index}
              onUpdate={(updates) => handlePropertyUpdate(index, updates)}
              onDelete={() => deleteProperty(index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              diagnostics={props.diagnostics.filter((d) => d.propertyIndex === index)}
              isFocused={newFieldFocused() === index}
              onFocusConsumed={() => setNewFieldFocused(null)}
            />
          )}
        </Index>

        {/* Simplified Add Property Trigger */}
        <button
          onClick={addField}
          class="w-full px-4 py-2 flex items-center gap-2 text-[11px] text-native-tertiary hover:text-accent hover:bg-accent/5 transition-all group/add border-t border-transparent hover:border-accent/10"
        >
          <Plus size={13} class="opacity-60 group-hover/add:opacity-100" />
          <span class="font-medium">Add attribute</span>
        </button>
      </div>

      {/* Diagnostics / Error Footer */}
      <Show when={props.diagnostics.length > 0}>
        <div class="px-4 py-2 bg-error/[0.03] border-t border-native-subtle space-y-1">
          <For each={props.diagnostics}>
            {(d) => (
              <div class={`text-[10px] font-medium flex items-center gap-2 ${d.level === "error" ? "text-error" : "text-warning"}`}>
                <div class="w-1 h-1 rounded-full bg-current" />
                {d.message}
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
