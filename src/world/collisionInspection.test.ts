import { describe, expect, it } from "vitest";
import { inspectCollisionPoint } from "./collisionInspection";
import { createCollisionGrid } from "./tiledRuntime";

function fixtureGrid() {
  return createCollisionGrid({
    width: 2,
    height: 2,
    tileWidth: 32,
    tileHeight: 32,
    data: [0, 1, 0, 0],
  }, { tileSize: 32 });
}

describe("collision inspection", () => {
  it("reports the authored cell and walkable status", () => {
    expect(inspectCollisionPoint(fixtureGrid(), { x: 8, y: 24 })).toEqual({
      cell: { x: 0, y: 0 },
      status: "walkable",
    });
  });

  it("reports blocked cells from the Tiled collision data", () => {
    expect(inspectCollisionPoint(fixtureGrid(), { x: 48, y: 16 })).toEqual({
      cell: { x: 1, y: 0 },
      status: "blocked",
    });
  });

  it("reports map-edge points as out of bounds", () => {
    expect(inspectCollisionPoint(fixtureGrid(), { x: 64, y: 16 })).toEqual({
      status: "out-of-bounds",
    });
  });

  it("reports unavailable when a map uses legacy rectangle collision", () => {
    expect(inspectCollisionPoint(undefined, { x: 16, y: 16 })).toEqual({
      status: "unavailable",
    });
  });
});
