import { JSX } from "solid-js";

interface ToolbarLayoutProps {
  children: JSX.Element;
  class?: string;
}

export const ToolbarLayout = (props: ToolbarLayoutProps) => {
  return (
    <div
      class={`h-11 w-full min-w-0 flex-none flex items-center gap-3 overflow-x-auto overflow-y-hidden whitespace-nowrap scrollbar-hide px-5 border-b ${props.class || ""}`}
      style={{
        "background-color": "var(--bg-toolbar)",
        "border-color": "var(--border-subtle)",
      }}
    >
      {props.children}
    </div>
  );
};
