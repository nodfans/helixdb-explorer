import { JSX } from "solid-js";

interface ToolbarLayoutProps {
  children: JSX.Element;
  class?: string;
}

export const ToolbarLayout = (props: ToolbarLayoutProps) => {
  return (
    <div
      class={`h-11 w-full flex-none flex items-center px-5 border-b ${props.class || ""}`}
      style={{
        "background-color": "var(--bg-sidebar-vibrant)",
        "border-color": "var(--border-subtle)",
      }}
    >
      {props.children}
    </div>
  );
};
