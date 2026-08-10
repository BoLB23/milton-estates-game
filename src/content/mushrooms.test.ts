import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createMushroomSpawns,
  getAuthoredMushroomSpawnCandidates,
  MUSHROOM_INTERACTION_CLEARANCE,
  mushroomCountForMap,
} from "./mushrooms";
import { createCollisionGrid, type WorldPoint } from "../world/tiledRuntime";

interface TestMapObject extends WorldPoint {
  name: string;
  width?: number;
  height?: number;
}

interface TestMapLayer {
  name: string;
  width?: number;
  height?: number;
  data?: number[];
  objects?: TestMapObject[];
}

interface TestMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TestMapLayer[];
}

function loadMap(path: string): TestMap {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as TestMap;
}

function object(map: TestMap, name: string): TestMapObject {
  const found = map.layers.flatMap((layer) => layer.objects ?? []).find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Missing test map object: ${name}`);
  return found;
}

function cellKey(point: WorldPoint): string {
  return `${point.x},${point.y}`;
}

function creekCollisionGrid(map: TestMap, tileSize = 16) {
  const width = map.width / tileSize;
  const height = map.height / tileSize;
  const forbidden = map.layers.find((layer) => layer.name === "collision-rects")?.objects ?? [];
  const data = Array.from({ length: width * height }, (_, index) => {
    const x = (index % width) * tileSize + tileSize / 2;
    const y = Math.floor(index / width) * tileSize + tileSize / 2;
    return forbidden.some((rect) =>
      x >= rect.x && x < rect.x + (rect.width ?? 0)
      && y >= rect.y && y < rect.y + (rect.height ?? 0),
    ) ? 1 : 0;
  });
  return createCollisionGrid({ width, height, data }, { tileSize });
}

describe("Andrew's mushroom hunt locations", () => {
  it("creates ten unique, evenly split locations", () => {
    const spawns = createMushroomSpawns(2007);

    expect(spawns).toHaveLength(10);
    expect(new Set(spawns.map(({ id }) => id)).size).toBe(10);
    expect(mushroomCountForMap(spawns, "neighborhood")).toBe(5);
    expect(mushroomCountForMap(spawns, "creek")).toBe(5);
  });

  it("is deterministic for save generation but changes placement for a new seed", () => {
    expect(createMushroomSpawns(42)).toEqual(createMushroomSpawns(42));
    expect(createMushroomSpawns(42)).not.toEqual(createMushroomSpawns(43));
  });

  it("keeps every Milton candidate on a walkable cell reachable from home", () => {
    const map = loadMap("public/assets/maps/expansion/neighborhood.tmj");
    const collision = map.layers.find((layer) => layer.name === "collision-grid");
    if (!collision?.data || !collision.width || !collision.height) throw new Error("Missing neighborhood collision grid");
    const grid = createCollisionGrid({
      width: collision.width,
      height: collision.height,
      data: collision.data,
      tileWidth: map.tilewidth,
      tileHeight: map.tileheight,
    });
    const homeCell = grid.pointToCell(object(map, "spawn_home"));
    if (!homeCell) throw new Error("Home spawn is outside the neighborhood grid");
    const reachable = grid.floodFill([homeCell]);

    for (const candidate of getAuthoredMushroomSpawnCandidates("neighborhood")) {
      const cell = grid.pointToCell(candidate);
      expect(cell && grid.isWalkable(cell), `${cellKey(candidate)} is blocked`).toBe(true);
      expect(cell && reachable.has(cellKey(cell)), `${cellKey(candidate)} is disconnected`).toBe(true);
    }
  });

  it("keeps every Creek candidate outside forbidden rectangles and reachable from its entrance", () => {
    const map = loadMap("public/assets/maps/creek-woods.tmj");
    const grid = creekCollisionGrid(map);
    const homeCell = grid.pointToCell(object(map, "spawn_home"));
    if (!homeCell) throw new Error("Creek entrance is outside the collision grid");
    const reachable = grid.floodFill([homeCell]);

    for (const candidate of getAuthoredMushroomSpawnCandidates("creek")) {
      const cell = grid.pointToCell(candidate);
      expect(cell && grid.isWalkable(cell), `${cellKey(candidate)} is forbidden`).toBe(true);
      expect(cell && reachable.has(cellKey(cell)), `${cellKey(candidate)} is disconnected`).toBe(true);
    }
  });

  it("keeps candidate interaction ranges from overlapping", () => {
    for (const map of ["neighborhood", "creek"] as const) {
      const candidates = getAuthoredMushroomSpawnCandidates(map);
      for (let left = 0; left < candidates.length; left += 1) {
        for (let right = left + 1; right < candidates.length; right += 1) {
          const first = candidates[left]!;
          const second = candidates[right]!;
          expect(
            Math.hypot(first.x - second.x, first.y - second.y),
            `${map} candidates ${cellKey(first)} and ${cellKey(second)} overlap`,
          ).toBeGreaterThanOrEqual(MUSHROOM_INTERACTION_CLEARANCE);
        }
      }
    }
  });
});
