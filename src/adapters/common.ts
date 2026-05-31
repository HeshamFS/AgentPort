import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import type {
  AgentItem,
  AgentPack,
  CommandItem,
  HookItem,
  ItemScopeInput,
  McpServerItem,
  PermissionsItem,
  PluginItem,
  ScanOptions,
  SkillItem,
  SourceEvidence,
  SourceToolId,
  ToolId,
  Transport
} from "../types.js";
import { listFilesRecursive, pathExists, readTextIfExists, toPosixRelative } from "../utils/fs.js";
import { stableId, slugify } from "../utils/id.js";
import { parseFrontmatter } from "../parsers/frontmatter.js";
import { parseTomlSubset } from "../parsers/toml.js";
import { redactRecord } from "../utils/redact.js";
import { normalizeScopeKind, scopeInfo, shouldScanGlobal, shouldScanLocal as shouldScanLocalScope, shouldScanManaged as shouldScanManagedScope, shouldScanProject as shouldScanProjectScope } from "../scope.js";

export function createEmptyPack(tool: SourceToolId, options: ScanOptions): AgentPack {
  return {
    schemaVersion: "1.1.0",
    createdAt: new Date().toISOString(),
    source: {
      tool,
      scope: options.scope,
      projectPath: path.resolve(options.projectPath),
      cwdPath: path.resolve(options.cwdPath),
      homePath: path.resolve(options.homePath),
      platform: `${os.platform()}-${os.arch()}`
    },
    instructions: [],
    mcpServers: [],
    skills: [],
    agents: [],
    commands: [],
    hooks: [],
    permissions: [],
    memorySummaries: [],
    plugins: [],
    sourceEvidence: [],
    manualActions: []
  };
}

export function addEvidence(pack: AgentPack, tool: SourceToolId, kind: string, scope: ItemScopeInput, filePath: string, note?: string, resolvedBy?: string): string {
  const normalizedScope = scopeInfo(scope);
  const id = stableId("evidence", [tool, kind, normalizedScope.kind, filePath, note]);
  const evidence: SourceEvidence = {
    id,
    tool,
    kind,
    scope: normalizedScope,
    path: path.resolve(filePath),
    resolvedBy: resolvedBy ?? "path-resolver"
  };
  if (note) {
    evidence.note = note;
  }
  if (!pack.sourceEvidence.some((existing) => existing.id === id)) {
    pack.sourceEvidence.push(evidence);
  }
  return id;
}

export function shouldScanUser(options: ScanOptions): boolean {
  return shouldScanGlobal(options.scope);
}

export function shouldScanProject(options: ScanOptions): boolean {
  return shouldScanProjectScope(options.scope);
}

export function shouldScanLocal(options: ScanOptions): boolean {
  return shouldScanLocalScope(options.scope);
}

export function shouldScanManaged(options: ScanOptions): boolean {
  return shouldScanManagedScope(options.scope);
}

export async function addInstructionIfExists(
  pack: AgentPack,
  tool: ToolId,
  filePath: string,
  scope: ItemScopeInput,
  canonicalName: string,
  activation?: string
): Promise<void> {
  const content = await readTextIfExists(filePath);
  if (content === undefined || !content.trim()) {
    return;
  }
  const normalizedScope = scopeInfo(scope);
  const evidenceId = addEvidence(pack, tool, "instructions", normalizedScope, filePath);
  pack.instructions.push({
    id: stableId("instruction", [tool, normalizedScope.kind, filePath]),
    sourceTool: tool,
    scope: normalizedScope,
    sourcePath: path.resolve(filePath),
    portability: "translated",
    evidenceIds: [evidenceId],
    canonicalName,
    content,
    activation
  });
}

