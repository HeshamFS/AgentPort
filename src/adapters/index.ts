import os from "node:os";
import path from "node:path";
import type { Adapter, AgentPack, ScanOptions, ToolId } from "../types.js";
import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";
import { geminiAdapter } from "./gemini.js";
import { mergePacks } from "./common.js";
import { PathResolver } from "../path-resolver.js";

export const adapters: Record<ToolId, Adapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  gemini: geminiAdapter
};

export function defaultScanOptions(partial: Partial<ScanOptions>): ScanOptions {
  const platform = partial.platform ?? os.platform();
  const env = partial.env ?? process.env;
  const homePath = path.resolve(partial.homePath ?? env.AGENTPORT_HOME ?? env.AGENTMIGRATE_HOME ?? os.homedir());
  const projectPath = path.resolve(partial.projectPath ?? process.cwd());
  return {
    from: partial.from ?? "auto",
    scope: partial.scope ?? "all",
    projectPath,
    cwdPath: path.resolve(partial.cwdPath ?? projectPath),
    homePath,
    env,
    platform
  };
}

export async function scan(options: ScanOptions): Promise<AgentPack> {
  if (options.from !== "auto") {
    return adapters[options.from].scan(options);
  }

  const detected: Adapter[] = [];
  for (const adapter of Object.values(adapters)) {
    if (await adapter.detect(options)) {
      detected.push(adapter);
    }
  }

  if (detected.length === 0) {
    return mergePacks("mixed", [], options);
  }

  const packs = [];
  for (const adapter of detected) {
    packs.push(await adapter.scan({ ...options, from: adapter.id }));
  }

  return detected.length === 1 ? packs[0] : mergePacks("mixed", packs, options);
}

export interface DoctorOptions {
  projectPath: string;
  cwdPath?: string;
  homePath?: string;
  showPaths?: boolean;
  json?: boolean;
}

export async function doctor(input: string | DoctorOptions, homePath = process.env.AGENTPORT_HOME ?? process.env.AGENTMIGRATE_HOME ?? os.homedir()): Promise<string> {
  const doctorOptions: DoctorOptions = typeof input === "string" ? { projectPath: input, homePath } : input;
  const options = defaultScanOptions({
    from: "auto",
    scope: "all",
    projectPath: doctorOptions.projectPath,
    cwdPath: doctorOptions.cwdPath,
    homePath: doctorOptions.homePath
  });
  const resolver = new PathResolver(options);
  const detectedRows = [];
  for (const adapter of Object.values(adapters)) {
    const detected = await adapter.detect(options);
    detectedRows.push({ id: adapter.id, displayName: adapter.displayName, detected });
  }
  const pack = await scan(options);
  const payload = {
    name: "AgentPort Doctor",
    project: options.projectPath,
    cwd: options.cwdPath,
    home: options.homePath,
    tools: detectedRows,
    paths: doctorOptions.showPaths ? Object.fromEntries(Object.keys(adapters).map((key) => [key, resolver.toolPaths(key as ToolId)])) : undefined,
    detectedItems: {
      instructions: pack.instructions.length,
      mcpServers: pack.mcpServers.length,
      skills: pack.skills.length,
      agents: pack.agents.length,
      commands: pack.commands.length,
      hooks: pack.hooks.length,
      permissions: pack.permissions.length,
      plugins: pack.plugins.length,
      manualActions: pack.manualActions.length
    }
  };
  if (doctorOptions.json) {
    return JSON.stringify(payload, null, 2);
  }

  const rows: string[] = [`AgentPort Doctor`, `Project: ${options.projectPath}`, `CWD: ${options.cwdPath}`, `Home: ${options.homePath}`, ""];
  for (const tool of detectedRows) {
    rows.push(`${tool.detected ? "[ok]" : "[--]"} ${tool.displayName}`);
  }
  if (doctorOptions.showPaths && payload.paths) {
    rows.push("");
    rows.push("Resolved paths:");
    for (const [tool, value] of Object.entries(payload.paths)) {
      rows.push(`- ${tool}: ${(value as { configDir: string }).configDir}`);
    }
  }
  rows.push("");
  rows.push(`Detected items:`);
  rows.push(`- instructions: ${pack.instructions.length}`);
  rows.push(`- MCP servers: ${pack.mcpServers.length}`);
  rows.push(`- skills: ${pack.skills.length}`);
  rows.push(`- agents: ${pack.agents.length}`);
  rows.push(`- commands: ${pack.commands.length}`);
  rows.push(`- hooks: ${pack.hooks.length}`);
  rows.push(`- permissions: ${pack.permissions.length}`);
  rows.push(`- plugins: ${pack.plugins.length}`);
  rows.push(`- manual actions: ${pack.manualActions.length}`);
  return rows.join("\n");
}
