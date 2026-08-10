import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";
import { MAP_DEFINITIONS } from "../content/maps";
import {
  CollisionGrid,
  createCollisionGrid,
  getExactWorldBounds,
  mountCollisionGridLayer,
  TiledRuntimeWorld,
} from "./tiledRuntime";

interface TiledObject { name: string; x: number; y: number; width?: number; height?: number; }
interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: Array<{ name: string; type: string; objects?: TiledObject[]; data?: number[]; width?: number; height?: number }>;
}

function authoredMap(path: string): TiledMap {
  return JSON.parse(readFileSync(resolve(process.cwd(), "public", path), "utf8")) as TiledMap;
}

describe("TMJ runtime sources", () => {
  it("contains every gameplay object consumed at runtime", () => {
    for (const definition of Object.values(MAP_DEFINITIONS)) {
      const map = authoredMap(definition.tiledMapPath);
      const names = new Set(map.layers.flatMap((layer) => layer.objects?.map(({ name }) => name) ?? []));
      expect(map.width * map.tilewidth).toBe(definition.worldWidth);
      expect(map.height * map.tileheight).toBe(definition.worldHeight);
      expect(definition.authoredObjectIds.every((name) => names.has(name))).toBe(true);
    }
  });

  it("authors non-empty collision rectangles in each TMJ", () => {
    for (const definition of Object.values(MAP_DEFINITIONS)) {
      const map = authoredMap(definition.tiledMapPath);
      const grid = map.layers.find(({ name }) => name === "collision-grid");
      if (grid) {
        expect(grid.width).toBe(map.width);
        expect(grid.height).toBe(map.height);
        expect(grid.data?.length).toBe(map.width * map.height);
      } else {
        const layer = map.layers.find(({ name }) => name === "collision-rects");
        expect(layer?.objects?.length).toBeGreaterThan(0);
        for (const collider of layer?.objects ?? []) {
          expect(collider.width).toBeGreaterThan(0);
          expect(collider.height).toBeGreaterThan(0);
        }
      }
    }
  });

  it("parses typed pickups from the interactions layer", () => {
    const layer = {
      objects: [{
        name: "pickup_milton_field_token_01",
        type: "pickup",
        x: 880,
        y: 912,
        properties: [
          { name: "itemId", type: "string", value: "field_token" },
          { name: "quantity", type: "int", value: 1 },
        ],
      }],
    };
    const tilemap = {
      width: 45,
      height: 33,
      tileWidth: 32,
      tileHeight: 32,
      getObjectLayer: (name: string) => name === "interactions" ? layer : null,
    } as unknown as Phaser.Tilemaps.Tilemap;
    const runtime = new TiledRuntimeWorld(tilemap);
    expect(runtime.pickups()).toEqual([{
      id: "pickup_milton_field_token_01",
      itemId: "field_token",
      quantity: 1,
      x: 880,
      y: 912,
      width: undefined,
      height: undefined,
    }]);
  });
});

