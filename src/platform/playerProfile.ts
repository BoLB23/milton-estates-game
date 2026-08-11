import type { PlayerProfile } from "../game/types";
import type { GamePlatformPlayer } from "./GamePlatformAdapter";
import { PLAYER_PROFILE_APPEARANCE_DEFAULTS } from "../game/playerAvatarAppearance";

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** Translate untrusted SDK fields once, before Phaser sees player identity. */
export function toPlayerProfile(player: GamePlatformPlayer): PlayerProfile {
  return {
    id: player.id,
    nickname: text(player.nickname, text(player.displayName, "Neighbor")),
    haircut: text(player.haircut, PLAYER_PROFILE_APPEARANCE_DEFAULTS.haircut),
    hairColor: text(player.hairColor, PLAYER_PROFILE_APPEARANCE_DEFAULTS.hairColor),
    tshirtColor: text(player.tshirtColor, PLAYER_PROFILE_APPEARANCE_DEFAULTS.tshirtColor),
    pantsColor: text(player.pantsColor, PLAYER_PROFILE_APPEARANCE_DEFAULTS.pantsColor),
    shoeColor: text(player.shoeColor, PLAYER_PROFILE_APPEARANCE_DEFAULTS.shoeColor),
  };
}
