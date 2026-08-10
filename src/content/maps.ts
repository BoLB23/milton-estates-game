import type { MapId, QuestId, QuestStage } from "../game/types";
import { assetUrl } from "./assets";

export type MapMarkerKind = "landmark" | "exit" | "objective";
export interface MapPoint { x: number; y: number; }
export interface RegionalMapBounds { x: number; y: number; width: number; height: number; }
export interface RegionalMapDisplayBounds extends RegionalMapBounds {}

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
  questId?: QuestId;
  stages?: readonly QuestStage[];
}

/** Minimal Tiled JSON shape used to read editable map markers without Phaser. */
export interface TiledMarkerSource {
  width?: number;
  height?: number;
  tilewidth?: number;
  tileheight?: number;
  layers?: readonly {
    name?: string;
    type?: string;
    objects?: readonly {
      name?: string;
      type?: string;
      class?: string;
      x?: number;
      y?: number;
      properties?: readonly { name?: string; value?: unknown }[] | Readonly<Record<string, unknown>>;
    }[];
  }[];
}
type TiledMarkerProperties = readonly { name?: string; value?: unknown }[] | Readonly<Record<string, unknown>> | undefined;

export interface MapDefinition {
  id: MapId;
  label: string;
  worldWidth: number;
  worldHeight: number;
  layers: readonly IllustratedMapLayer[];
  /** Loaded by BootScene and used as the runtime source for gameplay geometry. */
  tiledMapKey: string;
  tiledMapPath: string;
  /** Stable names expected in the authored gameplay object layers. */
  authoredObjectIds: readonly string[];
  markers: readonly MapMarker[];
  /** Placement of this map inside the regional fold-out artwork in MenuScene. */
  /** Normalized to the source fold-out image, never to a canvas layout. */
  regionalMapBounds: Readonly<RegionalMapBounds>;
}

export interface MapSelection {
  currentMap: MapId;
  questId: QuestId;
  stage: QuestStage;
  discoveredIds: ReadonlySet<string> | readonly string[];
}

const EXPANSION_WORLD = { width: 1440, height: 1056 };
const neighborhood = { width: 1440, height: 1088 };
const creek = { width: 2048, height: 1536 };

const REGIONAL_FOLDOUT_DESIGN_SIZE = { width: 960, height: 540 };

/** Converts the former 960x540 authoring space into source-image fractions. */
function regionalBounds(x: number, y: number, width: number, height: number): RegionalMapBounds {
  return {
    x: x / REGIONAL_FOLDOUT_DESIGN_SIZE.width,
    y: y / REGIONAL_FOLDOUT_DESIGN_SIZE.height,
    width: width / REGIONAL_FOLDOUT_DESIGN_SIZE.width,
    height: height / REGIONAL_FOLDOUT_DESIGN_SIZE.height,
  };
}

