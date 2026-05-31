# GitHub Publish Notes

## Repository Description

Safe migration planner and portable AgentPack standard for AI coding-agent environments.

## npm Package

Initial package name:

```text
@heshamfsalama/agentport
```

Install:

```bash
npm install -g @heshamfsalama/agentport
```

Run without installing:

```bash
npx @heshamfsalama/agentport doctor --project .
```

## Short Social Description

AgentPort scans Claude Code, Codex, and Gemini CLI configuration, normalizes it into an AgentPack, and creates a safe migration plan before writing anything.

## Suggested Topics

- ai-agents
- coding-agent
- codex
- claude-code
- gemini-cli
- mcp
- migration
- developer-tools
- typescript
- cli

## Ecosystems To Invite

Keep outreach simple and specific. Do not imply endorsement or compatibility beyond what exists.

Relevant ecosystems and companies/projects:

- OpenAI Codex
- Anthropic Claude Code
- Google Gemini CLI and Antigravity
- Cursor
- Windsurf
- AWS Kiro and Amazon Q Developer
- Sourcegraph Amp
- Aider
- OpenCode
- Block Goose
- Cline
- Roo Code
- Continue
- Zed
- JetBrains Junie
- GitHub Copilot

Suggested wording:

> We are building AgentPort, a small open-source migration planner for AI coding-agent configuration. V1 supports Claude Code, Codex, and Gemini CLI, with a research catalog for other tools. Feedback from maintainers and users of these ecosystems would be very useful, especially around config paths, MCP behavior, scopes, and safety boundaries.

## First GitHub Release Checklist

- Create repository and push `main`.
- Add repo description and topics above.
- Confirm CI passes on Windows, macOS, and Ubuntu.
- Enable private vulnerability reporting if available.
- Protect `main` after the first push.
- Open first issues for Cursor/Windsurf adapter research.
- Tag `v0.1.0` only after reviewing generated package contents.