export async function addSkillDirectories(pack: AgentPack, tool: ToolId, root: string, scope: ItemScopeInput): Promise<void> {
  if (!(await pathExists(root))) {
    return;
  }
  const normalizedScope = scopeInfo(scope);
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillRoot = path.join(root, entry.name);
    const skillFile = path.join(skillRoot, "SKILL.md");
    const skillContent = await readTextIfExists(skillFile);
    if (skillContent === undefined) {
      continue;
    }
    const { frontmatter } = parseFrontmatter(skillContent);
    const files = [];
    for (const file of await listFilesRecursive(skillRoot, { maxBytes: 512 * 1024 })) {
      const content = await readTextIfExists(file);
      if (content !== undefined) {
        files.push({ relativePath: toPosixRelative(skillRoot, file), content });
      }
    }
    const evidenceId = addEvidence(pack, tool, "skill", normalizedScope, skillRoot);
    const item: SkillItem = {
      id: stableId("skill", [tool, normalizedScope.kind, skillRoot]),
      sourceTool: tool,
      scope: normalizedScope,
      sourcePath: path.resolve(skillRoot),
      portability: "exact",
      evidenceIds: [evidenceId],
      name: frontmatter.name || entry.name,
      description: frontmatter.description,
      files
    };
    pack.skills.push(item);
  }
}

export async function addMarkdownDirectoryAsAgents(pack: AgentPack, tool: ToolId, root: string, scope: ItemScopeInput): Promise<void> {
  if (!(await pathExists(root))) {
    return;
  }
  const normalizedScope = scopeInfo(scope);
  for (const file of await listFilesRecursive(root, { maxBytes: 512 * 1024 })) {
    if (!/\.(md|markdown)$/i.test(file)) {
      continue;
    }
    const normalized = file.split(path.sep).join("/");
    if (normalized.includes("/skills/") || normalized.includes("/commands/")) {
      continue;
    }
    const content = await readTextIfExists(file);
    if (content === undefined) {
      continue;
    }
    const { frontmatter, body } = parseFrontmatter(content);
    const name = frontmatter.name || path.basename(file).replace(/\.(md|markdown)$/i, "");
    const evidenceId = addEvidence(pack, tool, "agent", normalizedScope, file);
    const item: AgentItem = {
      id: stableId("agent", [tool, normalizedScope.kind, file]),
      sourceTool: tool,
      scope: normalizedScope,
      sourcePath: path.resolve(file),
      portability: tool === "claude" ? "exact" : "manual",
      evidenceIds: [evidenceId],
      name,
      description: frontmatter.description,
      content: body.trim() ? body : content,
      frontmatter
    };
    pack.agents.push(item);
  }
}

export async function addMarkdownDirectoryAsCommands(pack: AgentPack, tool: ToolId, root: string, scope: ItemScopeInput): Promise<void> {
  if (!(await pathExists(root))) {
    return;
  }
  const normalizedScope = scopeInfo(scope);
  for (const file of await listFilesRecursive(root, { maxBytes: 512 * 1024 })) {
    if (!/\.(md|markdown)$/i.test(file)) {
      continue;
    }
    const content = await readTextIfExists(file);
    if (content === undefined) {
      continue;
    }
    const rel = toPosixRelative(root, file).replace(/\.(md|markdown)$/i, "");
    const evidenceId = addEvidence(pack, tool, "command", normalizedScope, file);
    const item: CommandItem = {
      id: stableId("command", [tool, normalizedScope.kind, file]),
      sourceTool: tool,
      scope: normalizedScope,
      sourcePath: path.resolve(file),
      portability: "translated",
      evidenceIds: [evidenceId],
      name: slugify(rel),
      content,
      trigger: `/${rel}`
    };
    pack.commands.push(item);
  }
}

export async function addTomlDirectoryAsCommands(pack: AgentPack, tool: ToolId, root: string, scope: ItemScopeInput): Promise<void> {
  if (!(await pathExists(root))) {
    return;
  }
  const normalizedScope = scopeInfo(scope);
  for (const file of await listFilesRecursive(root, { maxBytes: 512 * 1024 })) {
    if (!/\.toml$/i.test(file)) {
      continue;
    }
    const content = await readTextIfExists(file);
    if (content === undefined) {
      continue;
    }
    const parsed = parseTomlSubset(content);
    const rel = toPosixRelative(root, file).replace(/\.toml$/i, "");
    const name = rel.split("/").join(":");
    const prompt = typeof parsed.prompt === "string" ? parsed.prompt : content;
    const evidenceId = addEvidence(pack, tool, "command", normalizedScope, file);
    pack.commands.push({
      id: stableId("command", [tool, normalizedScope.kind, file]),
      sourceTool: tool,
      scope: normalizedScope,
      sourcePath: path.resolve(file),
      portability: "translated",
      evidenceIds: [evidenceId],
      name,
      content: prompt,
      trigger: `/${name}`,
      notes: typeof parsed.description === "string" ? [parsed.description] : undefined
    });
  }
}

