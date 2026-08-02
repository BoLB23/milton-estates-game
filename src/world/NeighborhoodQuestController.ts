import type Phaser from "phaser";

import {
  getAndrewDialogue,
  getBlockedRouteDialogue,
  getClueDialogue,
  getJeremyDialogue,
  getQuestCompletionDialogue,
} from "../content/dialogue";
import {
  RYAN_DECLINE,
  RYAN_DEPARTURE,
  RYAN_DESTINATION_LEAD,
  RYAN_INVITATION,
} from "../content/ryanRideDialogue";
import { CONTROLLER_ITEM, gameStore } from "../game/GameStore";
import {
  advanceMissingControllerStage,
  type MissingControllerQuestEvent,
} from "../game/quests/specs";
import type { MissingControllerStage } from "../game/types";
import type {
  NeighborhoodQuestHost,
  QuestRuntimeBinding,
} from "./contracts";
import { createNeighborhoodQuestBinding } from "./questRuntimeRegistry";

const INTERACTION_IDS = [
  "jeremy",
  "andrew",
  "billy_home",
  "side_yard_gap",
  "woods_gate",
  "blocked_bent_creek",
  "blocked_stonehenge",
  "blocked_reidenbaugh",
  "blocked_fruitville",
  "ryan",
  "exit_stonehenge",
  "exit_fruitville",
] as const;

/**
 * Coordinates the active quest binding on Wheatfield Drive. Native quest
 * modules own their actors and interactions; Missing Controller and Catch Ryan
 * remain compatibility bindings here until their runtime migration.
 */
export class NeighborhoodQuestController {
  private readonly characters: Phaser.GameObjects.GameObject[] = [];
  private nativeBinding?: QuestRuntimeBinding;

  public constructor(private readonly host: NeighborhoodQuestHost) {}

  public mount(): void {
    this.dispose();
    this.registerSharedTravel();
    const activeQuestId = gameStore.getState().activeQuestId;
    this.nativeBinding = createNeighborhoodQuestBinding(activeQuestId, this.host);
    if (this.nativeBinding) {
      this.nativeBinding.mount();
      return;
    }
    this.renderLegacyCharacters();
    this.registerLegacyInteractions();
  }

  public dispose(): void {
    this.nativeBinding?.dispose();
    this.nativeBinding = undefined;
    for (const object of this.characters) object.destroy();
    this.characters.length = 0;
    for (const id of INTERACTION_IDS) {
      this.host.unregisterInteraction(id);
      this.host.unregisterRegionInteraction(id);
    }
  }

  private registerSharedTravel(): void {
    const woodsGate = this.host.objectRectangle("woods_gate");
    this.host.registerRegionInteraction({
      id: "woods_gate",
      x: woodsGate.x + woodsGate.width / 2,
      y: woodsGate.y + woodsGate.height / 2,
      width: woodsGate.width,
      height: woodsGate.height,
      label: "Enter the creek woods",
      interact: () => this.host.enterWoods(),
    });
    const stonehengeExit = this.host.objectRectangle("exit_stonehenge");
    this.host.registerRegionInteraction({
      id: "exit_stonehenge",
      x: stonehengeExit.x + stonehengeExit.width / 2,
      y: stonehengeExit.y + stonehengeExit.height / 2,
      width: stonehengeExit.width,
      height: stonehengeExit.height,
      label: "Ride to Stonehenge",
      isAvailable: () => gameStore.isMapUnlocked("stonehenge"),
      interact: () => this.host.enterStonehenge(),
    });
    const fruitvilleExit = this.host.objectRectangle("exit_fruitville");
    this.host.registerRegionInteraction({
      id: "exit_fruitville",
      x: fruitvilleExit.x + fruitvilleExit.width / 2,
      y: fruitvilleExit.y + fruitvilleExit.height / 2,
      width: fruitvilleExit.width,
      height: fruitvilleExit.height,
      label: "Ride to Fruitville Pike",
      isAvailable: () => gameStore.isBicycleUnlocked() && gameStore.isMapUnlocked("fruitville_pike"),
      interact: () => this.host.enterFruitville(),
    });
  }

  private renderLegacyCharacters(): void {
    const state = gameStore.getState();
    if (state.activeQuestId === "catch_ryan"
      && (state.questStage === "invite" || state.questStage === "choose_destination")) {
      const ryan = this.host.objectPoint("ryan_invite");
      this.characters.push(
        this.host.world.add.sprite(ryan.x, ryan.y, "ryan").setDepth(45).setScale(1.2),
        this.host.addLabel(ryan.x, ryan.y - 48, "Ryan!", "#315f92"),
      );
    }

    const finaleMeetup = state.activeQuestId === "missing_controller"
      && (state.questStage === "return_to_jeremy" || state.questStage === "complete");
    const andrew = this.host.objectPoint(finaleMeetup ? "jeremy_driveway" : "andrew");
    const jeremy = this.host.objectPoint("jeremy");
    this.characters.push(
      this.host.world.add.sprite(andrew.x, andrew.y, "andrew").setDepth(45),
      this.host.world.add.sprite(jeremy.x, jeremy.y, "jeremy").setDepth(45),
      this.host.addLabel(andrew.x, andrew.y - 55, "Andrew", "#7d461b"),
      this.host.addLabel(jeremy.x, jeremy.y - 55, "Jeremy", "#7a2630"),
    );
  }

