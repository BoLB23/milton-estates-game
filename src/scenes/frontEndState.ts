import type { GamePlatformIdentityState } from "../platform/GamePlatformAdapter";

export function isCurrentSlotRefresh(
  generation: number,
  currentGeneration: number,
  expectedUserId: string,
  identity: GamePlatformIdentityState,
): boolean {
  return generation === currentGeneration
    && identity.status === "authenticated"
    && identity.player.id === expectedUserId;
}

export async function replaceWithRollback<T>(
  previous: T,
  replace: () => Promise<void>,
  restore: (snapshot: T) => void,
): Promise<boolean> {
  try { await replace(); return true; }
  catch (error) { restore(previous); throw error; }
}
