import path from "node:path";
import { promises as fs } from "node:fs";
import type { MigrationPlan } from "./types.js";
import { ensureDir, pathExists, writeTextFile } from "./utils/fs.js";

export interface ApplyOptions {
  dryRun?: boolean;
  yes?: boolean;
}

export interface ApplyResult {
  written: string[];
  backedUp: string[];
  dryRun: boolean;
}

export async function applyMigrationPlan(plan: MigrationPlan, options: ApplyOptions): Promise<ApplyResult> {
  if (!options.dryRun && !options.yes) {
    throw new Error("Refusing to write files without --yes. Run with --dry-run to preview changes.");
  }

  const result: ApplyResult = { written: [], backedUp: [], dryRun: Boolean(options.dryRun) };

  for (const write of plan.writes) {
    if (write.kind === "mkdir") {
      if (!options.dryRun) {
        await ensureDir(write.targetPath);
      }
      result.written.push(write.targetPath);
      continue;
    }
    if (write.content === undefined) {
      continue;
    }
    if (options.dryRun) {
      result.written.push(write.targetPath);
      continue;
    }
    if (await pathExists(write.targetPath)) {
      const backupPath = `${write.targetPath}.agentmigrate-backup.${timestamp()}`;
      await ensureDir(path.dirname(backupPath));
      await fs.copyFile(write.targetPath, backupPath);
      result.backedUp.push(backupPath);
    }
    await writeTextFile(write.targetPath, write.content);
    result.written.push(write.targetPath);
  }

  return result;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
