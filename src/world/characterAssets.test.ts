import { describe, expect, it } from "vitest";
import { CharacterAssets, PLAYER_HAIR_TEXTURE_KEYS, registerCharacterAnimations } from "./characterAssets";

describe("character art registry", () => {
  it("keeps every named NPC on the shared directional contract", () => {
    const created: Array<{ key: string; frames: Array<{ key: string; frame: number }> }> = [];
    const scene = {
      anims: {
        exists: () => false,
        create: (config: { key: string; frames: Array<{ key: string; frame: number }> }) => { created.push(config); },
      },
    } as never;
    for (const id of Object.keys(CharacterAssets) as Array<keyof typeof CharacterAssets>) registerCharacterAnimations(scene, id);

    expect(created).toHaveLength(48);
    expect(created.find((animation) => animation.key === "billy-walk-down")?.frames.map((frame) => frame.frame)).toEqual([0, 1, 2]);
    expect(created.find((animation) => animation.key === "mickey-walk-up")?.frames.map((frame) => frame.frame)).toEqual([9, 10, 11]);
    expect(created.find((animation) => animation.key === "andrew-walk-left")?.frames.map((frame) => frame.frame)).toEqual([3, 4, 5]);
  });

  it("registers all player hairstyles without a Billy texture dependency", () => {
    expect(Object.values(PLAYER_HAIR_TEXTURE_KEYS)).toEqual([
      "player-hair-classic", "player-hair-shaggy", "player-hair-bowl", "player-hair-long", "player-hair-curly",
    ]);
    const legacyBillyTexture = ["assets/characters", "billy-hd-movement.png"].join("/");
    expect(Object.values(CharacterAssets)).not.toContain(legacyBillyTexture);
  });
});
