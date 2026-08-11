import Phaser from "phaser";
import { assetUrl } from "../content/assets";
import type { PlayerAvatarHaircut } from "../game/playerAvatarAppearance";

export const CharacterAssets = {
  billy: "assets/characters/npcs/billy.png",
  andrew: "assets/characters/npcs/andrew.png",
  jeremy: "assets/characters/npcs/jeremy.png",
  ryan: "assets/characters/npcs/ryan.png",
  mickey: "assets/characters/npcs/mickey.png",
  schwartz: "assets/characters/npcs/schwartz.png",
} as const;

export type NpcId = keyof typeof CharacterAssets;

export const PlayerAssets = {
  body: "assets/characters/player/body.png",
  shirt: "assets/characters/player/shirt.png",
  pants: "assets/characters/player/pants.png",
  shoes: "assets/characters/player/shoes.png",
  hairClassic: "assets/characters/player/hair-classic.png",
  hairShaggy: "assets/characters/player/hair-shaggy.png",
  hairBowl: "assets/characters/player/hair-bowl.png",
  hairLong: "assets/characters/player/hair-long.png",
  hairCurly: "assets/characters/player/hair-curly.png",
} as const;

export const PLAYER_BODY_TEXTURE_KEY = "player";
export const PLAYER_SHIRT_TEXTURE_KEY = "player-shirt";
export const PLAYER_PANTS_TEXTURE_KEY = "player-pants";
export const PLAYER_SHOES_TEXTURE_KEY = "player-shoes";
export const PLAYER_HAIR_TEXTURE_KEYS: Record<PlayerAvatarHaircut, string> = {
  classic: "player-hair-classic",
  shaggy: "player-hair-shaggy",
  bowl: "player-hair-bowl",
  long: "player-hair-long",
  curly: "player-hair-curly",
};

export const PLAYER_SPRITESHEET_FRAME = { frameWidth: 128, frameHeight: 140 } as const;
export const NPC_SPRITESHEET_FRAME = { frameWidth: 128, frameHeight: 256 } as const;

export const VehicleAssets = {
  down: "assets/vehicles/mickey-car-down.png", left: "assets/vehicles/mickey-car-left.png",
  right: "assets/vehicles/mickey-car-right.png", up: "assets/vehicles/mickey-car-up.png",
} as const;
export const ClubhouseAssets = {
  frame: "assets/creek-clubhouse/clubhouse-frame.png", halfBuilt: "assets/creek-clubhouse/clubhouse-half-built.png",
  complete: "assets/creek-clubhouse/clubhouse-complete.png", flag: "assets/creek-clubhouse/props/flag.png",
} as const;

export function preloadArt(scene: Phaser.Scene): void {
  for (const [id, path] of Object.entries(CharacterAssets)) {
    scene.load.spritesheet(id, assetUrl(path), NPC_SPRITESHEET_FRAME);
  }
  scene.load.spritesheet(PLAYER_BODY_TEXTURE_KEY, assetUrl(PlayerAssets.body), PLAYER_SPRITESHEET_FRAME);
  scene.load.spritesheet(PLAYER_SHIRT_TEXTURE_KEY, assetUrl(PlayerAssets.shirt), PLAYER_SPRITESHEET_FRAME);
  scene.load.spritesheet(PLAYER_PANTS_TEXTURE_KEY, assetUrl(PlayerAssets.pants), PLAYER_SPRITESHEET_FRAME);
  scene.load.spritesheet(PLAYER_SHOES_TEXTURE_KEY, assetUrl(PlayerAssets.shoes), PLAYER_SPRITESHEET_FRAME);
  scene.load.spritesheet(PLAYER_HAIR_TEXTURE_KEYS.classic, assetUrl(PlayerAssets.hairClassic), PLAYER_SPRITESHEET_FRAME);
  scene.load.spritesheet(PLAYER_HAIR_TEXTURE_KEYS.shaggy, assetUrl(PlayerAssets.hairShaggy), PLAYER_SPRITESHEET_FRAME);
  scene.load.spritesheet(PLAYER_HAIR_TEXTURE_KEYS.bowl, assetUrl(PlayerAssets.hairBowl), PLAYER_SPRITESHEET_FRAME);
  scene.load.spritesheet(PLAYER_HAIR_TEXTURE_KEYS.long, assetUrl(PlayerAssets.hairLong), PLAYER_SPRITESHEET_FRAME);
  scene.load.spritesheet(PLAYER_HAIR_TEXTURE_KEYS.curly, assetUrl(PlayerAssets.hairCurly), PLAYER_SPRITESHEET_FRAME);
  for (const [facing, path] of Object.entries(VehicleAssets)) scene.load.image(`mickey-car-${facing}`, assetUrl(path));
  for (const [state, path] of Object.entries(ClubhouseAssets)) scene.load.image(`clubhouse-${state}`, assetUrl(path));
}

export function registerCharacterAnimations(scene: Phaser.Scene, id: NpcId): void {
  const directions = ["down", "left", "right", "up"] as const;
  directions.forEach((direction, row) => {
    const idle = `${id}-idle-${direction}`;
    const walk = `${id}-walk-${direction}`;
    const firstFrame = row * 3;
    if (!scene.anims.exists(idle)) scene.anims.create({ key: idle, frames: [{ key: id, frame: firstFrame }] });
    if (!scene.anims.exists(walk)) scene.anims.create({
      key: walk,
      frames: [firstFrame, firstFrame + 1, firstFrame + 2].map((frame) => ({ key: id, frame })),
      frameRate: 7,
      repeat: -1,
    });
  });
}
