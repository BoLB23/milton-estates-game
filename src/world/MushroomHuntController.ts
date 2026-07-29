import Phaser from "phaser";
import { EVENT, gameEvents } from "../game/events";
import { MUSHROOM_COUNT, gameStore } from "../game/GameStore";
import type { MapId } from "../game/types";
import type { ExplorationInteractionHost } from "./contracts";

/** Owns the transient mushroom sprites and their matching world interactions. */
export class MushroomHuntController {
  private readonly pickups = new Map<string, Phaser.GameObjects.Image>();

  public constructor(private readonly host: ExplorationInteractionHost) {}

  public mount(map: Extract<MapId, "neighborhood" | "creek">): void {
    this.dispose();
    const state = gameStore.getState();
    if (state.activeQuestId !== "andrew_mushroom_hunt"
      || state.questProgress.mushrooms.stage !== "search_mushrooms") return;

    for (const spawn of gameStore.getMushroomSpawns(map)) {
      if (state.questProgress.mushrooms.collectedIds.includes(spawn.id)) continue;
      const mushroom = this.host.world.add.image(spawn.x, spawn.y, "mushroom").setDepth(35).setScale(1.1);
      if (!gameStore.getState().settings.reducedMotion) {
        this.host.world.tweens.add({
          targets: mushroom,
          y: spawn.y - 4,
          duration: 900 + (spawn.x % 240),
          yoyo: true,
          repeat: -1,
          ease: "Sine.inOut",
        });
      }
      this.pickups.set(spawn.id, mushroom);
      this.host.registerInteraction({
        id: spawn.id,
        x: spawn.x,
        y: spawn.y,
        label: "Pick a mushroom",
        isAvailable: () => gameStore.isMushroomCollectible(spawn.id),
        interact: () => this.collect(spawn.id),
      });
    }
  }

  public dispose(): void {
    for (const [id, pickup] of this.pickups) {
      this.host.unregisterInteraction(id);
      this.host.world.tweens.killTweensOf(pickup);
      pickup.destroy();
    }
    this.pickups.clear();
  }

  private collect(id: string): void {
    if (!gameStore.collectMushroom(id)) return;
    const mushroom = this.pickups.get(id);
    if (mushroom) {
      this.host.world.tweens.killTweensOf(mushroom);
      mushroom.destroy();
      this.pickups.delete(id);
    }
    this.host.unregisterInteraction(id);
    const count = gameStore.getState().questProgress.mushrooms.collectedIds.length;
    this.host.showDialogue([{ speaker: "Billy", text: "A mushroom! Andrew is going to love this little forest treasure." }], () => {
      gameEvents.emit(
        EVENT.toast,
        count === MUSHROOM_COUNT
          ? "All 10 mushrooms found. Take one to Jeremy, one to Billy's house, and the last 8 to Andrew."
          : `Mushroom found: ${count} / ${MUSHROOM_COUNT}`,
      );
    });
  }
}
