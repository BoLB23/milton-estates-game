import { describe, expect, it } from "vitest";
import { CharacterAssets, PLAYER_HAIR_TEXTURE_KEYS, registerCharacterAnimations } from "./characterAssets";
import { CharacterFactory } from "./CharacterFactory";

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

  it("selects a directional NPC frame before starting its idle animation", () => {
    const calls: string[] = [];
    const sprite = {
      y: 20,
      setOrigin: () => { calls.push("origin"); return sprite; },
      setDepth: () => { calls.push("depth"); return sprite; },
      setScale: () => { calls.push("scale"); return sprite; },
      setFrame: (frame: number) => { calls.push(`frame:${frame}`); return sprite; },
      anims: { play: (key: string) => calls.push(`play:${key}`) },
    };

    CharacterFactory.styleNpc(sprite as never, { id: "andrew" });

    expect(calls).toEqual(["origin", "depth", "scale", "frame:0", "play:andrew-idle-down"]);
  });
});
