import { onMount, onCleanup, createEffect } from "solid-js";
import { EditorView, keymap, highlightSpecialChars, drawSelection, dropCursor, lineNumbers, highlightActiveLineGutter, placeholder, hoverTooltip } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from "@codemirror/commands";
import { indentOnInput, syntaxHighlighting, bracketMatching, foldGutter, foldKeymap, StreamLanguage, indentUnit } from "@codemirror/language";
import { autocompletion, completionKeymap, acceptCompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { searchKeymap, search } from "@codemirror/search";
import { setDiagnostics, Diagnostic, linter, lintGutter } from "@codemirror/lint";
import { invoke } from "@tauri-apps/api/core";
import { tags as t } from "@lezer/highlight";
import { HighlightStyle } from "@codemirror/language";
import { HQL_TRAVERSALS, HQL_TYPES, ALL_HQL_KEYWORDS } from "../../lib/hql-syntax";
import { useTheme } from "../theme";

interface CompletionItem {
  label: string;
  kind: string;
  detail: string | null;
}

interface HQLEditorProps {
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
}

interface HQLState {}

const helixTheme = EditorView.theme(
  {
    "&": {
      fontSize: "12px",
      lineHeight: "1.6",
      backgroundColor: "transparent",
      height: "100%",
    },
    ".cm-content": {
      fontFamily: "var(--font-mono)",
      padding: "10px 0",
      color: "var(--text-primary)",
      whiteSpace: "pre !important",
      tabSize: 4,
    },
    ".cm-line": {
      display: "block",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      borderRight: "1px solid var(--border-subtle)",
      color: "var(--text-tertiary)",
      fontSize: "11px",
      minWidth: "24px",
      marginRight: "4px",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--bg-hover)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--accent)",
      fontWeight: "bold",
    },
    ".cm-cursor": {
      borderLeft: "2px solid var(--accent)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "var(--bg-selected) !important",
    },
    ".cm-panels-top": {
      borderBottom: "none",
    },
    ".cm-panels": {
      backgroundColor: "transparent",
      color: "var(--text-primary)",
      fontWeight: "bold",
      position: "absolute !important",
      top: "8px !important",
      right: "20px !important",
      left: "auto !important",
      width: "auto !important",
      zIndex: 100,
    },
    ".cm-tooltip": {
      border: "1px solid var(--border-native)",
      backgroundColor: "var(--bg-sidebar)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--bg-active)",
      color: "var(--text-primary)",
    },

    ".cm-search [name=replace], .cm-search [name=replaceAll], .cm-search button[name=replace], .cm-search button[name=replaceAll], .cm-search label:has([name=replace]), .cm-search label:has([name=replaceAll]), .cm-search label:has([name=case]), .cm-search label:has([name=re]), .cm-search label:has([name=word])":
      {
        display: "none !important",
      },
    ".cm-search br": {
      display: "none",
    },
    ".cm-search": {
      padding: "4px 8px !important",
      display: "flex !important",
      alignItems: "center !important",
      gap: "2px",
      backgroundColor: "var(--bg-elevated) !important",
      backdropFilter: "blur(8px)",
      border: "1px solid var(--border-native)",
      borderRadius: "6px",
      boxShadow: "0 6px 20px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.05)",
      fontSize: "11px",
      whiteSpace: "nowrap",
    },
    ".cm-search .cm-textfield": {
      backgroundColor: "var(--bg-input) !important",
      border: "1px solid var(--border-subtle) !important",
      borderRadius: "3px !important",
      padding: "2px 6px !important",
      color: "var(--text-primary) !important",
      outline: "none !important",
      fontSize: "11px",
      width: "140px",
      marginRight: "2px",
    },
    ".cm-search .cm-textfield:focus": {
      borderColor: "var(--accent) !important",
    },
    ".cm-search .cm-button, .cm-search button": {
      backgroundColor: "transparent !important",
      backgroundImage: "none !important",
      border: "none !important",
      borderRadius: "4px !important",
      color: "var(--text-secondary) !important",
      padding: "0 !important",
      cursor: "pointer",
      display: "flex !important",
      alignItems: "center !important",
      justifyContent: "center !important",
      width: "20px !important",
      minWidth: "20px !important",
      height: "20px !important",
      transition: "background-color 0.1s ease",
      flexShrink: 0,
      fontSize: "0 !important",
      textIndent: "-9999px",
      overflow: "hidden",
    },
    ".cm-search .cm-button:hover, .cm-search button:hover": {
      backgroundColor: "var(--bg-hover) !important",
      color: "var(--text-primary) !important",
    },
    ".cm-search [name=prev]": {
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23666666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m18 15-6-6-6 6'/%3E%3C/svg%3E\") !important",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
    },
    ".cm-search [name=next]": {
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23666666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\") !important",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      marginRight: "2px",
    },
    ".cm-search [name=select]": {
      display: "none !important",
    },
    ".cm-search [name=close]": {
      position: "relative !important",
      top: "auto !important",
      right: "auto !important",
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23666666' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 6 6 18'/%3E%3Cpath d='m6 6 12 12'/%3E%3C/svg%3E\") !important",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      opacity: 0.7,
    },
    ".cm-search [name=close]:hover": {
      opacity: 1,
      backgroundColor: "var(--bg-hover) !important",
    },
    ".cm-searchMatch": {
      backgroundColor: "rgba(0, 122, 255, 0.12) !important",
      borderRadius: "2px",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "rgba(0, 122, 255, 0.35) !important",
      borderRadius: "2px",
    },
  },
  { dark: false }
);

