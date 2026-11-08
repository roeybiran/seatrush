/** Reads a positive integer setting, failing at startup instead of running with a broken rule. */
export function positiveIntegerFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, got "${raw}".`);
  }
  return value;
}
