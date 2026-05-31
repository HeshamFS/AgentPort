# Migration UX

AgentPort should feel like an onboarding assistant, not a blind converter.

## Ideal Flow

1. `doctor` tells the user what tools and artifacts exist.
2. `scan` creates an AgentPack without writing target files.
3. `plan` explains exactly what would be written, skipped, or reviewed manually.
4. `apply --dry-run` previews writes.
5. `apply --yes` writes files and backs up existing targets.

Use `doctor --show-paths --json` when debugging global/project/local resolution across machines.

## UX Principles

- Prefer explicit artifacts over hidden state.
- Show confidence labels everywhere.
- Never hide manual actions.
- Make dry-run the natural next step.
- Make raw conversation import opt-in only in future versions.
- Treat secrets as references, never as portable data.

## User-Facing Language

Use these terms consistently:

- "Detected" for source files found during scan.
- "Portable" for items that can move safely.
- "Manual review" for items that need human judgment.
- "Skipped by design" for data AgentPort refuses to migrate in V1.
- "Apply" only for the write phase.
- "Global" instead of "user" in new docs; `user` is only a compatibility alias.

Avoid saying "fully migrated" unless all manual and skipped items are explicitly resolved.
