import { describe, expect, it } from "vitest";
import {
  buildMapTopologyGraph,
  collectMapTopologyIssues,
  collectMapValidationIssues,
  isGridReachable,
  validateMapCatalog,
  validateMapData,
  validateMapTopology,
  validateReachability,
  validateReciprocalTransitions,
  type MapCatalogEntry,
  type MapTopologyGraph,
  type MapValidationDocument,
} from "./mapValidation";
import { createCollisionGrid } from "./tiledRuntime";

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function boundaryGrid(size = 6): number[] {
  const data = Array.from({ length: size * size }, () => 0);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) data[y * size + x] = 1;
    }
  }
  // The south exit occupies two aligned cells.
  data[(size - 1) * size + 2] = 0;
  data[(size - 1) * size + 3] = 0;
  // Keep the authored solid footprint in a blocked cell.
  data[2 * size + 1] = 1;
  return data;
}

function authoredMap(id: string, destinationMap = "stonehenge"): MapValidationDocument {
  return {
    mapId: id,
    width: 6,
    height: 6,
    tilewidth: 32,
    tileheight: 32,
    infinite: false,
    orientation: "orthogonal",
    layers: [
      {
        name: "collision-grid",
        type: "tilelayer",
        width: 6,
        height: 6,
        data: boundaryGrid(),
      },
      {
        name: "spawns",
        type: "objectgroup",
        objects: [
          { id: 1, name: "spawn_home", type: "spawn", x: 48, y: 48 },
          { id: 2, name: "spawn_destination", type: "spawn", x: 112, y: 112 },
        ],
      },
      {
        name: "transitions",
        type: "objectgroup",
        objects: [{
          id: 3,
          name: "exit_south",
          type: "transition",
          x: 64,
          y: 160,
          width: 64,
          height: 32,
          properties: { destinationMap, destinationSpawn: "spawn_home" },
        }],
      },
      {
        name: "interactions",
        type: "objectgroup",
        objects: [{ id: 4, name: "landmark_center", type: "interaction", x: 112, y: 112 }],
      },
      {
        name: "solid-footprints",
        type: "objectgroup",
        objects: [{ id: 5, name: "center_wall", x: 32, y: 64, width: 32, height: 32 }],
      },
    ],
  };
}

function pairMap(id: string, exitId: string, destinationMap: string, destinationSpawn: string, spawnId: string): MapCatalogEntry {
  return {
    id,
    map: {
      ...authoredMap(id, destinationMap),
      layers: [
        {
          name: "spawns",
          type: "objectgroup",
          objects: [{ id: 1, name: spawnId, type: "spawn", x: 16, y: 16 }],
        },
        {
          name: "transitions",
          type: "objectgroup",
          objects: [{
            id: 2,
            name: exitId,
            type: "transition",
            x: 0,
            y: 0,
            width: 32,
            height: 32,
            properties: { destinationMap, destinationSpawn },
          }],
        },
      ],
    },
  };
}

describe("static 32px map validation", () => {
  it("accepts a finite orthogonal map with aligned walkable anchors and explicit boundary exit", () => {
    expect(() => validateMapData(authoredMap("neighborhood"), {
      requiredLayerNames: ["spawns", "transitions", "interactions"],
      boundaryExits: [{ objectId: "exit_south", side: "south" }],
      reachabilityRules: [{
        startObjectIds: ["spawn_home"],
        targetObjectIds: ["spawn_destination", "landmark_center", "exit_south"],
      }],
    })).not.toThrow();
  });

  it("reports actionable finite/grid/alignment/walkability errors", () => {
    const invalid = copy(authoredMap("broken"));
    invalid.orientation = "isometric";
    invalid.infinite = true;
    invalid.tilewidth = 16;
    const spawnLayer = invalid.layers.find((layer) => layer.name === "spawns");
    const spawn = spawnLayer?.objects?.[0];
    if (spawn) spawn.x = 40;
    const issues = collectMapValidationIssues(invalid, {
      boundaryExits: [{ objectId: "exit_south", side: "south" }],
    });

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "orientation",
      "finite-map",
      "tile-size",
      "point-alignment",
    ]));
    expect(() => validateMapData(invalid)).toThrow(/orthogonal/);
  });

  it("rejects an anchor on a filled cell and a footprint overlapping legal travel", () => {
    const blockedAnchor = copy(authoredMap("blocked-anchor"));
    const gridLayer = blockedAnchor.layers.find((layer) => layer.name === "collision-grid");
    if (gridLayer?.data && !Array.isArray(gridLayer.data[0])) {
      (gridLayer.data as number[])[1 * 6 + 1] = 1;
    }
    expect(() => validateMapData(blockedAnchor, { boundaryExits: [{ objectId: "exit_south" }] })).toThrow(/empty collision-grid/);

    const overlappingFootprint = copy(authoredMap("overlap"));
    const footprintLayer = overlappingFootprint.layers.find((layer) => layer.name === "solid-footprints");
    const footprint = footprintLayer?.objects?.[0];
    if (footprint) footprint.x = 96;
    const issues = collectMapValidationIssues(overlappingFootprint, { boundaryExits: [{ objectId: "exit_south" }] });
    expect(issues.some((issue) => issue.code === "walkable-solid-overlap")).toBe(true);
  });

  it("proves flood-fill reachability and rejects disconnected anchors", () => {
    const grid = createCollisionGrid({
      width: 5,
      height: 3,
      data: [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    });
    expect(isGridReachable(grid, { x: 0, y: 1 }, { x: 1, y: 1 })).toBe(true);
    expect(isGridReachable(grid, { x: 0, y: 1 }, { x: 3, y: 1 })).toBe(false);
    expect(() => validateReachability(
      grid,
      [{ x: 0, y: 1 }],
      [{ id: "far_anchor", cell: { x: 3, y: 1 } }],
    )).toThrow(/far_anchor/);
  });

  it("rejects walkable boundary leaks unless an aligned explicit exit owns them", () => {
    const leaking = copy(authoredMap("leaking"));
    const gridLayer = leaking.layers.find((layer) => layer.name === "collision-grid");
    if (gridLayer?.data && !Array.isArray(gridLayer.data[0])) {
      (gridLayer.data as number[])[0] = 0;
    }
    const issues = collectMapValidationIssues(leaking, { boundaryExits: [{ objectId: "exit_south", side: "south" }] });
    expect(issues.some((issue) => issue.code === "boundary-leak")).toBe(true);

    const misaligned = copy(authoredMap("misaligned-exit"));
    const transition = misaligned.layers.find((layer) => layer.name === "transitions")?.objects?.[0];
    if (transition) transition.width = 48;
    expect(() => validateMapData(misaligned, { boundaryExits: [{ objectId: "exit_south", side: "south" }] })).toThrow(/Rectangle edges/);
  });
});

