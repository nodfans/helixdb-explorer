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
      <div class={`relative ${local.fullWidth ? "w-full" : "w-64"}`}>
        <input
          {...others}
          type="text"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck={false}
          class={`w-full h-[26px] pl-7 pr-3 rounded-md text-[12px] outline-none transition-all relative z-0 bg-native-elevated border border-native text-native-primary focus:border-accent focus:ring-4 focus:ring-accent/15 focus:shadow-[0_0_0_3px_rgba(0,122,255,0.12)] ${local.class || ""}`}
        />
        <Search size={13} stroke-width={2} class="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none z-10 text-native-tertiary" />
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
      class={`h-[26px] px-2.5 rounded-md text-[12px] outline-none transition-all bg-native-elevated border border-native text-native-primary focus:border-accent focus:ring-4 focus:ring-accent/15 focus:shadow-[0_0_0_3px_rgba(0,122,255,0.12)] disabled:opacity-50 disabled:cursor-not-allowed ${local.fullWidth ? "w-full" : ""} ${local.class || ""}`}
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
      class={`px-3 py-2 rounded-md text-[13px] outline-none transition-all resize-none bg-native-elevated border border-native text-native-primary focus:border-accent focus:ring-4 focus:ring-accent/15 focus:shadow-[0_0_0_3px_rgba(0,122,255,0.12)] font-sans disabled:opacity-50 disabled:cursor-not-allowed ${local.fullWidth ? "w-full" : ""} ${local.class || ""}`}
    />
  );
}
