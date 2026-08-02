import type { MapId } from "../game/types";
import { REGIONAL_BICYCLE_TUNING } from "./PlayerLocomotionController";
import type { WorldPoint } from "./tiledRuntime";

export interface RegionalTravelSegment {
  readonly map: MapId;
  /** Ordered stable object IDs along the marked, bicycle-clear route. */
  readonly pointIds: readonly string[];
}

export interface RegionalTravelTarget {
  readonly id: "milton_to_reidenbaugh" | "milton_to_bent_creek";
  readonly label: string;
  readonly minSeconds: number;
  readonly maxSeconds: number;
  readonly segments: readonly RegionalTravelSegment[];
}

/**
 * Timing uses the authored route beats, not a straight-line shortcut. Every
 * segment begins at a transition-safe spawn or departure and ends at the
 * destination entrance/gate beat. This is also the QA manifest for the two
 * D-010 timing targets.
 */
export const REGIONAL_TRAVEL_TARGETS: readonly RegionalTravelTarget[] = [
  {
    id: "milton_to_reidenbaugh",
    label: "Milton departure to Reidenbaugh entrance",
    minSeconds: 12,
    maxSeconds: 18,
    segments: [
      {
        map: "neighborhood",
        pointIds: [
          "bike_mount_milton", "ryan_depart_00", "ryan_depart_01", "ryan_depart_02", "ryan_depart_03",
          "ryan_depart_04", "ryan_depart_05", "ryan_depart_06", "ryan_depart_07", "ryan_depart_08",
          "ryan_depart_09", "ryan_depart_10", "ryan_depart_11",
        ],
      },
      {
        map: "stonehenge",
        pointIds: [
          "spawn_milton", "stonehenge_route_00", "stonehenge_route_01", "stonehenge_route_02", "stonehenge_route_03",
          "stonehenge_route_04", "stonehenge_route_05", "stonehenge_route_06", "stonehenge_route_07",
          "stonehenge_route_08", "stonehenge_route_09", "stonehenge_route_10", "stonehenge_route_11",
          "stonehenge_route_12",
        ],
      },
    ],
  },
  {
    id: "milton_to_bent_creek",
    label: "Milton departure to Bent Creek gate",
    minSeconds: 6,
    maxSeconds: 10,
    segments: [
      {
        map: "fruitville_pike",
        pointIds: [
          "spawn_milton", "fruitville_route_00", "fruitville_route_01", "fruitville_route_02", "fruitville_route_03",
          "fruitville_route_04", "fruitville_route_05", "fruitville_route_06", "fruitville_route_07", "fruitville_route_08",
        ],
      },
      {
        map: "bent_creek",
        pointIds: ["spawn_gate_exterior", "gate_attendant", "gate_entry"],
      },
    ],
  },
];

export type RegionalTravelPointResolver = (map: MapId, objectId: string) => WorldPoint;

export function polylineDistance(points: readonly WorldPoint[]): number {
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    distance += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return distance;
}

export function regionalTravelDistance(
  target: RegionalTravelTarget,
  resolvePoint: RegionalTravelPointResolver,
): number {
  return target.segments.reduce((total, segment) => {
    if (segment.pointIds.length < 2) throw new Error(`Regional route ${target.id} needs two points per segment`);
    return total + polylineDistance(segment.pointIds.map((id) => resolvePoint(segment.map, id)));
  }, 0);
}

export function regionalTravelSeconds(
  target: RegionalTravelTarget,
  resolvePoint: RegionalTravelPointResolver,
  speedPxPerSecond = REGIONAL_BICYCLE_TUNING.maxSpeed,
): number {
  if (!Number.isFinite(speedPxPerSecond) || speedPxPerSecond <= 0) throw new RangeError("Regional route speed must be positive");
  return regionalTravelDistance(target, resolvePoint) / speedPxPerSecond;
}

export function validateRegionalTravelTargets(
  targets: readonly RegionalTravelTarget[],
  resolvePoint: RegionalTravelPointResolver,
  speedPxPerSecond = REGIONAL_BICYCLE_TUNING.maxSpeed,
): void {
  const ids = new Set<string>();
  for (const target of targets) {
    if (ids.has(target.id)) throw new Error(`Duplicate regional route target ${target.id}`);
    ids.add(target.id);
    if (target.minSeconds <= 0 || target.maxSeconds <= target.minSeconds) {
      throw new Error(`Invalid timing window for ${target.id}`);
    }
    const seconds = regionalTravelSeconds(target, resolvePoint, speedPxPerSecond);
    if (seconds < target.minSeconds || seconds > target.maxSeconds) {
      throw new Error(`${target.id} is ${seconds.toFixed(1)}s, outside ${target.minSeconds}-${target.maxSeconds}s`);
    }
  }
}
