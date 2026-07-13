import { describe, expect, it } from "vitest";

import {
  getIllustratedMapLayers,
  ILLUSTRATED_MAP_LAYERS,
  validateIllustratedMapLayers,
} from "./illustratedMapLayers";

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

  it("validates unique image layers and preserves the stable interaction contract", () => {
    expect(() => validateIllustratedMapLayers()).not.toThrow();
    expect(ILLUSTRATED_MAP_LAYERS[0]?.stableObjectIds).toEqual([
      "spawn_home",
      "spawn_woods",
      "andrew",
      "jeremy",
      "side_yard_gap",
      "woods_gate",
      "blocked_bent_creek",
      "blocked_stonehenge",
      "blocked_reidenbaugh",
      "blocked_fruitville",
    ]);
    expect(ILLUSTRATED_MAP_LAYERS[1]?.stableObjectIds).toEqual([
      "spawn_home",
      "return_neighborhood",
      "creek_tracks",
      "controller",
      "secret",
    ]);
    expect(ILLUSTRATED_MAP_LAYERS[2]?.stableObjectIds).toBeUndefined();
  });
});
