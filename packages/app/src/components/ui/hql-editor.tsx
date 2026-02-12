import { onMount, onCleanup, createEffect } from "solid-js";
import { EditorView, keymap, highlightSpecialChars, drawSelection, dropCursor, lineNumbers, highlightActiveLineGutter, placeholder } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { indentOnInput, syntaxHighlighting, bracketMatching, foldGutter, foldKeymap, StreamLanguage, indentUnit } from "@codemirror/language";
import { autocompletion, completionKeymap, acceptCompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { setDiagnostics, Diagnostic } from "@codemirror/lint";
import { tags as t } from "@lezer/highlight";
import { HighlightStyle } from "@codemirror/language";
import { HQL_COMPLETION_OPTIONS, HQL_TRAVERSALS, HQL_TYPES, ALL_HQL_KEYWORDS } from "../../lib/hql-syntax";
import { useTheme } from "../theme";

interface HQLEditorProps {
  code: string;
  onCodeChange?: (code: string) => void;
  onExecute?: (selectedCode?: string) => void;
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

interface HQLState {
  indent: number;
  inBlock: boolean;
  bracketLevel: number;
}

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
      color: "var(--text-primary)", // Follow app text color
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
      backgroundColor: "var(--bg-hover)", // Use app hover color for active line
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
    ".cm-panels": {
      backgroundColor: "var(--bg-sidebar)",
      color: "var(--text-primary)",
      fontWeight: "bold",
    },
    ".cm-tooltip": {
      border: "1px solid var(--border-native)",
      backgroundColor: "var(--bg-sidebar)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--bg-active)",
      color: "var(--text-primary)",
    },
    ".cm-tooltip-lint": {
      display: "none",
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
    ".cm-panels": {
      backgroundColor: "var(--bg-sidebar)",
      color: "var(--text-primary)",
      fontWeight: "bold",
    },
    ".cm-tooltip": {
      border: "1px solid var(--border-native)",
      backgroundColor: "var(--bg-sidebar)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--bg-active)",
      color: "var(--text-primary)",
    },
    ".cm-tooltip-lint": {
      display: "none",
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
    return { indent: 0, inBlock: false, bracketLevel: 0 };
  },
  token(stream, state) {
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
        state.inBlock = true;
      }
      // Detect Query Tail / Structural Terminators
      else if (upperWord === "RETURN" || upperWord === "ORDER" || upperWord === "WHERE" || upperWord === "FOR") {
        // Only reset if NOT preceded by "::" (which would be a trajectory method like N<U>::WHERE)
        const prefix = stream.string.slice(0, stream.start);
        if (!prefix.trim().endsWith("::")) {
          state.inBlock = false;
          state.indent = 0;
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
      if (state.inBlock) state.indent = 4;
      return "operator";
    }
    if (stream.match("::")) return "typeName";
    if (stream.match(/^[:<>-]/)) return "operator";
    const char = stream.next();
    if (char === "{" || char === "(" || char === "[") {
      state.bracketLevel++;
    } else if (char === "}" || char === ")" || char === "]") {
      state.bracketLevel = Math.max(0, state.bracketLevel - 1);
    }
    return null;
  },
  indent(state, textAfter) {
    let base = state.indent;

    // Check if the current line starts with a closing bracket
    const closing = /^[}\])]/.test(textAfter.trim());
    if (closing) {
      return Math.max(0, base + (state.bracketLevel - 1) * 4);
    }

    // Check for top-level keywords that reset indentation
    const structural = /^(RETURN|ORDER|WHERE|FOR)/i.test(textAfter.trim());
    if (structural) {
      return 0;
    }

    return base + state.bracketLevel * 4;
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
        autocompletion({
          override: [
            (context) => {
              let word = context.matchBefore(/\w*/);
              if (!word || (word.from == word.to && !context.explicit)) return null;

              let options = [...HQL_COMPLETION_OPTIONS];

              // Add schema-based suggestions if available
              if (props.schema) {
                const nodes = props.schema.nodes.map((n) => ({
                  label: n.name,
                  type: "class",
                  detail: "Node",
                }));
                const edges = props.schema.edges.map((e) => ({
                  label: e.name,
                  type: "interface",
                  detail: "Edge",
                }));
                const vectors = props.schema.vectors.map((v) => ({
                  label: v.name,
                  type: "namespace",
                  detail: "Vector",
                }));
                options = [...options, ...nodes, ...edges, ...vectors];
              }

              return {
                from: word.from,
                options: options.filter((o) => o.label.toLowerCase().includes(word!.text.toLowerCase())),
                validFor: /^\w*$/,
              };
            },
          ],
        }),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          indentWithTab,
          { key: "Tab", run: acceptCompletion },
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
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: externalCode },
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
