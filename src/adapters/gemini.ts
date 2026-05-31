import path from "node:path";
import type { Adapter, AgentPack, ScanOptions } from "../types.js";
import { listFilesRecursive, pathExists, readJsonIfExists, readTextIfExists } from "../utils/fs.js";
import { PathResolver } from "../path-resolver.js";
import { scopeInfo } from "../scope.js";
import {
  addHooksFromSettings,
  addInstructionIfExists,
  addTomlDirectoryAsCommands,
  addPermissions,
  addPluginsFromSettings,
  addSkillDirectories,
  createEmptyPack,
  isRecord,
  normalizeMcpServers,
  shouldScanProject,
  shouldScanUser
} from "./common.js";

export const geminiAdapter: Adapter = {
  id: "gemini",
  displayName: "Gemini CLI",
  async detect(options: ScanOptions): Promise<boolean> {
    return (
      (await pathExists(path.join(options.homePath, ".gemini"))) ||
      (await pathExists(path.join(options.projectPath, ".gemini"))) ||
      (await pathExists(path.join(options.projectPath, "GEMINI.md")))
    );
  },
  async scan(options: ScanOptions): Promise<AgentPack> {
    const pack = createEmptyPack("gemini", options);
    const resolver = new PathResolver(options);
    const paths = resolver.toolPaths("gemini").paths;
    const userRoot = paths.globalConfigDir;
    const userSettings = shouldScanUser(options) ? await readSettings(pack, paths.globalSettings, "global") : undefined;
    const projectSettings = shouldScanProject(options) ? await readSettings(pack, paths.projectSettings, "project") : undefined;
    const globalContextNames = collectContextNames(userSettings);
    const projectContextNames = collectEffectiveContextNames(userSettings, projectSettings);

    if (shouldScanUser(options)) {
      for (const name of globalContextNames) {
        await addInstructionIfExists(pack, "gemini", path.join(userRoot, name), "user", name, "global");
      }
      await addTomlDirectoryAsCommands(pack, "gemini", paths.globalCommands, "global");
      await addSkillDirectories(pack, "gemini", paths.globalSkills, "global");
      await addExtensionPlugins(pack, userRoot, "user");
    }

    if (shouldScanProject(options)) {
      await addHierarchicalContext(pack, options.projectPath, options.cwdPath, projectContextNames);
      await addSubdirectoryContext(pack, options.projectPath, options.cwdPath, projectContextNames);
      await addTomlDirectoryAsCommands(pack, "gemini", paths.projectCommands, "project");
      await addSkillDirectories(pack, "gemini", paths.projectSkills, "project");
      await addExtensionPlugins(pack, paths.projectConfigDir, "project");
    }

    pack.memorySummaries.push({
      id: "memory_gemini_raw_sessions_skipped",
      sourceTool: "gemini",
      scope: scopeInfo("session"),
      portability: "skipped",
      evidenceIds: [],
      strategy: "skip-raw",
      content: "Gemini CLI raw sessions are intentionally not imported by V1."
    });
    return pack;
  }
};

async function readSettings(pack: AgentPack, filePath: string, scope: "global" | "project"): Promise<Record<string, unknown> | undefined> {
  const json = await readJsonIfExists(filePath);
  if (!isRecord(json)) {
    return undefined;
  }
  normalizeMcpServers(pack, "gemini", json.mcpServers, filePath, scope);
  if (isRecord(json.mcp) && isRecord(json.mcp.servers)) {
    normalizeMcpServers(pack, "gemini", json.mcp.servers, filePath, scope);
  }
  addHooksFromSettings(pack, "gemini", json, filePath, scope);
  addPermissions(pack, "gemini", json.permissions, filePath, scope);
  addPluginsFromSettings(pack, "gemini", json, filePath, scope);
  return json;
}

function collectContextNames(...settings: Array<Record<string, unknown> | undefined>): string[] {
  const names = new Set<string>(["GEMINI.md"]);
  for (const setting of settings) {
    if (!setting || !isRecord(setting.context)) {
      continue;
    }
    const fileName = setting.context.fileName;
    if (typeof fileName === "string") {
      names.add(fileName);
    } else if (Array.isArray(fileName)) {
      for (const name of fileName) {
        names.add(String(name));
      }
    }
  }
  return [...names];
}

