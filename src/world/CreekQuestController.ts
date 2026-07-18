import Phaser from "phaser";
import { getClueDialogue, getControllerDialogue } from "../content/dialogue";
import { EVENT, gameEvents } from "../game/events";
import { CONTROLLER_ITEM, gameStore } from "../game/GameStore";
import { advanceMissingControllerStage } from "../game/quests/specs";
import type { MissingControllerStage } from "../game/types";
import type { ExplorationInteractionHost } from "./contracts";

const INTERACTION_IDS = ["return_neighborhood", "creek_tracks", "controller", "secret"] as const;

export interface CreekQuestControllerHost extends ExplorationInteractionHost {
  returnToNeighborhood(): void;
}

/** Owns Creek Woods' quest pickups and their interaction registrations. */
export class CreekQuestController {
  private controllerSprite?: Phaser.GameObjects.Sprite;
  private secretSprite?: Phaser.GameObjects.Sprite;

  public constructor(private readonly host: CreekQuestControllerHost) {}

  public mount(): void {
    this.dispose();
    if (gameStore.isQuestAt("missing_controller", "search_creek") && !gameStore.hasInventoryItem(CONTROLLER_ITEM)) {
      const controller = this.host.objectPoint("controller");
      this.controllerSprite = this.host.world.add.sprite(controller.x, controller.y, "controller").setDepth(30);
    }
    if (!gameStore.hasSecret("creek_token")) {
      const secret = this.host.objectPoint("secret");
      this.secretSprite = this.host.world.add.sprite(secret.x, secret.y, "secret").setDepth(30);
    }
    this.registerInteractions();
  }

  public dispose(): void {
    this.controllerSprite?.destroy();
    this.secretSprite?.destroy();
    this.controllerSprite = undefined;
    this.secretSprite = undefined;
    for (const id of INTERACTION_IDS) {
      this.host.unregisterInteraction(id);
      this.host.unregisterRegionInteraction(id);
    }
  }

  private registerInteractions(): void {
    this.host.registerRegionInteraction({
      id: "return_neighborhood", ...this.host.objectPoint("return_neighborhood"),
      width: 350, height: 90, label: "Return to Wheatfield Drive", interact: () => this.host.returnToNeighborhood(),
    });
    this.host.registerInteraction({
      id: "creek_tracks", ...this.host.objectPoint("creek_tracks"), label: "Inspect tracks",
      isAvailable: () => gameStore.isQuestAt("missing_controller", "search_creek"),
      interact: () => this.host.showDialogue(getClueDialogue("creek_tracks", gameStore.getState().questStage as MissingControllerStage)),
    });
    this.host.registerInteraction({
      id: "controller", ...this.host.objectPoint("controller"), label: "Search the tall grass",
      isAvailable: () => gameStore.isQuestAt("missing_controller", "search_creek") && !gameStore.hasInventoryItem(CONTROLLER_ITEM),
      interact: () => this.findController(),
    });
    this.host.registerInteraction({
      id: "secret", ...this.host.objectPoint("secret"),
      label: gameStore.hasSecret("creek_token") ? "Inspect the clearing" : "Pick up the shiny token",
      interact: () => this.findSecret(),
    });
  }

  private findController(): void {
    const stage = gameStore.getState().questProgress.missingControllerStage;
    this.host.showDialogue(getControllerDialogue(stage), () => {
      if (stage !== "search_creek") return;
      gameStore.addInventoryItem(CONTROLLER_ITEM);
      gameStore.setQuestStage(advanceMissingControllerStage(stage, { type: "picked_up_controller" }));
      this.controllerSprite?.destroy();
      this.controllerSprite = undefined;
      this.host.unregisterInteraction("controller");
      gameEvents.emit(EVENT.toast, "Xbox controller added to your backpack.");
    });
  }

  private findSecret(): void {
    if (gameStore.hasSecret("creek_token")) {
      this.host.showDialogue([{ speaker: "Billy", text: "The little clearing feels like a good hideout spot." }]);
      return;
    }
    this.host.showDialogue([
      { speaker: "Billy", text: "A Milton Estates arcade token? This must be ancient." },
      { speaker: "Billy", text: "Or from last summer. Still counts." },
    ], () => {
      gameStore.addSecret("creek_token");
      this.secretSprite?.destroy();
      this.secretSprite = undefined;
      this.host.unregisterInteraction("secret");
      gameEvents.emit(EVENT.toast, "Secret found: Creek Token");
    });
  }
}
