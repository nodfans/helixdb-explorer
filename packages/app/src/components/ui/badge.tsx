import { ParentProps } from "solid-js";

interface BadgeProps extends ParentProps {
  variant?: "success" | "warning" | "error" | "info" | "neutral";
  size?: "xs" | "sm";
  class?: string;
  dot?: boolean;
}

export const Badge = (props: BadgeProps) => {
  const variantClasses = {
    success: "bg-success/15 text-success border-success/30",
    warning: "bg-warning/15 text-warning border-warning/30",
    error: "bg-error/15 text-error border-error/30",
    info: "bg-accent/15 text-accent border-accent/30",
    neutral: "bg-hover text-native-secondary border-native",
  };

  const sizes = {
    xs: "px-1.5 py-0.5 text-[10px]",
    sm: "px-2.5 py-1 text-[11px]",
  };

  return (
    <span
      classList={{
        "inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide": true,
        [sizes[props.size || "sm"]]: true,
        [variantClasses[props.variant || "neutral"]]: true,
        [props.class || ""]: !!props.class,
      }}
    >
      {props.dot && (
        <span
          class="w-1.5 h-1.5 rounded-full"
          classList={{
            "bg-native-tertiary": props.variant === "neutral",
            "bg-current": props.variant !== "neutral",
          }}
        />
      )}
      {props.children}
    </span>
  );
};
