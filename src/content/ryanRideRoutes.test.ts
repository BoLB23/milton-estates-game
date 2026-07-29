import { describe, expect, it } from "vitest";
import { NEIGHBORHOOD_DEPARTURE_ROUTE, validateRyanRoute } from "./ryanRideRoutes";

describe("Ryan ride routes", () => {
  it("requires ordered, resolvable authored waypoints", () => {
    expect(() => validateRyanRoute(NEIGHBORHOOD_DEPARTURE_ROUTE, () => true)).not.toThrow();
    expect(() => validateRyanRoute({ ...NEIGHBORHOOD_DEPARTURE_ROUTE, waypoints: [] }, () => true)).toThrow(/at least two/);
    expect(() => validateRyanRoute(NEIGHBORHOOD_DEPARTURE_ROUTE, () => false)).toThrow(/missing/);
  });
});
