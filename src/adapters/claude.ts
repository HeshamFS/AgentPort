import path from "node:path";
import type { Adapter, AgentPack, ScanOptions } from "../types.js";
import { pathExists, readJsonIfExists } from "../utils/fs.js";
import { PathResolver } from "../path-resolver.js";
import { scopeInfo } from "../scope.js";
import {
  addEvidence,
  addHooksFromSettings,
  addInstructionIfExists,
  addMarkdownDirectoryAsInstructions,
  addMarkdownDirectoryAsAgents,
  addMarkdownDirectoryAsCommands,
  addPermissions,
  addPluginsFromSettings,
  addSkillDirectories,
  createEmptyPack,
  isRecord,
  normalizeMcpServers,
  shouldScanLocal,
  shouldScanManaged,
  shouldScanProject,
  shouldScanUser
} from "./common.js";

export const claudeAdapter: Adapter = {
  id: "claude",
  displayName: "Claude Code",
  async detect(options: ScanOptions): Promise<boolean> {
    const userRoot = path.join(options.homePath, ".claude");
    return (
      (await pathExists(userRoot)) ||
      (await pathExists(path.join(options.projectPath, ".claude"))) ||
      (await pathExists(path.join(options.projectPath, "CLAUDE.md"))) ||
      (await pathExists(path.join(options.projectPath, ".mcp.json")))
    );
  },
  async scan(options: ScanOptions): Promise<AgentPack> {
    const pack = createEmptyPack("claude", options);
    const paths = new PathResolver(options).toolPaths("claude").paths;
    const userRoot = paths.globalConfigDir;
    const projectRoot = paths.projectConfigDir;

    if (shouldScanManaged(options)) {
      await addInstructionIfExists(pack, "claude", paths.managedInstructions, "managed", "CLAUDE.md", "managed-policy");
      await readClaudeSettings(pack, paths.managedSettings, "managed");
      await readManagedMcp(pack, paths.managedMcp);
    }

    if (shouldScanUser(options)) {
      await addInstructionIfExists(pack, "claude", paths.globalInstructions, "global", "CLAUDE.md", "global");
      await addSkillDirectories(pack, "claude", paths.globalSkills, "global");
      await addMarkdownDirectoryAsAgents(pack, "claude", paths.globalAgents, "global");
      await addMarkdownDirectoryAsCommands(pack, "claude", paths.globalCommands, "global");
      await readClaudeJson(pack, paths.globalState, "global", options.projectPath);
      await readClaudeSettings(pack, paths.globalSettings, "global");
    }

    if (shouldScanProject(options)) {
      await addInstructionIfExists(pack, "claude", paths.projectInstructions, "project", "CLAUDE.md", "project-root");
      await addInstructionIfExists(pack, "claude", paths.projectDotInstructions, "project", "CLAUDE.md", "project-dotdir");
      await addMarkdownDirectoryAsInstructions(pack, "claude", paths.projectRules, "nested", "claude-rules");
      await addSkillDirectories(pack, "claude", paths.projectSkills, "project");
      await addMarkdownDirectoryAsAgents(pack, "claude", paths.projectAgents, "project");
      await addMarkdownDirectoryAsCommands(pack, "claude", paths.projectCommands, "project");
      await readProjectMcp(pack, paths.projectMcp);
      await readClaudeSettings(pack, paths.projectSettings, "project");
    }

    if (shouldScanLocal(options)) {
      await addInstructionIfExists(pack, "claude", paths.localInstructions, "local", "CLAUDE.local.md", "local");
      await readClaudeJson(pack, paths.globalState, "local", options.projectPath);
      await readClaudeSettings(pack, paths.localSettings, "local");
    }

    pack.memorySummaries.push({
      id: "memory_claude_raw_transcripts_skipped",
      sourceTool: "claude",
      scope: scopeInfo("session"),
      portability: "skipped",
      evidenceIds: [],
      strategy: "skip-raw",
      content: "Claude Code raw session transcripts are intentionally not imported by V1."
    });
    return pack;
  }
};

async function readClaudeJson(pack: AgentPack, filePath: string, scope: "global" | "local", projectPath: string): Promise<void> {
  const json = await readJsonIfExists(filePath);
  if (!isRecord(json)) {
    return;
  }
  if (scope === "global") {
    normalizeMcpServers(pack, "claude", json.mcpServers, filePath, scope);
  } else {
    normalizeMcpServers(pack, "claude", findProjectMcpServers(json, projectPath), filePath, scope);
  }
  addEvidence(pack, "claude", "state", scope, filePath, "Claude Code state file scanned without importing sessions.");
}

async function readProjectMcp(pack: AgentPack, filePath: string): Promise<void> {
  const json = await readJsonIfExists(filePath);
  if (!isRecord(json)) {
    return;
  }
  normalizeMcpServers(pack, "claude", json.mcpServers, filePath, "project");
}

async function readManagedMcp(pack: AgentPack, filePath: string): Promise<void> {
  const json = await readJsonIfExists(filePath);
  if (!isRecord(json)) {
    return;
  }
  normalizeMcpServers(pack, "claude", json.mcpServers, filePath, "managed");
}

async function readClaudeSettings(pack: AgentPack, filePath: string, scope: "managed" | "global" | "project" | "local"): Promise<void> {
  const json = await readJsonIfExists(filePath);
  if (!isRecord(json)) {
    return;
  }
  addHooksFromSettings(pack, "claude", json, filePath, scope);
  addPermissions(pack, "claude", json.permissions, filePath, scope);
  addPluginsFromSettings(pack, "claude", json, filePath, scope);
}

function findProjectMcpServers(json: Record<string, unknown>, projectPath: string): unknown {
  if (!isRecord(json.projects)) {
    return undefined;
  }
  const normalizedProject = normalizeComparablePath(projectPath);
  for (const [key, value] of Object.entries(json.projects)) {
    if (!isRecord(value)) {
      continue;
    }
    if (normalizeComparablePath(key) === normalizedProject) {
      return value.mcpServers;
    }
  }
  return undefined;
}

function normalizeComparablePath(input: string): string {
  return path.resolve(input).replace(/\\/g, "/").toLowerCase();
}