  private registerLegacyInteractions(): void {
    this.host.registerRegionInteraction({
      id: "jeremy",
      ...this.host.objectPoint("jeremy"),
      width: 190,
      height: 105,
      label: "Talk to Jeremy",
      isAvailable: () => gameStore.isQuestActive("missing_controller") && !gameStore.isAtStage("complete"),
      interact: () => this.talkToJeremy(),
    });
    this.host.registerRegionInteraction({
      id: "andrew",
      ...this.host.objectPoint("andrew"),
      width: 190,
      height: 105,
      label: "Talk to Andrew",
      isAvailable: () => gameStore.isQuestAt("missing_controller", "talk_to_andrew"),
      interact: () => this.talkToAndrew(),
    });
    this.host.registerInteraction({
      id: "side_yard_gap",
      ...this.host.objectPoint("side_yard_gap"),
      label: "Inspect bent grass",
      isAvailable: () => gameStore.isQuestAt("missing_controller", "search_creek"),
      interact: () => this.inspectGap(),
    });
    for (const route of ["bent_creek", "stonehenge", "reidenbaugh", "fruitville"] as const) {
      const anchor = this.host.objectPoint(`blocked_${route}`);
      this.host.registerInteraction({
        id: `blocked_${route}`,
        x: anchor.x,
        y: anchor.y,
        label: "Check the way ahead",
        isAvailable: () => gameStore.isQuestActive("missing_controller"),
        interact: () => this.host.showDialogue(
          getBlockedRouteDialogue(route, gameStore.getState().questStage),
        ),
      });
    }
    this.host.registerRegionInteraction({
      id: "ryan",
      ...this.host.objectPoint("ryan_invite"),
      width: 180,
      height: 110,
      label: "Talk to Ryan",
      isAvailable: () =>
        gameStore.isRyanRideStage("invite") || gameStore.isRyanRideStage("choose_destination"),
      interact: () => this.talkToRyan(),
    });
  }

  private talkToJeremy(): void {
    const state = gameStore.getState();
    if (state.activeQuestId !== "missing_controller") return;
    if (state.questStage === "return_to_jeremy" && gameStore.hasInventoryItem(CONTROLLER_ITEM)) {
      this.host.showDialogue(
        getQuestCompletionDialogue(),
        () => this.advanceMissing({ type: "returned_controller" }),
      );
      return;
    }
    const stage = state.questStage as MissingControllerStage;
    this.host.showDialogue(getJeremyDialogue(stage), () => {
      if (stage === "talk_to_jeremy") this.advanceMissing({ type: "talked_to_jeremy" });
    });
  }

  private talkToAndrew(): void {
    const state = gameStore.getState();
    if (state.activeQuestId !== "missing_controller") return;
    const stage = state.questStage as MissingControllerStage;
    this.host.showDialogue(getAndrewDialogue(stage), () => {
      if (stage === "talk_to_andrew") this.advanceMissing({ type: "talked_to_andrew" });
    });
  }

  private talkToRyan(): void {
    if (gameStore.isRyanRideStage("choose_destination")) {
      this.host.showDialogue([...RYAN_DESTINATION_LEAD], () => this.showDestinationChoice());
      return;
    }
    this.host.showDialogue([...RYAN_INVITATION], () => this.host.showChoice({
      speaker: "Ryan",
      prompt: "Want to go for a bike ride?",
      options: [{ id: "yes", label: "Yes" }, { id: "later", label: "Not right now" }],
      onSelect: (id) => {
        if (id === "later") this.host.showDialogue([...RYAN_DECLINE]);
        else {
          gameStore.acceptRyanRide();
          this.host.showDialogue([...RYAN_DESTINATION_LEAD], () => this.showDestinationChoice());
        }
      },
    }));
  }

  private showDestinationChoice(): void {
    this.host.showChoice({
      speaker: "Ryan",
      prompt: "Where should we go?",
      options: [
        { id: "reidenbaugh", label: "Reidenbaugh" },
        {
          id: "bent_creek",
          label: "Bent Creek — Coming later",
          enabled: false,
          disabledReason: "Coming later",
        },
        { id: "back", label: "Back" },
      ],
      onSelect: (id) => {
        if (id === "back") {
          gameStore.returnToRyanRideInvitation();
          return;
        }
        if (id !== "reidenbaugh") return;
        gameStore.selectRyanRideDestination();
        this.host.world.events.emit("ryan-map-reveal");
        this.host.showDialogue([...RYAN_DEPARTURE], () => this.host.onRideSelected());
      },
    });
  }

  private inspectGap(): void {
    const stage = gameStore.getState().questStage as MissingControllerStage;
    this.host.showDialogue(getClueDialogue("side_yard_gap", stage));
  }

  private advanceMissing(event: MissingControllerQuestEvent): void {
    const current = gameStore.getState().questProgress.missingControllerStage;
    gameStore.setQuestStage(advanceMissingControllerStage(current, event));
  }
}