export async function addMarkdownDirectoryAsInstructions(pack: AgentPack, tool: ToolId, root: string, scope: ItemScopeInput, activationPrefix: string): Promise<void> {
  if (!(await pathExists(root))) {
    return;
  }
  for (const file of await listFilesRecursive(root, { maxBytes: 512 * 1024 })) {
    if (/\.(md|markdown)$/i.test(file)) {
      await addInstructionIfExists(pack, tool, file, scope, path.basename(file), `${activationPrefix}:${toPosixRelative(root, file)}`);
    }
  }
}

export function normalizeMcpServers(
  pack: AgentPack,
  tool: ToolId,
  rawServers: unknown,
  sourcePath: string,
  scope: ItemScopeInput
): void {
  if (!isRecord(rawServers)) {
    return;
  }
  const normalizedScope = scopeInfo(scope);
  for (const [name, raw] of Object.entries(rawServers)) {
    if (!isRecord(raw)) {
      continue;
    }
    const transport = inferTransport(raw);
    const { value: env, redactedKeys: envRedacted } = redactRecord(asRecord(raw.env));
    const { value: headers, redactedKeys: headerRedacted } = redactRecord(asRecord(raw.headers));
    const evidenceId = addEvidence(pack, tool, "mcp", normalizedScope, sourcePath, name);
    const item: McpServerItem = {
      id: stableId("mcp", [tool, normalizedScope.kind, sourcePath, name]),
      sourceTool: tool,
      scope: normalizedScope,
      sourcePath: path.resolve(sourcePath),
      portability: "exact",
      evidenceIds: [evidenceId],
      name,
      transport,
      raw
    };
    if (typeof raw.command === "string") {
      item.command = raw.command;
    }
    if (Array.isArray(raw.args)) {
      item.args = raw.args.map(String);
    }
    if (typeof raw.url === "string") {
      item.url = raw.url;
    }
    if (typeof raw.serverUrl === "string") {
      item.serverUrl = raw.serverUrl;
    }
    if (typeof raw.httpUrl === "string") {
      item.serverUrl = raw.httpUrl;
    }
    if (env && Object.keys(env).length > 0) {
      item.env = env;
    }
    if (headers && Object.keys(headers).length > 0) {
      item.headers = headers;
    }
    if (typeof raw.disabled === "boolean") {
      item.disabled = raw.disabled;
    }
    if (Array.isArray(raw.alwaysAllow)) {
      item.autoApprove = raw.alwaysAllow.map(String);
    }
    if (Array.isArray(raw.autoApprove)) {
      item.autoApprove = raw.autoApprove.map(String);
    }
    if (Array.isArray(raw.includeTools)) {
      item.autoApprove = raw.includeTools.map(String);
    }
    if (envRedacted.length || headerRedacted.length) {
      item.notes = [`Redacted secret-like keys: ${[...envRedacted, ...headerRedacted].join(", ")}`];
      pack.manualActions.push({
        id: stableId("manual", ["redacted", item.id]),
        portability: "manual",
        reason: `Review credentials for MCP server "${name}"; secret-like values were replaced with environment variable references.`,
        itemIds: [item.id]
      });
    }
    pack.mcpServers.push(item);
  }
}

