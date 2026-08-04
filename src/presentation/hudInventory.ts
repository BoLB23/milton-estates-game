import type { GameState, MushroomQuestStage } from "../game/types";

const CONTROLLER_ITEM = "xbox_controller";

export interface HudInventory {
  readonly controllerCount: 0 | 1;
  readonly mushroomCount: number;
}

function carriedMushrooms(stage: MushroomQuestStage, collectedCount: number): number {
  switch (stage) {
    case "talk_to_andrew_for_mushrooms": return 0;
    case "search_mushrooms":
    case "feed_mushroom_to_jeremy": return collectedCount;
    case "place_mushroom_at_billy": return Math.max(0, collectedCount - 1);
    case "give_mushrooms_to_andrew": return Math.max(0, collectedCount - 2);
    case "complete": return 0;
  }
}

/** Projects persisted quest history into items Billy is still carrying. */
export function selectHudInventory(
  state: Pick<GameState, "inventory" | "questProgress">,
): HudInventory {
  const controllerCount = state.inventory.some((stack) => stack.itemId === CONTROLLER_ITEM && stack.quantity > 0)
    && state.questProgress.missingControllerStage === "return_to_jeremy"
    ? 1
    : 0;
  const collectedCount = Math.min(10, state.questProgress.mushrooms.collectedIds.length);

  return {
    controllerCount,
    mushroomCount: carriedMushrooms(state.questProgress.mushrooms.stage, collectedCount),
  };
}
