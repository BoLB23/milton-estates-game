import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CREEK_MAP } from "./maps";

function creekObjects(): Array<{ name: string; x: number; y: number; width?: number; height?: number }> {
  const map = JSON.parse(readFileSync(resolve(process.cwd(), "public", CREEK_MAP.tiledMapPath), "utf8")) as { layers: Array<{ name: string; objects?: Array<{ name: string; x: number; y: number; width?: number; height?: number }> }> };
  return map.layers.find(({ name }) => name === "stable-gameplay-objects")?.objects ?? [];
}

function isInsideWater(point: { x: number; y: number }): boolean {
  const colliders = JSON.parse(readFileSync(resolve(process.cwd(), "public", CREEK_MAP.tiledMapPath), "utf8")) as { layers: Array<{ name: string; objects?: Array<{ x: number; y: number; width: number; height: number }> }> };
  return (colliders.layers.find(({ name }) => name === "collision-rects")?.objects ?? []).some((collider) => collider.x >= 800 && point.x >= collider.x
    && point.x <= collider.x + collider.width
    && point.y >= collider.y
    && point.y <= collider.y + collider.height);
}

describe("illustrated map gameplay coordinates", () => {
  it("keeps creek gameplay anchors on land", () => {
    for (const anchor of creekObjects()) {
      expect(isInsideWater(anchor)).toBe(false);
    }
  });

  it("leaves both painted bridge crossings open", () => {
    expect(isInsideWater({ x: 1120, y: 340 })).toBe(false);
    expect(isInsideWater({ x: 1040, y: 1040 })).toBe(false);
  });
});
