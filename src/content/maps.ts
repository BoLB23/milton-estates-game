import type { MapId, QuestStage } from "../game/types";
import { assetUrl } from "./assets";

export type MapMarkerKind = "landmark" | "exit" | "objective";
export interface MapPoint { x: number; y: number; }

export interface IllustratedMapLayer {
  id: string;
  role: "master" | "foreground";
  textureKey: string;
  imagePath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
}

export interface MapMarker {
  /** Stable ID used by discovery data and menu rendering. */
  id: string;
  kind: MapMarkerKind;
  label: string;
  /** Coordinates normalized to the authored map's world bounds (0..1). */
  x: number;
  y: number;
  initiallyVisible?: boolean;
  stages?: readonly QuestStage[];
}

export interface MapDefinition {
  id: MapId;
  label: string;
  worldWidth: number;
  worldHeight: number;
  layers: readonly IllustratedMapLayer[];
  /** Loaded by BootScene and used as the runtime source for gameplay geometry. */
  tiledMapKey: string;
  tiledMapPath: string;
  /** Names expected in the Tiled stable-gameplay-objects layer. */
  authoredObjectIds: readonly string[];
  markers: readonly MapMarker[];
  /** Placement of this map inside the regional fold-out artwork in MenuScene. */
  regionalMapBounds: Readonly<{ x: number; y: number; width: number; height: number }>;
}

export interface MapSelection {
  currentMap: MapId;
  stage: QuestStage;
  discoveredIds: ReadonlySet<string> | readonly string[];
}

const neighborhood = { width: 2300, height: 1500 };
const creek = { width: 2048, height: 1536 };

/** The canonical world, artwork, collision, and menu metadata for each map. */
export const MAP_DEFINITIONS: Readonly<Record<MapId, MapDefinition>> = {
  neighborhood: {
    id: "neighborhood", label: "Milton Estates — Wheatfield Drive",
    worldWidth: neighborhood.width, worldHeight: neighborhood.height,
    layers: [{
      id: "neighborhood_illustrated_master", role: "master", textureKey: "neighborhood-illustrated-master",
      imagePath: assetUrl("assets/maps/neighborhood-master-v1.png"), x: 0, y: 0,
      width: neighborhood.width, height: neighborhood.height, depth: 10,
    }],
    tiledMapKey: "neighborhood-tmj", tiledMapPath: "assets/maps/neighborhood-wheatfield-slice.tmj",
    authoredObjectIds: ["spawn_home", "spawn_woods", "andrew", "billy", "jeremy", "jeremy_driveway", "side_yard_gap", "woods_gate", "blocked_bent_creek", "blocked_stonehenge", "blocked_reidenbaugh", "blocked_fruitville"],
    markers: [
      { id: "billy_home", kind: "landmark", label: "Billy's House", x: 0.552, y: 0.653, initiallyVisible: true },
      { id: "jeremy_home", kind: "landmark", label: "Jeremy's House", x: 0.817, y: 0.653 },
      { id: "andrew_home", kind: "landmark", label: "Andrew's House", x: 0.096, y: 0.653 },
      { id: "creek_woods", kind: "exit", label: "Creek Woods", x: 0.491, y: 0.227 },
      { id: "obj_jeremy", kind: "objective", label: "Talk to Jeremy", x: 0.817, y: 0.653, stages: ["talk_to_jeremy", "return_to_jeremy"] },
      { id: "obj_andrew", kind: "objective", label: "Talk to Andrew", x: 0.096, y: 0.653, stages: ["talk_to_andrew"] },
      { id: "obj_mushroom_yards", kind: "objective", label: "Search Milton's backyards for mushrooms", x: 0.42, y: 0.35, stages: ["search_mushrooms"] },
      { id: "obj_feed_jeremy", kind: "objective", label: "Feed one mushroom to Jeremy", x: 0.817, y: 0.653, stages: ["feed_mushroom_to_jeremy"] },
      { id: "obj_place_billy", kind: "objective", label: "Place one mushroom at Billy's house", x: 0.552, y: 0.653, stages: ["place_mushroom_at_billy"] },
      { id: "obj_give_andrew", kind: "objective", label: "Give the last eight mushrooms to Andrew", x: 0.096, y: 0.653, stages: ["give_mushrooms_to_andrew"] },
      { id: "obj_skateboard", kind: "objective", label: "Meet Jeremy to skateboard", x: 0.817, y: 0.653, stages: ["meet_jeremy_to_skateboard"] },
      { id: "obj_baseball", kind: "objective", label: "Meet Billy to play baseball", x: 0.552, y: 0.653, stages: ["meet_billy_to_play_baseball"] },
      { id: "obj_basketball", kind: "objective", label: "Meet Andrew to play basketball", x: 0.096, y: 0.653, stages: ["meet_andrew_to_play_basketball"] },
    ],
    regionalMapBounds: { x: 360, y: 209, width: 210, height: 132 },
  },
  creek: {
    id: "creek", label: "Creek Woods", worldWidth: creek.width, worldHeight: creek.height,
    layers: [
      { id: "creek_illustrated_master", role: "master", textureKey: "creek-illustrated-master", imagePath: assetUrl("assets/maps/creek-woods-master-v1.png"), x: 0, y: 0, width: creek.width, height: creek.height, depth: 10 },
      { id: "creek_foreground_canopy", role: "foreground", textureKey: "creek-foreground-canopy", imagePath: assetUrl("assets/maps/creek-foreground-canopy-v1.png"), x: 0, y: 0, width: creek.width, height: creek.height, depth: 55 },
    ],
    tiledMapKey: "creek-tmj", tiledMapPath: "assets/maps/creek-woods.tmj",
    authoredObjectIds: ["spawn_home", "return_neighborhood", "creek_tracks", "controller", "secret"],
    markers: [
      { id: "fallen_log", kind: "landmark", label: "Fallen Log Clearing", x: 0.273, y: 0.133 },
      { id: "creek_crossing", kind: "landmark", label: "Creek Crossing", x: 0.5, y: 0.716, initiallyVisible: true },
      { id: "wheatfield_drive", kind: "exit", label: "Back to Wheatfield Drive", x: 0.669, y: 0.951 },
      { id: "obj_controller", kind: "objective", label: "Search the tall grass", x: 0.293, y: 0.443, stages: ["search_creek"] },
      { id: "obj_return_home", kind: "objective", label: "Return to Wheatfield Drive", x: 0.669, y: 0.951, stages: ["return_to_jeremy"] },
      { id: "obj_mushroom_creek", kind: "objective", label: "Search Creek Woods for mushrooms", x: 0.4, y: 0.38, stages: ["search_mushrooms"] },
    ],
    regionalMapBounds: { x: 200, y: 190, width: 285, height: 190 },
  },
};

