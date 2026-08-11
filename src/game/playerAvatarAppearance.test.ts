import { describe, expect, it } from "vitest";
import {
  PLAYER_PROFILE_APPEARANCE_DEFAULTS,
  normalizePlayerHaircut,
  resolvePlayerAvatarAppearance,
} from "./playerAvatarAppearance";

describe("player avatar appearance resolution", () => {
  it("maps legacy haircut aliases to supported layer IDs", () => {
    expect(normalizePlayerHaircut("short")).toBe("classic");
    expect(normalizePlayerHaircut("bowlcut")).toBe("bowl");
    expect(normalizePlayerHaircut("long-hair")).toBe("long");
    expect(normalizePlayerHaircut("curls")).toBe("curly");
    expect(normalizePlayerHaircut("unknown-style")).toBe("classic");
  });

  it("resolves layer tints independently from profile fields", () => {
    expect(resolvePlayerAvatarAppearance({
      haircut: "curly",
      hairColor: "#1a2b3c",
      tshirtColor: "green",
      pantsColor: "denim",
      shoeColor: "black",
    })).toEqual({
      haircut: "curly",
      hairTint: 0x1a2b3c,
      shirtTint: 0x70a666,
      pantsTint: 0x4a648a,
      shoesTint: 0x2f3338,
    });
  });

  it("keeps legacy defaults when values are missing or invalid", () => {
    const resolved = resolvePlayerAvatarAppearance({
      haircut: "",
      hairColor: "???",
      tshirtColor: "",
      pantsColor: "not-a-color",
      shoeColor: "",
    });
    expect(resolved.haircut).toBe("classic");
    expect(resolved.hairTint).toBe(0x6a4c34);
    expect(resolved.shirtTint).toBe(0x5f89c5);
    expect(resolved.pantsTint).toBe(0x4a648a);
    expect(resolved.shoesTint).toBe(0xdedede);

    expect(resolvePlayerAvatarAppearance()).toEqual({
      haircut: "classic",
      hairTint: 0x6a4c34,
      shirtTint: 0x5f89c5,
      pantsTint: 0x4a648a,
      shoesTint: 0xdedede,
    });
    expect(PLAYER_PROFILE_APPEARANCE_DEFAULTS.haircut).toBe("short");
  });
});
