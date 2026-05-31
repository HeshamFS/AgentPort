import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { applyMigrationPlan } from "../src/apply.js";
import { defaultScanOptions, scan } from "../src/adapters/index.js";
import { PathResolver } from "../src/path-resolver.js";
import { createMigrationPlan } from "../src/planner.js";
import type { AgentPack, MigrationPlan } from "../src/types.js";

const execFileAsync = promisify(execFile);

test("scans Claude Code fixtures and redacts secret-like MCP values", async () => {
  const { home, project } = await makeTempLayout();
  await write(path.join(home, ".claude", "CLAUDE.md"), "Use pnpm everywhere.\n");
  await write(path.join(project, "CLAUDE.md"), "Run tests before finishing.\n");
  await write(path.join(home, ".claude.json"), JSON.stringify({
    mcpServers: {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "ghp_actual_secret" },
        alwaysAllow: ["search"]
      }
    }
  }, null, 2));
  await write(path.join(project, ".claude", "settings.json"), JSON.stringify({
    permissions: {
      allow: ["Bash(npm test)"],
      deny: ["Read(.env)"]
    },
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [{ type: "command", command: "./hooks/check.sh" }]
        }
      ]
    },
    enabledPlugins: ["team/plugin"]
  }, null, 2));
  await write(path.join(project, ".claude", "skills", "ship", "SKILL.md"), "---\nname: ship\ndescription: Release checklist.\n---\nShip safely.\n");

  const pack = await scan(defaultScanOptions({ from: "claude", scope: "all", projectPath: project, homePath: home }));

  assert.equal(pack.source.tool, "claude");
  assert.equal(pack.instructions.length, 2);
  assert.equal(pack.mcpServers.length, 1);
  assert.equal(pack.mcpServers[0].env?.GITHUB_TOKEN, "${GITHUB_TOKEN}");
  assert.equal(pack.skills[0].name, "ship");
  assert.equal(pack.hooks.length, 1);
  assert.equal(pack.permissions.length, 1);
  assert.equal(pack.plugins.length, 1);
  assert.ok(pack.manualActions.some((action) => action.reason.includes("Review credentials")));
});

test("plans Claude to Codex and only writes on apply --yes", async () => {
  const { home, project } = await makeTempLayout();
  await write(path.join(home, ".claude", "CLAUDE.md"), "Global agreement.\n");
  await write(path.join(project, "CLAUDE.md"), "Project agreement.\n");
  await write(path.join(project, ".mcp.json"), JSON.stringify({
    mcpServers: {
      docs: {
        command: "node",
        args: ["server.js"],
        env: { DOCS_API_KEY: "secret" }
      }
    }
  }, null, 2));
  await write(path.join(project, ".claude", "settings.json"), JSON.stringify({
    hooks: { PostToolUse: [{ hooks: [{ type: "command", command: "npm test" }] }] }
  }, null, 2));

  const pack = await scan(defaultScanOptions({ from: "claude", scope: "all", projectPath: project, homePath: home }));
  const plan = createMigrationPlan(pack, "codex");

  assert.ok(plan.writes.some((writeAction) => writeAction.targetPath.endsWith(path.join(".codex", "AGENTS.md"))));
  assert.ok(plan.writes.some((writeAction) => writeAction.targetPath.endsWith(path.join(".codex", "config.toml"))));
  assert.ok(plan.manualActions.some((action) => action.reason.includes("Hook")));

  await applyMigrationPlan(plan, { dryRun: true });
  await assert.rejects(fs.stat(path.join(project, "AGENTS.md")));

  await applyMigrationPlan(plan, { yes: true });
  const projectAgents = await fs.readFile(path.join(project, "AGENTS.md"), "utf8");
  assert.match(projectAgents, /Project agreement/);
  const codexConfig = await fs.readFile(path.join(project, ".codex", "config.toml"), "utf8");
  assert.match(codexConfig, /\[mcp_servers.docs\]/);
  assert.match(codexConfig, /\$\{DOCS_API_KEY\}/);
});

test("scans Gemini CLI settings, configured context files, commands, and MCP servers", async () => {
  const { home, project } = await makeTempLayout();
  await write(path.join(home, ".gemini", "settings.json"), JSON.stringify({
    context: { fileName: ["GEMINI.md", "CONTEXT.md"] },
    mcpServers: {
      local: { command: "node", args: ["mcp.js"] }
    }
  }, null, 2));
  await write(path.join(home, ".gemini", "GEMINI.md"), "Global Gemini guidance.\n");
  await write(path.join(project, "CONTEXT.md"), "Project context.\n");
  await write(path.join(project, ".gemini", "commands", "deploy.toml"), "description = \"Deploy command\"\nprompt = \"Deploy carefully.\"\n");

  const pack = await scan(defaultScanOptions({ from: "gemini", scope: "all", projectPath: project, homePath: home }));

  assert.equal(pack.source.tool, "gemini");
  assert.equal(pack.mcpServers.length, 1);
  assert.ok(pack.instructions.some((item) => item.canonicalName === "GEMINI.md" && item.scope.kind === "global"));
  assert.ok(pack.instructions.some((item) => item.canonicalName === "CONTEXT.md" && item.scope.kind === "project"));
  assert.equal(pack.commands.length, 1);
});

