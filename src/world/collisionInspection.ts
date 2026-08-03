import type { CollisionGrid, GridCell, WorldPoint } from "./tiledRuntime";

export type CollisionInspectionStatus = "walkable" | "blocked" | "out-of-bounds" | "unavailable";

export interface CollisionInspectionResult {
  readonly cell?: GridCell;
  readonly status: CollisionInspectionStatus;
}

/** Reads the authored collision source at a world point without coupling the overlay to Phaser. */
export function inspectCollisionPoint(
  grid: CollisionGrid | undefined,
  point: WorldPoint,
): CollisionInspectionResult {
  if (!grid) return { status: "unavailable" };

  const cell = grid.pointToCell(point);
  if (!cell) return { status: "out-of-bounds" };

  return { cell, status: grid.isBlocked(cell) ? "blocked" : "walkable" };
}