/** The canonical world, artwork, collision, and menu metadata for each map. */
export const MAP_DEFINITIONS: Readonly<Record<MapId, MapDefinition>> = {
  neighborhood: {
    id: "neighborhood", label: "Milton Estates — Wheatfield Drive",
    worldWidth: neighborhood.width, worldHeight: neighborhood.height,
    layers: [{
      id: "neighborhood_illustrated_master", role: "master", textureKey: "ch01.map.neighborhood.master",
      imagePath: assetUrl("assets/maps/milton-estates-new.png"), x: 0, y: 0,
      width: neighborhood.width, height: neighborhood.height, depth: 10,
    }],
    tiledMapKey: "neighborhood-expansion-tmj", tiledMapPath: "assets/maps/expansion/neighborhood.tmj",
    authoredObjectIds: [
      "spawn_home", "spawn_woods", "spawn_stonehenge", "spawn_fruitville", "woods_gate", "exit_stonehenge", "exit_fruitville",
      "andrew", "player_house", "player_home", "home_storage", "billy", "jeremy", "ryan", "jeremy_driveway", "side_yard_gap",
      "blocked_bent_creek", "blocked_stonehenge", "blocked_reidenbaugh", "blocked_fruitville",
      "ryan_invite", "bike_mount_milton",
      "ryan_depart_00", "ryan_depart_01", "ryan_depart_02", "ryan_depart_03", "ryan_depart_04", "ryan_depart_05",
      "ryan_depart_06", "ryan_depart_07", "ryan_depart_08", "ryan_depart_09", "ryan_depart_10", "ryan_depart_11",
      "andrew_house", "player_house_footprint", "billy_house", "jeremy_house", "move_in_start", "move_in_end", "qa_home_route", "qa_stonehenge_route", "qa_fruitville_route",
      "pickup_milton_field_token_01",
    ],
    markers: [
      { id: "player_home", kind: "landmark", label: "Home", x: 0.333, y: 0.588, initiallyVisible: true },
      { id: "billy_home", kind: "landmark", label: "Billy's House", x: 0.567, y: 0.544 },
      { id: "jeremy_home", kind: "landmark", label: "Jeremy's House", x: 0.856, y: 0.833 },
      { id: "andrew_home", kind: "landmark", label: "Andrew's House", x: 0.189, y: 0.742 },
      { id: "creek_woods", kind: "exit", label: "Creek Woods", x: 0.078, y: 0.015 },
      { id: "stonehenge_exit", kind: "exit", label: "Stonehenge", x: 0.989, y: 0.182 },
      { id: "fruitville_exit", kind: "exit", label: "Fruitville Pike", x: 0.467, y: 0.985 },
      { id: "obj_jeremy", kind: "objective", label: "Talk to Jeremy", x: 0.856, y: 0.833, questId: "missing_controller", stages: ["talk_to_jeremy", "return_to_jeremy"] },
      { id: "obj_andrew", kind: "objective", label: "Talk to Andrew", x: 0.189, y: 0.742, questId: "missing_controller", stages: ["talk_to_andrew"] },
      { id: "obj_mushroom_yards", kind: "objective", label: "Search Milton's backyards for mushrooms", x: 0.5, y: 0.55, questId: "andrew_mushroom_hunt", stages: ["search_mushrooms"] },
      { id: "obj_feed_jeremy", kind: "objective", label: "Feed one mushroom to Jeremy", x: 0.856, y: 0.833, questId: "andrew_mushroom_hunt", stages: ["feed_mushroom_to_jeremy"] },
      { id: "obj_place_billy", kind: "objective", label: "Place one mushroom at Billy's house", x: 0.567, y: 0.864, questId: "andrew_mushroom_hunt", stages: ["place_mushroom_at_billy"] },
      { id: "obj_give_andrew", kind: "objective", label: "Give the last eight mushrooms to Andrew", x: 0.189, y: 0.742, questId: "andrew_mushroom_hunt", stages: ["give_mushrooms_to_andrew"] },
      { id: "obj_skateboard", kind: "objective", label: "Meet Jeremy to skateboard", x: 0.856, y: 0.833, questId: "three_player_sports", stages: ["meet_jeremy_to_skateboard"] },
      { id: "obj_baseball", kind: "objective", label: "Play baseball at Billy's house", x: 0.567, y: 0.864, questId: "three_player_sports", stages: ["meet_billy_to_play_baseball"] },
      { id: "obj_basketball", kind: "objective", label: "Meet Andrew to play basketball", x: 0.189, y: 0.742, questId: "three_player_sports", stages: ["meet_andrew_to_play_basketball"] },
      { id: "obj_ryan_invite", kind: "objective", label: "Talk to Ryan", x: 0.589, y: 0.924, questId: "catch_ryan", stages: ["invite", "choose_destination"] },
      { id: "obj_stonehenge_departure", kind: "objective", label: "Follow Ryan toward Stonehenge", x: 0.85, y: 0.35, questId: "catch_ryan", stages: ["depart_neighborhood"] },
    ],
    regionalMapBounds: regionalBounds(320, 205, 235, 140),
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
      { id: "obj_controller", kind: "objective", label: "Search the tall grass", x: 0.293, y: 0.443, questId: "missing_controller", stages: ["search_creek"] },
      { id: "obj_return_home", kind: "objective", label: "Return to Wheatfield Drive", x: 0.669, y: 0.951, questId: "missing_controller", stages: ["return_to_jeremy"] },
      { id: "obj_mushroom_creek", kind: "objective", label: "Search Creek Woods for mushrooms", x: 0.4, y: 0.38, questId: "andrew_mushroom_hunt", stages: ["search_mushrooms"] },
    ],
    regionalMapBounds: regionalBounds(200, 190, 285, 190),
  },
  stonehenge: {
    id: "stonehenge", label: "Stonehenge", worldWidth: EXPANSION_WORLD.width, worldHeight: EXPANSION_WORLD.height,
    layers: [{
      id: "stonehenge_illustrated_master", role: "master", textureKey: "ch01.map.stonehenge.master",
      imagePath: assetUrl("assets/maps/expansion/stonehenge-master-v1.png"), x: 0, y: 0,
      width: EXPANSION_WORLD.width, height: EXPANSION_WORLD.height, depth: 10,
    }],
    tiledMapKey: "stonehenge-tmj", tiledMapPath: "assets/maps/expansion/stonehenge.tmj",
    authoredObjectIds: [
      "spawn_milton", "spawn_reidenbaugh", "exit_milton", "exit_reidenbaugh",
      "stonehenge_gate", "roundabout", "stonehenge_lookout",
      "stonehenge_route_00", "stonehenge_route_01", "stonehenge_route_02", "stonehenge_route_03", "stonehenge_route_04",
      "stonehenge_route_05", "stonehenge_route_06", "stonehenge_route_07", "stonehenge_route_08", "stonehenge_route_09",
      "stonehenge_route_10", "stonehenge_route_11", "stonehenge_route_12",
      "estate_west", "estate_east", "estate_south", "qa_milton_route", "qa_reidenbaugh_route", "qa_lookout",
    ],
    markers: [
      { id: "stonehenge_landmark", kind: "landmark", label: "Stonehenge Circle", x: 0.522, y: 0.53, initiallyVisible: true },
      { id: "stonehenge_to_milton", kind: "exit", label: "Milton Estates", x: 0.011, y: 0.894 },
      { id: "stonehenge_to_school", kind: "exit", label: "Reidenbaugh Elementary", x: 0.956, y: 0.03 },
      { id: "obj_stonehenge_route", kind: "objective", label: "Ride across Stonehenge", x: 0.7, y: 0.3, questId: "catch_ryan", stages: ["ride_stonehenge"] },
    ],
    regionalMapBounds: regionalBounds(550, 145, 125, 120),
  },
  reidenbaugh: {
    id: "reidenbaugh", label: "Reidenbaugh Elementary", worldWidth: EXPANSION_WORLD.width, worldHeight: EXPANSION_WORLD.height,
    layers: [{
      id: "reidenbaugh_elementary_illustrated_master", role: "master", textureKey: "ch01.map.reidenbaugh.master",
      imagePath: assetUrl("assets/maps/expansion/reidenbaugh-elementary-master-v1.png"), x: 0, y: 0,
      width: EXPANSION_WORLD.width, height: EXPANSION_WORLD.height, depth: 10,
    }],
    tiledMapKey: "reidenbaugh-tmj", tiledMapPath: "assets/maps/expansion/reidenbaugh.tmj",
    authoredObjectIds: [
      "spawn_stonehenge", "exit_stonehenge", "school_front", "bus_loop", "visitor_parking",
      "bike_rack_reidenbaugh", "playground", "basketball_court", "athletic_field", "service_side",
      "ryan_finish", "ryan_post",
      "chase_a_00", "chase_a_01", "chase_a_02", "chase_a_03", "chase_a_04", "chase_a_05", "chase_a_06",
      "chase_b_00", "chase_b_01", "chase_b_02", "chase_b_03", "chase_b_04", "chase_b_05", "chase_b_06",
      "chase_c_00", "chase_c_01", "chase_c_02", "chase_c_03", "chase_c_04", "chase_c_05", "chase_c_06",
      "school_wing_west", "school_wing_east", "service_block",
      "qa_school_entrance", "qa_school_front", "qa_playground", "qa_field",
    ],
    markers: [
      { id: "school_front", kind: "landmark", label: "Reidenbaugh Elementary", x: 0.5, y: 0.47, initiallyVisible: true },
      { id: "school_playground", kind: "landmark", label: "Playground and courts", x: 0.167, y: 0.227 },
      { id: "reidenbaugh_return", kind: "exit", label: "Back to Stonehenge", x: 0.011, y: 0.939 },
      { id: "obj_ryan_school", kind: "objective", label: "Catch Ryan at the school", x: 0.544, y: 0.591, questId: "catch_ryan", stages: ["chase_reidenbaugh"] },
    ],
    regionalMapBounds: regionalBounds(600, 55, 165, 90),
  },
  fruitville_pike: {
    id: "fruitville_pike", label: "Fruitville Pike", worldWidth: EXPANSION_WORLD.width, worldHeight: EXPANSION_WORLD.height,
    layers: [{
      id: "fruitville_pike_illustrated_master", role: "master", textureKey: "ch01.map.fruitville_pike.master",
      imagePath: assetUrl("assets/maps/expansion/fruitville-pike-master-v1.png"), x: 0, y: 0,
      width: EXPANSION_WORLD.width, height: EXPANSION_WORLD.height, depth: 10,
    }],
    tiledMapKey: "fruitville-pike-tmj", tiledMapPath: "assets/maps/expansion/fruitville_pike.tmj",
    authoredObjectIds: [
      "spawn_milton", "spawn_bent_creek", "exit_milton", "exit_bent_creek",
      "crosswalk_north", "crosswalk_south", "bike_shoulder", "fruitville_midpoint",
      "fruitville_route_00", "fruitville_route_01", "fruitville_route_02", "fruitville_route_03", "fruitville_route_04",
      "fruitville_route_05", "fruitville_route_06", "fruitville_route_07", "fruitville_route_08",
      "roadside_north", "roadside_south", "qa_pike_milton", "qa_pike_midpoint", "qa_pike_bent_creek",
    ],
    markers: [
      { id: "fruitville_midpoint", kind: "landmark", label: "Fruitville Pike", x: 0.567, y: 0.439, initiallyVisible: true },
      { id: "fruitville_to_milton", kind: "exit", label: "Milton Estates", x: 0.422, y: 0.985 },
      { id: "fruitville_to_bent", kind: "exit", label: "Bent Creek", x: 0.667, y: 0.03 },
    ],
    regionalMapBounds: regionalBounds(500, 315, 170, 65),
  },
  bent_creek: {
    id: "bent_creek", label: "Bent Creek", worldWidth: EXPANSION_WORLD.width, worldHeight: EXPANSION_WORLD.height,
    layers: [{
      id: "bent_creek_illustrated_master", role: "master", textureKey: "ch01.map.bent_creek.master",
      imagePath: assetUrl("assets/maps/expansion/bent-creek-master-v1.png"), x: 0, y: 0,
      width: EXPANSION_WORLD.width, height: EXPANSION_WORLD.height, depth: 10,
    }],
    tiledMapKey: "bent-creek-tmj", tiledMapPath: "assets/maps/expansion/bent_creek.tmj",
    authoredObjectIds: [
      "spawn_gate_exterior", "spawn_fruitville", "exit_fruitville", "gatehouse", "gate_attendant", "gate_entry",
      "clubhouse", "golf_cart_path_00", "golf_cart_path_01", "golf_cart_path_02", "golf_cart_path_03",
      "golf_cart_path_04", "golf_cart_path_05", "golf_cart_path_06", "golf_cart_path_07",
      "golf_cart_path_08", "golf_cart_path_09", "golf_cart_path_10", "golf_cart_path_11",
      "gate_barrier", "gatehouse_building", "maintenance_yard", "qa_gate_exterior", "qa_clubhouse", "qa_cart_path",
    ],
    markers: [
      { id: "bent_creek_gate", kind: "landmark", label: "Schwartz / Votilla gatehouse", x: 0.189, y: 0.833, initiallyVisible: true },
      { id: "obj_bent_creek_gate", kind: "objective", label: "Open the Bent Creek gate", x: 0.189, y: 0.833, questId: "explore_bent_creek", stages: ["open_gate"] },
      { id: "bent_creek_clubhouse", kind: "landmark", label: "Bent Creek clubhouse", x: 0.878, y: 0.197 },
      { id: "bent_creek_return", kind: "exit", label: "Back to Fruitville Pike", x: 0.011, y: 0.924 },
    ],
    regionalMapBounds: regionalBounds(665, 330, 115, 48),
  },
};

