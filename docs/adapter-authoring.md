# Adapter Authoring

Adapters translate between a tool's local storage model and AgentPack.

Each implemented adapter exposes:

```ts
interface Adapter {
  id: ToolId
  displayName: string
  detect(options: ScanOptions): Promise<boolean>
  scan(options: ScanOptions): Promise<AgentPack>
}
```

## Adapter Rules

- Detection should be cheap and file-based.
- Scanning should not mutate files.
- Every emitted item should include `sourceEvidence`.
- Every emitted item should use structured scope: `global`, `project`, `local`, `managed`, `nested`, or a non-file scope.
- Secret-like values must be redacted.
- Unknown automation should become `manual`, not `exact`.
- Raw sessions and private app state should be skipped unless a future explicit opt-in exists.

## Adding A New Tool

1. Add researched facts to `catalog/adapter-facts.yaml`.
2. Add a new adapter under `src/adapters/`.
3. Register it in `src/adapters/index.ts`.
4. Add fixtures and tests that cover scan, plan, and dry-run behavior.
5. Document target-specific caveats in `docs/compatibility-catalog.md`.

## Minimum Useful Adapter

A good first adapter should support:

- project instructions
- user instructions
- local/private instructions without sharing them by default
- MCP servers
- command/workflow files if documented
- safe evidence for hooks and permissions

Do not start by migrating marketplace installs or conversations.
