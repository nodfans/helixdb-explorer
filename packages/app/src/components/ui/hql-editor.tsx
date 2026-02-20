import { onMount, onCleanup, createEffect } from "solid-js";
import { EditorView, keymap, highlightSpecialChars, lineNumbers, highlightActiveLineGutter, placeholder, WidgetType, Decoration, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from "@codemirror/commands";
import { indentOnInput, syntaxHighlighting, bracketMatching, foldGutter, foldKeymap, indentUnit } from "@codemirror/language";
import { autocompletion, completionKeymap, acceptCompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { searchKeymap, search } from "@codemirror/search";
import { Diagnostic, forEachDiagnostic } from "@codemirror/lint";
import { setDiagnostics } from "@codemirror/lint";

class DiagnosticInlineWidget extends WidgetType {
  constructor(readonly message: string) {
    super();
  }
  eq(other: DiagnosticInlineWidget) {
    return other.message == this.message;
  }
  toDOM() {
    let wrap = document.createElement("span");
    wrap.className = "cm-diagnostic-inline";
    wrap.textContent = ` // ${this.message}`;
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

const diagnosticInlineAnnotation = ViewPlugin.fromClass(
  class {
    decorations: any;

    constructor(view: EditorView) {
      this.decorations = this.getDecorations(view);
    }

    update(update: ViewUpdate) {
      // Only update when doc changes, viewport changes, or if the selection moved to a different line
      const lineChanged = update.selectionSet && update.state.doc.lineAt(update.state.selection.main.head).number !== update.startState.doc.lineAt(update.startState.selection.main.head).number;

      if (update.docChanged || update.viewportChanged || lineChanged) {
        this.decorations = this.getDecorations(update.view);
      }
    }

    getDecorations(view: EditorView) {
      let widgets: any[] = [];
      let sel = view.state.selection.main;
      if (!sel.empty) return Decoration.none;

      let line = view.state.doc.lineAt(sel.head);
      forEachDiagnostic(view.state, (d, from, to) => {
        // If the diagnostic overlaps with the current line, show the widget at the end of the line
        if (from <= line.to && to >= line.from) {
          widgets.push(
            Decoration.widget({
              widget: new DiagnosticInlineWidget(d.message),
              side: 1,
            }).range(line.to)
          );
        }
      });

      return Decoration.set(widgets, true);
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);
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
  diagnostics?: Diagnostic[];
  placeholder?: string;
  language?: any;
}

export const HQLEditor = (props: HQLEditorProps) => {
  let editorParent: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let gutterObserver: ResizeObserver | undefined;
  let lintTimeout: ReturnType<typeof setTimeout>;
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
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        diagnosticInlineAnnotation,
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

                if (!suggestions || suggestions.length === 0) return null;

                return {
                  from: word.from,
                  options: suggestions.map((s) => ({
                    label: s.label,
                    type: s.kind,
                    detail: s.detail || undefined,
                  })),
                  // validFor: /^\w*$/, // Let backend decide
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
          if (update.docChanged && props.onCodeChange) {
            props.onCodeChange(update.state.doc.toString());
          }
          if (update.selectionSet && props.onSelectionChange) {
            const selection = update.state.selection.main;
            const text = selection.empty ? "" : update.state.sliceDoc(selection.from, selection.to);
            props.onSelectionChange(text);
          }

          if (update.docChanged) {
            clearTimeout(lintTimeout);
            lintTimeout = setTimeout(async () => {
              const code = update.state.doc.toString();
              if (!code.trim()) {
                update.view.dispatch(setDiagnostics(update.view.state, []));
                return;
              }
              try {
                const diagnostics = await invoke<Diagnostic[]>("validate_hql", { code });
                update.view.dispatch(setDiagnostics(update.view.state, diagnostics));
              } catch (e) {
                console.error("Validation failed:", e);
              }
            }, 1000);
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
    if (view && view.state.doc.toString() !== externalCode) {
      // Save current state
      const scroll = view.scrollDOM.scrollTop;

      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: externalCode },
        // CodeMirror will attempt to map the selection,
        // which usually works well for formatting.
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
