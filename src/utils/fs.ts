import { promises as fs } from "node:fs";
import path from "node:path";

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readTextIfExists(filePath: string): Promise<string | undefined> {
  if (!(await pathExists(filePath))) {
    return undefined;
  }
  return fs.readFile(filePath, "utf8");
}

export async function readJsonIfExists(filePath: string): Promise<unknown | undefined> {
  const content = await readTextIfExists(filePath);
  if (content === undefined) {
    return undefined;
  }
  return JSON.parse(content);
}

export async function listFilesRecursive(root: string, options: { maxBytes?: number; ignoreDirs?: string[] } = {}): Promise<string[]> {
  if (!(await pathExists(root))) {
    return [];
  }
  const ignore = new Set(options.ignoreDirs ?? ["node_modules", ".git", "dist", ".cache"]);
  const out: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!ignore.has(entry.name)) {
          await walk(full);
        }
        continue;
      }
      if (entry.isFile()) {
        if (options.maxBytes !== undefined) {
          const stat = await fs.stat(full);
          if (stat.size > options.maxBytes) {
            continue;
          }
        }
        out.push(full);
      }
    }
  }

  await walk(root);
  return out.sort();
}

export async function listImmediateMarkdownFiles(root: string): Promise<string[]> {
  if (!(await pathExists(root))) {
    return [];
  }
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(md|markdown|txt)$/i.test(entry.name))
    .map((entry) => path.join(root, entry.name))
    .sort();
}

export function normalizePath(filePath: string): string {
  return path.resolve(filePath);
}

export function toPosixRelative(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}