export const NEIGHBORHOOD_MAP = MAP_DEFINITIONS.neighborhood;
export const CREEK_MAP = MAP_DEFINITIONS.creek;

export function getMapDefinition(mapId: MapId): MapDefinition { return MAP_DEFINITIONS[mapId]; }
export function getIllustratedMapLayers(mapId: MapId): readonly IllustratedMapLayer[] { return MAP_DEFINITIONS[mapId].layers; }

/** Projects a normalized authored-map coordinate onto the regional fold-out. */
export function projectRegionalMapPoint(map: MapDefinition, point: MapPoint): MapPoint {
  return {
    x: map.regionalMapBounds.x + point.x * map.regionalMapBounds.width,
    y: map.regionalMapBounds.y + point.y * map.regionalMapBounds.height,
  };
}

export function selectVisibleMapMarkers(selection: MapSelection): readonly MapMarker[] {
  const discovered = selection.discoveredIds instanceof Set ? selection.discoveredIds : new Set(selection.discoveredIds);
  return MAP_DEFINITIONS[selection.currentMap].markers.filter((marker) => {
    if (marker.kind === "exit") return true;
    if (marker.kind === "objective") return marker.stages?.includes(selection.stage) ?? false;
    return marker.initiallyVisible === true || discovered.has(marker.id);
  });
}
export function selectActiveObjectiveMarker(selection: MapSelection): MapMarker | undefined {
  return selectVisibleMapMarkers(selection).find((marker) => marker.kind === "objective");
}

/** Catches invalid authored/runtime metadata before Phaser tries to create a scene. */
export function validateMapDefinitions(): void {
  const textureKeys = new Set<string>();
  for (const map of Object.values(MAP_DEFINITIONS)) {
    if (map.worldWidth <= 0 || map.worldHeight <= 0) throw new Error(`Invalid map dimensions: ${map.id}`);
    for (const marker of map.markers) {
      if (marker.x < 0 || marker.x > 1 || marker.y < 0 || marker.y > 1) throw new Error(`Marker outside map bounds: ${marker.id}`);
    }
    for (const layer of map.layers) {
      if (textureKeys.has(layer.textureKey)) throw new Error(`Duplicate map texture key: ${layer.textureKey}`);
      textureKeys.add(layer.textureKey);
      if (layer.width <= 0 || layer.height <= 0) throw new Error(`Invalid map layer dimensions: ${layer.id}`);
    }
  }
}
