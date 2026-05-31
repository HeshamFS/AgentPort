# Standardization Strategy

AgentPort should become useful in three layers.

## 1. Portable Format

AgentPack is the common format. It should be stable, documented, and easy for other tools to emit or consume.

The standard should focus on durable concepts:

- instructions
- MCP servers
- skills
- agents
- commands
- permissions
- hooks
- memory summaries
- plugins/extensions
- evidence
- manual actions

Tool-specific behavior belongs in adapters, not in the core schema unless multiple ecosystems share it.

## 2. Safe Migration Planner

The CLI proves the standard. It should always show:

- what was detected
- where it came from
- what will be written
- what is skipped
- what needs manual review
- how confident the migration is

This is what makes migrations trustworthy for real teams.

## 3. Community Adapter Ecosystem

Every adapter should be small, tested, and documented against dated facts. New adapters should start as research-only catalog entries before becoming implemented adapters.

Priority order for future adapters:

1. Cursor and Windsurf, because IDE migration is a high-demand workflow.
2. Antigravity and Kiro, because they introduce richer project steering/spec models.
3. Amp, OpenCode, Aider, Goose, Cline, Roo Code, and Continue, because they cover popular CLI and extension-based workflows.
4. Enterprise/cloud agents after local portability is reliable.

## Adoption Path

The path to adoption is:

1. Publish the schema and docs.
2. Publish the CLI.
3. Add fixtures for real-world configurations.
4. Invite maintainers of other agent tools to contribute adapters.
5. Keep a public compatibility matrix with dates and citations.

The standard wins if it is honest about lossy migration. It should not claim universal compatibility; it should make migration risk visible and manageable.
