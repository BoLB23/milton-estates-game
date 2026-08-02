import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MAP_DEFINITIONS, projectRegionalMapPoint, validateMapDefinitions } from "./maps";

interface TiledObject { name: string; x: number; y: number; }
interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: Array<{ type: string; objects?: TiledObject[] }>;
}

function readTiledMap(path: string): TiledMap {
  return JSON.parse(readFileSync(resolve(process.cwd(), "public", path), "utf8")) as TiledMap;
}

describe("canonical map definitions", () => {
  it("matches each authored Tiled object coordinate and map size", () => {
    for (const definition of Object.values(MAP_DEFINITIONS)) {
      const tiled = readTiledMap(definition.tiledMapPath);
      expect(tiled.width * tiled.tilewidth).toBe(definition.worldWidth);
      expect(tiled.height * tiled.tileheight).toBe(definition.worldHeight);
      const objects = new Map(
        tiled.layers.flatMap((layer) => layer.type === "objectgroup" ? layer.objects ?? [] : [])
          .map((object) => [object.name, object]),
      );
      for (const id of definition.authoredObjectIds) {
        expect(objects.get(id)).toBeDefined();
      }
    }
  });

  it("keeps runtime metadata and regional-map projection valid", () => {
    expect(() => validateMapDefinitions()).not.toThrow();
    for (const definition of Object.values(MAP_DEFINITIONS)) {
      const projected = projectRegionalMapPoint(definition, { x: 0.5, y: 0.5 });
      expect(projected.x).toBeGreaterThan(0);
      expect(projected.y).toBeGreaterThan(0);
    }
  });
});
