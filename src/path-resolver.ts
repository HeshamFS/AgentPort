import os from "node:os";
import path from "node:path";
import type { ToolId } from "./types.js";

export interface PathResolverOptions {
  platform?: NodeJS.Platform;
  homePath?: string;
  projectPath?: string;
  cwdPath?: string;
  env?: Record<string, string | undefined>;
}

export interface ToolPathSet {
  tool: ToolId;
  homeDir: string;
  configDir: string;
  managedDir?: string;
  paths: Record<string, string>;
  templates: Record<string, string>;
}

export class PathResolver {
  readonly platform: NodeJS.Platform;
  readonly homePath: string;
  readonly projectPath: string;
  readonly cwdPath: string;
  readonly env: Record<string, string | undefined>;
  private readonly pathApi: path.PlatformPath;

  constructor(options: PathResolverOptions = {}) {
    this.platform = options.platform ?? os.platform();
    this.pathApi = this.platform === "win32" ? path.win32 : path.posix;
    this.env = options.env ?? process.env;
    this.homePath = this.resolveInputPath(options.homePath ?? os.homedir());
    this.projectPath = this.resolveInputPath(options.projectPath ?? process.cwd());
    this.cwdPath = this.resolveInputPath(options.cwdPath ?? this.projectPath);
  }

  toolPaths(tool: ToolId): ToolPathSet {
    if (tool === "claude") {
      return this.claudePaths();
    }
    if (tool === "codex") {
      return this.codexPaths();
    }
    return this.geminiPaths();
  }

  templateFor(filePath: string): string {
    const resolved = this.resolveInputPath(filePath);
    const replacements: Array<readonly [string, string]> = [
      ["${PROJECT}", this.projectPath],
      ["${CWD}", this.cwdPath],
      ["${HOME}", this.homePath]
    ];
    if (this.env.CODEX_HOME) {
      replacements.push(["${CODEX_HOME}", this.codexHome()]);
    }

    for (const [template, root] of replacements.sort((a, b) => b[1].length - a[1].length)) {
      if (resolved === root) {
        return template;
      }
      const prefix = root.endsWith(this.pathApi.sep) ? root : `${root}${this.pathApi.sep}`;
      if (resolved.startsWith(prefix)) {
        return `${template}/${resolved.slice(prefix.length).split(this.pathApi.sep).join("/")}`;
      }
    }
    return resolved.split(this.pathApi.sep).join("/");
  }

  join(...parts: string[]): string {
    return this.pathApi.join(...parts);
  }

  resolveInputPath(input: string): string {
    if (this.pathApi.isAbsolute(input)) {
      return this.pathApi.normalize(input);
    }
    return this.pathApi.resolve(input);
  }

  pathModule(): path.PlatformPath {
    return this.pathApi;
  }

  private claudePaths(): ToolPathSet {
    const configDir = this.join(this.homePath, ".claude");
    const managedDir = this.managedDir("claude");
    const paths = {
      globalConfigDir: configDir,
      globalSettings: this.join(configDir, "settings.json"),
      globalInstructions: this.join(configDir, "CLAUDE.md"),
      globalCommands: this.join(configDir, "commands"),
      globalSkills: this.join(configDir, "skills"),
      globalAgents: this.join(configDir, "agents"),
      globalState: this.join(this.homePath, ".claude.json"),
      projectConfigDir: this.join(this.projectPath, ".claude"),
      projectSettings: this.join(this.projectPath, ".claude", "settings.json"),
      projectInstructions: this.join(this.projectPath, "CLAUDE.md"),
      projectDotInstructions: this.join(this.projectPath, ".claude", "CLAUDE.md"),
      projectCommands: this.join(this.projectPath, ".claude", "commands"),
      projectSkills: this.join(this.projectPath, ".claude", "skills"),
      projectAgents: this.join(this.projectPath, ".claude", "agents"),
      projectRules: this.join(this.projectPath, ".claude", "rules"),
      projectMcp: this.join(this.projectPath, ".mcp.json"),
      localSettings: this.join(this.projectPath, ".claude", "settings.local.json"),
      localInstructions: this.join(this.projectPath, "CLAUDE.local.md"),
      managedDir: managedDir ?? "",
      managedSettings: managedDir ? this.join(managedDir, "managed-settings.json") : "",
      managedMcp: managedDir ? this.join(managedDir, "managed-mcp.json") : "",
      managedInstructions: managedDir ? this.join(managedDir, "CLAUDE.md") : ""
    };
    return this.pathSet("claude", configDir, managedDir, paths);
  }

  private codexPaths(): ToolPathSet {
    const configDir = this.codexHome();
    const paths = {
      globalConfigDir: configDir,
      globalConfig: this.join(configDir, "config.toml"),
      globalInstructions: this.join(configDir, "AGENTS.md"),
      globalOverrideInstructions: this.join(configDir, "AGENTS.override.md"),
      globalCommands: this.join(configDir, "commands"),
      globalSkills: this.join(configDir, "skills"),
      globalSkillsMirror: this.join(configDir, "skills-mirror"),
      globalAgents: this.join(configDir, "agents"),
      projectConfigDir: this.join(this.projectPath, ".codex"),
      projectConfig: this.join(this.projectPath, ".codex", "config.toml"),
      projectCommands: this.join(this.projectPath, ".codex", "commands"),
      projectSkills: this.join(this.projectPath, ".agents", "skills"),
      projectAgents: this.join(this.projectPath, ".agents")
    };
    return this.pathSet("codex", configDir, undefined, paths);
  }

  private geminiPaths(): ToolPathSet {
    const configDir = this.join(this.homePath, ".gemini");
    const paths = {
      globalConfigDir: configDir,
      globalSettings: this.join(configDir, "settings.json"),
      globalInstructions: this.join(configDir, "GEMINI.md"),
      globalCommands: this.join(configDir, "commands"),
      globalSkills: this.join(configDir, "skills"),
      globalExtensions: this.join(configDir, "extensions"),
      projectConfigDir: this.join(this.projectPath, ".gemini"),
      projectSettings: this.join(this.projectPath, ".gemini", "settings.json"),
      projectCommands: this.join(this.projectPath, ".gemini", "commands"),
      projectSkills: this.join(this.projectPath, ".gemini", "skills"),
      projectExtensions: this.join(this.projectPath, ".gemini", "extensions")
    };
    return this.pathSet("gemini", configDir, undefined, paths);
  }

  private pathSet(tool: ToolId, configDir: string, managedDir: string | undefined, paths: Record<string, string>): ToolPathSet {
    const templates: Record<string, string> = {};
    for (const [key, value] of Object.entries(paths)) {
      templates[key] = value ? this.templateFor(value) : "";
    }
    return { tool, homeDir: this.homePath, configDir, managedDir, paths, templates };
  }

  private codexHome(): string {
    return this.resolveInputPath(this.env.CODEX_HOME || this.join(this.homePath, ".codex"));
  }

  private managedDir(tool: ToolId): string | undefined {
    if (tool !== "claude") {
      return undefined;
    }
    if (this.platform === "darwin") {
      return "/Library/Application Support/ClaudeCode";
    }
    if (this.platform === "win32") {
      return "C:\\Program Files\\ClaudeCode";
    }
    return "/etc/claude-code";
  }
}
