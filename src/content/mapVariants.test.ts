import { describe, expect, it } from "vitest";

import { getMapVariant, MAP_VARIANTS } from "./mapVariants";

describe("map variants", () => {
  it("registers one shallow overlay per Missing Controller map", () => {
    expect(MAP_VARIANTS.map((variant) => variant.mapId)).toEqual(["neighborhood", "creek"]);
    expect(getMapVariant("neighborhood", "missing_controller")).toMatchObject({
      id: "missing_controller_neighborhood",
      timeOfDay: "summer_afternoon",
      ambience: "neighborhood_summer",
    });
  });

  it("fails clearly when content has no configured overlay", () => {
    expect(() => getMapVariant("creek", "storm_drain_detectives")).toThrow(RangeError);
  });
});