export const NEIGHBORHOOD_MAP = MAP_DEFINITIONS.neighborhood;
export const CREEK_MAP = MAP_DEFINITIONS.creek;
export const STONEHENGE_MAP = MAP_DEFINITIONS.stonehenge;
export const REIDENBAUGH_MAP = MAP_DEFINITIONS.reidenbaugh;
export const FRUITVILLE_PIKE_MAP = MAP_DEFINITIONS.fruitville_pike;
export const BENT_CREEK_MAP = MAP_DEFINITIONS.bent_creek;

export function getMapDefinition(mapId: MapId): MapDefinition { return MAP_DEFINITIONS[mapId]; }
export function getIllustratedMapLayers(mapId: MapId): readonly IllustratedMapLayer[] { return MAP_DEFINITIONS[mapId].layers; }

/** Projects a normalized authored-map coordinate onto the regional fold-out. */
export function projectRegionalMapPoint(
  map: MapDefinition,
  point: MapPoint,
  displayBounds: RegionalMapDisplayBounds = { x: 0, y: 0, width: 1, height: 1 },
): MapPoint {
  return {
    x: displayBounds.x + (map.regionalMapBounds.x + point.x * map.regionalMapBounds.width) * displayBounds.width,
    y: displayBounds.y + (map.regionalMapBounds.y + point.y * map.regionalMapBounds.height) * displayBounds.height,
  };
}

