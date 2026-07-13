import Phaser from "phaser";
import { gameStore } from "../game/GameStore";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create(): void {
    this.makeTextures();
    // Persist migrations and establish an initial autosave before play begins.
    gameStore.saveNow();
    this.scene.launch("ui");
    this.scene.launch("menu");
    this.scene.start(gameStore.getState().currentMap);
  }

  private makeTextures(): void {
    this.makePerson("billy", 0x3e8ed0, 0xf1c27d);
    this.makePerson("andrew", 0xf29f3d, 0xe5b887);
    this.makePerson("jeremy", 0xd85b63, 0xd7a36d);

    const controller = this.make.graphics({ x: 0, y: 0 });
    controller.fillStyle(0x30343b).fillRoundedRect(2, 6, 28, 18, 6);
    controller.fillStyle(0x6b7280).fillCircle(10, 14, 3).fillCircle(22, 14, 3);
    controller.generateTexture("controller", 32, 32).destroy();

    const secret = this.make.graphics({ x: 0, y: 0 });
    secret.fillStyle(0xffd447).fillCircle(12, 12, 10);
    secret.lineStyle(3, 0xfff2a6).strokeCircle(12, 12, 8);
    secret.generateTexture("secret", 24, 24).destroy();
  }

  private makePerson(key: string, shirt: number, skin: number): void {
    const graphics = this.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x342c2a).fillCircle(16, 8, 7);
    graphics.fillStyle(skin).fillCircle(16, 12, 7);
    graphics.fillStyle(shirt).fillRoundedRect(8, 18, 16, 16, 4);
    graphics.fillStyle(0x26364a).fillRect(9, 32, 6, 9).fillRect(18, 32, 6, 9);
    graphics.generateTexture(key, 32, 42).destroy();
  }
}
