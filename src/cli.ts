#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { applyMigrationPlan } from "./apply.js";
import { defaultScanOptions, doctor, scan } from "./adapters/index.js";
import { createMigrationPlan } from "./planner.js";
import type { AgentPack, MigrationPlan, TargetScopeMode, ToolId } from "./types.js";
import { parseScanScope } from "./scope.js";

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);

  if (!command || command === "help" || args.help === true) {
    printHelp();
    return;
  }

  if (command === "scan") {
    const options = defaultScanOptions({
      from: parseFrom(args.from),
      scope: parseScope(args.scope),
      projectPath: stringArg(args.project) ?? process.cwd(),
      cwdPath: stringArg(args.cwd) ?? stringArg(args.project) ?? process.cwd(),
      homePath: stringArg(args.home)
    });
    const pack = await scan(options);
    await writeJsonOrStdout(pack, stringArg(args.out));
    return;
  }

  if (command === "plan") {
    const packPath = requiredString(args.pack, "--pack is required");
    const target = parseTarget(args.to);
    const pack = JSON.parse(await fs.readFile(packPath, "utf8")) as AgentPack;
    const plan = createMigrationPlan(pack, target, {
      targetHomePath: stringArg(args["target-home"]),
      targetProjectPath: stringArg(args["target-project"]),
      targetScope: parseTargetScope(args["target-scope"])
    });
    await writeJsonOrStdout(plan, stringArg(args.out));
    return;
  }

  if (command === "apply") {
    const planPath = requiredString(args.plan, "--plan is required");
    const plan = JSON.parse(await fs.readFile(planPath, "utf8")) as MigrationPlan;
    const result = await applyMigrationPlan(plan, {
      dryRun: args["dry-run"] === true,
      yes: args.yes === true
    });
    console.log(formatApplyResult(result));
    return;
  }

  if (command === "doctor") {
    const project = path.resolve(stringArg(args.project) ?? process.cwd());
    console.log(await doctor({
      projectPath: project,
      cwdPath: stringArg(args.cwd),
      homePath: stringArg(args.home),
      showPaths: args["show-paths"] === true,
      json: args.json === true
    }));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function parseArgs(args: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      continue;
    }
    const without = arg.slice(2);
    const eq = without.indexOf("=");
    if (eq !== -1) {
      out[without.slice(0, eq)] = without.slice(eq + 1);
      continue;
    }
    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      out[without] = next;
      i += 1;
    } else {
      out[without] = true;
    }
  }
  return out;
}

function parseFrom(value: unknown): ToolId | "auto" {
  const text = String(value ?? "auto");
  if (text === "auto" || text === "claude" || text === "codex" || text === "gemini") {
    return text;
  }
  throw new Error(`Invalid --from value: ${text}`);
}

function parseTarget(value: unknown): ToolId {
  const text = String(value ?? "");
  if (text === "claude" || text === "codex" || text === "gemini") {
    return text;
  }
  throw new Error("--to must be one of claude, codex, gemini");
}

function parseScope(value: unknown) {
  return parseScanScope(value);
}

function parseTargetScope(value: unknown): TargetScopeMode {
  const text = String(value ?? "same");
  if (text === "same" || text === "global" || text === "project" || text === "local") {
    return text;
  }
  throw new Error("--target-scope must be one of same, global, project, local");
}

function stringArg(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(message);
  }
  return value;
}

async function writeJsonOrStdout(value: unknown, outPath: string | undefined): Promise<void> {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (!outPath) {
    process.stdout.write(content);
    return;
  }
  await fs.mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
  await fs.writeFile(outPath, content, "utf8");
}

function formatApplyResult(result: { dryRun: boolean; written: string[]; backedUp: string[] }): string {
  const lines = [result.dryRun ? "Dry run. No files were written." : "Migration plan applied."];
  lines.push(`Writes: ${result.written.length}`);
  for (const file of result.written) {
    lines.push(`- ${file}`);
  }
  if (result.backedUp.length) {
    lines.push(`Backups: ${result.backedUp.length}`);
    for (const file of result.backedUp) {
      lines.push(`- ${file}`);
    }
  }
  return lines.join("\n");
}

function printHelp(): void {
  console.log(`AgentPort

Recommended:
  agentport doctor --project .
  agentport scan --from auto --scope all --project . --cwd . --out agentpack.json
  agentport plan --pack agentpack.json --to codex --target-scope same --out migration.plan.json
  agentport apply --plan migration.plan.json --dry-run

Commands:
  scan   --from auto|claude|codex|gemini --scope global|project|local|managed|all --project <path> --cwd <path> --out agentpack.json
  plan   --pack agentpack.json --to claude|codex|gemini --target-home <path> --target-project <path> --target-scope same|global|project|local --out migration.plan.json
  apply  --plan migration.plan.json --dry-run
  apply  --plan migration.plan.json --yes
  doctor --project <path> --show-paths --json

Advanced:
  --home <path> can be used in tests or profile-specific migrations.
  --scope user is accepted as a compatibility alias for --scope global.

Alias:
  agentmigrate is kept as a compatibility alias for agentport.
`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
