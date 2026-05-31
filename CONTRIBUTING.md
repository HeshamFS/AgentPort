# Contributing

AgentPort is a migration planner for AI coding-agent environments. Contributions are welcome, especially adapter fixtures, researched compatibility facts, and safety improvements.

## Development

```bash
npm install
npm test
node dist/src/cli.js help
```

`npm test` builds TypeScript and runs the Node test suite.

## Contribution Areas

- **Adapter facts**: update `catalog/adapter-facts.yaml` with dated sources.
- **Adapters**: add scan support for a new tool under `src/adapters/`.
- **Schema**: evolve `schemas/agentpack.schema.json` carefully and document compatibility.
- **Safety**: improve redaction, dry-run behavior, and manual-review classification.
- **Docs**: make scope, platform, and migration behavior clearer.

## Adapter Requirements

Every implemented adapter should:

- use structured scopes: `global`, `project`, `local`, `managed`, `nested`, or a non-file scope;
- include source evidence for scanned items;
- redact secret-like values;
- keep hooks and permissions manual-review unless behavior is proven equivalent;
- include fixture tests for user/global and project behavior;
- avoid importing raw conversations by default.

## Pull Requests

Keep PRs focused. Include:

- what tool or behavior changed;
- what official docs or source facts were used;
- what tests were added or updated;
- any known lossy or manual migration cases.

Run `npm test` before opening a PR.
