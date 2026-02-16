import { StreamLanguage } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const HQL_STRUCTURAL_KEYWORDS = ["QUERY", "MIGRATION", "RETURN", "UPDATE", "DROP", "FOR", "IN", "AS", "DEFAULT", "UNIQUE", "INDEX", "EXISTS", "NOW", "NONE"];

export const HQL_TRAVERSALS = [
  "N",
  "E",
  "V",

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

  "SearchV",
  "SearchBM25",
  "PREFILTER",
  "RerankRRF",
  "RerankMMR",
  "Embed",

  "AddN",
  "AddE",
  "AddV",
  "BatchAddV",
  "UpsertN",
  "UpsertE",
  "UpsertV",

  "WHERE",
  "ORDER",
  "RANGE",
  "COUNT",
  "FIRST",
  "AGGREGATE_BY",
  "GROUP_BY",
  "ID",

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

export const HQL_TYPES = ["String", "Boolean", "F32", "F64", "I8", "I16", "I32", "I64", "U8", "U16", "U32", "U64", "U128", "ID", "Date"];

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

export const HQL_NEW_LINE_KEYWORDS = ["RETURN", "RANGE", "ORDER", "WHERE", "UPDATE", "DROP", "FOR"];

export const ALL_HQL_KEYWORDS = [...HQL_STRUCTURAL_KEYWORDS, ...HQL_TRAVERSALS, ...HQL_TYPES, ...HQL_MATH, "Properties"];

// --- Lexer Logic ---
interface HQLState {}
const SOURCE_TOKENS = ["N", "E", "V"];
const STEP_TOKENS = ["WHERE", "ORDER", "RANGE", "COUNT", "FIRST", "Node", "Edge"];

export const hqlLanguage = StreamLanguage.define<HQLState>({
  startState() {
    return {};
  },
  token(stream, _state) {
    if (stream.eatSpace()) return null;
    if (stream.match("//") || stream.match("#")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^"([^"\\\n]|\\.)*"/)) return "string";
    if (stream.match(/^'([^'\\\n]|\\.)*'/)) return "string";
    if (stream.match(/^[0-9]+(\.[0-9]+)?/)) return "number";
    if (stream.match(/^[a-zA-Z_][\w]*|^\`[^\`]*\`/)) {
      const word = stream.current();
      const upperWord = word.toUpperCase();
      if (stream.match(/^\s*:(?!:)/, false)) return "variableName";
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
      const prefix = stream.string.slice(0, stream.start);
      if (/::\s*$/.test(prefix)) {
        if (HQL_TYPES.includes(word)) return "typeName";
        return "variableName";
      }
      return "variableName";
    }
    if (stream.match("=>")) return "operator";
    if (stream.match("::")) return "typeName";
    if (stream.match(/^[:<>-]/)) return "operator";
    stream.next();
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