describe("collision-grid runtime contract", () => {
  it("treats filled cells as blocked and exposes exact cell edges/centers", () => {
    const grid = createCollisionGrid({
      width: 3,
      height: 2,
      tileWidth: 32,
      tileHeight: 32,
      data: [0, 1, -1, 0, 0, 0],
    }, { tileSize: 32 });

    expect(grid).toBeInstanceOf(CollisionGrid);
    expect(grid.isWalkable({ x: 0, y: 0 })).toBe(true);
    expect(grid.isBlocked({ x: 1, y: 0 })).toBe(true);
    expect(grid.isWalkable({ x: 2, y: 0 })).toBe(true);
    expect(grid.isBlocked({ x: -1, y: 0 })).toBe(true);
    expect(grid.cellBounds({ x: 1, y: 1 })).toEqual({ x: 32, y: 32, width: 32, height: 32 });
    expect(grid.cellCenter({ x: 1, y: 1 })).toEqual({ x: 48, y: 48 });
    expect(grid.pointToCell({ x: 48, y: 48 })).toEqual({ x: 1, y: 1 });
    expect(grid.isPointAtCellCenter({ x: 48, y: 48 })).toBe(true);
    expect(grid.isPointAtCellCenter({ x: 32, y: 48 })).toBe(false);
    expect(grid.worldWidth).toBe(96);
    expect(grid.worldHeight).toBe(64);
  });

  it("rejects diagonal corner squeezing while allowing an open diagonal", () => {
    const grid = createCollisionGrid({
      width: 3,
      height: 3,
      data: [0, 1, 0, 1, 0, 0, 0, 0, 0],
    }, { tileSize: 32 });

    expect(grid.canTraverse({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
    expect(grid.canTraverse({ x: 1, y: 1 }, { x: 2, y: 2 })).toBe(true);
    expect(grid.canTravel({ x: 16, y: 16 }, { x: 48, y: 48 })).toBe(false);
    expect(grid.canTravel({ x: 48, y: 48 }, { x: 80, y: 80 })).toBe(true);
  });

  it("mounts a hidden collision layer, collider, and exact physics/camera bounds", () => {
    const tileData = [0, 1, 0, 0, 0, 0];
    const layer = {
      setCollisionByExclusion: vi.fn(),
      setVisible: vi.fn(),
      destroy: vi.fn(),
    };
    const tilemap = {
      width: 3,
      height: 2,
      tileWidth: 32,
      tileHeight: 32,
      widthInPixels: 96,
      heightInPixels: 64,
      getTileAt: (x: number, y: number) => ({ index: tileData[y * 3 + x] ?? -1 }),
      createLayer: vi.fn(() => layer),
    } as unknown as Phaser.Tilemaps.Tilemap;
    const physicsWorld = { setBounds: vi.fn() };
    const camera = { setBounds: vi.fn() };
    const addCollider = vi.fn(() => ({ destroy: vi.fn() }));

    const mounted = mountCollisionGridLayer(tilemap, {
      physicsWorld,
      camera,
      colliderTarget: { name: "player" },
      addCollider,
    }, { tileSize: 32 });

    expect(mounted.bounds).toEqual({ x: 0, y: 0, width: 96, height: 64 });
    expect(mounted.grid.isBlocked({ x: 1, y: 0 })).toBe(true);
    expect(layer.setCollisionByExclusion).toHaveBeenCalledWith([-1, 0], true, true);
    expect(layer.setVisible).toHaveBeenCalledWith(false);
    expect(physicsWorld.setBounds).toHaveBeenCalledWith(0, 0, 96, 64, true, true, true, true);
    expect(camera.setBounds).toHaveBeenCalledWith(0, 0, 96, 64);
    expect(addCollider).toHaveBeenCalledWith(expect.anything(), layer);

    mounted.destroy();
    expect(layer.destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps stable object queries and world bounds available to existing consumers", () => {
    const tilemap = {
      width: 2,
      height: 2,
      tileWidth: 32,
      tileHeight: 32,
      widthInPixels: 64,
      heightInPixels: 64,
      getObjectLayer: (name: string) => name === "objects"
        ? { objects: [{ name: "exit", x: 16, y: 16, width: 32, height: 32, properties: { destinationMap: "woods" } }] }
        : { objects: [] },
    } as unknown as Phaser.Tilemaps.Tilemap;
    const runtime = new TiledRuntimeWorld(tilemap, "objects", "objects");

    expect(runtime.point("exit")).toEqual({ x: 16, y: 16 });
    expect(runtime.rectangle("exit")).toEqual({ x: 16, y: 16, width: 32, height: 32 });
    expect(runtime.property("exit", "destinationMap")).toBe("woods");
    expect(runtime.worldBounds).toEqual(getExactWorldBounds(tilemap));
  });

  it("matches artwork transforms by authored role instead of fragile layer order", () => {
    const tilemap = {
      width: 1, height: 1, tileWidth: 1, tileHeight: 1,
      getObjectLayer: () => null,
      imageLayers: [
        { properties: [{ name: "role", value: "foreground" }, { name: "depth", value: 55 }] },
        { properties: [{ name: "role", value: "master" }, { name: "displayX", value: 24 }, { name: "depth", value: 10 }] },
      ],
    } as unknown as Phaser.Tilemaps.Tilemap;
    const runtime = new TiledRuntimeWorld(tilemap);
    const transform = runtime.artworkTransform("master", 0, {
      x: 0, y: 0, width: 100, height: 100, cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100, depth: 99,
    });
    expect(transform.x).toBe(24);
    expect(transform.depth).toBe(10);
  });
});