const helixThemeDark = EditorView.theme(
  {
    "&": {
      fontSize: "12px",
      lineHeight: "1.6",
      backgroundColor: "transparent",
      height: "100%",
    },
    ".cm-content": {
      fontFamily: "var(--font-mono)",
      padding: "10px 0",
      color: "var(--text-primary)",
      whiteSpace: "pre !important",
      tabSize: 4,
    },
    ".cm-line": {
      display: "block",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      borderRight: "1px solid var(--border-color)",
      color: "var(--text-tertiary)",
      fontSize: "11px",
      minWidth: "24px",
      marginRight: "4px",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--bg-hover)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--accent)",
      fontWeight: "bold",
    },
    ".cm-cursor": {
      borderLeft: "2px solid var(--accent)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "var(--bg-selected) !important",
    },
    ".cm-panels-top": {
      borderBottom: "none",
    },
    ".cm-panels": {
      backgroundColor: "transparent",
      color: "var(--text-primary)",
      fontWeight: "bold",
      position: "absolute !important",
      top: "8px !important",
      right: "20px !important",
      left: "auto !important",
      width: "auto !important",
      zIndex: 100,
    },
    ".cm-tooltip": {
      border: "1px solid var(--border-native)",
      backgroundColor: "var(--bg-sidebar)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--bg-active)",
      color: "var(--text-primary)",
    },

    ".cm-search [name=replace], .cm-search [name=replaceAll], .cm-search button[name=replace], .cm-search button[name=replaceAll], .cm-search label:has([name=replace]), .cm-search label:has([name=replaceAll]), .cm-search label:has([name=case]), .cm-search label:has([name=re]), .cm-search label:has([name=word])":
      {
        display: "none !important",
      },
    ".cm-search br": {
      display: "none",
    },
    ".cm-search": {
      padding: "4px 8px !important",
      display: "flex !important",
      alignItems: "center !important",
      gap: "2px",
      backgroundColor: "var(--bg-elevated) !important",
      backdropFilter: "blur(8px)",
      border: "1px solid var(--border-native)",
      borderRadius: "6px",
      boxShadow: "0 6px 20px rgba(0, 0, 0, 0.4)",
      fontSize: "11px",
      whiteSpace: "nowrap",
    },
    ".cm-search .cm-textfield": {
      backgroundColor: "var(--bg-input) !important",
      border: "1px solid var(--border-subtle) !important",
      borderRadius: "3px !important",
      padding: "2px 6px !important",
      color: "var(--text-primary) !important",
      outline: "none !important",
      fontSize: "11px",
      width: "140px",
      marginRight: "2px",
    },
    ".cm-search .cm-textfield:focus": {
      borderColor: "var(--accent) !important",
    },
    ".cm-search .cm-button, .cm-search button": {
      backgroundColor: "transparent !important",
      backgroundImage: "none !important",
      border: "none !important",
      borderRadius: "4px !important",
      color: "var(--text-secondary) !important",
      padding: "0 !important",
      cursor: "pointer",
      display: "flex !important",
      alignItems: "center !important",
      justifyContent: "center !important",
      width: "20px !important",
      minWidth: "20px !important",
      height: "20px !important",
      transition: "background-color 0.1s ease",
      flexShrink: 0,
      fontSize: "0 !important",
      textIndent: "-9999px",
      overflow: "hidden",
    },
    ".cm-search .cm-button:hover, .cm-search button:hover": {
      backgroundColor: "var(--bg-hover) !important",
      color: "var(--text-primary) !important",
    },
    ".cm-search [name=prev]": {
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m18 15-6-6-6 6'/%3E%3C/svg%3E\") !important",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      opacity: 0.8,
    },
    ".cm-search [name=next]": {
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\") !important",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      opacity: 0.8,
      marginRight: "2px",
    },
    ".cm-search [name=select]": {
      display: "none !important",
    },
    ".cm-search [name=close]": {
      position: "relative !important",
      top: "auto !important",
      right: "auto !important",
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 6 6 18'/%3E%3Cpath d='m6 6 12 12'/%3E%3C/svg%3E\") !important",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      opacity: 0.6,
    },
    ".cm-search [name=close]:hover": {
      opacity: 1,
      backgroundColor: "var(--bg-hover) !important",
    },
    ".cm-searchMatch": {
      backgroundColor: "rgba(10, 132, 255, 0.15) !important",
      borderRadius: "2px",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "rgba(10, 132, 255, 0.45) !important",
      borderRadius: "2px",
    },
  },
  { dark: true }
);

const helixHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "#EA580C" },
  { tag: t.function(t.variableName), color: "#9333EA" },
  { tag: t.string, color: "#E11D48" },
  { tag: t.number, color: "#16A34A" },
  { tag: t.bool, color: "#CA8A04" },
  { tag: t.variableName, color: "#334155" },
  { tag: t.typeName, color: "#3b82f6" },
  { tag: t.className, color: "#2563EB" },
  { tag: t.operator, color: "#EA580C" },
  { tag: t.comment, color: "var(--text-tertiary)" },
]);

const helixHighlightStyleDark = HighlightStyle.define([
  { tag: t.keyword, color: "#f97316" },
  { tag: t.function(t.variableName), color: "#BD93F9" },
  { tag: t.string, color: "#FF6B9D" },
  { tag: t.number, color: "#50FA7B" },
  { tag: t.bool, color: "#F1FA8C" },
  { tag: t.variableName, color: "#e5e7eb" },
  { tag: t.typeName, color: "#60a5fa" },
  { tag: t.className, color: "#60a5fa" },
  { tag: t.operator, color: "#f97316" },
  { tag: t.comment, color: "var(--text-tertiary)" },
]);

const SOURCE_TOKENS = ["N", "E", "V"];
const STEP_TOKENS = ["WHERE", "ORDER", "RANGE", "COUNT", "FIRST", "Node", "Edge"];

