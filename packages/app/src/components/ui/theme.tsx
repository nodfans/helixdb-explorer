import { createSignal, onMount, Show } from "solid-js";
import { Sun, Moon, Monitor, Settings, X, Check } from "lucide-solid";

export type Theme = "light" | "dark" | "system";

interface ThemeSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

// Global theme state
const [currentTheme, setCurrentTheme] = createSignal<Theme>((localStorage.getItem("theme") as Theme) || "system");

// Apply theme to document
const applyTheme = (theme: Theme) => {
  const root = document.documentElement;

  if (theme === "system") {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (isDark) {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }
  } else if (theme === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }

  localStorage.setItem("theme", theme);
};

// Listen for system theme changes
if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (currentTheme() === "system") {
      if (e.matches) {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    }
  });
}

// Export for use in other components
export const useTheme = () => {
  return {
    theme: currentTheme,
    setTheme: (theme: Theme) => {
      setCurrentTheme(theme);
      applyTheme(theme);
    },
  };
};

// Initialize theme on app load
export const initTheme = () => {
  // Always default to system on app start as requested
  setCurrentTheme("system");
  applyTheme("system");
};

export const ThemeSelector = () => {
  const { theme, setTheme } = useTheme();

  onMount(() => {
    // Theme is initialized at the App level
  });

  const themes: { id: Theme; label: string; icon: typeof Sun }[] = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "System", icon: Monitor },
  ];

  return (
    <div class="max-w-md">
      <p class="text-[11px] font-medium text-native-secondary uppercase tracking-wider mb-3">Mode</p>

      <div class="grid grid-cols-3 gap-3">
        {themes.map((t) => (
          <button
            onClick={() => setTheme(t.id)}
            class={`relative flex flex-col items-center gap-3 p-4 rounded-xl border transition-all ${theme() === t.id ? "border-accent bg-selected shadow-macos-sm" : "border-native-subtle hover:border-native bg-native-content hover:bg-hover"}`}
          >
            <t.icon size={22} class={theme() === t.id ? "text-accent" : "text-native-tertiary"} />
            <span class={`text-[13px] font-semibold ${theme() === t.id ? "text-accent" : "text-native-secondary"}`}>{t.label}</span>

            {/* Check mark badge */}
            <Show when={theme() === t.id}>
              <div class="absolute top-1.5 right-1.5 w-4.5 h-4.5 rounded-full bg-accent flex items-center justify-center shadow-macos-sm border border-white/20">
                <Check size={11} class="text-white" />
              </div>
            </Show>
          </button>
        ))}
      </div>

      <p class="mt-4 text-[11px] text-native-tertiary leading-relaxed">Choose how Helix Explorer appears. "System" will automatically match your macOS appearance.</p>
    </div>
  );
};

export const ThemeSettings = (props: ThemeSettingsProps) => {
  return (
    <Show when={props.isOpen}>
      {/* Backdrop */}
      <div class="fixed inset-0 bg-black/30 backdrop-blur-md z-[10001] animate-in fade-in duration-300" onClick={props.onClose} />

      {/* Modal */}
      <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10001] w-[360px] bg-native-elevated border border-native rounded-2xl shadow-macos-md animate-in zoom-in-95 fade-in duration-200">
        {/* Header */}
        <div class="flex items-center justify-between px-5 py-4 border-b border-native">
          <div class="flex items-center gap-2.5">
            <Settings size={18} class="text-accent" />
            <h2 class="text-base font-semibold text-native-primary">Settings</h2>
          </div>
          <button onClick={props.onClose} class="p-1.5 hover:bg-native-content rounded-lg transition-colors">
            <X size={16} class="text-native-secondary" />
          </button>
        </div>

        {/* Content */}
        <div class="p-5">
          <ThemeSelector />
        </div>
      </div>
    </Show>
  );
};

export default ThemeSettings;
