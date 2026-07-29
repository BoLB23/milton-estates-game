import { MushroomNeighborhoodBinding } from "../content/chapters/chapter-01/quests/andrew-mushroom-hunt/runtime/neighborhood";
import { SportsNeighborhoodBinding } from "../content/chapters/chapter-01/quests/three-player-sports/runtime/neighborhood";
import type { QuestId } from "../game/types";
import type {
  NeighborhoodQuestHost,
  QuestRuntimeBinding,
} from "./contracts";

type NeighborhoodBindingFactory = (host: NeighborhoodQuestHost) => QuestRuntimeBinding;

/**
 * Runtime composition stays explicit while map controllers remain quest-agnostic.
 * A quest with a neighborhood binding adds one factory here.
 */
const NEIGHBORHOOD_BINDINGS: Partial<Record<QuestId, NeighborhoodBindingFactory>> = {
  andrew_mushroom_hunt: (host) => new MushroomNeighborhoodBinding(host),
  three_player_sports: (host) => new SportsNeighborhoodBinding(host),
};

export function createNeighborhoodQuestBinding(
  questId: QuestId,
  host: NeighborhoodQuestHost,
): QuestRuntimeBinding | undefined {
  return NEIGHBORHOOD_BINDINGS[questId]?.(host);
}