describe("transition reciprocity and regional topology", () => {
  it("validates reciprocal exits, destination maps, and stable destination spawns", () => {
    const maps = [
      pairMap("neighborhood", "exit_stonehenge", "stonehenge", "spawn_milton", "spawn_stonehenge"),
      pairMap("stonehenge", "exit_milton", "neighborhood", "spawn_stonehenge", "spawn_milton"),
    ];
    const rule = {
      fromMapId: "neighborhood",
      exitId: "exit_stonehenge",
      toMapId: "stonehenge",
      destinationSpawnId: "spawn_milton",
      returnExitId: "exit_milton",
      returnSpawnId: "spawn_stonehenge",
    } as const;

    expect(() => validateReciprocalTransitions(maps, [rule])).not.toThrow();
    const broken = copy(maps);
    const brokenTransition = broken[1]?.map.layers.find((layer) => layer.name === "transitions")?.objects?.[0];
    if (brokenTransition?.properties && !Array.isArray(brokenTransition.properties)) {
      (brokenTransition.properties as Record<string, unknown>).destinationSpawn = "missing_spawn";
    }
    expect(() => validateReciprocalTransitions(broken, [rule])).toThrow(/spawn_stonehenge/);

    const unknownTarget = copy(maps);
    const unknownTransition = unknownTarget[0]?.map.layers.find((layer) => layer.name === "transitions")?.objects?.[0];
    if (unknownTransition?.properties && !Array.isArray(unknownTransition.properties)) {
      (unknownTransition.properties as Record<string, unknown>).destinationMap = "unknown_map";
    }
    expect(() => validateMapCatalog(unknownTarget, { mapOptions: { requireCollisionGrid: false } })).toThrow(/unknown map/);
  });

  it("proves required route checkpoints and rejects direct/legacy shortcuts", () => {
    const legacyRoadMapId = ["reidenbaugh", "road"].join("_");
    const canonical: MapTopologyGraph = {
      mapIds: ["neighborhood", "stonehenge", "reidenbaugh", "fruitville_pike", "bent_creek"],
      edges: [
        { sourceMapId: "neighborhood", destinationMapId: "stonehenge", transitionId: "exit_stonehenge" },
        { sourceMapId: "stonehenge", destinationMapId: "reidenbaugh", transitionId: "exit_reidenbaugh" },
        { sourceMapId: "neighborhood", destinationMapId: "fruitville_pike", transitionId: "exit_fruitville" },
        { sourceMapId: "fruitville_pike", destinationMapId: "bent_creek", transitionId: "exit_bent_creek" },
      ],
    };
    const options = {
      requiredRoutes: [
        { fromMapId: "neighborhood", toMapId: "reidenbaugh", viaMapIds: ["stonehenge"] },
        { fromMapId: "neighborhood", toMapId: "bent_creek", viaMapIds: ["fruitville_pike"] },
      ],
      forbiddenMapIds: [legacyRoadMapId],
    } as const;
    expect(() => validateMapTopology(canonical, options)).not.toThrow();

    const shortcut: MapTopologyGraph = {
      ...canonical,
      edges: [...canonical.edges, { sourceMapId: "neighborhood", destinationMapId: "reidenbaugh", transitionId: "legacy_direct_reidenbaugh" }],
    };
    expect(collectMapTopologyIssues(shortcut, options).some((issue) => issue.code === "shortcut-route")).toBe(true);

    const legacy: MapTopologyGraph = {
      ...canonical,
      mapIds: [...canonical.mapIds, legacyRoadMapId],
      edges: [...canonical.edges, { sourceMapId: "neighborhood", destinationMapId: legacyRoadMapId, transitionId: "legacy_road" }],
    };
    expect(() => validateMapTopology(legacy, options)).toThrow(/forbidden legacy map/);
  });

  it("builds a topology graph from authored transition properties", () => {
    const maps = [
      pairMap("neighborhood", "exit_stonehenge", "stonehenge", "spawn_milton", "spawn_stonehenge"),
      pairMap("stonehenge", "exit_milton", "neighborhood", "spawn_stonehenge", "spawn_milton"),
    ];
    expect(buildMapTopologyGraph(maps).edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceMapId: "neighborhood", destinationMapId: "stonehenge", transitionId: "exit_stonehenge" }),
      expect.objectContaining({ sourceMapId: "stonehenge", destinationMapId: "neighborhood", transitionId: "exit_milton" }),
    ]));
  });
});
