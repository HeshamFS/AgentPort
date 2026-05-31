# Security Policy

AgentPort handles configuration that may reference credentials, shell commands, hooks, permissions, and local paths. Treat migration output as sensitive until reviewed.

## Supported Versions

Only the current `main` branch is supported before the first stable release.

## Reporting A Vulnerability

Please open a private security advisory on GitHub if available. If private advisories are not enabled yet, open a minimal issue that says a security report is available and avoid posting secrets, exploit details, or private configuration.

## Security Expectations

- `scan`, `plan`, `doctor`, and `apply --dry-run` must not write target configuration.
- Secret-like values in MCP `env` and `headers` must be redacted.
- Raw conversations must not be imported by default.
- Hooks and permissions must remain manual-review by default.
- Managed/organization scope must never be auto-written.
- Local/private scope must not become shared project scope without explicit user intent.
