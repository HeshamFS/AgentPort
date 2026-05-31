const SECRET_KEY_PATTERN = /(token|secret|password|passwd|api[_-]?key|auth|credential|private|bearer)/i;
const ENV_REF_PATTERN = /^\$?\{?[A-Z_][A-Z0-9_]*\}?$/;

export function looksSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

export function redactRecord(record: Record<string, unknown> | undefined): { value?: Record<string, string>; redactedKeys: string[] } {
  if (!record) {
    return { redactedKeys: [] };
  }
  const value: Record<string, string> = {};
  const redactedKeys: string[] = [];

  for (const [key, raw] of Object.entries(record)) {
    const text = String(raw ?? "");
    if (looksSecretKey(key) && text && !ENV_REF_PATTERN.test(text)) {
      value[key] = `\${${normalizeEnvName(key)}}`;
      redactedKeys.push(key);
    } else {
      value[key] = text;
    }
  }

  return { value, redactedKeys };
}

function normalizeEnvName(key: string): string {
  return key
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}
