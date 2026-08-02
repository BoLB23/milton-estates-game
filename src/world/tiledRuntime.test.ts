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
});

describe("collision-grid runtime contract", () => {
  it("treats filled cells as blocked and exposes exact cell edges/centers", () => {
    const grid = createCollisionGrid({
      width: 3,
      height: 2,
      tileWidth: 32,
      tileHeight: 32,
      data: [0, 1, -1, 0, 0, 0],
    });

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
    });

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
    });

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
});
