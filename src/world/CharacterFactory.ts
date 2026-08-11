import Phaser from "phaser";
import { type NpcId } from "./characterAssets";

export class CharacterFactory {
  static createNpc(scene: Phaser.Scene, options: { id: NpcId; x: number; y: number; facing?: "down" | "left" | "right" | "up"; depth?: number; scale?: number }): Phaser.GameObjects.Sprite {
    const { id, x, y, facing = "down", depth = y } = options;
    const scale = options.scale ?? (id === "billy" ? 0.26 : 0.2);
    return CharacterFactory.styleNpc(scene.add.sprite(x, y, id), { id, facing, depth, scale });
  }

  static styleNpc<T extends Phaser.GameObjects.Sprite>(
    sprite: T,
    options: { id: NpcId; facing?: "down" | "left" | "right" | "up"; depth?: number; scale?: number },
  ): T {
    const { id, facing = "down", depth = sprite.y } = options;
    const scale = options.scale ?? (id === "billy" ? 0.26 : 0.2);
    sprite.setOrigin(0.5, 0.9).setDepth(depth).setScale(scale);
    sprite.anims.play(`${id}-idle-${facing}`);
    return sprite;
  }
}