export function projectRegionalMapBounds(
  map: MapDefinition,
  displayBounds: RegionalMapDisplayBounds,
): RegionalMapBounds {
  return {
    x: displayBounds.x + map.regionalMapBounds.x * displayBounds.width,
    y: displayBounds.y + map.regionalMapBounds.y * displayBounds.height,
    width: map.regionalMapBounds.width * displayBounds.width,
    height: map.regionalMapBounds.height * displayBounds.height,
  };
}

/** Converts an exact world coordinate into the fold-out's normalized map space. */
export function normalizeWorldMapPoint(map: Pick<MapDefinition, "worldWidth" | "worldHeight">, point: MapPoint): MapPoint {
  return {
    x: Math.min(1, Math.max(0, point.x / map.worldWidth)),
    y: Math.min(1, Math.max(0, point.y / map.worldHeight)),
  };
}

function tiledProperty(properties: TiledMarkerProperties, name: string): unknown {
  if (Array.isArray(properties)) return properties.find((property) => property.name === name)?.value;
  return (properties as Readonly<Record<string, unknown>> | undefined)?.[name];
}

function asMarkerKind(value: unknown): MapMarkerKind | undefined {
  return value === "landmark" || value === "exit" || value === "objective" ? value : undefined;
}

/**
 * Reads editable map markers from Tiled object data. Marker objects can live in
 * the dedicated `map-markers` layer or in another object layer when the editor
 * has created a POI carrying `markerKind` metadata.
 */
