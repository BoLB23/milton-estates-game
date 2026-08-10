import { describe, expect, it } from "vitest";
import {
  MAP_DEFINITIONS,
  getMapDefinition,
  initializeTiledMapMarkerCatalog,
  normalizeWorldMapPoint,
  parseTiledMapMarkers,
  resetTiledMapMarkerCatalog,
  updateTiledMapMarkerCatalog,
  selectActiveObjectiveMarker,
  selectVisibleMapMarkers,
} from "./maps";

describe("map content", () => {
  it("reads editable marker objects and uses their authored coordinates", () => {
    const map = MAP_DEFINITIONS.neighborhood;
    const markers = parseTiledMapMarkers(map, {
      width: 90, height: 68, tilewidth: 16, tileheight: 16,
      layers: [{ name: "map-markers", type: "objectgroup", objects: [{
        name: "marker_test", x: 720, y: 544,
        properties: [
          { name: "markerId", value: "test_marker" },
          { name: "markerKind", value: "objective" },
          { name: "markerLabel", value: "Test objective" },
          { name: "questId", value: "missing_controller" },
          { name: "stages", value: "talk_to_jeremy, return_to_jeremy" },
        ],
      }] }],
    });
    expect(markers).toEqual([expect.objectContaining({
      id: "test_marker", kind: "objective", x: 0.5, y: 0.5,
      stages: ["talk_to_jeremy", "return_to_jeremy"],
    })]);
  });

  it("uses the initialized TMJ marker catalog while retaining a fallback", () => {
    initializeTiledMapMarkerCatalog({ creek: {
      width: 2048, height: 1536, tilewidth: 1, tileheight: 1,
      layers: [{ name: "map-markers", type: "objectgroup", objects: [{
        name: "marker_runtime", x: 1024, y: 768,
        properties: [
          { name: "markerKind", value: "objective" },
          { name: "markerLabel", value: "Runtime marker" },
          { name: "questId", value: "missing_controller" },
          { name: "stages", value: "search_creek" },
        ],
      }] }],
    } });
    expect(selectActiveObjectiveMarker({ currentMap: "creek", questId: "missing_controller", stage: "search_creek", discoveredIds: [] })?.id).toBe("marker_runtime");
    resetTiledMapMarkerCatalog();
    expect(selectActiveObjectiveMarker({ currentMap: "creek", questId: "missing_controller", stage: "search_creek", discoveredIds: [] })?.id).toBe("obj_controller");
  });

  it("refreshes one playtested map without discarding other loaded marker catalogs", () => {
    const source = (label: string) => ({ width: 100, height: 100, tilewidth: 1, tileheight: 1, layers: [{
      name: "map-markers", type: "objectgroup", objects: [{ name: `marker_${label}`, x: 50, y: 50, properties: [
        { name: "markerKind", value: "landmark" }, { name: "markerLabel", value: label }, { name: "initiallyVisible", value: true },
      ] }],
    }] });
    initializeTiledMapMarkerCatalog({ neighborhood: source("before"), creek: source("creek") });
    updateTiledMapMarkerCatalog("neighborhood", source("after"));
    expect(selectVisibleMapMarkers({ currentMap: "neighborhood", questId: "missing_controller", stage: "complete", discoveredIds: [] })[0]?.label).toBe("after");
    expect(selectVisibleMapMarkers({ currentMap: "creek", questId: "missing_controller", stage: "complete", discoveredIds: [] })[0]?.label).toBe("creek");
    resetTiledMapMarkerCatalog();
  });

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
      questId: "missing_controller",
      stage: "talk_to_jeremy",
      discoveredIds: [],
    });

    expect(markers.map(({ id }) => id)).toEqual([
      "player_home",
      "creek_woods",
      "stonehenge_exit",
      "fruitville_exit",
      "obj_jeremy",
    ]);
  });

  it("reveals discovered landmarks without mutating discovery input", () => {
    const discovered = ["jeremy_home"] as const;
    const markers = selectVisibleMapMarkers({
      currentMap: "neighborhood",
      questId: "missing_controller",
      stage: "complete",
      discoveredIds: discovered,
    });

    expect(markers.map(({ id }) => id)).toContain("jeremy_home");
    expect(discovered).toEqual(["jeremy_home"]);
  });

  it("selects only the objective for the supplied map and quest stage", () => {
    expect(selectActiveObjectiveMarker({
      currentMap: "creek",
      questId: "missing_controller",
      stage: "search_creek",
      discoveredIds: new Set(),
    })?.id).toBe("obj_controller");

    expect(selectActiveObjectiveMarker({
      currentMap: "creek",
      questId: "missing_controller",
      stage: "complete",
      discoveredIds: [],
    })).toBeUndefined();
  });

  it("does not reveal another quest's objective when stage names overlap", () => {
    expect(selectActiveObjectiveMarker({
      currentMap: "creek",
      questId: "andrew_mushroom_hunt",
      stage: "search_creek",
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
