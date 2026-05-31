import os from "node:os";
import path from "node:path";
import type {
  AgentItem,
  AgentPack,
  CommandItem,
  ManualAction,
  McpServerItem,
  MigrationPlan,
  PlanOptions,
  Portability,
  ScopeKind,
  SkillItem,
  TargetScopeMode,
  ToolId,
  WriteAction
} from "./types.js";
import { hashObject, slugify, stableId } from "./utils/id.js";
import { stringifyTomlMcp } from "./parsers/toml.js";
import { PathResolver } from "./path-resolver.js";
import { normalizeScopeKind } from "./scope.js";

export function createMigrationPlan(pack: AgentPack, target: ToolId, options: PlanOptions = {}): MigrationPlan {
  const writes: WriteAction[] = [];
  const manualActions: ManualAction[] = [...pack.manualActions];
  const skipped: ManualAction[] = [];
  const warnings: string[] = [];
  const projectPath = path.resolve(options.targetProjectPath ?? pack.source.projectPath ?? process.cwd());
  const homePath = path.resolve(options.targetHomePath ?? pack.source.homePath ?? os.homedir());
  const resolver = new PathResolver({
    homePath,
    projectPath,
    cwdPath: projectPath,
    env: options.env ?? process.env,
    platform: options.platform ?? os.platform()
  });
  const targetScope = options.targetScope ?? "same";

  planInstructions(pack, target, writes, manualActions, resolver, targetScope);
  planMcpServers(pack, target, writes, manualActions, resolver, targetScope);
  planSkills(pack, target, writes, manualActions, resolver, targetScope);
  planAgents(pack, target, writes, manualActions, resolver, targetScope);
  planCommands(pack, target, writes, manualActions, resolver, targetScope);
  planManualOnly(pack, manualActions, skipped);

  if (pack.source.tool === target) {
    warnings.push("Source and target are the same tool; generated writes may still normalize or relocate files.");
  }
  if (!pack.instructions.length && !pack.mcpServers.length && !pack.skills.length) {
    warnings.push("No high-confidence portable configuration was found.");
  }

  return {
    schemaVersion: "1.1.0",
    createdAt: new Date().toISOString(),
    source: pack.source,
    target,
    sourcePackHash: hashObject(pack),
    summary: summarize([...writes.map((write) => write.portability), ...manualActions.map((action) => action.portability), ...skipped.map((action) => action.portability)]),
    writes,
    manualActions: dedupeManual(manualActions),
    skipped: dedupeManual(skipped),
    warnings
  };
}

function planInstructions(
  pack: AgentPack,
  target: ToolId,
  writes: WriteAction[],
  manualActions: ManualAction[],
  resolver: PathResolver,
  targetScope: TargetScopeMode
): void {
  const buckets: Record<"global" | "project" | "local", typeof pack.instructions> = {
    global: [],
    project: [],
    local: []
  };

  for (const item of pack.instructions) {
    const destination = destinationScope(scopeKind(item), targetScope);
    if (destination === "managed") {
      manualActions.push(manual("managed-instruction", item.id, `Managed instruction "${item.canonicalName}" is organization policy and is never auto-written.`));
    } else if (destination === "global") {
      buckets.global.push(item);
    } else if (destination === "project" || destination === "nested") {
      buckets.project.push(item);
    } else if (destination === "local") {
      buckets.local.push(item);
    } else {
      manualActions.push(manual("instruction-scope", item.id, `Instruction "${item.canonicalName}" has non-portable scope "${destination}".`));
    }
  }

  if (buckets.global.length) {
    const targetPath = targetInstructionPath(target, "global", resolver);
    writes.push(writeAction("instructions", targetPath, resolver, renderInstructions(buckets.global, target), buckets.global.map((item) => item.id), "translated", `Compile global instructions into ${targetInstructionName(target)}.`));
  }
  if (buckets.project.length) {
    const targetPath = targetInstructionPath(target, "project", resolver);
    writes.push(writeAction("instructions", targetPath, resolver, renderInstructions(buckets.project, target), buckets.project.map((item) => item.id), "translated", `Compile project instructions into ${targetInstructionName(target)}.`));
  }
  for (const item of buckets.local) {
    if (target === "claude") {
      const targetPath = targetInstructionPath(target, "local", resolver);
      writes.push(writeAction("instructions", targetPath, resolver, renderInstructions([item], target), [item.id], "translated", `Compile local/private instructions into CLAUDE.local.md.`));
    } else {
      manualActions.push(manual("local-instruction", item.id, `Local/private instruction "${item.canonicalName}" was not auto-written because ${target} has no exact private project instruction file in V1.`));
    }
  }
}

