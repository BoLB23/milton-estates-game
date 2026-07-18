import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MAP_DEFINITIONS } from "../content/maps";

interface TiledObject { name: string; x: number; y: number; width?: number; height?: number; }
interface TiledMap { width: number; height: number; layers: Array<{ name: string; type: string; objects?: TiledObject[] }>; }

function authoredMap(path: string): TiledMap {
  return JSON.parse(readFileSync(resolve(process.cwd(), "public", path), "utf8")) as TiledMap;
}

describe("TMJ runtime sources", () => {
  it("contains every gameplay object consumed at runtime", () => {
    for (const definition of Object.values(MAP_DEFINITIONS)) {
      const map = authoredMap(definition.tiledMapPath);
      const layer = map.layers.find(({ name }) => name === "stable-gameplay-objects");
      const names = new Set(layer?.objects?.map(({ name }) => name));
      expect(map.width).toBe(definition.worldWidth);
      expect(map.height).toBe(definition.worldHeight);
      expect(definition.authoredObjectIds.every((name) => names.has(name))).toBe(true);
    }
  });

  it("authors non-empty collision rectangles in each TMJ", () => {
    for (const definition of Object.values(MAP_DEFINITIONS)) {
      const layer = authoredMap(definition.tiledMapPath).layers.find(({ name }) => name === "collision-rects");
      expect(layer?.objects?.length).toBeGreaterThan(0);
      for (const collider of layer?.objects ?? []) {
        expect(collider.width).toBeGreaterThan(0);
        expect(collider.height).toBeGreaterThan(0);
      }
    }
  });
});
