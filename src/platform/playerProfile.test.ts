import { describe, expect, it } from "vitest";
import { toPlayerProfile } from "./playerProfile";

describe("toPlayerProfile", () => {
  it("preserves legacy appearance defaults when SDK fields are missing", () => {
    expect(toPlayerProfile({ id: "player-1" })).toEqual({
      id: "player-1",
      nickname: "Neighbor",
      haircut: "short",
      hairColor: "brown",
      tshirtColor: "blue",
      pantsColor: "denim",
      shoeColor: "white",
    });
  });

  it("trims identity fields before storing the profile", () => {
    expect(toPlayerProfile({
      id: "player-2",
      displayName: "  Display Name  ",
      nickname: "  Casey  ",
      haircut: " shaggy ",
      hairColor: " #123abc ",
      tshirtColor: " green ",
      pantsColor: " blue ",
      shoeColor: " black ",
    })).toMatchObject({
      id: "player-2",
      nickname: "Casey",
      haircut: "shaggy",
      hairColor: "#123abc",
      tshirtColor: "green",
      pantsColor: "blue",
      shoeColor: "black",
    });
  });
});
