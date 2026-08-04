import Phaser from "phaser";
import { getItemDefinition } from "../content/items";
import { EVENT, gameEvents } from "../game/events";
import { gameStore } from "../game/GameStore";
import type { Interactable } from "../game/types";
import type { TiledPickup, TiledRuntimeWorld } from "./tiledRuntime";

export interface PickupControllerHost {
  world: Phaser.Scene;
  registerInteraction(interactable: Interactable): void;
  unregisterInteraction(id: string): void;
}

/** Mounts stable Tiled pickups and removes them permanently after collection. */
export class PickupController {
  private readonly visuals = new Map<string, Phaser.GameObjects.GameObject>();

  public constructor(private readonly host: PickupControllerHost) {}

  public mount(runtime: TiledRuntimeWorld): void {
    this.dispose();
    for (const pickup of runtime.pickups()) {
      if (gameStore.getState().collectedPickupIds.includes(pickup.id)) continue;
      this.visuals.set(pickup.id, this.createVisual(pickup));
      this.host.registerInteraction({
        id: pickup.id,
        x: pickup.x,
        y: pickup.y,
        label: `Pick up ${getItemDefinition(pickup.itemId).label}`,
        isAvailable: () => !gameStore.getState().collectedPickupIds.includes(pickup.id),
        interact: () => this.collect(pickup),
      });
    }
  }

  public dispose(): void {
    for (const [id, visual] of this.visuals) {
      this.host.unregisterInteraction(id);
      visual.destroy();
    }
    this.visuals.clear();
  }

  private createVisual(pickup: TiledPickup): Phaser.GameObjects.GameObject {
    if (pickup.itemId === "xbox_controller" && this.host.world.textures.exists("controller")) {
      return this.host.world.add.image(pickup.x, pickup.y, "controller").setDepth(35).setScale(1.15);
    }
    const graphic = this.host.world.add.graphics().setDepth(35);
    if (pickup.itemId === "bicycle") {
      graphic.lineStyle(3, 0x24343b, 1)
        .strokeCircle(pickup.x - 13, pickup.y, 9)
        .strokeCircle(pickup.x + 13, pickup.y, 9)
        .lineBetween(pickup.x - 13, pickup.y, pickup.x, pickup.y - 14)
        .lineBetween(pickup.x, pickup.y - 14, pickup.x + 13, pickup.y)
        .lineBetween(pickup.x - 13, pickup.y, pickup.x + 4, pickup.y)
        .lineBetween(pickup.x + 4, pickup.y, pickup.x, pickup.y - 14);
      graphic.fillStyle(0xc84c3f, 1).fillCircle(pickup.x, pickup.y - 14, 3);
    } else {
      graphic.fillStyle(0xe0ad4d, 1).fillCircle(pickup.x, pickup.y, 12);
      graphic.lineStyle(2, 0x8d5f2b, 1).strokeCircle(pickup.x, pickup.y, 12);
      graphic.fillStyle(0xfff0a8, 1).fillCircle(pickup.x - 4, pickup.y - 4, 3);
    }
    return graphic;
  }

  private collect(pickup: TiledPickup): void {
    if (!gameStore.collectPickup(pickup.id, pickup.itemId, pickup.quantity)) return;
    const visual = this.visuals.get(pickup.id);
    visual?.destroy();
    this.visuals.delete(pickup.id);
    this.host.unregisterInteraction(pickup.id);
    gameEvents.emit(EVENT.audioCue, pickup.itemId === "xbox_controller" ? "controllerPickup" : "tokenPickup");
    gameEvents.emit(EVENT.toast, `${getItemDefinition(pickup.itemId).label} added to your backpack.`);
  }
}
