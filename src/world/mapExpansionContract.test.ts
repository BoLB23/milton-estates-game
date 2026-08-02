import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MAP_DEFINITIONS } from "../content/maps";
import {
  floodFillWalkable,
  validateMapCatalog,
  type MapCatalogEntry,
  type MapValidationDocument,
  type MapValidationOptions,
  type ReciprocalTransitionRule,
} from "./mapValidation";
import { createCollisionGrid } from "./tiledRuntime";

const EXPANSION_MAP_IDS = ["neighborhood", "stonehenge", "reidenbaugh", "fruitville_pike", "bent_creek"] as const;
const LEGACY_ROAD_MAP_ID = ["reidenbaugh", "road"].join("_");

function readExpansionMap(id: typeof EXPANSION_MAP_IDS[number]): MapCatalogEntry {
  const definition = MAP_DEFINITIONS[id];
  const map = JSON.parse(readFileSync(resolve(process.cwd(), "public", definition.tiledMapPath), "utf8")) as MapValidationDocument;
  return { id, map };
}

function readCreekMap(): MapCatalogEntry {
  const definition = MAP_DEFINITIONS.creek;
  const map = JSON.parse(readFileSync(resolve(process.cwd(), "public", definition.tiledMapPath), "utf8")) as MapValidationDocument;
  return { id: "creek", map };
}

const reciprocalTransitions: readonly ReciprocalTransitionRule[] = [
  { fromMapId: "neighborhood", exitId: "exit_stonehenge", toMapId: "stonehenge", destinationSpawnId: "spawn_milton", returnExitId: "exit_milton", returnSpawnId: "spawn_stonehenge" },
  { fromMapId: "stonehenge", exitId: "exit_reidenbaugh", toMapId: "reidenbaugh", destinationSpawnId: "spawn_stonehenge", returnExitId: "exit_stonehenge", returnSpawnId: "spawn_reidenbaugh" },
  { fromMapId: "neighborhood", exitId: "exit_fruitville", toMapId: "fruitville_pike", destinationSpawnId: "spawn_milton", returnExitId: "exit_milton", returnSpawnId: "spawn_fruitville" },
  { fromMapId: "fruitville_pike", exitId: "exit_bent_creek", toMapId: "bent_creek", destinationSpawnId: "spawn_gate_exterior", returnExitId: "exit_fruitville", returnSpawnId: "spawn_bent_creek" },
];

const boundaryExits: Readonly<Record<typeof EXPANSION_MAP_IDS[number], MapValidationOptions["boundaryExits"]>> = {
  neighborhood: [
    { objectId: "woods_gate", side: "north" },
    { objectId: "exit_stonehenge", side: "east" },
    { objectId: "exit_fruitville", side: "south" },
  ],
  stonehenge: [
    { objectId: "exit_milton", side: "west" },
    { objectId: "exit_reidenbaugh", side: "north" },
  ],
  reidenbaugh: [{ objectId: "exit_stonehenge", side: "west" }],
  fruitville_pike: [
    { objectId: "exit_milton", side: "south" },
    { objectId: "exit_bent_creek", side: "north" },
  ],
  bent_creek: [{ objectId: "exit_fruitville", side: "west" }],
};

describe("Milton Estates expansion authored contract", () => {
  it("validates every expansion TMJ against the 32px finite-map contract", () => {
    const maps = [...EXPANSION_MAP_IDS.map(readExpansionMap), readCreekMap()];
    const mapOptionsById = Object.fromEntries([
      ...EXPANSION_MAP_IDS.map((id) => [id, {
        expectedTileSize: 32,
        expectedWorldWidth: MAP_DEFINITIONS[id].worldWidth,
        expectedWorldHeight: MAP_DEFINITIONS[id].worldHeight,
        requiredLayerNames: ["ground", "solid-footprints", "spawns", "transitions", "interactions", "navigation", "qa-probes"],
        requiredObjectIds: MAP_DEFINITIONS[id].authoredObjectIds,
        boundaryExits: boundaryExits[id],
      }] as const),
      ["creek", {
        expectedTileSize: 1,
        expectedWorldWidth: MAP_DEFINITIONS.creek.worldWidth,
        expectedWorldHeight: MAP_DEFINITIONS.creek.worldHeight,
        requireCollisionGrid: false,
        requiredObjectIds: MAP_DEFINITIONS.creek.authoredObjectIds,
        anchorTypes: [],
        validateTransitions: false,
      }] as const,
    ]) as Readonly<Record<string, MapValidationOptions>>;

    expect(() => validateMapCatalog(maps, {
      mapOptionsById,
      reciprocalTransitions,
      topology: {
        requiredRoutes: [
          { fromMapId: "neighborhood", viaMapIds: ["stonehenge"], toMapId: "reidenbaugh" },
          { fromMapId: "neighborhood", viaMapIds: ["fruitville_pike"], toMapId: "bent_creek" },
        ],
        forbiddenMapIds: [LEGACY_ROAD_MAP_ID],
      },
    })).not.toThrow();

    const collisionLayer = maps[0]!.map.layers.find((layer) => layer.name === "collision-grid")!;
    const grid = createCollisionGrid({
      width: collisionLayer.width!,
      height: collisionLayer.height!,
      data: collisionLayer.data!,
      tileWidth: 32,
      tileHeight: 32,
    });
    expect(floodFillWalkable(grid, [{ x: 25, y: 30 }]).has("43,5")).toBe(true);
  });
});
