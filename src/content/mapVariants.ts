import type { MapId, QuestId } from "../game/types";

export type TimeOfDay = "summer_afternoon" | "golden_hour" | "overcast";

export interface MapVariantDefinition {
  id: string;
  mapId: MapId;
  questId: QuestId;
  timeOfDay: TimeOfDay;
  ambience: "neighborhood_summer" | "creek_summer";
  visibleOverlayIds: readonly string[];
  hiddenObjectIds: readonly string[];
}

/**
 * Shallow content overlays for revisiting a stable map. Geometry, interaction
 * IDs, and transition IDs remain owned by the base map scenes.
 */
export const MAP_VARIANTS: readonly MapVariantDefinition[] = [
  {
    id: "missing_controller_neighborhood",
    mapId: "neighborhood",
    questId: "missing_controller",
    timeOfDay: "summer_afternoon",
    ambience: "neighborhood_summer",
    visibleOverlayIds: ["jeremy_outside", "andrew_outside", "controller_search_clue"],
    hiddenObjectIds: [],
  },
  {
    id: "missing_controller_creek",
    mapId: "creek",
    questId: "missing_controller",
    timeOfDay: "summer_afternoon",
    ambience: "creek_summer",
    visibleOverlayIds: ["controller_search_pocket", "creek_token_clearing"],
    hiddenObjectIds: [],
  },
];

export function getMapVariant(mapId: MapId, questId: QuestId): MapVariantDefinition {
  const variant = MAP_VARIANTS.find((candidate) => candidate.mapId === mapId && candidate.questId === questId);
  if (!variant) throw new RangeError(`No map variant registered for ${questId} on ${mapId}`);
  return variant;
}
