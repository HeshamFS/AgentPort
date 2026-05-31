# Quickstart

AgentPort is designed around review before mutation. The normal flow is:

```bash
npx @heshamfsalama/agentport doctor --project .
```

Or install it:

```bash
npm install -g @heshamfsalama/agentport
```

```bash
agentport doctor --project .
agentport scan --from auto --scope all --project . --cwd . --out agentpack.json
agentport plan --pack agentpack.json --to codex --target-scope same --out migration.plan.json
agentport apply --plan migration.plan.json --dry-run
agentport apply --plan migration.plan.json --yes
```

## What To Review

Review `agentpack.json` when you want to understand what was detected.

Review `migration.plan.json` before writing anything. It contains:

- `writes`: files AgentPort can safely generate.
- `manualActions`: items that need review before migration.
- `skipped`: intentionally non-portable items such as raw conversations and marketplace installs.
- `summary`: counts by portability label.

## Common Migrations

Claude Code to Codex:

```bash
agentport scan --from claude --scope all --project . --out agentpack.json
agentport plan --pack agentpack.json --to codex --target-scope same --out migration.plan.json
agentport apply --plan migration.plan.json --dry-run
```

Codex to Claude Code:

```bash
agentport scan --from codex --scope all --project . --out agentpack.json
agentport plan --pack agentpack.json --to claude --target-scope same --out migration.plan.json
agentport apply --plan migration.plan.json --dry-run
```

Gemini CLI to Codex:

```bash
agentport scan --from gemini --scope all --project . --out agentpack.json
agentport plan --pack agentpack.json --to codex --target-scope same --out migration.plan.json
agentport apply --plan migration.plan.json --dry-run
```

## Local Development

From this repository:

```bash
npm install
npm run build
npm link
agentport help
```

If `agentport` is not found, check that your global npm bin folder is on `PATH`.