function collectEffectiveContextNames(userSettings: Record<string, unknown> | undefined, projectSettings: Record<string, unknown> | undefined): string[] {
  if (projectSettings && isRecord(projectSettings.context) && projectSettings.context.fileName !== undefined) {
    return collectContextNames(projectSettings);
  }
  return collectContextNames(userSettings);
}

async function addHierarchicalContext(pack: AgentPack, projectPath: string, cwdPath: string, contextNames: string[]): Promise<void> {
  for (const dir of ancestorDirs(projectPath, cwdPath)) {
    for (const name of contextNames) {
      const file = path.join(dir, name);
      if (await pathExists(file)) {
        await addInstructionIfExists(pack, "gemini", file, path.resolve(dir) === path.resolve(projectPath) ? "project" : "nested", name, "ancestor");
      }
    }
  }
}

async function addSubdirectoryContext(pack: AgentPack, projectPath: string, cwdPath: string, contextNames: string[]): Promise<void> {
  const ignore = await readIgnore(projectPath);
  const files = await listFilesRecursive(cwdPath, { maxBytes: 512 * 1024 });
  for (const file of files) {
    if (!contextNames.includes(path.basename(file))) {
      continue;
    }
    if (ancestorDirs(projectPath, cwdPath).some((dir) => path.resolve(file) === path.resolve(path.join(dir, path.basename(file))))) {
      continue;
    }
    if (isIgnored(projectPath, file, ignore)) {
      continue;
    }
    await addInstructionIfExists(pack, "gemini", file, "nested", path.basename(file), "subdirectory");
  }
}

function ancestorDirs(projectPath: string, cwdPath: string): string[] {
  const resolvedProject = path.resolve(projectPath);
  const resolvedCwd = path.resolve(cwdPath);
  const dirs = [resolvedProject];
  const relative = path.relative(resolvedProject, resolvedCwd);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return dirs;
  }
  let current = resolvedProject;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    dirs.push(current);
  }
  return dirs;
}

async function readIgnore(projectPath: string): Promise<string[]> {
  const patterns: string[] = [];
  for (const file of [path.join(projectPath, ".gitignore"), path.join(projectPath, ".geminiignore")]) {
    const content = await readTextIfExists(file);
    if (!content) {
      continue;
    }
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        patterns.push(trimmed);
      }
    }
  }
  return patterns;
}

function isIgnored(projectPath: string, file: string, patterns: string[]): boolean {
  const rel = path.relative(projectPath, file).split(path.sep).join("/");
  return patterns.some((pattern) => {
    const normalized = pattern.replace(/\\/g, "/").replace(/^\//, "");
    if (normalized.endsWith("/")) {
      return rel.startsWith(normalized);
    }
    if (normalized.includes("*")) {
      const regex = new RegExp(`^${normalized.split("*").map(escapeRegex).join(".*")}$`);
      return regex.test(rel);
    }
    return rel === normalized || rel.startsWith(`${normalized}/`) || rel.endsWith(`/${normalized}`);
  });
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function addExtensionPlugins(pack: AgentPack, geminiRoot: string, scope: "user" | "project"): Promise<void> {
  const extensionRoot = path.join(geminiRoot, "extensions");
  if (!(await pathExists(extensionRoot))) {
    return;
  }
  const files = await listFilesRecursive(extensionRoot, { maxBytes: 512 * 1024 });
  for (const file of files) {
    if (path.basename(file) !== "gemini-extension.json") {
      continue;
    }
    const json = await readJsonIfExists(file);
    const name = isRecord(json) && typeof json.name === "string" ? json.name : path.basename(path.dirname(file));
    pack.plugins.push({
      id: `plugin_gemini_${scope}_${name}`,
      sourceTool: "gemini",
      scope: scopeInfo(scope === "user" ? "global" : "project"),
      sourcePath: path.resolve(file),
      portability: "skipped",
      evidenceIds: [],
      name,
      raw: json
    });
  }
}
