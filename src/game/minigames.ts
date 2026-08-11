import type { GameState } from "./types";

export type MinigameId = "mickey_drag_race" | "don_rossi";

export interface MinigameDefinition {
  readonly id: MinigameId;
  readonly title: string;
  readonly description: string;
  readonly sceneKey: "mickey_drag_race" | "bad_trip";
  readonly unlockHint: string;
}

type MinigameProgress = Pick<GameState, "completedQuestIds" | "secrets">;
type MinigameLaunchContext = Pick<GameState, "replayQuestId">;

export const MINIGAMES: readonly MinigameDefinition[] = [
  {
    id: "mickey_drag_race",
    title: "Mickey's Drag Race",
    description: "Build RPM, nail every shift, and beat Mickey to the line.",
    sceneKey: "mickey_drag_race",
    unlockHint: "Beat Mickey at Bent Creek to unlock replays.",
  },
  {
    id: "don_rossi",
    title: "Survive Don Rossi",
    description: "Keep moving for 45 seconds, secure the Dorito, then chase a survival record.",
    sceneKey: "bad_trip",
    unlockHint: "Survive Don Rossi during Andrew's bonfire to unlock replays.",
  },
] as const;

export function isMinigameUnlocked(id: MinigameId, state: MinigameProgress): boolean {
  if (id === "mickey_drag_race") return state.secrets.includes("mickey_drag_race.beaten");
  return state.completedQuestIds.includes("attend_bonfire_at_andrews");
}

export function selectUnlockedMinigames(state: MinigameProgress): readonly MinigameDefinition[] {
  return MINIGAMES.filter((game) => isMinigameUnlocked(game.id, state));
}

/**
 * Quest replays deliberately have no nested replay stack. A standalone
 * mini-game replay must therefore begin from canonical adventure state;
 * quest-owned challenges pass `false` and remain part of that quest replay.
 */
export function canLaunchMinigameReplay(
  state: MinigameLaunchContext,
  replayRequested = true,
): boolean {
  return !replayRequested || state.replayQuestId === null;
}