export function parseTiledMapMarkers(map: Pick<MapDefinition, "worldWidth" | "worldHeight">, source: TiledMarkerSource): readonly MapMarker[] {
  const width = typeof source.width === "number" && typeof source.tilewidth === "number"
    ? source.width * source.tilewidth : map.worldWidth;
  const height = typeof source.height === "number" && typeof source.tileheight === "number"
    ? source.height * source.tileheight : map.worldHeight;
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return [];

  const markers: MapMarker[] = [];
  for (const layer of source.layers ?? []) {
    if (layer.type !== "objectgroup") continue;
    for (const object of layer.objects ?? []) {
      const kind = asMarkerKind(tiledProperty(object.properties, "markerKind"));
      if (!kind || typeof object.x !== "number" || typeof object.y !== "number") continue;
      const id = tiledProperty(object.properties, "markerId");
      const label = tiledProperty(object.properties, "markerLabel");
      const markerId = typeof id === "string" ? id : object.name;
      if (!markerId || typeof label !== "string") continue;
      const point = { x: object.x / width, y: object.y / height };
      if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) continue;
      const questId = tiledProperty(object.properties, "questId");
      const stageValue = tiledProperty(object.properties, "stages");
      const stages = typeof stageValue === "string"
        ? stageValue.split(",").map((stage) => stage.trim()).filter(Boolean) as QuestStage[]
        : undefined;
      markers.push({
        id: markerId,
        kind,
        label,
        x: point.x,
        y: point.y,
        ...(tiledProperty(object.properties, "initiallyVisible") === true ? { initiallyVisible: true } : {}),
        ...(typeof questId === "string" ? { questId: questId as QuestId } : {}),
        ...(stages?.length ? { stages } : {}),
      });
    }
  }
  return markers;
}

