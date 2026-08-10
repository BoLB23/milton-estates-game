import type { PlayerProfile } from "../game/types";
import type { GamePlatformPlayer } from "./GamePlatformAdapter";

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** Translate untrusted SDK fields once, before Phaser sees player identity. */
export function toPlayerProfile(player: GamePlatformPlayer): PlayerProfile {
  return {
    id: player.id,
    nickname: text(player.nickname, text(player.displayName, "Neighbor")),
    haircut: text(player.haircut, "short"),
    hairColor: text(player.hairColor, "brown"),
    tshirtColor: text(player.tshirtColor, "blue"),
    pantsColor: text(player.pantsColor, "denim"),
    shoeColor: text(player.shoeColor, "white"),
  };
}
