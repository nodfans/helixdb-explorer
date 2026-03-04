import { JSX, ParentProps, splitProps, createMemo, Show } from "solid-js";

interface ButtonProps extends ParentProps, JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "destructive" | "toolbar" | "ghost";
  size?: "sm" | "md" | "lg";
  active?: boolean;
  loading?: boolean;
  noScale?: boolean;
}

export function Button(props: ButtonProps) {
  const [local, others] = splitProps(props, ["variant", "size", "class", "children", "disabled", "style", "active", "loading", "noScale"]);

  const variant = createMemo(() => local.variant || "default");
  const size = createMemo(() => local.size || "md");
  const shouldScale = createMemo(() => {
    if (local.noScale !== undefined) return !local.noScale;
    if (variant() === "toolbar" || variant() === "ghost" || variant() === "primary") return false;
    return true;
  });

  const sizeClasses = {
    sm: "h-[24px] px-2 text-[11px]",
    md: "h-[28px] px-3 text-[11px]",
    lg: "h-[32px] px-3.5 text-[12px]",
  };

  return (
    <button
      {...others}
      disabled={local.disabled || local.loading}
      classList={{
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-150 cubic-bezier(0.4, 0, 0.2, 1) disabled:opacity-40 disabled:cursor-not-allowed": true,
        "active:scale-[0.97] hover:scale-[1.01]": !local.disabled && !local.loading && shouldScale(),
        [sizeClasses[size()]]: true,
        "border text-[var(--button-primary-text)] [background:var(--button-primary-bg)] [border-color:var(--button-primary-border)] [box-shadow:var(--button-primary-shadow)] active:[background:var(--button-primary-active)] active:[box-shadow:var(--button-primary-shadow-active)]":
          variant() === "primary",
        "border border-transparent text-white bg-[var(--status-error)] hover:[background:var(--status-error-hover)] active:[background:var(--status-error-active)] [box-shadow:var(--button-destructive-shadow)] hover:[box-shadow:var(--button-destructive-shadow-hover)] active:[box-shadow:var(--button-destructive-shadow-active)]":
          variant() === "destructive",
        "border border-native-subtle hover:bg-hover active:bg-active": variant() === "toolbar" && !local.active,
        "border [background:var(--control-selected-bg)] [border-color:var(--control-selected-border)] [color:var(--control-selected-text)] [box-shadow:var(--control-selected-shadow)]":
          variant() === "toolbar" && local.active,
        "bg-transparent text-native-primary": variant() === "toolbar" && !local.active,
        "border-none hover:bg-hover active:bg-active": variant() === "ghost",
        "[background:var(--control-selected-bg)] [color:var(--control-selected-text)]": variant() === "ghost" && local.active,
        "bg-transparent text-native-secondary": variant() === "ghost" && !local.active,
        "text-native-primary border [background:var(--button-default-bg)] [border-color:var(--button-default-border)] [box-shadow:var(--button-default-shadow)] hover:[background:var(--button-default-hover)] hover:[box-shadow:var(--button-default-shadow-hover)] active:[background:var(--button-default-active)] active:[box-shadow:var(--button-default-shadow-active)]":
          variant() === "default",
        [local.class || ""]: !!local.class,
      }}
      style={typeof local.style === "object" ? local.style : {}}
    >
      <Show when={local.loading}>
        <div
          class="w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin shrink-0"
          classList={{ "[border-color:color-mix(in_srgb,var(--toolbar-icon)_24%,transparent)] [border-top-color:var(--toolbar-icon)]": variant() !== "primary" && variant() !== "destructive" }}
        />
      </Show>
      {local.children}
    </button>
  );
}
