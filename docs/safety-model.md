# Safety Model

AgentPort's default posture is conservative because coding-agent configuration can execute commands, expose credentials, and change repository behavior.

## Non-Mutating Commands

These commands must not write target configuration:

- `doctor`
- `scan`
- `plan`
- `apply --dry-run`

## Mutating Command

Only this command writes files:

```bash
agentport apply --plan migration.plan.json --yes
```

Before overwriting a target file, AgentPort creates a timestamped backup next to the original file.

## Secrets

AgentPort redacts secret-like values in MCP `env` and `headers`. For example:

```json
{
  "GITHUB_TOKEN": "ghp_actual_secret"
}
```

becomes:

```json
{
  "GITHUB_TOKEN": "${GITHUB_TOKEN}"
}
```

The migration plan then includes a manual action telling the user to review credentials.

## Hooks And Permissions

Hooks and permissions are never auto-upgraded across tools in V1. They are scanned and preserved as evidence, but target behavior must be reviewed manually.

## Local Scope

Local/private project scope is never converted into a shared project file unless the user explicitly plans with:

```bash
agentport plan --target-scope project
```

## Conversations

Raw conversations are skipped by design in V1. Future versions may support explicit summary extraction, but raw transcript import should remain opt-in.
