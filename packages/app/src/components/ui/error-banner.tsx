import { Show } from "solid-js";
import { CircleAlert } from "lucide-solid";
import { normalizeError, type UiError } from "../../lib/error-normalizer";

interface ErrorBannerProps {
  error: unknown;
  class?: string;
}

export const ErrorBanner = (props: ErrorBannerProps) => {
  const uiError = () => normalizeError(props.error) as UiError;

  return (
    <div class={`p-1 text-left ${props.class || ""}`}>
      <div class="flex items-start gap-2.5">
        <CircleAlert class="mt-0.5 h-4 w-4 text-status-error shrink-0" />
        <div class="min-w-0">
          <div class="text-[12px] font-semibold text-native-primary">
            {uiError().title} <span class="text-native-tertiary font-mono ml-1">[{uiError().code}]</span>
          </div>
          <div class="mt-1 text-[12px] text-native-secondary leading-relaxed">{uiError().message}</div>
          <Show when={uiError().hint}>
            <div class="mt-2 text-[11px] text-native-tertiary">Hint: {uiError().hint}</div>
          </Show>
        </div>
      </div>
    </div>
  );
};
