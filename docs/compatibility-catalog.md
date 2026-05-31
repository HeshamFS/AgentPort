# Compatibility Catalog

The compatibility catalog is stored in:

```text
catalog/adapter-facts.yaml
```

It separates researched facts from conversion logic. That matters because vendor behavior changes over time, and adapters should be testable against a specific set of documented assumptions.

## V1 Implemented

- Claude Code
- Codex
- Gemini CLI

## V1 Research-Only

- Cursor
- Windsurf
- Antigravity
- Kiro
- Amp
- Aider
- OpenCode
- Goose
- Zed
- JetBrains Junie
- GitHub Copilot CLI
- Amazon Q Developer
- Continue
- Cline
- Roo Code
- Trae
- Augment
- Replit Agent
- Devin

## Promotion Criteria

A research-only tool can become an implemented adapter when it has:

- documented local storage paths
- a stable instruction mechanism
- a documented MCP configuration format or clear absence of MCP support
- a test fixture for user scope and project scope
- explicit caveats for hooks, permissions, memories, and plugins
