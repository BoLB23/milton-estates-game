import type Phaser from "phaser";

import { gameStore } from "../../../../../../game/GameStore";
import type {
  NeighborhoodQuestHost,
  QuestRuntimeBinding,
} from "../../../../../../world/contracts";
import { getMushroomDialogue, type MushroomDialogueId } from "../dialogue";
import {
  advanceMushroomStage,
  type MushroomQuestEvent,
} from "../rules";

const INTERACTION_IDS = ["jeremy", "billy_home", "andrew"] as const;

/** Neighborhood actors and handoffs owned only by Andrew's Mushroom Hunt. */
export class MushroomNeighborhoodBinding implements QuestRuntimeBinding {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];

  public constructor(private readonly host: NeighborhoodQuestHost) {}

  public mount(): void {
    this.dispose();
    const state = gameStore.getState();
    if (state.activeQuestId !== "andrew_mushroom_hunt") return;
    this.renderCharacters();
    this.registerHandoffs();
  }

  public dispose(): void {
    for (const object of this.objects) object.destroy();
    this.objects.length = 0;
    for (const id of INTERACTION_IDS) {
      this.host.unregisterInteraction(id);
      this.host.unregisterRegionInteraction(id);
    }
  }

  private renderCharacters(): void {
    const andrew = this.host.objectPoint("andrew");
    const jeremy = this.host.objectPoint("jeremy");
    this.objects.push(
      this.host.world.add.sprite(andrew.x, andrew.y, "andrew").setDepth(45),
      this.host.world.add.sprite(jeremy.x, jeremy.y, "jeremy").setDepth(45),
      this.host.addLabel(andrew.x, andrew.y - 55, "Andrew", "#7d461b"),
      this.host.addLabel(jeremy.x, jeremy.y - 55, "Jeremy", "#7a2630"),
    );
  }

  private registerHandoffs(): void {
    this.host.registerRegionInteraction({
      id: "jeremy",
      ...this.host.objectPoint("jeremy"),
      width: 190,
      height: 105,
      label: "Feed a mushroom to Jeremy",
      isAvailable: () =>
        gameStore.isQuestAt("andrew_mushroom_hunt", "feed_mushroom_to_jeremy"),
      interact: () => this.showAndAdvance("feed_jeremy", { type: "fed_mushroom_to_jeremy" }),
    });
    this.host.registerRegionInteraction({
      id: "billy_home",
      ...this.host.objectPoint("billy"),
      width: 220,
      height: 110,
      label: "Place a mushroom at Billy's house",
      isAvailable: () =>
        gameStore.isQuestAt("andrew_mushroom_hunt", "place_mushroom_at_billy"),
      interact: () => this.showAndAdvance("place_billy", { type: "placed_mushroom_at_billy" }),
    });
    this.host.registerRegionInteraction({
      id: "andrew",
      ...this.host.objectPoint("andrew"),
      width: 190,
      height: 105,
      label: "Talk to Andrew",
      isAvailable: () =>
        gameStore.isQuestAt("andrew_mushroom_hunt", "talk_to_andrew_for_mushrooms")
        || gameStore.isQuestAt("andrew_mushroom_hunt", "give_mushrooms_to_andrew"),
      interact: () => {
        if (gameStore.isQuestAt("andrew_mushroom_hunt", "talk_to_andrew_for_mushrooms")) {
          this.showAndAdvance("ask_andrew", { type: "talked_to_andrew_for_mushrooms" });
        } else {
          this.showAndAdvance("give_andrew", { type: "gave_mushrooms_to_andrew" });
        }
      },
    });
  }

  private showAndAdvance(dialogueId: MushroomDialogueId, event: MushroomQuestEvent): void {
    this.host.showDialogue(getMushroomDialogue(dialogueId), () => {
      const current = gameStore.getState().questProgress.mushrooms.stage;
      const next = advanceMushroomStage(current, event);
      gameStore.setQuestStage(next);
      if (current === "talk_to_andrew_for_mushrooms" && next === "search_mushrooms") {
        this.host.refreshMushroomHunt();
      }
      this.host.refreshQuestBindings();
    });
  }
}
