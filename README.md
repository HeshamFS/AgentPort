# AgentPort

AgentPort is a safe migration planner and compiler for AI coding-agent environments.

It scans tools like Claude Code, Codex, and Gemini CLI, normalizes their configuration into an **AgentPack**, produces a reviewed migration plan, and applies that plan only after explicit approval.

The goal is not to copy random folders. The goal is a standard, inspectable way to move agent instructions, MCP servers, skills, commands, permissions, and automation between coding agents without silently leaking secrets or changing behavior.

## npm Package

AgentPort is published on npm:

[npmjs.com/package/@heshamfsalama/agentport](https://www.npmjs.com/package/@heshamfsalama/agentport)

```bash
npx @heshamfsalama/agentport help
```

## Product Model

- **AgentPort**: the CLI and migration engine.
- **AgentPack**: the portable JSON artifact and schema.
- **Adapter**: a scanner/emitter for a specific tool.
- **Migration plan**: a reviewed list of writes, manual actions, skipped items, and portability labels.

## Recommended First Run

Without installing:

```bash
npx @heshamfsalama/agentport doctor --project .
```

Or install globally:

```bash
npm install -g @heshamfsalama/agentport
```

```bash
agentport doctor --project .
agentport scan --from auto --scope all --project . --cwd . --out agentpack.json
agentport plan --pack agentpack.json --to codex --target-scope same --out migration.plan.json
agentport apply --plan migration.plan.json --dry-run
```

Only apply after reviewing `migration.plan.json`:

```bash
agentport apply --plan migration.plan.json --yes
```

`agentmigrate` remains as a backward-compatible alias while the project transitions to AgentPort.

## Safety Defaults

- `scan` and `plan` do not write target files.
- Secrets are redacted into environment variable references.
- Raw conversations are not imported.
- Hooks and permissions that do not map exactly are flagged for manual review.
- Marketplace plugins are cataloged but not installed.
- Managed organization policy is never auto-written.
- Local/private project scope stays private unless explicitly promoted.

## Supported V1 Adapters

- Claude Code
- Codex
- Gemini CLI

The compatibility catalog also tracks research-only entries for Cursor, Windsurf, Antigravity, Kiro, Amp, Aider, OpenCode, Goose, Zed, JetBrains Junie, GitHub Copilot CLI, Amazon Q Developer, Continue, Cline, Roo Code, Trae, Augment, Replit Agent, and Devin.

## Who Should Look At This

AgentPort is meant for users and maintainers of AI coding-agent tools who care about portable, reviewable configuration. Relevant ecosystems include OpenAI Codex, Anthropic Claude Code, Google Gemini CLI and Antigravity, Cursor, Windsurf, Kiro, Amazon Q Developer, Sourcegraph Amp, Aider, OpenCode, Goose, Cline, Roo Code, Continue, Zed, JetBrains Junie, and GitHub Copilot.

This list is not an endorsement claim. It is a map of tools whose users may benefit from a shared migration format.

## Documentation

- [Quickstart](docs/quickstart.md)
- [AgentPack Standard](docs/agentpack-standard.md)
- [Scope Model](docs/scope-model.md)
- [Platform Paths](docs/platform-paths.md)
- [Migration UX](docs/migration-ux.md)
- [Safety Model](docs/safety-model.md)
- [Adapter Authoring](docs/adapter-authoring.md)
- [Compatibility Catalog](docs/compatibility-catalog.md)
- [Standardization Strategy](docs/standardization-strategy.md)
- [GitHub Publish Notes](docs/github-publish.md)

## Contributing

Contributions are welcome. The most useful early contributions are sanitized fixtures, adapter research facts, and tests for new tool paths.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

## Security

Please do not paste private configs, credentials, or raw conversations into public issues. See [SECURITY.md](SECURITY.md).

## Current Status

This is V1. It is useful today for local migration planning between Claude Code, Codex, and Gemini CLI, and it is structured so the community can add adapters without changing the core standard.
