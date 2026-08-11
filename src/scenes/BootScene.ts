import Phaser from "phaser";
import { assetUrl } from "../content/assets";
import { CONTENT_MODULES, validateRegisteredContent } from "../content/registry";
import { initializeTiledMapMarkerCatalog, MAP_DEFINITIONS, type TiledMarkerSource, validateMapDefinitions } from "../content/maps";
import type { MapId } from "../game/types";
import { gamePlatform } from "../platform/integration";
import { COLLISION_GRID_TILE_SIZE } from "../world/tiledRuntime";
import { preloadArt, registerCharacterAnimations } from "../world/characterAssets";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    for (const chapter of CONTENT_MODULES) {
      for (const asset of chapter.assets) {
        if (asset.kind !== "image") throw new Error(`Unsupported chapter catalog asset: ${asset.kind}`);
        this.load.image(asset.key, assetUrl(asset.path));
      }
    }
    // TMJs are small and contain the editable marker catalog. Keep images lazy
    // so entering a regional scene still loads only its artwork plate.
    for (const map of Object.values(MAP_DEFINITIONS)) {
      this.load.tilemapTiledJSON(map.tiledMapKey, assetUrl(map.tiledMapPath));
    }
    // Creek remains warm so its long-standing quest handoff is unchanged;
    // Milton is the first playable region.
    for (const map of [MAP_DEFINITIONS.creek, MAP_DEFINITIONS.neighborhood]) {
      for (const layer of map.layers) this.load.image(layer.textureKey, layer.imagePath);
    }
    preloadArt(this);
  }

  create(): void {
    initializeTiledMapMarkerCatalog(Object.fromEntries(Object.values(MAP_DEFINITIONS).map((map) => [
      map.id,
      (this.cache.tilemap.get(map.tiledMapKey) as unknown as { data?: TiledMarkerSource } | undefined)?.data,
    ])) as Partial<Record<MapId, TiledMarkerSource>>);
    validateRegisteredContent(new Set(Object.keys(MAP_DEFINITIONS) as MapId[]));
    validateMapDefinitions();
    this.makeTextures();
    this.makePlayerAnimations();
    (["billy", "andrew", "jeremy", "ryan", "mickey", "schwartz"] as const).forEach((id) => registerCharacterAnimations(this, id));
    this.makeBikeAnimations();
    this.scene.launch("input-router");
    // Login and cloud-slot selection happen in FrontEndScene. Never stamp a
    // browser-default save before that authenticated choice is complete.
    void gamePlatform.initializeIdentity();
    this.scene.start("front-end");
  }

  private makeTextures(): void {
    const collisionGrid = this.make.graphics({ x: 0, y: 0 });
    collisionGrid.fillStyle(0xffffff, 1).fillRect(0, 0, COLLISION_GRID_TILE_SIZE, COLLISION_GRID_TILE_SIZE);
    collisionGrid.generateTexture("map.collision-grid", COLLISION_GRID_TILE_SIZE, COLLISION_GRID_TILE_SIZE).destroy();

    const controller = this.make.graphics({ x: 0, y: 0 });
    controller.fillStyle(0x182127).fillRoundedRect(2, 8, 28, 18, 7);
    controller.fillStyle(0x39444d).fillRoundedRect(3, 6, 26, 16, 6);
    controller.fillStyle(0x11181d).fillCircle(10, 14, 4).fillCircle(22, 14, 4);
    controller.fillStyle(0x87929a).fillRect(8, 11, 4, 7).fillRect(6, 13, 8, 3);
    controller.fillStyle(0x78b85f).fillCircle(24, 11, 2);
    controller.fillStyle(0xe9b74a).fillCircle(27, 15, 2);
    controller.fillStyle(0x6d7a82).fillCircle(16, 10, 2);
    controller.generateTexture("controller", 32, 32).destroy();

    const secret = this.make.graphics({ x: 0, y: 0 });
    secret.fillStyle(0x704b24).fillCircle(12, 13, 11);
    secret.fillStyle(0xd9a53d).fillCircle(12, 11, 10);
    secret.fillStyle(0xf4d66d).fillCircle(9, 8, 6);
    secret.lineStyle(2, 0x8d5f2b).strokeCircle(12, 11, 7);
    secret.fillStyle(0x8d5f2b).fillRect(10, 6, 4, 10).fillRect(7, 9, 10, 4);
    secret.generateTexture("secret", 24, 24).destroy();

    const mushroom = this.make.graphics({ x: 0, y: 0 });
    mushroom.fillStyle(0x6b3c2c).fillRoundedRect(11, 17, 7, 12, 3);
    mushroom.fillStyle(0xb9433e).fillEllipse(14, 14, 25, 17);
    mushroom.fillStyle(0xe6785b).fillEllipse(14, 12, 18, 10);
    mushroom.fillStyle(0xffe8b0).fillCircle(9, 11, 2).fillCircle(15, 8, 2).fillCircle(19, 13, 2);
    mushroom.generateTexture("mushroom", 28, 32).destroy();
  }

  private makePlayerAnimations(): void {
    const makeWalk = (key: string, frames: number[]) => {
      this.anims.create({
        key,
        frames: frames.map((frame) => ({ key: "player", frame })),
        frameRate: 7,
        repeat: -1,
      });
    };
    const makeIdle = (key: string, frame: number) => {
      this.anims.create({ key, frames: [{ key: "player", frame }] });
    };

    makeIdle("player-idle-down", 0);
    makeWalk("player-walk-down", [0, 1, 2]);
    makeIdle("player-idle-side", 3);
    makeWalk("player-walk-side", [3, 4, 5]);
    makeIdle("player-idle-up", 6);
    makeWalk("player-walk-up", [6, 7, 8]);
  }

  /** Bike presentation reuses the playable character's four-direction sheet. */
  private makeBikeAnimations(): void {
    const make = (key: string, frames: number[], moving: boolean) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: frames.map((frame) => ({ key: "player", frame })),
        frameRate: moving ? 10 : 1,
        repeat: moving ? -1 : 0,
      });
    };
    make("player-bike-idle-down", [0], false);
    make("player-bike-ride-down", [0, 1], true);
    make("player-bike-idle-side", [4], false);
    make("player-bike-ride-side", [4, 5], true);
    make("player-bike-idle-up", [6], false);
    make("player-bike-ride-up", [6, 7], true);
    for (const facing of ["down", "side", "up"] as const) {
      for (const state of ["idle", "ride"] as const) {
        const key = `ryan-bike-${state}-${facing}`;
        if (!this.anims.exists(key)) {
          this.anims.create({ key, frames: [{ key: "ryan" }], frameRate: 1, repeat: state === "ride" ? -1 : 0 });
        }
      }
    }
  }

}
