import path from "node:path";
import type { Adapter, AgentPack, ScanOptions } from "../types.js";
import { parseTomlSubset, type TomlObject } from "../parsers/toml.js";
import { listFilesRecursive, pathExists, readTextIfExists } from "../utils/fs.js";
import { PathResolver } from "../path-resolver.js";
import { scopeInfo } from "../scope.js";
import {
  addHooksFromSettings,
  addInstructionIfExists,
  addMarkdownDirectoryAsAgents,
  addMarkdownDirectoryAsCommands,
  addPermissions,
  addPluginsFromSettings,
  addSkillDirectories,
  createEmptyPack,
  isRecord,
  normalizeMcpServers,
  shouldScanProject,
  shouldScanUser
} from "./common.js";

export const codexAdapter: Adapter = {
  id: "codex",
  displayName: "Codex",
  async detect(options: ScanOptions): Promise<boolean> {
    return (
      (await pathExists(path.join(options.homePath, ".codex"))) ||
      (await pathExists(path.join(options.projectPath, ".codex"))) ||
      (await pathExists(path.join(options.projectPath, "AGENTS.md"))) ||
      (await pathExists(path.join(options.projectPath, ".agents")))
    );
  },
  async scan(options: ScanOptions): Promise<AgentPack> {
    const pack = createEmptyPack("codex", options);
    const resolver = new PathResolver(options);
    const paths = resolver.toolPaths("codex").paths;
    let userConfig: TomlObject | undefined;
    let projectConfig: TomlObject | undefined;

    if (shouldScanUser(options)) {
      await addInstructionIfExists(pack, "codex", paths.globalOverrideInstructions, "global", "AGENTS.override.md", "global-override");
      await addInstructionIfExists(pack, "codex", paths.globalInstructions, "global", "AGENTS.md", "global");
      await addSkillDirectories(pack, "codex", paths.globalSkills, "global");
      await addSkillDirectories(pack, "codex", paths.globalSkillsMirror, "global");
      await addMarkdownDirectoryAsAgents(pack, "codex", paths.globalAgents, "global");
      await addMarkdownDirectoryAsCommands(pack, "codex", paths.globalCommands, "global");
      userConfig = await readCodexConfig(pack, paths.globalConfig, "global");
    }

    if (shouldScanProject(options)) {
      projectConfig = await readCodexConfig(pack, paths.projectConfig, "project");
      await addProjectInstructions(pack, resolver, fallbackNames(userConfig, projectConfig));
      await addSkillDirectories(pack, "codex", paths.projectSkills, "project");
      await addMarkdownDirectoryAsAgents(pack, "codex", paths.projectAgents, "project");
      await addMarkdownDirectoryAsCommands(pack, "codex", paths.projectCommands, "project");
    }

    pack.memorySummaries.push({
      id: "memory_codex_raw_sessions_skipped",
      sourceTool: "codex",
      scope: scopeInfo("session"),
      portability: "skipped",
      evidenceIds: [],
      strategy: "skip-raw",
      content: "Codex raw sessions and app state are intentionally not imported by V1."
    });
    return pack;
  }
};

async function addProjectInstructions(pack: AgentPack, resolver: PathResolver, fallbackFilenames: string[]): Promise<void> {
  for (const dir of instructionDirs(resolver.projectPath, resolver.cwdPath)) {
    for (const base of ["AGENTS.override.md", "AGENTS.md", ...fallbackFilenames]) {
      const file = resolver.join(dir, base);
      if (await pathExists(file)) {
        await addInstructionIfExists(
          pack,
          "codex",
          file,
          samePath(dir, resolver.projectPath) ? "project" : "nested",
          base,
          base === "AGENTS.override.md" ? "override" : "hierarchical"
        );
        break;
      }
    }
  }
}

async function readCodexConfig(pack: AgentPack, filePath: string, scope: "global" | "project"): Promise<TomlObject | undefined> {
  const content = await readTextIfExists(filePath);
  if (content === undefined) {
    return undefined;
  }
  const config = parseTomlSubset(content);
  if (isRecord(config.mcp_servers)) {
    normalizeMcpServers(pack, "codex", config.mcp_servers, filePath, scope);
  }
  addHooksFromSettings(pack, "codex", config, filePath, scope);
  if (isRecord(config.permissions)) {
    addPermissions(pack, "codex", config.permissions, filePath, scope);
  } else {
    const permissionLike: Record<string, unknown> = {};
    for (const key of ["approval_policy", "sandbox_mode"]) {
      if (key in config) {
        permissionLike[key] = config[key];
      }
    }
    if (Object.keys(permissionLike).length > 0) {
      addPermissions(pack, "codex", permissionLike, filePath, scope);
    }
  }
  if (scope === "project") {
    const ignoredKeys = [
      "openai_base_url",
      "chatgpt_base_url",
      "apps_mcp_product_sku",
      "model_provider",
      "model_providers",
      "notify",
      "profile",
      "profiles",
      "experimental_realtime_ws_base_url",
      "otel"
    ].filter((key) => key in config);
    if (ignoredKeys.length) {
      pack.manualActions.push({
        id: `manual_codex_project_ignored_${ignoredKeys.join("_")}`,
        portability: "manual",
        reason: `Codex ignores these keys in project .codex/config.toml and they should remain global: ${ignoredKeys.join(", ")}.`
      });
    }
  }
  addPluginsFromSettings(pack, "codex", config, filePath, scope);
  return config;
}

function fallbackNames(...configs: Array<TomlObject | undefined>): string[] {
  const names = new Set<string>();
  for (const config of configs) {
    if (Array.isArray(config?.project_doc_fallback_filenames)) {
      for (const item of config.project_doc_fallback_filenames) {
        names.add(String(item));
      }
    }
  }
  return [...names];
}

function instructionDirs(projectPath: string, cwdPath: string): string[] {
  const resolvedProject = path.resolve(projectPath);
  const resolvedCwd = path.resolve(cwdPath);
  if (!isSubPath(resolvedProject, resolvedCwd)) {
    return [resolvedProject];
  }
  const dirs: string[] = [];
  let current = resolvedProject;
  dirs.push(current);
  const relative = path.relative(resolvedProject, resolvedCwd);
  if (!relative) {
    return dirs;
  }
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    dirs.push(current);
  }
  return dirs;
}

function isSubPath(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}