function planMcpServers(
  pack: AgentPack,
  target: ToolId,
  writes: WriteAction[],
  manualActions: ManualAction[],
  resolver: PathResolver,
  targetScope: TargetScopeMode
): void {
  const groups: Record<"global" | "project", McpServerItem[]> = { global: [], project: [] };
  for (const server of pack.mcpServers) {
    const destination = destinationScope(scopeKind(server), targetScope);
    if (destination === "global") {
      groups.global.push(server);
    } else if (destination === "project" || destination === "nested") {
      groups.project.push(server);
    } else {
      manualActions.push(manual("mcp-scope", server.id, `MCP server "${server.name}" from ${destination} scope requires manual placement for ${target}.`));
    }
  }

  for (const [scope, servers] of Object.entries(groups) as Array<["global" | "project", McpServerItem[]]>) {
    if (!servers.length) {
      continue;
    }
    const targetPath = targetMcpPath(target, scope, resolver);
    writes.push(writeAction("mcp", targetPath, resolver, renderMcpConfig(target, servers), servers.map((server) => server.id), "exact", `Write ${servers.length} MCP server(s) for ${target}.`));
  }
}

function planSkills(
  pack: AgentPack,
  target: ToolId,
  writes: WriteAction[],
  manualActions: ManualAction[],
  resolver: PathResolver,
  targetScope: TargetScopeMode
): void {
  for (const skill of pack.skills) {
    const destination = destinationScope(scopeKind(skill), targetScope);
    if (destination === "managed" || destination === "local") {
      manualActions.push(manual("skill-scope", skill.id, `Skill "${skill.name}" from ${destination} scope requires manual review before writing.`));
      continue;
    }
    if (target === "gemini") {
      manualActions.push(manual("skill-gemini", skill.id, `Skill "${skill.name}" was preserved in AgentPack but Gemini CLI does not have a stable documented SKILL.md loading path in V1.`));
      continue;
    }
    const root = targetSkillRoot(target, destination === "global" ? "global" : "project", resolver);
    for (const file of skill.files) {
      writes.push(writeAction("skill", resolver.join(root, slugify(skill.name), file.relativePath), resolver, file.content, [skill.id], "exact", `Preserve SKILL.md folder for "${skill.name}".`));
    }
  }
}

function planAgents(
  pack: AgentPack,
  target: ToolId,
  writes: WriteAction[],
  manualActions: ManualAction[],
  resolver: PathResolver,
  targetScope: TargetScopeMode
): void {
  for (const agent of pack.agents) {
    const destination = destinationScope(scopeKind(agent), targetScope);
    if (destination === "managed" || destination === "local") {
      manualActions.push(manual("agent-scope", agent.id, `Agent "${agent.name}" from ${destination} scope requires manual review before writing.`));
      continue;
    }
    if (target !== "claude") {
      manualActions.push(manual("agent", agent.id, `Agent "${agent.name}" needs manual review because ${target} does not share Claude Code's documented agent-file semantics.`));
      continue;
    }
    const root = targetAgentRoot(destination === "global" ? "global" : "project", resolver);
    writes.push(writeAction("agent", resolver.join(root, `${slugify(agent.name)}.md`), resolver, renderAgent(agent), [agent.id], agent.sourceTool === "claude" ? "exact" : "translated", `Emit Claude Code subagent "${agent.name}".`));
  }
}

