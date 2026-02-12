/**
 * HQL Syntax Definitions
 * Single source of truth for HQL keywords, traversals, and types.
 */

// Top-level structural keywords (Orange/Header level)
export const HQL_STRUCTURAL_KEYWORDS = ["QUERY", "MIGRATION", "RETURN", "UPDATE", "DROP", "FOR", "IN", "AS", "DEFAULT", "UNIQUE", "INDEX", "EXISTS", "NOW", "NONE"];

// Traversal and Step Helpers (Blue/Purple level)
export const HQL_TRAVERSALS = [
  // Entry Points
  "N",
  "E",
  "V",

  // Graph Traversals
  "Out",
  "In",
  "OutE",
  "InE",
  "FromN",
  "ToN",
  "FromV",
  "ToV",
  "ShortestPath",
  "ShortestPathDijkstras",
  "ShortestPathBFS",
  "ShortestPathAStar",

  // Vector / Search
  "SearchV",
  "SearchBM25",
  "PREFILTER",
  "RerankRRF",
  "RerankMMR",
  "Embed",

  // Creation / Mutation
  "AddN",
  "AddE",
  "AddV",
  "BatchAddV",
  "UpsertN",
  "UpsertE",
  "UpsertV",

  // Chain Steps (WHERE, ORDER, RANGE are actually steps in HQL!)
  "WHERE",
  "ORDER",
  "RANGE",
  "COUNT",
  "FIRST",
  "AGGREGATE_BY",
  "GROUP_BY",
  "ID",

  // Logic within steps
  "AND",
  "OR",
  "GT",
  "GTE",
  "LT",
  "LTE",
  "EQ",
  "NEQ",
  "IS_IN",
  "CONTAINS",
  "Asc",
  "Desc",
];

// Built-in Scalar Types
export const HQL_TYPES = ["String", "Boolean", "F32", "F64", "I8", "I16", "I32", "I64", "U8", "U16", "U32", "U64", "U128", "ID", "Date"];

// Math and Aggregate functions
export const HQL_MATH = [
  "ADD",
  "SUB",
  "MUL",
  "DIV",
  "POW",
  "MOD",
  "ABS",
  "SQRT",
  "LN",
  "LOG10",
  "LOG",
  "EXP",
  "CEIL",
  "FLOOR",
  "ROUND",
  "SIN",
  "COS",
  "TAN",
  "ASIN",
  "ACOS",
  "ATAN",
  "ATAN2",
  "PI",
  "MIN",
  "MAX",
  "SUM",
  "AVG",
];

// Keywords that typically trigger a new line in formatting
export const HQL_NEW_LINE_KEYWORDS = ["RETURN", "RANGE", "ORDER", "WHERE", "UPDATE", "DROP", "FOR"];

// Utility: All keywords in uppercase for easy lookup
export const ALL_HQL_KEYWORDS = [...HQL_STRUCTURAL_KEYWORDS, ...HQL_TRAVERSALS, ...HQL_TYPES, ...HQL_MATH].map((k) => k.toUpperCase());

// Utility: Completion options for CodeMirror
export const HQL_COMPLETION_OPTIONS = [
  ...HQL_STRUCTURAL_KEYWORDS.map((k) => ({ label: k, type: "keyword" })),
  ...HQL_TRAVERSALS.map((k) => ({ label: k, type: "function" })),
  ...HQL_TYPES.map((k) => ({ label: k, type: "type" })),
  ...HQL_MATH.map((k) => ({ label: k, type: "function", detail: "math" })),
];
