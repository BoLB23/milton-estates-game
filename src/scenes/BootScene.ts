import Phaser from "phaser";
import { ILLUSTRATED_MAP_LAYERS, validateIllustratedMapLayers } from "../content/illustratedMapLayers";
import { gameStore } from "../game/GameStore";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    this.load.image("chapter-1-cover", "/assets/concepts/chapter-1-neighborhood-concept.png");
    this.load.image("chapter-quest-browser-target", "/assets/concepts/phase-a/chapter-quest-browser-target.png");
    this.load.image("regional-foldout-map", "/assets/concepts/phase-a/regional-foldout-map-target.png");
    for (const layer of ILLUSTRATED_MAP_LAYERS) this.load.image(layer.textureKey, layer.imagePath);
    this.load.spritesheet("billy", "/assets/characters/billy-hd-movement.png", {
      frameWidth: 400,
      frameHeight: 450,
    });
  }

  create(): void {
    validateIllustratedMapLayers();
    this.makeTextures();
    this.makeBillyAnimations();
    this.scene.launch("input-router");
    // Persist migrations and establish an initial autosave before play begins.
    gameStore.saveNow();
    this.scene.start("front-end");
  }

  private makeTextures(): void {
    this.makePerson("andrew", 0xf29f3d, 0xe5b887);
    this.makePerson("jeremy", 0xd85b63, 0xd7a36d);

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
  }

  private makeBillyAnimations(): void {
    const makeWalk = (key: string, frames: number[]) => {
      this.anims.create({
        key,
        frames: frames.map((frame) => ({ key: "billy", frame })),
        frameRate: 7,
        repeat: -1,
      });
    };
    const makeIdle = (key: string, frame: number) => {
      this.anims.create({ key, frames: [{ key: "billy", frame }] });
    };

    makeIdle("billy-idle-down", 0);
    makeWalk("billy-walk-down", [0, 1]);
    makeIdle("billy-idle-side", 4);
    makeWalk("billy-walk-side", [4, 5]);
    makeIdle("billy-idle-up", 6);
    makeWalk("billy-walk-up", [6, 7]);
  }

  private makePerson(key: string, shirt: number, skin: number): void {
    const graphics = this.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x173026, 0.24).fillEllipse(17, 39, 25, 7);
    graphics.fillStyle(0x2b2524).fillRect(9, 5, 15, 10).fillRect(7, 9, 4, 7);
    graphics.fillStyle(skin).fillRoundedRect(10, 9, 13, 11, 4);
    graphics.fillStyle(0x443129).fillRect(9, 8, 14, 4).fillRect(20, 6, 4, 6);
    graphics.fillStyle(0x28343a).fillRect(12, 13, 2, 2).fillRect(19, 13, 2, 2);
    graphics.fillStyle(0x8f5e48).fillRect(15, 17, 4, 2);
    graphics.fillStyle(0x1b272b).fillRoundedRect(7, 19, 19, 17, 4);
    graphics.fillStyle(shirt).fillRoundedRect(8, 18, 16, 16, 4);
    graphics.fillStyle(0xffffff, 0.22).fillRect(10, 20, 3, 10);
    graphics.fillStyle(skin).fillRect(5, 22, 4, 11).fillRect(24, 22, 4, 11);
    graphics.fillStyle(0x26364a).fillRect(9, 32, 6, 8).fillRect(18, 32, 6, 8);
    graphics.fillStyle(0x26282b).fillRect(8, 39, 8, 3).fillRect(18, 39, 8, 3);
    graphics.generateTexture(key, 32, 42).destroy();
  }
}
