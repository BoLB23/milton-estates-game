import { describe, expect, it } from "vitest";
import {
  MAP_DEFINITIONS,
  getMapDefinition,
  normalizeWorldMapPoint,
  selectActiveObjectiveMarker,
  selectVisibleMapMarkers,
} from "./maps";

describe("map content", () => {
  it("keeps every configured marker inside normalized map bounds", () => {
    for (const map of Object.values(MAP_DEFINITIONS)) {
      expect(map.worldWidth).toBeGreaterThan(0);
      expect(map.worldHeight).toBeGreaterThan(0);
      for (const marker of map.markers) {
        expect(marker.x).toBeGreaterThanOrEqual(0);
        expect(marker.x).toBeLessThanOrEqual(1);
        expect(marker.y).toBeGreaterThanOrEqual(0);
        expect(marker.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it("always shows exits and initially visible landmarks", () => {
    const markers = selectVisibleMapMarkers({
      currentMap: "neighborhood",
      stage: "talk_to_jeremy",
      discoveredIds: [],
    });

    expect(markers.map(({ id }) => id)).toEqual([
      "billy_home",
      "creek_woods",
      "obj_jeremy",
    ]);
  });

  it("reveals discovered landmarks without mutating discovery input", () => {
    const discovered = ["jeremy_home"] as const;
    const markers = selectVisibleMapMarkers({
      currentMap: "neighborhood",
      stage: "complete",
      discoveredIds: discovered,
    });

    expect(markers.map(({ id }) => id)).toContain("jeremy_home");
    expect(discovered).toEqual(["jeremy_home"]);
  });

  it("selects only the objective for the supplied map and quest stage", () => {
    expect(selectActiveObjectiveMarker({
      currentMap: "creek",
      stage: "search_creek",
      discoveredIds: new Set(),
    })?.id).toBe("obj_controller");

    expect(selectActiveObjectiveMarker({
      currentMap: "creek",
      stage: "complete",
      discoveredIds: [],
    })).toBeUndefined();
  });

  it("provides stable world metadata for menu projection", () => {
    expect(getMapDefinition("creek")).toMatchObject({
      label: "Creek Woods",
      worldWidth: 2048,
      worldHeight: 1536,
    });
  });

  it("normalizes and clamps exact world positions for the regional fold-out", () => {
    const map = getMapDefinition("creek");
    expect(normalizeWorldMapPoint(map, { x: 1024, y: 768 })).toEqual({ x: 0.5, y: 0.5 });
    expect(normalizeWorldMapPoint(map, { x: -12, y: 9_999 })).toEqual({ x: 0, y: 1 });
  });
});
