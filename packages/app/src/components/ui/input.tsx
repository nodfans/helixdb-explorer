import { JSX, splitProps } from "solid-js";
import { Search } from "lucide-solid";

interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "search";
  fullWidth?: boolean;
}

export function Input(props: InputProps) {
  const [local, others] = splitProps(props, ["variant", "fullWidth", "class"]);

  if (local.variant === "search") {
    return (
      <div class={`relative ${local.fullWidth ? "w-full" : "w-64"} ${local.class || ""}`}>
        <input
          {...others}
          type="text"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck={false}
          class="w-full h-[28px] pl-9 pr-3 rounded-md text-[13px] outline-none transition-all relative z-0 bg-native-elevated border border-native text-native-primary focus:border-accent"
        />
        <Search size={16} stroke-width={2} class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10 text-native-tertiary" />
      </div>
    );
  }

  return (
    <input
      {...others}
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck={false}
      class={`h-[28px] px-3 rounded-md text-[13px] outline-none transition-all bg-native-elevated border border-native text-native-primary focus:border-accent ${local.fullWidth ? "w-full" : ""} ${local.class || ""}`}
    />
  );
}

interface TextareaProps extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {
  fullWidth?: boolean;
}

export function Textarea(props: TextareaProps) {
  const [local, others] = splitProps(props, ["fullWidth", "class"]);

  return (
    <textarea
      {...others}
      class={`px-3 py-2 rounded-md text-[13px] outline-none transition-all resize-none bg-native-elevated border border-native text-native-primary focus:border-accent font-sans ${local.fullWidth ? "w-full" : ""} ${local.class || ""}`}
    />
  );
}
