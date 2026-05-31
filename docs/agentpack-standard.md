# AgentPack Standard

AgentPack is the portable artifact emitted by AgentPort. It is intentionally explicit: every item has source evidence, structured scope, and a portability label.

The schema lives at:

```text
schemas/agentpack.schema.json
```

Current schema version: `1.1.0`.

## Core Objects

- `instructions`: Markdown guidance such as `CLAUDE.md`, `AGENTS.md`, and `GEMINI.md`.
- `mcpServers`: MCP server definitions normalized across JSON and TOML formats.
- `skills`: portable `SKILL.md` folders and their included files.
- `agents`: subagents or agent personas where the source tool exposes them as files.
- `commands`: reusable slash-command style workflows.
- `hooks`: lifecycle automation, always manual-review in V1.
- `permissions`: allow/deny/ask rules, always manual-review in V1.
- `memorySummaries`: summary-only memory migration; raw conversations are skipped.
- `plugins`: cataloged plugins/extensions; never auto-installed in V1.
- `sourceEvidence`: file-level evidence for every scanned item.
- `manualActions`: actions the user must review.

## Scope Object

Every portable item uses:

```json
{
  "kind": "global",
  "sharedWith": "all-projects",
  "appliesTo": "current-user",
  "precedence": 100,
  "toolNativeName": "user"
}
```

`user` from AgentPack `1.0.0` is read as `global` for backward compatibility.

## Portability Labels

- `exact`: same concept can be emitted safely.
- `translated`: equivalent target behavior is generated in a different format.
- `lossy`: useful but incomplete conversion.
- `manual`: user review is required.
- `unsupported`: target has no matching feature.
- `skipped`: intentionally not migrated.

## Standardization Rule

AgentPack should preserve intent, not filenames. For example, Claude `CLAUDE.md`, Codex `AGENTS.md`, and Gemini `GEMINI.md` are all normalized as `instructions`, then compiled into the target tool's expected file.

MCP is the highest-confidence portable layer. Hooks, permissions, marketplace plugins, and conversations are the lowest-confidence layers and must remain conservative.