let tiledMarkerCatalog: Readonly<Partial<Record<MapId, readonly MapMarker[]>>> = {};

/** Installs the map-editor authored catalog after BootScene has loaded TMJs. */
export function initializeTiledMapMarkerCatalog(sources: Readonly<Partial<Record<MapId, TiledMarkerSource>>>): void {
  const next: Partial<Record<MapId, readonly MapMarker[]>> = {};
  for (const map of Object.values(MAP_DEFINITIONS)) {
    const source = sources[map.id];
    if (!source) continue;
    const markers = parseTiledMapMarkers(map, source);
    // An incomplete or externally-edited document must never blank the menu.
    if (markers.length > 0) next[map.id] = markers;
  }
  tiledMarkerCatalog = next;
}

/** Refreshes one edited map without discarding the already-loaded regional catalog. */
export function updateTiledMapMarkerCatalog(mapId: MapId, source: TiledMarkerSource): void {
  const markers = parseTiledMapMarkers(MAP_DEFINITIONS[mapId], source);
  tiledMarkerCatalog = { ...tiledMarkerCatalog, [mapId]: markers.length > 0 ? markers : MAP_DEFINITIONS[mapId].markers };
}

export function resetTiledMapMarkerCatalog(): void { tiledMarkerCatalog = {}; }

function markersFor(mapId: MapId): readonly MapMarker[] {
  return tiledMarkerCatalog[mapId] ?? MAP_DEFINITIONS[mapId].markers;
}

export function selectVisibleMapMarkers(selection: MapSelection): readonly MapMarker[] {
  const discovered = selection.discoveredIds instanceof Set ? selection.discoveredIds : new Set(selection.discoveredIds);
  return markersFor(selection.currentMap).filter((marker) => {
    if (marker.kind === "exit") return true;
    if (marker.kind === "objective") {
      return marker.questId === selection.questId && (marker.stages?.includes(selection.stage) ?? false);
    }
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
    if (!map.tiledMapPath.endsWith(".tmj")) throw new Error(`Map source is not TMJ: ${map.id}`);
    for (const marker of map.markers) {
      if (marker.x < 0 || marker.x > 1 || marker.y < 0 || marker.y > 1) throw new Error(`Marker outside map bounds: ${marker.id}`);
      if (marker.kind === "objective" && !marker.questId) throw new Error(`Objective marker missing quest ID: ${marker.id}`);
    }
    for (const layer of map.layers) {
      if (textureKeys.has(layer.textureKey)) throw new Error(`Duplicate map texture key: ${layer.textureKey}`);
      textureKeys.add(layer.textureKey);
      if (layer.width !== map.worldWidth || layer.height !== map.worldHeight) throw new Error(`Layer dimensions do not match map bounds: ${layer.id}`);
    }
  }
}