const hqlLanguage = StreamLanguage.define<HQLState>({
  startState() {
    return {};
  },
  token(stream, _state) {
    if (stream.eatSpace()) return null;

    // Comments
    if (stream.match("//") || stream.match("#")) {
      stream.skipToEnd();
      return "comment";
    }

    // Strings
    if (stream.match(/^"([^"\\\n]|\\.)*"/)) return "string";
    if (stream.match(/^'([^'\\\n]|\\.)*'/)) return "string";

    // Numbers
    if (stream.match(/^[0-9]+(\.[0-9]+)?/)) return "number";

    // Identifiers and Keywords
    if (stream.match(/^[a-zA-Z_][\w]*|^\`[^\`]*\`/)) {
      const word = stream.current();
      const upperWord = word.toUpperCase();

      // Check if it's a property key (followed by : but not ::)
      if (stream.match(/^\s*:(?!:)/, false)) {
        return "variableName";
      }

      // Detect Top-Level Header start
      if (upperWord === "QUERY" || upperWord === "MIGRATION") {
        // state.inBlock = true; // Removed legacy reasoning
      }
      // Detect Query Tail / Structural Terminators
      else if (upperWord === "RETURN" || upperWord === "ORDER" || upperWord === "WHERE" || upperWord === "FOR") {
        // Only reset if NOT preceded by "::" (which would be a trajectory method like N<U>::WHERE)
        const prefix = stream.string.slice(0, stream.start);
        if (!prefix.trim().endsWith("::")) {
          // state.inBlock = false;
          // state.indent = 0;
        }
      }

      if (upperWord === "TRUE" || upperWord === "FALSE") return "bool";

      if (ALL_HQL_KEYWORDS.includes(upperWord)) {
        if (HQL_TRAVERSALS.includes(word)) {
          if (SOURCE_TOKENS.includes(word)) return "sourceName";
          if (STEP_TOKENS.includes(word)) return "typeName";
          return "functionName";
        }
        if (HQL_TYPES.includes(word)) return "typeName";
        return "keyword";
      }

      // Check context for "::" prefix (Type Annotation or Method Chain)
      const prefix = stream.string.slice(0, stream.start);
      // Check if immediately preceded by :: (ignoring spaces is handled by tokenizer eating spaces)
      // We look at the raw string before the current token start
      const isTypeContext = /::\s*$/.test(prefix);
      if (isTypeContext) {
        // If it's a known type (e.g. ::String), keep it colored
        if (HQL_TYPES.includes(word)) return "typeName";
        // Otherwise (e.g. ::Customer), keep it white
        return "variableName";
      }

      return "variableName";
    }

    // Operators
    if (stream.match("=>")) {
      return "operator";
    }
    if (stream.match("::")) return "typeName";
    if (stream.match(/^[:<>-]/)) return "operator";
    const char = stream.next();
    // Brackets tracking removed as indentation is handled by backend
    if (char === "{" || char === "(" || char === "[") {
      // state.bracketLevel++;
    } else if (char === "}" || char === ")" || char === "]") {
      // state.bracketLevel = Math.max(0, state.bracketLevel - 1);
    }
    return null;
  },

  languageData: {
    commentTokens: { line: "//" },
    closeBrackets: { brackets: ["(", "[", "{", " ' ", '"'] },
  },
  tokenTable: {
    comment: t.comment,
    string: t.string,
    number: t.number,
    bool: t.bool,
    keyword: t.keyword,
    variableName: t.variableName,
    sourceName: t.className,
    typeName: t.typeName,
    operator: t.operator,
    functionName: t.function(t.variableName),
  },
});

const themeConfig = new Compartment();
const highlightConfig = new Compartment();

export const HQLEditor = (props: HQLEditorProps) => {
  let editorParent: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let gutterObserver: ResizeObserver | undefined;
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
        hqlLanguage,
        EditorState.tabSize.of(4),
        indentUnit.of("    "),
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
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
        EditorView.updateListener.of((update) => {
          if (update.docChanged && props.onCodeChange) {
            props.onCodeChange(update.state.doc.toString());
          }
          if (update.selectionSet && props.onSelectionChange) {
            const selection = update.state.selection.main;
            const text = selection.empty ? "" : update.state.sliceDoc(selection.from, selection.to);
            props.onSelectionChange(text);
          }
        }),
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
        linter(
          async (view) => {
            const code = view.state.doc.toString();
            if (!code.trim()) return [];

            try {
              // Debug validation
              console.log("[HQL Validation] Checking code:", code);
              const diagnostics = await invoke<Diagnostic[]>("validate_hql", { code });
              console.log("[HQL Validation] Result:", diagnostics);
              return diagnostics;
            } catch (e) {
              console.error("Validation failed:", e);
              return [];
            }
          },
          { delay: 500 }
        ),
        hoverTooltip((_view, _pos, _side) => {
          return null; // Let default lint tooltip handle it, just need to enable the extension
        }),
        lintGutter(),
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

  // Update diagnostics when they change
  createEffect(() => {
    if (view && props.diagnostics !== undefined) {
      view.dispatch(setDiagnostics(view.state, props.diagnostics));
    }
  });

  return <div ref={editorParent} class="h-full w-full overflow-hidden" style={{ "font-variant-ligatures": "none" }} />;
};
