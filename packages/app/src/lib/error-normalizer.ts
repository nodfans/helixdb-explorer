import { invoke } from "@tauri-apps/api/core";

export type UiErrorCode =
  | "READ_ONLY_BLOCKED"
  | "MCP_UNSUPPORTED_STEP"
  | "MCP_ID_FILTER_LIMIT"
  | "MCP_QUERY_INVALID"
  | "AUTH_FAILED"
  | "NETWORK_TIMEOUT"
  | "NETWORK_UNREACHABLE"
  | "SERVER_ERROR"
  | "UNKNOWN";

export interface UiError {
  code: UiErrorCode;
  title: string;
  message: string;
  hint?: string;
  raw?: string;
}

export interface UiErrorEvent {
  code: UiErrorCode;
  context: string;
  at: string;
  message: string;
}

function toErrorText(err: unknown): string {
  if (err instanceof Error) return err.message || String(err);
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function matchAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

export function normalizeError(err: unknown): UiError {
  const raw = toErrorText(err);
  const text = raw.toLowerCase();

  if (text.includes("explorer mode is read-only")) {
    return {
      code: "READ_ONLY_BLOCKED",
      title: "Read-Only Restriction",
      message: "This operation modifies data and is blocked in Explorer mode.",
      hint: "Run this query through compiled Query API / migrations for write operations.",
      raw,
    };
  }

  if (matchAny(text, [/unsupported step type/, /not supported by the mcp protocol/, /unsupported .* in generic query chains/, /negated recursive filter traversal/])) {
    return {
      code: "MCP_UNSUPPORTED_STEP",
      title: "MCP Capability Limit",
      message: "This query uses a step that MCP execution cannot represent.",
      hint: "Simplify the query to MCP-safe traversal/filter steps, or use compiled Query API.",
      raw,
    };
  }

  if (matchAny(text, [/filterbyid/, /nfromid/, /two-pass execution for id filtering/, /dangerous for large datasets/])) {
    return {
      code: "MCP_ID_FILTER_LIMIT",
      title: "ID Filtering Limitation",
      message: "ID-based filtering is limited in MCP and may require expensive fallback behavior.",
      hint: "Prefer compiled endpoint execution for precise ID lookups.",
      raw,
    };
  }

  if (matchAny(text, [/failed to parse hql/, /failed to parse query/, /no executable traversal or return statement found/, /multiple queries detected/])) {
    return {
      code: "MCP_QUERY_INVALID",
      title: "Query Parse/Validation Error",
      message: "The submitted HQL could not be executed in current context.",
      hint: "Execute a single valid query block or select one query before running.",
      raw,
    };
  }

  if (matchAny(text, [/missing x-api-key/, /invalid api key/, /forbidden/, /401/, /403/, /unauthorized/])) {
    return {
      code: "AUTH_FAILED",
      title: "Authentication Failed",
      message: "API key is missing or invalid for this target.",
      hint: "Check connection API key and target environment permissions.",
      raw,
    };
  }

  if (matchAny(text, [/timed out/, /timeout/])) {
    return {
      code: "NETWORK_TIMEOUT",
      title: "Request Timed Out",
      message: "The server did not respond in time.",
      hint: "Verify target availability, network latency, and instance load.",
      raw,
    };
  }

  if (matchAny(text, [/connection refused/, /target is unreachable/, /failed to fetch/, /network error/, /empty response from server/])) {
    return {
      code: "NETWORK_UNREACHABLE",
      title: "Connection Failed",
      message: "Could not reach the Helix service.",
      hint: "Check host/port, service status, and local firewall settings.",
      raw,
    };
  }

  if (matchAny(text, [/server responded with status/, /server error \(/])) {
    return {
      code: "SERVER_ERROR",
      title: "Server Error",
      message: raw,
      raw,
    };
  }

  return {
    code: "UNKNOWN",
    title: "Execution Error",
    message: raw || "Unknown error",
    raw,
  };
}

export function formatUiError(err: unknown): string {
  const e = normalizeError(err);
  return e.hint ? `${e.title}: ${e.message}\nHint: ${e.hint}` : `${e.title}: ${e.message}`;
}

function persistErrorCounter(code: UiErrorCode) {
  try {
    const key = "helix_ui_error_counts";
    const raw = localStorage.getItem(key);
    const data = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    data[code] = (data[code] || 0) + 1;
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
}

export function reportUiError(context: string, err: unknown): UiError {
  const normalized = normalizeError(err);
  persistErrorCounter(normalized.code);

  const event: UiErrorEvent = {
    code: normalized.code,
    context,
    at: new Date().toISOString(),
    message: normalized.message,
  };

  console.error("[ui-error]", event, err);

  if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
    invoke("log_to_terminal", {
      message: `[ui-error] ${event.at} ${event.context} ${event.code} ${event.message}`,
    }).catch(() => {
      // Best effort logging only.
    });
  }

  return normalized;
}
