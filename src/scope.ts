import type { ItemScopeInput, Scope, ScopeInfo, ScopeKind } from "./types.js";

const SCOPE_META: Record<ScopeKind, Omit<ScopeInfo, "kind">> = {
  managed: {
    sharedWith: "organization",
    appliesTo: "all-users",
    precedence: 500,
    toolNativeName: "managed"
  },
  global: {
    sharedWith: "all-projects",
    appliesTo: "current-user",
    precedence: 100,
    toolNativeName: "user"
  },
  project: {
    sharedWith: "team",
    appliesTo: "current-project",
    precedence: 200,
    toolNativeName: "project"
  },
  local: {
    sharedWith: "current-user",
    appliesTo: "current-project",
    precedence: 300,
    toolNativeName: "local"
  },
  nested: {
    sharedWith: "team",
    appliesTo: "path-subtree",
    precedence: 250,
    toolNativeName: "nested"
  },
  plugin: {
    sharedWith: "unknown",
    appliesTo: "runtime",
    precedence: 50,
    toolNativeName: "plugin"
  },
  cloud: {
    sharedWith: "unknown",
    appliesTo: "runtime",
    precedence: 50,
    toolNativeName: "cloud"
  },
  session: {
    sharedWith: "current-session",
    appliesTo: "runtime",
    precedence: 400,
    toolNativeName: "session"
  },
  unknown: {
    sharedWith: "unknown",
    appliesTo: "unknown",
    precedence: 0,
    toolNativeName: "unknown"
  }
};

export function scopeInfo(input: ItemScopeInput, toolNativeName?: string): ScopeInfo {
  if (typeof input === "object") {
    return input;
  }
  const kind = normalizeScopeKind(input);
  return {
    kind,
    ...SCOPE_META[kind],
    toolNativeName: toolNativeName ?? SCOPE_META[kind].toolNativeName
  };
}

export function normalizeScopeKind(input: ItemScopeInput): ScopeKind {
  if (typeof input === "object") {
    return input.kind;
  }
  if (input === "user") {
    return "global";
  }
  if (input === "managed" || input === "global" || input === "project" || input === "local" || input === "nested" || input === "plugin" || input === "cloud" || input === "session" || input === "unknown") {
    return input;
  }
  return "unknown";
}

export function parseScanScope(input: unknown): Scope {
  const text = String(input ?? "all");
  if (text === "user") {
    return "global";
  }
  if (text === "global" || text === "project" || text === "local" || text === "managed" || text === "all") {
    return text;
  }
  throw new Error(`Invalid --scope value: ${text}`);
}

export function shouldScanGlobal(scope: Scope): boolean {
  return scope === "global" || scope === "all";
}

export function shouldScanProject(scope: Scope): boolean {
  return scope === "project" || scope === "all";
}

export function shouldScanLocal(scope: Scope): boolean {
  return scope === "local" || scope === "all";
}

export function shouldScanManaged(scope: Scope): boolean {
  return scope === "managed" || scope === "all";
}