function planCommands(
  pack: AgentPack,
  target: ToolId,
  writes: WriteAction[],
  manualActions: ManualAction[],
  resolver: PathResolver,
  targetScope: TargetScopeMode
): void {
  for (const command of pack.commands) {
    const destination = destinationScope(scopeKind(command), targetScope);
    if (destination === "managed" || destination === "local") {
      manualActions.push(manual("command-scope", command.id, `Command "${command.name}" from ${destination} scope requires manual review before writing.`));
      continue;
    }
    if (target === "codex") {
      manualActions.push(manual("command", command.id, `Command "${command.name}" was not auto-written because Codex command storage differs by app surface and should be reviewed.`));
      continue;
    }
    const root = targetCommandRoot(target, destination === "global" ? "global" : "project", resolver);
    const ext = target === "gemini" ? ".toml" : ".md";
    const content = target === "gemini" ? renderGeminiCommand(command) : command.content;
    writes.push(writeAction("command", resolver.join(root, `${slugify(command.name)}${ext}`), resolver, content, [command.id], command.sourceTool === target ? "exact" : "translated", `Emit slash-command style workflow "${command.name}".`));
  }
}

function planManualOnly(pack: AgentPack, manualActions: ManualAction[], skipped: ManualAction[]): void {
  for (const hook of pack.hooks) {
    manualActions.push(manual("hook", hook.id, `Hook "${hook.event}" requires manual review; V1 never auto-upgrades lifecycle automation across tools.`));
  }
  for (const permissions of pack.permissions) {
    manualActions.push(manual("permissions", permissions.id, "Permission rules require manual review; V1 does not auto-upgrade allow/deny/ask behavior across tools."));
  }
  for (const memory of pack.memorySummaries) {
    skipped.push({ id: stableId("skipped", ["memory", memory.id]), portability: "skipped", reason: memory.content ?? "Raw memory or session history skipped by default.", itemIds: [memory.id] });
  }
  for (const plugin of pack.plugins) {
    skipped.push({ id: stableId("skipped", ["plugin", plugin.id]), portability: "skipped", reason: `Plugin or extension "${plugin.name}" was cataloged but not installed automatically.`, itemIds: [plugin.id] });
  }
}

function renderInstructions(items: Array<{ canonicalName: string; content: string; sourcePath?: string }>, target: ToolId): string {
  const title = targetInstructionName(target);
  const sections = [`# ${title}`, "", "Generated by AgentPort. Review this file before relying on it.", ""];
  for (const item of items) {
    sections.push(`## Source: ${item.sourcePath ?? item.canonicalName}`, "");
    sections.push(item.content.trim(), "");
  }
  return `${sections.join("\n").trimEnd()}\n`;
}

function renderMcpConfig(target: ToolId, servers: McpServerItem[]): string {
  const normalized: Record<string, Record<string, unknown>> = {};
  for (const server of servers) {
    normalized[server.name] = renderMcpServer(target, server);
  }
  if (target === "codex") {
    return stringifyTomlMcp(normalized);
  }
  return `${JSON.stringify({ mcpServers: normalized }, null, 2)}\n`;
}

function renderMcpServer(target: ToolId, server: McpServerItem): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (server.command) out.command = server.command;
  if (server.args?.length) out.args = server.args;
  if (server.env && Object.keys(server.env).length) out.env = server.env;
  if (server.headers && Object.keys(server.headers).length) {
    if (target === "codex") {
      out.http_headers = server.headers;
    } else {
      out.headers = server.headers;
    }
  }
  const url = server.serverUrl ?? server.url;
  if (url) {
    if (target === "claude") {
      out.type = server.transport === "sse" ? "sse" : "http";
      out.url = url;
    } else if (target === "gemini") {
      if (server.transport === "streamable-http") {
        out.httpUrl = url;
      } else {
        out.url = url;
      }
    } else {
      out.url = url;
    }
  }
  if (server.disabled !== undefined && target !== "codex") out.disabled = server.disabled;
  if (server.autoApprove?.length && target === "gemini") out.includeTools = server.autoApprove;
  return out;
}

