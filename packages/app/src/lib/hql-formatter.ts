import { HQL_STRUCTURAL_KEYWORDS, HQL_TRAVERSALS, HQL_TYPES } from "./hql-syntax";

const MAJOR_KEYWORDS = HQL_STRUCTURAL_KEYWORDS;
const HELPERS = HQL_TRAVERSALS;

export function formatHQL(code: string): string {
  if (!code) return "";

  const lines = code.split(/\r?\n/);
  const formattedLines: string[] = [];
  let inQuery = false;
  let queryBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed && !inQuery) continue;

    if (/\b(QUERY|MIGRATION)\b/i.test(trimmed)) {
      if (inQuery) {
        formattedLines.push(...formatBlock(queryBuffer));
        queryBuffer = [];
      }
      inQuery = true;
    }

    if (inQuery) {
      queryBuffer.push(line);

      let queryEnds = false;
      if (i === lines.length - 1) {
        queryEnds = true;
      } else {
        for (let j = i + 1; j < lines.length; j++) {
          const nextTrim = lines[j].trim();
          if (!nextTrim) continue;
          if (/\b(QUERY|MIGRATION)\b/i.test(nextTrim)) {
            queryEnds = true;
            break;
          }
          if (nextTrim.startsWith("//") || nextTrim.startsWith("#") || nextTrim.startsWith("/*")) {
            let foundNext = false;
            for (let k = j + 1; k < lines.length; k++) {
              const kTrim = lines[k].trim();
              if (kTrim) {
                if (/\b(QUERY|MIGRATION)\b/i.test(kTrim)) queryEnds = true;
                foundNext = true;
                break;
              }
            }
            if (foundNext) break;
          }
          break;
        }
      }

      if (queryEnds) {
        formattedLines.push(...formatBlock(queryBuffer));
        formattedLines.push("");
        queryBuffer = [];
        inQuery = false;
      }
    } else {
      formattedLines.push(capitalizeKeywords(trimmed));
    }
  }

  return formattedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([A-Z0-9'"}\)])\n+(\/\/|#|\/\*)/g, "$1\n\n$2")
    .trim();
}

function formatBlock(lines: string[]): string[] {
  const text = lines.join(" ").replace(/\s+/g, " ");
  const match = text.match(/\b(QUERY|MIGRATION)\b\s+(.*?)\s*=>\s*(.*)/i);

  if (!match) return lines;

  const type = match[1].toUpperCase();
  const header = `${type} ${match[2].trim().replace(/\s+\(/g, "(")} =>`;
  let bodyText = match[3].trim();

  const resultLines: string[] = [capitalizeKeywords(header)];

  const returnIdx = bodyText.toUpperCase().lastIndexOf(" RETURN ");
  if (returnIdx === -1) {
    resultLines.push("    " + capitalizeKeywords(bodyText));
    return resultLines;
  }

  const mainBody = bodyText.substring(0, returnIdx).trim();
  const returnPart = bodyText.substring(returnIdx + 8).trim();

  // Split by variable assignment, DROP keyword, OR comment starts
  const statements = mainBody
    .split(/(?=\b[a-zA-Z_]\w*\s*<-)|(?=\bDROP\b)|(?=\/\/|#|\/\*)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    // If it's a standalone comment, just push it
    if (stmt.startsWith("//") || stmt.startsWith("#") || stmt.startsWith("/*")) {
      resultLines.push("    " + stmt);
      continue;
    }

    const arrowIdx = stmt.indexOf("<-");
    if (arrowIdx === -1) {
      resultLines.push("    " + capitalizeKeywords(stmt));
      continue;
    }

    const varName = stmt.substring(0, arrowIdx).trim();
    const expression = stmt.substring(arrowIdx + 2).trim();

    const parts = splitByDoubleColonSafe(expression);

    // Apply capitalization to all parts
    const capitalizedParts = parts.map(capitalizeKeywords);

    // Check ALL parts for multi-prop objects
    let isMultiLine = false;
    for (let i = 0; i < capitalizedParts.length; i++) {
      if (capitalizedParts[i].includes("{") && capitalizedParts[i].includes(",")) {
        capitalizedParts[i] = capitalizedParts[i].replace(/(\{)(.*?)(\})/g, (match, open, content, close) => {
          // Only format if there are commas inside
          if (!content.includes(",")) return match;

          const props = content
            .split(",")
            .map((p: string) => p.trim())
            .filter((p: string) => p);
          if (props.length <= 1) return match;

          isMultiLine = true;
          const indent = "\n        ";
          return `${open}${indent}${props.join("," + indent)}\n    ${close}`;
        });
      }
    }

    // LOGIC: When to collapse to single line?
    const isCompact =
      parts.length <= 2 ||
      (!isMultiLine &&
        parts.slice(1).every((p) => {
          const up = p.toUpperCase();
          return up.startsWith("WHERE") || up.startsWith("RANGE") || up.startsWith("COUNT") || up.startsWith("GROUP_BY") || up.startsWith("OUT") || up.startsWith("IN") || p.length < 20;
        }));

    if (isCompact) {
      const joined = capitalizedParts.join("::");
      resultLines.push(`    ${varName} <- ${joined}`);
    } else {
      resultLines.push(`    ${varName} <- ${capitalizedParts[0]}`);
      for (let i = 1; i < capitalizedParts.length; i++) {
        const part = capitalizedParts[i];
        const up = part.toUpperCase();
        if (up.startsWith("FROM") || up.startsWith("TO")) {
          resultLines[resultLines.length - 1] += `::${part}`;
        } else {
          resultLines.push(`        ::${part}`);
        }
      }
    }
  }

  // Handle Return Part - separate possible trailing comments
  const returnParts = returnPart.split(/(?=\/\/|#|\/\*)/);
  if (returnParts.length > 0) {
    resultLines.push(`    RETURN ${capitalizeKeywords(returnParts[0].trim())}`);
    // If there's a comment, add a newline before it to separate from the query body
    if (returnParts.length > 1) {
      resultLines.push(""); // Add breathing room before the separator comment
    }
    for (let i = 1; i < returnParts.length; i++) {
      // No indent for trailing comments - they are usually section separators
      resultLines.push(returnParts[i].trim());
    }
  }

  return resultLines;
}

function splitByDoubleColonSafe(text: string): string[] {
  const result: string[] = [];
  let current = "";
  let parenCount = 0;
  let angleCount = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === "(") parenCount++;
    if (ch === ")") parenCount--;
    if (ch === "<") angleCount++;
    if (ch === ">") angleCount--;

    if (ch === ":" && text[i + 1] === ":" && parenCount === 0 && angleCount === 0) {
      result.push(current.trim());
      current = "";
      i++;
      continue;
    }

    current += ch;
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

function capitalizeKeywords(text: string): string {
  if (!text) return "";

  // Split by comments to protect them from being capitalized
  const parts = text.split(/(\/\/.*|#.*|\/\*[\s\S]*?\*\/)/);

  return parts
    .map((part, i) => {
      // Index is odd -> this is a comment according to the regex with capture group
      if (i % 2 === 1) return part;

      let result = part;
      result = result.replace(/\s*::\s*/g, "::");
      result = result.replace(/\s+/g, " ");
      result = result.replace(/\(\s+/g, "(");
      result = result.replace(/\s+\)/g, ")");
      result = result.replace(/\{\s+/g, "{");
      result = result.replace(/\s+\}/g, "}");

      result = result.replace(/\b(asc|ASC)\b/gi, "Asc");
      result = result.replace(/\b(desc|DESC)\b/gi, "Desc");

      result = result.replace(/\b([a-zA-Z_]\w*)\b/g, (match) => {
        if (match === "Asc" || match === "Desc") return match;

        const upper = match.toUpperCase();
        if (MAJOR_KEYWORDS.includes(upper)) return upper;

        const helper = HELPERS.find((h) => h.toUpperCase() === upper);
        if (helper) return helper;

        const type = HQL_TYPES.find((t) => t.toUpperCase() === upper);
        if (type) return type;

        return match;
      });

      result = result.replace(/\{(\w+)\}/g, (_, name) => `{${name.toLowerCase()}}`);
      return result;
    })
    .join("");
}
