import type { PlayerProfile } from "./types";

export const PLAYER_PROFILE_APPEARANCE_DEFAULTS = {
  haircut: "short",
  hairColor: "brown",
  tshirtColor: "blue",
  pantsColor: "denim",
  shoeColor: "white",
} as const;

export const PLAYER_AVATAR_HAIRCUTS = ["classic", "shaggy", "bowl", "long", "curly"] as const;
export type PlayerAvatarHaircut = (typeof PLAYER_AVATAR_HAIRCUTS)[number];

type LayerColorId = "hair" | "shirt" | "pants" | "shoes";

const HAIRCUT_ALIASES: Record<string, PlayerAvatarHaircut> = {
  short: "classic",
  classic: "classic",
  default: "classic",
  shaggy: "shaggy",
  messy: "shaggy",
  bowl: "bowl",
  bowlcut: "bowl",
  "bowl-cut": "bowl",
  long: "long",
  longhair: "long",
  "long-hair": "long",
  curly: "curly",
  curls: "curly",
} as const;

const LAYER_COLOR_NAMES: Record<LayerColorId, Readonly<Record<string, number>>> = {
  hair: {
    black: 0x2a1f19,
    brown: 0x6a4c34,
    auburn: 0x8a3f2f,
    red: 0xb65a42,
    blonde: 0xd8bb66,
    blond: 0xd8bb66,
    gray: 0x9198a1,
    grey: 0x9198a1,
    white: 0xdedede,
    purple: 0x8c6eb3,
    blue: 0x5c7bb0,
    green: 0x5a9462,
  },
  shirt: {
    blue: 0x5f89c5,
    green: 0x70a666,
    red: 0xc76a5e,
    yellow: 0xd0b162,
    purple: 0x9c7ac6,
    black: 0x3f4144,
    white: 0xdfe4e8,
    gray: 0x8c949d,
    grey: 0x8c949d,
    orange: 0xc7864a,
    pink: 0xc595bf,
    brown: 0x896754,
  },
  pants: {
    denim: 0x4a648a,
    blue: 0x4f719d,
    black: 0x3f454c,
    gray: 0x6f7682,
    grey: 0x6f7682,
    white: 0xc9d0d7,
    brown: 0x6f5647,
    green: 0x5f7a59,
    red: 0x8f4d4d,
  },
  shoes: {
    white: 0xdedede,
    black: 0x2f3338,
    gray: 0x8a8f96,
    grey: 0x8a8f96,
    brown: 0x6f4f37,
    blue: 0x4f6b92,
    red: 0x9b4f43,
    green: 0x5d7f57,
  },
};

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function parseHexColor(value: string): number | undefined {
  const normalized = value.trim().toLowerCase();
  const six = normalized.match(/^#[0-9a-f]{6}$/);
  if (six) return Number.parseInt(normalized.slice(1), 16);
  const three = normalized.match(/^#[0-9a-f]{3}$/);
  if (!three) return undefined;
  const expanded = normalized
    .slice(1)
    .split("")
    .map((digit) => `${digit}${digit}`)
    .join("");
  return Number.parseInt(expanded, 16);
}

function resolveColorName(value: string, layer: LayerColorId): number | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("#")) return parseHexColor(normalized);
  return LAYER_COLOR_NAMES[layer][normalized];
}

export function normalizePlayerHaircut(value: string | undefined): PlayerAvatarHaircut {
  const key = text(value, PLAYER_PROFILE_APPEARANCE_DEFAULTS.haircut).toLowerCase();
  return HAIRCUT_ALIASES[key] ?? "classic";
}

function resolveLayerTint(value: string | undefined, fallback: string, layer: LayerColorId): number | undefined {
  return resolveColorName(text(value, fallback), layer) ?? resolveColorName(fallback, layer);
}

export interface ResolvedPlayerAvatarAppearance {
  haircut: PlayerAvatarHaircut;
  hairTint?: number;
  shirtTint?: number;
  pantsTint?: number;
  shoesTint?: number;
}

export function resolvePlayerAvatarAppearance(
  profile?: Partial<Pick<PlayerProfile, "haircut" | "hairColor" | "tshirtColor" | "pantsColor" | "shoeColor">>,
): ResolvedPlayerAvatarAppearance {
  return {
    haircut: normalizePlayerHaircut(profile?.haircut),
    hairTint: resolveLayerTint(profile?.hairColor, PLAYER_PROFILE_APPEARANCE_DEFAULTS.hairColor, "hair"),
    shirtTint: resolveLayerTint(profile?.tshirtColor, PLAYER_PROFILE_APPEARANCE_DEFAULTS.tshirtColor, "shirt"),
    pantsTint: resolveLayerTint(profile?.pantsColor, PLAYER_PROFILE_APPEARANCE_DEFAULTS.pantsColor, "pants"),
    shoesTint: resolveLayerTint(profile?.shoeColor, PLAYER_PROFILE_APPEARANCE_DEFAULTS.shoeColor, "shoes"),
  };
}