function renderAgent(agent: AgentItem): string {
  const frontmatter: string[] = ["---", `name: ${slugify(agent.name)}`];
  if (agent.description) frontmatter.push(`description: ${agent.description}`);
  frontmatter.push("---", "");
  return `${frontmatter.join("\n")}${agent.content.trim()}\n`;
}

function renderGeminiCommand(command: CommandItem): string {
  const description = command.notes?.[0] ?? `Migrated command ${command.name}`;
  return `description = ${JSON.stringify(description)}\nprompt = ${JSON.stringify(command.content)}\n`;
}

function targetInstructionName(target: ToolId): string {
  if (target === "claude") return "CLAUDE.md";
  if (target === "gemini") return "GEMINI.md";
  return "AGENTS.md";
}

function targetInstructionPath(target: ToolId, scope: "global" | "project" | "local", resolver: PathResolver): string {
  const paths = resolver.toolPaths(target).paths;
  if (target === "claude") {
    if (scope === "global") return paths.globalInstructions;
    if (scope === "local") return paths.localInstructions;
    return paths.projectInstructions;
  }
  if (target === "gemini") {
    return scope === "global" ? paths.globalInstructions : resolver.join(resolver.projectPath, "GEMINI.md");
  }
  return scope === "global" ? paths.globalInstructions : resolver.join(resolver.projectPath, "AGENTS.md");
}

function targetMcpPath(target: ToolId, scope: "global" | "project", resolver: PathResolver): string {
  const paths = resolver.toolPaths(target).paths;
  if (target === "claude") return scope === "project" ? paths.projectMcp : paths.globalState;
  if (target === "gemini") return scope === "project" ? paths.projectSettings : paths.globalSettings;
  return scope === "project" ? paths.projectConfig : paths.globalConfig;
}

function targetSkillRoot(target: ToolId, scope: "global" | "project", resolver: PathResolver): string {
  const paths = resolver.toolPaths(target).paths;
  if (target === "claude") return scope === "global" ? paths.globalSkills : paths.projectSkills;
  return scope === "global" ? paths.globalSkills : paths.projectSkills;
}

function targetAgentRoot(scope: "global" | "project", resolver: PathResolver): string {
  const paths = resolver.toolPaths("claude").paths;
  return scope === "global" ? paths.globalAgents : paths.projectAgents;
}

function targetCommandRoot(target: ToolId, scope: "global" | "project", resolver: PathResolver): string {
  const paths = resolver.toolPaths(target).paths;
  if (target === "claude") return scope === "global" ? paths.globalCommands : paths.projectCommands;
  return scope === "global" ? paths.globalCommands : paths.projectCommands;
}

function destinationScope(itemScope: ScopeKind, mode: TargetScopeMode): ScopeKind {
  if (mode === "same") return itemScope === "nested" ? "project" : itemScope;
  return mode;
}

function scopeKind(item: { scope: unknown }): ScopeKind {
  return normalizeScopeKind(item.scope as never);
}

function writeAction(kind: string, targetPath: string, resolver: PathResolver, content: string, itemIds: string[], portability: Portability, reason: string): WriteAction {
  return {
    id: stableId("write", [kind, targetPath, itemIds]),
    kind: "write",
    targetPath,
    targetTemplate: resolver.templateFor(targetPath),
    content,
    portability,
    reason,
    itemIds
  };
}

function manual(prefix: string, itemId: string, reason: string): ManualAction {
  return {
    id: stableId("manual", [prefix, itemId]),
    portability: "manual",
    reason,
    itemIds: [itemId]
  };
}

function summarize(values: Portability[]): Record<Portability, number> {
  const out: Record<Portability, number> = { exact: 0, translated: 0, lossy: 0, manual: 0, unsupported: 0, skipped: 0 };
  for (const value of values) out[value] += 1;
  return out;
}

function dedupeManual(items: ManualAction[]): ManualAction[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
