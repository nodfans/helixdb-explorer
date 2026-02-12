import { ParentProps } from "solid-js";

interface BadgeProps extends ParentProps {
  variant?: "success" | "warning" | "error" | "info" | "neutral";
  size?: "xs" | "sm";
  class?: string;
  dot?: boolean;
}

export const Badge = (props: BadgeProps) => {
  const getVariantStyles = () => {
    switch (props.variant) {
      case "success":
        return {
          backgroundColor: "rgba(52, 199, 89, 0.15)",
          color: "var(--macos-green)",
          borderColor: "rgba(52, 199, 89, 0.3)",
        };
      case "warning":
        return {
          backgroundColor: "rgba(255, 149, 0, 0.15)",
          color: "var(--macos-orange)",
          borderColor: "rgba(255, 149, 0, 0.3)",
        };
      case "error":
        return {
          backgroundColor: "rgba(255, 59, 48, 0.15)",
          color: "var(--macos-red)",
          borderColor: "rgba(255, 59, 48, 0.3)",
        };
      case "info":
        return {
          backgroundColor: "rgba(0, 122, 255, 0.15)",
          color: "var(--macos-blue)",
          borderColor: "rgba(0, 122, 255, 0.3)",
        };
      default:
        return {
          backgroundColor: "var(--macos-hover-bg)",
          color: "var(--macos-text-secondary)",
          borderColor: "var(--macos-border-medium)",
        };
    }
  };

  const sizes = {
    xs: "px-1.5 py-0.5 text-[10px]",
    sm: "px-2.5 py-1 text-[11px]",
  };

  return (
    <span class={`inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide ${sizes[props.size || "sm"]} ${props.class || ""}`} style={getVariantStyles()}>
      {props.dot && <span class={`w-1.5 h-1.5 rounded-full ${props.variant === "neutral" ? "bg-macos-text-tertiary" : "bg-current"}`} />}
      {props.children}
    </span>
  );
};