test("resolves cross-platform tool paths and CODEX_HOME", () => {
  const win = new PathResolver({
    platform: "win32",
    homePath: "C:\\Users\\ada",
    projectPath: "D:\\repo",
    cwdPath: "D:\\repo\\packages\\app",
    env: { CODEX_HOME: "E:\\portable\\codex" }
  });
  assert.equal(win.toolPaths("claude").paths.managedDir, "C:\\Program Files\\ClaudeCode");
  assert.equal(win.toolPaths("codex").configDir, "E:\\portable\\codex");
  assert.equal(win.templateFor("E:\\portable\\codex\\config.toml"), "${CODEX_HOME}/config.toml");

  const mac = new PathResolver({ platform: "darwin", homePath: "/Users/ada", projectPath: "/repo", cwdPath: "/repo/app", env: {} });
  assert.equal(mac.toolPaths("claude").paths.managedDir, "/Library/Application Support/ClaudeCode");

  const linux = new PathResolver({ platform: "linux", homePath: "/home/ada", projectPath: "/repo", cwdPath: "/repo/app", env: {} });
  assert.equal(linux.toolPaths("claude").paths.managedDir, "/etc/claude-code");
});

test("scans Claude managed scope and local project MCP from global state", async () => {
  const { home, project } = await makeTempLayout();
  await write(path.join(home, ".claude.json"), JSON.stringify({
    projects: {
      [project]: {
        mcpServers: {
          localfs: { command: "node", args: ["local.js"] }
        }
      }
    }
  }, null, 2));
  await write(path.join(project, ".claude", "settings.local.json"), JSON.stringify({
    permissions: { ask: ["Bash(*)"] }
  }));

  const pack = await scan(defaultScanOptions({ from: "claude", scope: "all", projectPath: project, homePath: home }));

  assert.ok(pack.mcpServers.some((server) => server.name === "localfs" && server.scope.kind === "local"));
  assert.ok(pack.permissions.some((permission) => permission.scope.kind === "local"));
});

test("scans Codex CODEX_HOME and nested AGENTS hierarchy to cwd", async () => {
  const { home, project } = await makeTempLayout();
  const cwd = path.join(project, "packages", "app");
  const codexHome = path.join(home, "portable-codex");
  await write(path.join(codexHome, "config.toml"), "[mcp_servers.docs]\ncommand = \"node\"\nargs = [\"docs.js\"]\nproject_doc_fallback_filenames = [\"GUIDE.md\"]\n");
  await write(path.join(project, "AGENTS.md"), "Project root instructions.\n");
  await write(path.join(cwd, "AGENTS.override.md"), "Nested override.\n");

  const pack = await scan(defaultScanOptions({ from: "codex", scope: "all", projectPath: project, cwdPath: cwd, homePath: home, env: { CODEX_HOME: codexHome } }));

  assert.ok(pack.mcpServers.some((server) => server.scope.kind === "global"));
  assert.ok(pack.instructions.some((item) => item.scope.kind === "project" && item.content.includes("Project root")));
  assert.ok(pack.instructions.some((item) => item.scope.kind === "nested" && item.content.includes("Nested override")));
});

test("keeps local scope private unless target-scope project is explicit", async () => {
  const { home, project } = await makeTempLayout();
  await write(path.join(project, "CLAUDE.local.md"), "Private local instruction.\n");

  const pack = await scan(defaultScanOptions({ from: "claude", scope: "all", projectPath: project, homePath: home }));
  const defaultPlan = createMigrationPlan(pack, "codex");
  assert.ok(defaultPlan.manualActions.some((action) => action.reason.includes("Local/private instruction")));
  assert.ok(!defaultPlan.writes.some((writeAction) => writeAction.content?.includes("Private local instruction")));

  const explicitPlan = createMigrationPlan(pack, "codex", { targetScope: "project", targetHomePath: home, targetProjectPath: project });
  assert.ok(explicitPlan.writes.some((writeAction) => writeAction.targetTemplate === "${PROJECT}/AGENTS.md" && writeAction.content?.includes("Private local instruction")));
});

test("CLI scan, plan, dry-run, and apply work end to end", async () => {
  const { home, project, root } = await makeTempLayout();
  const packPath = path.join(root, "pack.json");
  const planPath = path.join(root, "plan.json");
  const cli = path.resolve("dist", "src", "cli.js");

  await write(path.join(project, "AGENTS.md"), "Use strict TypeScript.\n");
  await write(path.join(home, ".codex", "config.toml"), "[mcp_servers.docs]\ncommand = \"node\"\nargs = [\"docs.js\"]\n");

  await execFileAsync(process.execPath, [cli, "scan", "--from", "codex", "--scope", "all", "--project", project, "--home", home, "--out", packPath]);
  const pack = JSON.parse(await fs.readFile(packPath, "utf8")) as AgentPack;
  assert.equal(pack.source.tool, "codex");
  assert.equal(pack.mcpServers.length, 1);

  await execFileAsync(process.execPath, [cli, "plan", "--pack", packPath, "--to", "claude", "--out", planPath]);
  const plan = JSON.parse(await fs.readFile(planPath, "utf8")) as MigrationPlan;
  assert.equal(plan.target, "claude");

  const dry = await execFileAsync(process.execPath, [cli, "apply", "--plan", planPath, "--dry-run"]);
  assert.match(dry.stdout, /Dry run/);

  await execFileAsync(process.execPath, [cli, "apply", "--plan", planPath, "--yes"]);
  assert.match(await fs.readFile(path.join(project, "CLAUDE.md"), "utf8"), /Use strict TypeScript/);
});

async function makeTempLayout(): Promise<{ root: string; home: string; project: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agentmigrate-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  await fs.mkdir(home, { recursive: true });
  await fs.mkdir(project, { recursive: true });
  return { root, home, project };
}

async function write(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}
