import type { MapId } from "../game/types";

/**
 * The image-layer subset of the eventual Tiled maps. Visual layers are allowed
 * to evolve independently; object IDs are the contract with quest code.
 */
export interface IllustratedMapLayer {
  id: string;
  mapId: MapId;
  role: "master" | "foreground";
  textureKey: string;
  imagePath: string;
  /** Top-left world position in the stable, existing coordinate system. */
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  /** IDs mirrored by a master plate's Tiled object group and kept stable by gameplay. */
  stableObjectIds?: readonly string[];
}

const NEIGHBORHOOD_STABLE_OBJECT_IDS = [
  "spawn_home",
  "spawn_woods",
  "andrew",
  "jeremy",
  "side_yard_gap",
  "woods_gate",
  "blocked_bent_creek",
  "blocked_stonehenge",
  "blocked_reidenbaugh",
  "blocked_fruitville",
] as const;

const CREEK_STABLE_OBJECT_IDS = [
  "spawn_home",
  "return_neighborhood",
  "creek_tracks",
  "controller",
  "secret",
] as const;

/**
 * Tiled-ready full-map image layers. Runtime scenes still own collision,
 * transitions, interactions, and quest behavior through their stable IDs.
 */
export const ILLUSTRATED_MAP_LAYERS: readonly IllustratedMapLayer[] = [
  {
    id: "neighborhood_illustrated_master",
    mapId: "neighborhood",
    role: "master",
    textureKey: "neighborhood-illustrated-master",
    imagePath: "/assets/maps/neighborhood-master-v1.png",
    x: 0,
    y: 0,
    width: 2300,
    height: 1500,
    depth: 10,
    stableObjectIds: NEIGHBORHOOD_STABLE_OBJECT_IDS,
  },
  {
    id: "creek_illustrated_master",
    mapId: "creek",
    role: "master",
    textureKey: "creek-illustrated-master",
    imagePath: "/assets/maps/creek-woods-master-v1.png",
    x: 0,
    y: 0,
    width: 2048,
    height: 1536,
    depth: 10,
    stableObjectIds: CREEK_STABLE_OBJECT_IDS,
  },
  {
    id: "creek_foreground_canopy",
    mapId: "creek",
    role: "foreground",
    textureKey: "creek-foreground-canopy",
    imagePath: "/assets/maps/creek-foreground-canopy-v1.png",
    x: 0,
    y: 0,
    width: 2048,
    height: 1536,
    depth: 55,
  },
];

export function getIllustratedMapLayers(mapId: MapId): readonly IllustratedMapLayer[] {
  return ILLUSTRATED_MAP_LAYERS.filter((layer) => layer.mapId === mapId);
}

/** Throws during boot rather than allowing presentation work to silently rename gameplay objects. */
export function validateIllustratedMapLayers(): void {
  const seenLayerIds = new Set<string>();
  for (const layer of ILLUSTRATED_MAP_LAYERS) {
    if (seenLayerIds.has(layer.id)) throw new Error(`Duplicate illustrated map layer: ${layer.id}`);
    seenLayerIds.add(layer.id);
    if (layer.width <= 0 || layer.height <= 0) throw new Error(`Invalid layer dimensions: ${layer.id}`);
    if (layer.role !== "master") continue;
    if (!layer.stableObjectIds || layer.stableObjectIds.length === 0) {
      throw new Error(`Missing stable objects: ${layer.id}`);
    }
    if (new Set(layer.stableObjectIds).size !== layer.stableObjectIds.length) {
      throw new Error(`Duplicate stable object ID: ${layer.id}`);
    }
  }
}