export function addHooksFromSettings(pack: AgentPack, tool: ToolId, settings: unknown, sourcePath: string, scope: ItemScopeInput): void {
  if (!isRecord(settings) || !isRecord(settings.hooks)) {
    return;
  }
  const normalizedScope = scopeInfo(scope);
  for (const [event, rawEntries] of Object.entries(settings.hooks)) {
    const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];
    for (const rawEntry of entries) {
      const entry: Record<string, unknown> = isRecord(rawEntry) ? rawEntry : { value: rawEntry };
      const hooks = Array.isArray(entry.hooks) ? entry.hooks : [entry];
      for (const hook of hooks) {
        const rawHook: Record<string, unknown> = isRecord(hook) ? hook : { value: hook };
        const evidenceId = addEvidence(pack, tool, "hook", normalizedScope, sourcePath, event);
        const item: HookItem = {
          id: stableId("hook", [tool, normalizedScope.kind, sourcePath, event, rawHook]),
          sourceTool: tool,
          scope: normalizedScope,
          sourcePath: path.resolve(sourcePath),
          portability: "manual",
          evidenceIds: [evidenceId],
          event,
          matcher: typeof entry.matcher === "string" ? entry.matcher : undefined,
          handlerType: typeof rawHook.type === "string" ? rawHook.type : "command",
          command: typeof rawHook.command === "string" ? rawHook.command : undefined,
          url: typeof rawHook.url === "string" ? rawHook.url : undefined,
          raw: rawHook
        };
        pack.hooks.push(item);
      }
    }
  }
}

export function addPermissions(pack: AgentPack, tool: ToolId, permissions: unknown, sourcePath: string, scope: ItemScopeInput): void {
  if (!isRecord(permissions)) {
    return;
  }
  const normalizedScope = scopeInfo(scope);
  const evidenceId = addEvidence(pack, tool, "permissions", normalizedScope, sourcePath);
  const item: PermissionsItem = {
    id: stableId("permissions", [tool, normalizedScope.kind, sourcePath]),
    sourceTool: tool,
    scope: normalizedScope,
    sourcePath: path.resolve(sourcePath),
    portability: "manual",
    evidenceIds: [evidenceId],
    allow: arrayOfStrings(permissions.allow),
    ask: arrayOfStrings(permissions.ask),
    deny: arrayOfStrings(permissions.deny),
    raw: permissions
  };
  pack.permissions.push(item);
}

export function addPluginsFromSettings(pack: AgentPack, tool: ToolId, settings: unknown, sourcePath: string, scope: ItemScopeInput): void {
  if (!isRecord(settings)) {
    return;
  }
  const normalizedScope = scopeInfo(scope);
  const pluginValues = [
    ...arrayOfStrings(settings.enabledPlugins),
    ...arrayOfStrings(settings.plugins)
  ];
  for (const name of pluginValues) {
    const evidenceId = addEvidence(pack, tool, "plugin", normalizedScope, sourcePath, name);
    const item: PluginItem = {
      id: stableId("plugin", [tool, normalizedScope.kind, sourcePath, name]),
      sourceTool: tool,
      scope: normalizedScope,
      sourcePath: path.resolve(sourcePath),
      portability: "skipped",
      evidenceIds: [evidenceId],
      name
    };
    pack.plugins.push(item);
  }
}

export function mergePacks(source: SourceToolId, packs: AgentPack[], options: ScanOptions): AgentPack {
  const merged = createEmptyPack(source, options);
  for (const pack of packs) {
    merged.instructions.push(...pack.instructions);
    merged.mcpServers.push(...pack.mcpServers);
    merged.skills.push(...pack.skills);
    merged.agents.push(...pack.agents);
    merged.commands.push(...pack.commands);
    merged.hooks.push(...pack.hooks);
    merged.permissions.push(...pack.permissions);
    merged.memorySummaries.push(...pack.memorySummaries);
    merged.plugins.push(...pack.plugins);
    merged.sourceEvidence.push(...pack.sourceEvidence);
    merged.manualActions.push(...pack.manualActions);
  }
  return merged;
}

function inferTransport(raw: Record<string, unknown>): Transport {
  const type = typeof raw.type === "string" ? raw.type.toLowerCase() : "";
  if (typeof raw.command === "string") {
    return "stdio";
  }
  if (typeof raw.httpUrl === "string") {
    return "streamable-http";
  }
  if (type === "sse" || (typeof raw.url === "string" && raw.url.includes("/sse"))) {
    return "sse";
  }
  if (type === "http" || type === "streamable-http" || type === "streamablehttp" || typeof raw.url === "string" || typeof raw.serverUrl === "string") {
    return "streamable-http";
  }
  return "unknown";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(String);
}

export function getScopeKind(input: ItemScopeInput): ReturnType<typeof normalizeScopeKind> {
  return normalizeScopeKind(input);
}
