import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { Compartment } from "@codemirror/state";

export const helixTheme = EditorView.theme(
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
      border: "none",
      backgroundColor: "transparent",
    },
    ".cm-tooltip-autocomplete": {
      border: "1px solid rgba(0, 0, 0, 0.06)",
      backgroundColor: "rgba(255, 255, 255, 0.88)",
      backdropFilter: "blur(12px)",
      borderRadius: "8px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)",
      padding: "4px",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete > ul": {
      fontFamily: "var(--font-mono)",
      fontSize: "12px",
    },
    ".cm-tooltip-autocomplete > ul > li": {
      padding: "4px 8px",
      borderRadius: "4px",
      margin: "1px 2px",
      transition: "background-color 0.1s ease",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--accent)",
      color: "#fff",
      borderRadius: "4px",
    },

    ".cm-tooltip-lint": {
      border: "none !important",
      backgroundColor: "transparent !important",
      boxShadow: "none !important",
      padding: "0 !important",
      maxWidth: "none",
      whiteSpace: "nowrap",
      position: "absolute !important",
      zIndex: 100,
    },

    ".cm-diagnostic": {
      padding: "4px 10px",
      display: "inline-block",
      border: "1px solid #e5e7eb",
      borderLeft: "3px solid #f59e0b",
      borderRadius: "3px",
      backgroundColor: "#fefefe",
      color: "#4b5563",
      fontSize: "11.5px",
      fontFamily: "var(--font-sans)",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)",
      whiteSpace: "nowrap",
      position: "relative",
      top: "4px",
    },

    ".cm-diagnosticText": {
      fontFamily: "inherit",
      lineHeight: "1.4",
      fontWeight: "normal",
      whiteSpace: "nowrap",
    },

    ".cm-lintRange-error": {
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='6' height='3' viewBox='0 0 6 3' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 2.5c0.83-1 1.67-1 2.5 0s1.67 1 2.5 0' stroke='%23f59e0b' stroke-width='0.75' fill='none'/%3E%3C/svg%3E")`,
      backgroundPosition: "left bottom",
      backgroundRepeat: "repeat-x",
      paddingBottom: "2px",
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

export const helixThemeDark = EditorView.theme(
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
      border: "none",
      backgroundColor: "transparent",
    },
    ".cm-tooltip-autocomplete": {
      border: "1px solid rgba(255, 255, 255, 0.08)",
      backgroundColor: "rgba(30, 30, 30, 0.85)",
      backdropFilter: "blur(12px)",
      borderRadius: "8px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.28), 0 2px 8px rgba(0, 0, 0, 0.12)",
      padding: "4px",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete > ul": {
      fontFamily: "var(--font-mono)",
      fontSize: "12px",
    },
    ".cm-tooltip-autocomplete > ul > li": {
      padding: "4px 8px",
      borderRadius: "4px",
      margin: "1px 2px",
      transition: "background-color 0.1s ease",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--accent)",
      color: "#fff",
      borderRadius: "4px",
    },

    ".cm-tooltip-lint": {
      border: "none !important",
      backgroundColor: "transparent !important",
      boxShadow: "none !important",
      padding: "0 !important",
      maxWidth: "none",
      whiteSpace: "nowrap",
      position: "absolute !important",
      zIndex: 100,
    },

    ".cm-diagnostic": {
      padding: "4px 10px",
      display: "inline-block",
      border: "1px solid rgba(75, 85, 99, 0.4)",
      borderLeft: "3px solid #fbbf24",
      borderRadius: "3px",
      backgroundColor: "rgba(31, 41, 55, 0.6)",
      backdropFilter: "blur(8px)",
      color: "#e5e7eb",
      fontSize: "11.5px",
      fontFamily: "var(--font-sans)",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.1)",
      whiteSpace: "nowrap",
      position: "relative",
      top: "4px",
    },

    ".cm-diagnosticText": {
      fontFamily: "inherit",
      lineHeight: "1.4",
      fontWeight: "normal",
      whiteSpace: "nowrap",
    },

    ".cm-lintRange-error": {
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='6' height='3' viewBox='0 0 6 3' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 2.5c0.83-1 1.67-1 2.5 0s1.67 1 2.5 0' stroke='%23fbbf24' stroke-width='0.75' fill='none'/%3E%3C/svg%3E")`,
      backgroundPosition: "left bottom",
      backgroundRepeat: "repeat-x",
      paddingBottom: "2px",
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

export const helixHighlightStyle = HighlightStyle.define([
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

export const helixHighlightStyleDark = HighlightStyle.define([
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

export const themeConfig = new Compartment();
export const highlightConfig = new Compartment();
