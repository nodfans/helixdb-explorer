import { Component, JSX } from "solid-js";

interface EmptyStateProps {
  icon: Component<{ size?: number; class?: string }>;
  title: string;
  description?: string;
  variant?: "large" | "compact";
  class?: string;
  children?: JSX.Element;
}

export const EmptyState = (props: EmptyStateProps) => {
  const isLarge = () => props.variant !== "compact";

  return (
    <div
      class={`flex flex-col items-center justify-center text-center p-8 transition-all ${props.class || ""}`}
      classList={{
        "flex-1 h-full": isLarge(),
        "h-full bg-native-sidebar/30": !isLarge(),
      }}
    >
      <div class="relative mb-6 group">
        {/* Minimalist glow effect */}
        <div class="absolute inset-0 bg-accent/20 blur-3xl rounded-full scale-150 opacity-0 group-hover:opacity-100 transition-all duration-1000" classList={{ hidden: !isLarge() }} />
        <div class="relative z-10 flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
          <props.icon size={isLarge() ? 64 : 32} class="text-native-quaternary/70 dark:text-native-tertiary/70" />
        </div>
      </div>

      <h3
        class="font-semibold text-native-primary mb-2"
        classList={{
          "text-[15px]": isLarge(),
          "text-[13px]": !isLarge(),
        }}
      >
        {props.title}
      </h3>

      {props.description && (
        <p
          class="text-native-secondary mx-auto leading-relaxed whitespace-nowrap"
          classList={{
            "text-[13px]": isLarge(),
            "text-[11px]": !isLarge(),
          }}
        >
          {props.description}
        </p>
      )}

      {props.children && <div class="mt-6">{props.children}</div>}
    </div>
  );
};
