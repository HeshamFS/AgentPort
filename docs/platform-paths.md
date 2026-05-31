# Platform Paths

AgentPort resolves paths through `PathResolver` instead of hard-coding the current machine.

## Inputs

- `--home`: overrides the user home directory for testing or profile migration.
- `--project`: repository/project root.
- `--cwd`: active working directory inside the project, used for hierarchical instruction discovery.
- `CODEX_HOME`: overrides Codex global home.

## Claude Code

| Scope | Windows | macOS | Linux/WSL |
| --- | --- | --- | --- |
| Managed | `C:\Program Files\ClaudeCode\` | `/Library/Application Support/ClaudeCode/` | `/etc/claude-code/` |
| Global | `${HOME}/.claude/` and `${HOME}/.claude.json` | Same | Same |
| Project | `${PROJECT}/CLAUDE.md`, `${PROJECT}/.claude/settings.json`, `${PROJECT}/.mcp.json` | Same | Same |
| Local | `${PROJECT}/CLAUDE.local.md`, `${PROJECT}/.claude/settings.local.json`, project entry in `${HOME}/.claude.json` | Same | Same |

## Codex

| Scope | Path |
| --- | --- |
| Global | `${CODEX_HOME}` when set, otherwise `${HOME}/.codex/` |
| Project | `${PROJECT}/AGENTS.md`, nested `AGENTS.md`, `${PROJECT}/.codex/config.toml`, `${PROJECT}/.agents/skills/` |

`AGENTS.override.md` takes priority where present. `--cwd` controls which nested instruction files are considered active.

## Gemini CLI

| Scope | Path |
| --- | --- |
| Global | `${HOME}/.gemini/settings.json`, `${HOME}/.gemini/GEMINI.md`, `${HOME}/.gemini/commands/*.toml` |
| Project | `${PROJECT}/.gemini/settings.json`, hierarchical `GEMINI.md`, `${PROJECT}/.gemini/commands/*.toml` |

Workspace settings override user settings for configured context filenames. Subdirectory context discovery respects `.gitignore` and `.geminiignore`.
