import type { MapId } from "../game/types";

export interface RyanWaypointSpec {
  readonly objectId: string;
  readonly mode: "sprint" | "cruise" | "tease";
  readonly waitSafe?: boolean;
  readonly callout?: string;
}

export interface RyanRouteSpec {
  readonly id: string;
  readonly map: MapId;
  readonly waypoints: readonly RyanWaypointSpec[];
  readonly farDistance: number;
  readonly resumeDistance: number;
}

export const NEIGHBORHOOD_DEPARTURE_ROUTE: RyanRouteSpec = {
  id: "milton_departure", map: "neighborhood", farDistance: 470, resumeDistance: 250,
  waypoints: [
    { objectId: "ryan_depart_00", mode: "cruise", waitSafe: true, callout: "This bike handles differently than walking!" },
    { objectId: "ryan_depart_01", mode: "tease" },
    { objectId: "ryan_depart_02", mode: "cruise", waitSafe: true, callout: "I’ll wait at the corner!" },
    { objectId: "ryan_depart_03", mode: "sprint", waitSafe: true },
  ],
};

export const REIDENBAUGH_ROAD_ROUTE: RyanRouteSpec = {
  id: "reidenbaugh_road", map: "reidenbaugh_road", farDistance: 470, resumeDistance: 250,
  waypoints: [
    { objectId: "road_route_00", mode: "cruise", waitSafe: true, callout: "Road trip!" },
    { objectId: "road_route_01", mode: "tease" },
    { objectId: "road_route_02", mode: "cruise", waitSafe: true, callout: "Almost there!" },
    { objectId: "road_route_03", mode: "sprint", waitSafe: true },
  ],
};

export const REIDENBAUGH_CHASE_ROUTES: readonly RyanRouteSpec[] = [
  { id: "chase_a", map: "reidenbaugh", farDistance: 470, resumeDistance: 250, waypoints: [
    { objectId: "chase_a_00", mode: "cruise", waitSafe: true }, { objectId: "chase_a_01", mode: "tease" }, { objectId: "chase_a_02", mode: "sprint", waitSafe: true },
  ] },
  { id: "chase_b", map: "reidenbaugh", farDistance: 470, resumeDistance: 250, waypoints: [
    { objectId: "chase_b_00", mode: "cruise", waitSafe: true }, { objectId: "chase_b_01", mode: "sprint" }, { objectId: "chase_b_02", mode: "tease", waitSafe: true },
  ] },
  { id: "chase_c", map: "reidenbaugh", farDistance: 470, resumeDistance: 250, waypoints: [
    { objectId: "chase_c_00", mode: "cruise", waitSafe: true }, { objectId: "chase_c_01", mode: "tease" }, { objectId: "chase_c_02", mode: "sprint", waitSafe: true },
  ] },
];

/** Validates static authored routes before a Phaser adapter begins moving Ryan. */
export function validateRyanRoute(route: RyanRouteSpec, hasPoint: (id: string) => boolean): void {
  if (route.waypoints.length < 2) throw new Error(`Route ${route.id} needs at least two waypoints`);
  if (route.farDistance <= route.resumeDistance) throw new Error(`Route ${route.id} has invalid catch-up thresholds`);
  const ids = new Set<string>();
  for (const waypoint of route.waypoints) {
    if (ids.has(waypoint.objectId)) throw new Error(`Route ${route.id} repeats ${waypoint.objectId}`);
    if (!hasPoint(waypoint.objectId)) throw new Error(`Route ${route.id} is missing ${waypoint.objectId}`);
    ids.add(waypoint.objectId);
  }
}
