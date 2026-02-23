import { onMount, onCleanup, createEffect } from "solid-js";
import { EditorView, keymap, highlightSpecialChars, lineNumbers, highlightActiveLineGutter, placeholder, drawSelection } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from "@codemirror/commands";
import { indentOnInput, syntaxHighlighting, bracketMatching, foldGutter, foldKeymap, indentUnit } from "@codemirror/language";
import { autocompletion, completionKeymap, acceptCompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { searchKeymap, search } from "@codemirror/search";

import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "./theme";
import { helixTheme, helixThemeDark, helixHighlightStyle, helixHighlightStyleDark, themeConfig, highlightConfig } from "./hql-theme";

interface CompletionItem {
  label: string;
  kind: string;
  detail: string | null;
}

export interface HQLEditorProps {
  code: string;
  onCodeChange?: (code: string) => void;
  onExecute?: (selectedCode?: string) => void;
  onFormat?: () => void;
  onSelectionChange?: (selectedText: string) => void;
  onGutterWidthChange?: (width: number) => void;
  schema?: {
    nodes: any[];
    edges: any[];
    vectors: any[];
  };
  readOnly?: boolean;
  placeholder?: string;
  language?: any;
}

export const HQLEditor = (props: HQLEditorProps) => {
  let editorParent: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let gutterObserver: ResizeObserver | undefined;
  let lastLocalCode = props.code;
  let codeSyncTimeout: ReturnType<typeof setTimeout> | null = null;
  let isInternalChange = false;
  const { theme: appTheme } = useTheme();

  // Helper to get current theme-specific extensions
  const getThemeExtensions = (isDark: boolean) => {
    return [themeConfig.of(isDark ? helixThemeDark : helixTheme), highlightConfig.of(syntaxHighlighting(isDark ? helixHighlightStyleDark : helixHighlightStyle))];
  };

  onMount(() => {
    if (!editorParent) return;

    // Detect initial theme
    const isInitialDark = appTheme() === "dark" || (appTheme() === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

    const startState = EditorState.create({
      doc: props.code,
      extensions: [
        props.language || [],
        EditorState.tabSize.of(4),
        indentUnit.of("    "),
        lineNumbers(),
        drawSelection(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        search({ top: true }),
        autocompletion({
          override: [
            async (context) => {
              const word = context.matchBefore(/[\w:]*/); // Match words including ::
              if (!word || (word.from == word.to && !context.explicit)) return null;

              // If we are at "::", we want to trigger completion
              const isTrigger = word.text === "::" || context.explicit;

              if (!isTrigger && word.text.length < 1) return null;

              try {
                const suggestions = await invoke<CompletionItem[]>("get_hql_completion", {
                  code: context.state.doc.toString(),
                  cursor: context.pos,
                  schema: props.schema || null,
                });

                if (!suggestions) return null;

                // Detect current query block boundaries (based on empty lines or keywords)
                const fullDoc = context.state.doc.toString();
                const pos = context.pos;
                const lines = fullDoc.split("\n");

                // Find current line index
                let currentLineIdx = 0;
                let charAcc = 0;
                for (let i = 0; i < lines.length; i++) {
                  const lineLen = lines[i].length + 1; // +1 for newline
                  if (charAcc + lineLen > pos) {
                    currentLineIdx = i;
                    break;
                  }
                  charAcc += lineLen;
                }

                // Walk back to find block start
                let startLine = currentLineIdx;
                while (startLine > 0) {
                  const line = lines[startLine - 1].trim();
                  if (line === "" || /^\s*(QUERY|FUNC)\b/i.test(line)) {
                    // If it's a keyword line, include it as start
                    if (/^\s*(QUERY|FUNC)\b/i.test(line)) startLine--;
                    break;
                  }
                  startLine--;
                }

                // Walk forward to find block end
                let endLine = currentLineIdx;
                while (endLine < lines.length - 1) {
                  const line = lines[endLine + 1].trim();
                  if (line === "" || /^\s*(QUERY|FUNC)\b/i.test(line)) break;
                  endLine++;
                }

                // Extract text for current block
                const blockText = lines.slice(startLine, endLine + 1).join("\n");
                const localVars = new Set<string>();

                // Extract variables ONLY from the current block
                // 1. Capture aliases/assignments: user <- N...
                const aliasRegex = /(\w+)\s*<-/g;
                let match;
                while ((match = aliasRegex.exec(blockText)) !== null) {
                  localVars.add(match[1]);
                }

                // 2. Capture query arguments: QUERY Name(abc: String)
                const argRegex = /(?:QUERY|FUNC)\s+\w+\s*\(([^)]+)\)/gi;
                let argMatch;
                while ((argMatch = argRegex.exec(blockText)) !== null) {
                  const argsPart = argMatch[1];
                  const individualArgs = argsPart.split(",");
                  for (const arg of individualArgs) {
                    const parts = arg.trim().split(":");
                    if (parts[0]) {
                      const argName = parts[0].trim().split(/\s+/).pop();
                      if (argName && /^\w+$/.test(argName)) {
                        localVars.add(argName);
                      }
                    }
                  }
                }

                const currentText = word.text.toLowerCase();

                // Merge backend suggestions with local variables
                const allCompletions = [
                  ...suggestions,
                  ...Array.from(localVars).map((name) => ({
                    label: name,
                    kind: "variable",
                    detail: "local",
                  })),
                ];

                const filtered = allCompletions.filter((s) => s.label.toLowerCase().startsWith(currentText)).sort((a, b) => a.label.localeCompare(b.label));

                if (filtered.length === 0) return null;

                return {
                  from: word.from,
                  options: filtered.map((s: any) => ({
                    label: s.label,
                    type: s.kind,
                    detail: s.detail || undefined,
                  })),
                  filter: false, // Disable default fuzzy filter
                };
              } catch (e) {
                console.error("Autocomplete failed", e);
                return null;
              }
            },
          ],
        }),
        keymap.of([
          ...completionKeymap,
          // Custom Tab: Accept Completion -> Indent Selection -> Insert Spaces
          {
            key: "Tab",
            run: (view) => {
              if (acceptCompletion(view)) return true;
              if (!view.state.selection.main.empty) {
                return indentMore(view);
              }
              view.dispatch(view.state.replaceSelection("    "));
              return true;
            },
          },
          {
            key: "Shift-Tab",
            run: indentLess,
          },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...searchKeymap.filter((k) => k.key === "Mod-f" || k.key === "F3" || k.key === "Shift-F3" || k.key === "Mod-g" || k.key === "Shift-Mod-g"),
          {
            key: "Mod-Enter",
            run: () => {
              if (props.onExecute) {
                const selection = view?.state.selection.main;
                const selectedCode = selection && !selection.empty ? view?.state.sliceDoc(selection.from, selection.to) : undefined;
                props.onExecute(selectedCode);
                return true;
              }
              return false;
            },
          },
          {
            key: "Shift-Alt-f",
            run: () => {
              if (props.onFormat) {
                props.onFormat();
                return true;
              }
              return false;
            },
          },
        ]),
        props.readOnly ? EditorState.readOnly.of(true) : [],
        // Allow the editor to be focused even in readOnly mode to enable Cmd+A
        EditorView.editable.of(true),
        props.placeholder ? placeholder(props.placeholder) : [],
        ...getThemeExtensions(isInitialDark),
        EditorView.domEventHandlers({
          paste(event, view) {
            const clipboardData = event.clipboardData;
            if (!clipboardData) return;

            const text = clipboardData.getData("text/plain");
            if (!text || !/[\r\n]/.test(text)) return;

            // Heuristic: If content has newlines but no spaces, it's likely an ID or single token that picked up a newline.
            const trimmed = text.trim();
            if (trimmed.length > 0 && !/\s/.test(trimmed) && (text.includes("\n") || text.includes("\r"))) {
              event.preventDefault();
              view.dispatch(view.state.replaceSelection(trimmed));
              return true;
            }
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            isInternalChange = true;
            if (codeSyncTimeout) clearTimeout(codeSyncTimeout);
            codeSyncTimeout = setTimeout(() => {
              const newCode = update.state.doc.toString();
              if (newCode !== lastLocalCode) {
                lastLocalCode = newCode;
                props.onCodeChange?.(newCode);
              }
              isInternalChange = false;
              codeSyncTimeout = null;
            }, 300); // Decouple typing from Store/UI re-renders
          }
          if (update.selectionSet && props.onSelectionChange) {
            const selection = update.state.selection.main;
            const text = selection.empty ? "" : update.state.sliceDoc(selection.from, selection.to);
            props.onSelectionChange(text);
          }
        }),
      ],
    });

    view = new EditorView({
      state: startState,
      parent: editorParent,
    });

    // Observe gutter width changes
    if (view && props.onGutterWidthChange) {
      const gutters = view.dom.querySelector(".cm-gutters");
      if (gutters) {
        gutterObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            props.onGutterWidthChange!(entry.contentRect.width);
          }
        });
        gutterObserver.observe(gutters);
      }
    }
  });

  onCleanup(() => {
    if (gutterObserver) {
      gutterObserver.disconnect();
    }
    if (view) {
      view.destroy();
    }
  });

  // Update theme when it changes
  createEffect(() => {
    if (view) {
      const isDark = appTheme() === "dark" || (appTheme() === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

      view.dispatch({
        effects: [themeConfig.reconfigure(isDark ? helixThemeDark : helixTheme), highlightConfig.reconfigure(syntaxHighlighting(isDark ? helixHighlightStyleDark : helixHighlightStyle))],
      });
    }
  });

  // Keep editor content in sync with external property changes
  createEffect(() => {
    const externalCode = props.code;
    if (view && !isInternalChange && externalCode !== lastLocalCode) {
      lastLocalCode = externalCode;
      // Save current state
      const scroll = view.scrollDOM.scrollTop;

      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: externalCode },
      });

      // Restore scroll position
      view.requestMeasure({
        read() {
          return {};
        },
        write() {
          if (view) view.scrollDOM.scrollTop = scroll;
        },
      });
    }
  });

  return <div ref={editorParent} class="h-full w-full overflow-hidden" style={{ "font-variant-ligatures": "none" }} />;
};
