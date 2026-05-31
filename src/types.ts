export type ToolId = "claude" | "codex" | "gemini";
export type SourceToolId = ToolId | "mixed";
export type Scope = "global" | "project" | "local" | "managed" | "all";
export type ScopeKind = "managed" | "global" | "project" | "local" | "nested" | "plugin" | "cloud" | "session" | "unknown";
export type LegacyItemScope = "user" | "project" | "local" | "managed" | "unknown";
export type ItemScopeInput = ScopeKind | LegacyItemScope | ScopeInfo;
export type Portability = "exact" | "translated" | "lossy" | "manual" | "unsupported" | "skipped";
export type Transport = "stdio" | "streamable-http" | "sse" | "unknown";
export type TargetScopeMode = "same" | "global" | "project" | "local";

export interface ScopeInfo {
  kind: ScopeKind;
  sharedWith: "organization" | "all-projects" | "team" | "current-user" | "current-session" | "unknown";
  appliesTo: "all-users" | "current-user" | "all-projects" | "current-project" | "path-subtree" | "runtime" | "unknown";
  precedence: number;
  toolNativeName: string;
}

export interface ScanOptions {
  from: ToolId | "auto";
  scope: Scope;
  projectPath: string;
  homePath: string;
  cwdPath: string;
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
}

export interface SourceInfo {
  tool: SourceToolId;
  scope: Scope;
  projectPath?: string;
  cwdPath?: string;
  homePath?: string;
  platform: string;
}

export interface SourceEvidence {
  id: string;
  tool: SourceToolId;
  kind: string;
  scope: ScopeInfo;
  path: string;
  resolvedBy: string;
  note?: string;
}

export interface BaseItem {
  id: string;
  sourceTool: SourceToolId;
  scope: ScopeInfo;
  sourcePath?: string;
  portability: Portability;
  evidenceIds: string[];
  notes?: string[];
}

export interface InstructionItem extends BaseItem {
  canonicalName: string;
  content: string;
  activation?: string;
}

export interface McpServerItem extends BaseItem {
  name: string;
  transport: Transport;
  command?: string;
  args?: string[];
  url?: string;
  serverUrl?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  disabled?: boolean;
  autoApprove?: string[];
  raw?: Record<string, unknown>;
}

export interface FileContent {
  relativePath: string;
  content: string;
}

export interface SkillItem extends BaseItem {
  name: string;
  description?: string;
  files: FileContent[];
}

export interface AgentItem extends BaseItem {
  name: string;
  description?: string;
  content: string;
  frontmatter?: Record<string, string>;
}

export interface CommandItem extends BaseItem {
  name: string;
  content: string;
  trigger?: string;
}

export interface HookItem extends BaseItem {
  event: string;
  matcher?: string;
  handlerType: string;
  command?: string;
  url?: string;
  raw: unknown;
}

export interface PermissionsItem extends BaseItem {
  allow?: string[];
  ask?: string[];
  deny?: string[];
  raw?: unknown;
}

export interface MemorySummaryItem extends BaseItem {
  strategy: "summarize-only" | "skip-raw" | "manual";
  content?: string;
}

export interface PluginItem extends BaseItem {
  name: string;
  source?: string;
  raw?: unknown;
}

export interface ManualAction {
  id: string;
  reason: string;
  portability: Portability;
  itemIds?: string[];
}

export interface AgentPack {
  schemaVersion: "1.1.0";
  createdAt: string;
  source: SourceInfo;
  instructions: InstructionItem[];
  mcpServers: McpServerItem[];
  skills: SkillItem[];
  agents: AgentItem[];
  commands: CommandItem[];
  hooks: HookItem[];
  permissions: PermissionsItem[];
  memorySummaries: MemorySummaryItem[];
  plugins: PluginItem[];
  sourceEvidence: SourceEvidence[];
  manualActions: ManualAction[];
}

export type WriteActionKind = "write" | "mkdir";

export interface WriteAction {
  id: string;
  kind: WriteActionKind;
  targetPath: string;
  targetTemplate: string;
  content?: string;
  portability: Portability;
  reason: string;
  itemIds: string[];
}

export interface MigrationPlan {
  schemaVersion: "1.1.0";
  createdAt: string;
  source: SourceInfo;
  target: ToolId;
  sourcePackHash: string;
  summary: Record<Portability, number>;
  writes: WriteAction[];
  manualActions: ManualAction[];
  skipped: ManualAction[];
  warnings: string[];
}

export interface PlanOptions {
  targetHomePath?: string;
  targetProjectPath?: string;
  targetScope?: TargetScopeMode;
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
}

export interface Adapter {
  id: ToolId;
  displayName: string;
  detect(options: ScanOptions): Promise<boolean>;
  scan(options: ScanOptions): Promise<AgentPack>;
}
