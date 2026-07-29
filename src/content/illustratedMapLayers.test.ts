import { describe, expect, it } from "vitest";

import {
  getIllustratedMapLayers,
  ILLUSTRATED_MAP_LAYERS,
  validateIllustratedMapLayers,
} from "./illustratedMapLayers";
import { MAP_DEFINITIONS } from "./maps";

describe("illustrated map layers", () => {
  it("keeps full illustrated plates in the existing map coordinate spaces", () => {
    expect(getIllustratedMapLayers("neighborhood")).toMatchObject([
      {
        id: "neighborhood_illustrated_master",
        x: 0,
        y: 0,
        width: 2300,
        height: 1500,
      },
    ]);
    expect(getIllustratedMapLayers("creek")).toMatchObject([
      {
        id: "creek_illustrated_master",
        x: 0,
        y: 0,
        width: 2048,
        height: 1536,
      },
      {
        id: "creek_foreground_canopy",
        role: "foreground",
        depth: 55,
      },
    ]);
  });

  it("validates unique image layers and keeps stable interactions with the canonical map", () => {
    expect(() => validateIllustratedMapLayers()).not.toThrow();
    expect(MAP_DEFINITIONS.neighborhood.authoredObjectIds).toEqual([
      "spawn_home",
      "spawn_woods",
      "andrew",
      "billy",
      "jeremy",
      "jeremy_driveway",
      "side_yard_gap",
      "woods_gate",
      "blocked_bent_creek",
      "blocked_stonehenge",
      "blocked_reidenbaugh",
      "blocked_fruitville",
      "ryan_invite",
      "bike_mount_milton",
      "reidenbaugh_exit",
      "ryan_depart_00",
      "ryan_depart_01",
      "ryan_depart_02",
      "ryan_depart_03",
    ]);
    expect(MAP_DEFINITIONS.creek.authoredObjectIds).toEqual([
      "spawn_home",
      "return_neighborhood",
      "creek_tracks",
      "controller",
      "secret",
    ]);
    expect(ILLUSTRATED_MAP_LAYERS[2]?.role).toBe("foreground");
  });
});
