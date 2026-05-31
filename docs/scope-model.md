# Scope Model

AgentPort separates where something lives from who it affects.

| Scope | Meaning | Shared With | Typical Precedence | Auto-Write |
| --- | --- | --- | --- | --- |
| `managed` | Organization/IT policy | Organization | Highest | Never |
| `global` | User-wide private configuration | Current user across projects | Low | Yes, to target global paths |
| `project` | Repository-shared configuration | Team/project | Medium | Yes, to target project paths |
| `local` | Private project-specific configuration | Current user in current project | High | Only to exact private equivalent |
| `nested` | Path-subtree instructions below project root | Team/project subtree | Above project | Emits as project unless target supports nesting |
| `plugin` | Installed extension/plugin metadata | Tool/runtime | Tool-specific | Skipped in V1 |
| `cloud` | Remote service/account state | External service | Tool-specific | Skipped in V1 |
| `session` | Conversation or runtime session data | Current session | Runtime-only | Skipped in V1 |

## CLI Scopes

`--scope user` is accepted as a compatibility alias for `--scope global`.

```bash
agentport scan --scope global
agentport scan --scope project
agentport scan --scope local
agentport scan --scope managed
agentport scan --scope all
```

## Target Scope

`plan --target-scope same` preserves the source scope.

Explicit target scopes are opt-in:

```bash
agentport plan --target-scope project
```

This is the only way local/private inputs may become shared project outputs. Managed inputs are still manual-review only.
