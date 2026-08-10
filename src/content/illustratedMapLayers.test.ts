import { describe, expect, it } from "vitest";

import {
  getIllustratedMapLayers,
  ILLUSTRATED_MAP_LAYERS,
  validateIllustratedMapLayers,
} from "./illustratedMapLayers";
import { MAP_DEFINITIONS } from "./maps";

describe("illustrated map layers", () => {
  it("keeps full illustrated plates in their authored map coordinate spaces", () => {
    expect(getIllustratedMapLayers("neighborhood")).toMatchObject([
      {
        id: "neighborhood_illustrated_master",
        x: 0,
        y: 0,
        width: 1440,
        height: 1088,
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
      "spawn_stonehenge",
      "spawn_fruitville",
      "woods_gate",
      "exit_stonehenge",
      "exit_fruitville",
      "andrew",
      "player_house",
      "player_home",
      "home_storage",
      "billy",
      "jeremy",
      "ryan",
      "jeremy_driveway",
      "side_yard_gap",
      "blocked_bent_creek",
      "blocked_stonehenge",
      "blocked_reidenbaugh",
      "blocked_fruitville",
      "ryan_invite",
      "bike_mount_milton",
      "ryan_depart_00",
      "ryan_depart_01",
      "ryan_depart_02",
      "ryan_depart_03",
      "ryan_depart_04",
      "ryan_depart_05",
      "ryan_depart_06",
      "ryan_depart_07",
      "ryan_depart_08",
      "ryan_depart_09",
      "ryan_depart_10",
      "ryan_depart_11",
      "andrew_house",
      "player_house_footprint",
      "billy_house",
      "jeremy_house",
      "move_in_start",
      "move_in_end",
      "qa_home_route",
      "qa_stonehenge_route",
      "qa_fruitville_route",
      "pickup_milton_field_token_01",
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
