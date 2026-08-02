/**
 * Keeps untrusted storage parsing at one boundary. Schema/version migration is
 * intentionally supplied by the game domain, so this module stays browser and
 * Phaser independent.
 */
export function decodePersistedJson(serialized: string | null): unknown | undefined {
  if (serialized === null) return undefined;
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    return undefined;
  }
}

/** Reads only the numeric schema marker; the game domain owns full validation. */
export function getPersistedVersion(value: unknown): number | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const version = (value as { version?: unknown }).version;
  return typeof version === "number" && Number.isInteger(version) ? version : undefined;
}

export function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
