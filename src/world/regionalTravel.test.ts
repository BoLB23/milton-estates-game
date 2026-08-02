import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MAP_DEFINITIONS } from "../content/maps";
import {
  REGIONAL_TRAVEL_TARGETS,
  regionalTravelDistance,
  regionalTravelSeconds,
  validateRegionalTravelTargets,
} from "./regionalTravel";
import { REGIONAL_BICYCLE_TUNING } from "./PlayerLocomotionController";
import type { MapId } from "../game/types";

interface TiledObject { name: string; x: number; y: number; width?: number; height?: number; }
interface TiledMap { layers: Array<{ type: string; objects?: TiledObject[] }> }

const objectsByMap = new Map<MapId, Map<string, { x: number; y: number }>>();
for (const definition of Object.values(MAP_DEFINITIONS)) {
  const tiled = JSON.parse(readFileSync(resolve(process.cwd(), "public", definition.tiledMapPath), "utf8")) as TiledMap;
  objectsByMap.set(definition.id, new Map(
    tiled.layers.flatMap((layer) => layer.type === "objectgroup" ? layer.objects ?? [] : [])
      .map((object) => [object.name, {
        x: object.x + (object.width ?? 0) / 2,
        y: object.y + (object.height ?? 0) / 2,
      }]),
  ));
}

function resolvePoint(map: MapId, objectId: string): { x: number; y: number } {
  const point = objectsByMap.get(map)?.get(objectId);
  if (!point) throw new Error(`Missing timed-route point ${map}.${objectId}`);
  return point;
}

describe("regional bicycle travel targets", () => {
  it("keeps both approved traversal windows on the authored route beats", () => {
    expect(() => validateRegionalTravelTargets(REGIONAL_TRAVEL_TARGETS, resolvePoint)).not.toThrow();
    const estimates = REGIONAL_TRAVEL_TARGETS.map((target) => regionalTravelSeconds(target, resolvePoint));
    expect(estimates[0]).toBeGreaterThanOrEqual(12);
    expect(estimates[0]).toBeLessThanOrEqual(18);
    expect(estimates[1]).toBeGreaterThanOrEqual(6);
    expect(estimates[1]).toBeLessThanOrEqual(10);
  });

  it("uses meaningful route distance instead of straight-line shortcuts", () => {
    const distances = REGIONAL_TRAVEL_TARGETS.map((target) => regionalTravelDistance(target, resolvePoint));
    distances.forEach((distance, index) => {
      const target = REGIONAL_TRAVEL_TARGETS[index]!;
      expect(distance).toBeGreaterThanOrEqual(target.minSeconds * REGIONAL_BICYCLE_TUNING.maxSpeed);
      expect(distance).toBeLessThanOrEqual(target.maxSeconds * REGIONAL_BICYCLE_TUNING.maxSpeed);
    });
  });
});
