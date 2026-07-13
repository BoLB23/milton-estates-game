import type { QuestStage } from "../game/types";

export type MapId = "neighborhood" | "creek";
export type MapMarkerKind = "landmark" | "exit" | "objective";

export interface MapMarker {
  /** Stable ID used by discovery data and menu rendering. */
  id: string;
  kind: MapMarkerKind;
  label: string;
  /** Coordinates normalized to the map artwork (0..1). */
  x: number;
  y: number;
  /** Landmarks without this flag stay hidden until their ID is discovered. */
  initiallyVisible?: boolean;
  /** Objective markers are shown only during one of these stages. */
  stages?: readonly QuestStage[];
}

export interface MapDefinition {
  id: MapId;
  label: string;
  worldWidth: number;
  worldHeight: number;
  markers: readonly MapMarker[];
}

export interface MapSelection {
  currentMap: MapId;
  stage: QuestStage;
  discoveredIds: ReadonlySet<string> | readonly string[];
}

/**
 * Menu-facing map content. Coordinates mirror the graybox scenes but remain
 * normalized so the menu can render them at any size.
 */
export const MAP_DEFINITIONS: Readonly<Record<MapId, MapDefinition>> = {
  neighborhood: {
    id: "neighborhood",
    label: "Milton Estates — Wheatfield Drive",
    worldWidth: 2300,
    worldHeight: 1500,
    markers: [
      { id: "billy_home", kind: "landmark", label: "Billy's House", x: 0.574, y: 0.381, initiallyVisible: true },
      { id: "jeremy_home", kind: "landmark", label: "Jeremy's House", x: 0.809, y: 0.38 },
      { id: "andrew_home", kind: "landmark", label: "Andrew's House", x: 0.191, y: 0.38 },
      { id: "creek_woods", kind: "exit", label: "Creek Woods", x: 0.583, y: 0.193 },
      { id: "obj_jeremy", kind: "objective", label: "Talk to Jeremy", x: 0.809, y: 0.46, stages: ["talk_to_jeremy", "return_to_jeremy"] },
      { id: "obj_andrew", kind: "objective", label: "Talk to Andrew", x: 0.191, y: 0.46, stages: ["talk_to_andrew"] },
      { id: "obj_side_yard", kind: "objective", label: "Inspect the bent grass", x: 0.472, y: 0.333, stages: ["search_yards"] },
    ],
  },
  creek: {
    id: "creek",
    label: "Creek Woods",
    worldWidth: 2048,
    worldHeight: 1536,
    markers: [
      { id: "fallen_log", kind: "landmark", label: "Fallen Log Clearing", x: 0.273, y: 0.133 },
      { id: "creek_crossing", kind: "landmark", label: "Creek Crossing", x: 0.5, y: 0.716, initiallyVisible: true },
      { id: "wheatfield_drive", kind: "exit", label: "Back to Wheatfield Drive", x: 0.5, y: 0.934 },
      { id: "obj_controller", kind: "objective", label: "Search the tall grass", x: 0.332, y: 0.397, stages: ["search_creek"] },
      { id: "obj_return_home", kind: "objective", label: "Return to Wheatfield Drive", x: 0.5, y: 0.934, stages: ["return_to_jeremy"] },
    ],
  },
};

export function getMapDefinition(mapId: MapId): MapDefinition {
  return MAP_DEFINITIONS[mapId];
}

/** Selects the markers that the current map menu may reveal. */
export function selectVisibleMapMarkers(selection: MapSelection): readonly MapMarker[] {
  const discovered = selection.discoveredIds instanceof Set
    ? selection.discoveredIds
    : new Set(selection.discoveredIds);

  return MAP_DEFINITIONS[selection.currentMap].markers.filter((marker) => {
    if (marker.kind === "exit") return true;
    if (marker.kind === "objective") return marker.stages?.includes(selection.stage) ?? false;
    return marker.initiallyVisible === true || discovered.has(marker.id);
  });
}

export function selectActiveObjectiveMarker(selection: MapSelection): MapMarker | undefined {
  return selectVisibleMapMarkers(selection).find((marker) => marker.kind === "objective");
}
