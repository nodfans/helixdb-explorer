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
    if (variant() === "toolbar" || variant() === "ghost") return false;
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
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-150 cubic-bezier(0.4, 0, 0.2, 1) disabled:opacity-40 disabled:cursor-not-allowed": true,
        "active:scale-[0.97] hover:scale-[1.01]": !local.disabled && !local.loading && shouldScale(),
        [sizeClasses[size()]]: true,
        "bg-[#007AFF] hover:bg-[#0066DD] active:bg-[#0055CC] dark:bg-[#0A84FF] dark:hover:bg-[#0077EE] dark:active:bg-[#0066DD] text-white border-none shadow-[0_1px_3px_rgba(0,122,255,0.3),0_0_0_0.5px_rgba(0,122,255,0.1),inset_0_0.5px_0_rgba(255,255,255,0.2)] hover:shadow-[0_2px_6px_rgba(0,122,255,0.4),0_0_0_0.5px_rgba(0,122,255,0.2),inset_0_0.5px_0_rgba(255,255,255,0.2)] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2),0_0_0_0.5px_rgba(0,122,255,0.2)]":
          variant() === "primary",
        "bg-[#FF3B30] hover:bg-[#E6352B] active:bg-[#CC2F26] dark:bg-[#FF453A] dark:hover:bg-[#E63E34] dark:active:bg-[#CC372E] text-white border-none shadow-[0_1px_3px_rgba(255,59,48,0.3),0_0_0_0.5px_rgba(255,59,48,0.1),inset_0_0.5px_0_rgba(255,255,255,0.2)] hover:shadow-[0_2px_6px_rgba(255,59,48,0.4),0_0_0_0.5px_rgba(255,59,48,0.2),inset_0_0.5px_0_rgba(255,255,255,0.2)] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2),0_0_0_0.5px_rgba(255,59,48,0.2)]":
          variant() === "destructive",
        "border border-native-subtle hover:bg-hover active:bg-active": variant() === "toolbar",
        "bg-accent/15 text-accent border-accent/30": variant() === "toolbar" && local.active,
        "bg-transparent text-native-primary": variant() === "toolbar" && !local.active,
        "border-none hover:bg-hover active:bg-active": variant() === "ghost",
        "bg-accent/15 text-accent": variant() === "ghost" && local.active,
        "bg-transparent text-native-secondary": variant() === "ghost" && !local.active,
        "bg-transparent text-native-primary border border-native hover:bg-hover active:bg-active shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.08)] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]":
          variant() === "default",
        [local.class || ""]: !!local.class,
      }}
      style={typeof local.style === "object" ? local.style : {}}
    >
      <Show when={local.loading}>
        <div
          class="w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin shrink-0"
          classList={{ "border-accent/30 border-t-accent": variant() !== "primary" && variant() !== "destructive" }}
        />
      </Show>
      {local.children}
    </button>
  );
}
