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

export function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
