import type Phaser from "phaser";
import { EVENT, gameEvents, type ChoiceOption } from "../game/events";

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
import { selectUnlockedMinigames } from "../game/minigames";
import { CharacterFactory } from "./CharacterFactory";
import {
  advanceMissingControllerStage,
  type MissingControllerQuestEvent,
} from "../game/quests/specs";
import type { MissingControllerStage } from "../game/types";
import type {
  NeighborhoodQuestHost,
  QuestRuntimeBinding,
  RegionInteraction,
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
  "home_storage",
  "billy",
] as const;

const BILLY_QUEST_ACTION_ID = "billy_home";

export type BillyInteractionMode = "first_quest_intro" | "quest_action" | "quest_journal";

export function createBillyQuestChoices(actionLabel: string): readonly ChoiceOption[] {
  return [
    { id: "quest_action", label: actionLabel },
    { id: "quest_journal", label: "Open quest journal" },
    { id: "back", label: "Not right now" },
  ];
}

/** Shown whenever Billy has no immediate quest handoff, so leaderboards stay reachable. */
export function createBillyIdleChoices(): readonly ChoiceOption[] {
  return [
    { id: "quest_journal", label: "Open quest journal" },
    { id: "leaderboards", label: "Browse leaderboards" },
    { id: "back", label: "Not right now" },
  ];
}

/** Pure routing rule used by the single Billy world interaction. */
export function selectBillyInteractionMode(
  activeQuestId: string,
  questStage: string,
  questActionAvailable: boolean,
): BillyInteractionMode {
  if (activeQuestId === "missing_controller" && questStage === "talk_to_billy") {
    return "first_quest_intro";
  }
  return questActionAvailable ? "quest_action" : "quest_journal";
}

/**
 * Coordinates the active quest binding on Wheatfield Drive. Native quest
 * modules own their actors and interactions; Missing Controller and Catch Ryan
 * remain compatibility bindings here until their runtime migration.
 */
export class NeighborhoodQuestController {
  private readonly characters: Phaser.GameObjects.GameObject[] = [];
  private nativeBinding?: QuestRuntimeBinding;
  private billyQuestAction?: RegionInteraction;

  public constructor(private readonly host: NeighborhoodQuestHost) {}

  public mount(): void {
    this.dispose();
    this.registerSharedTravel();
    this.renderBillyHost();
    const activeQuestId = gameStore.getState().activeQuestId;
    this.nativeBinding = createNeighborhoodQuestBinding(activeQuestId, this.questBindingHost());
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
    this.billyQuestAction = undefined;
    for (const object of this.characters) object.destroy();
    this.characters.length = 0;
    for (const id of INTERACTION_IDS) {
      this.host.unregisterInteraction(id);
      this.host.unregisterRegionInteraction(id);
    }
  }

  private registerSharedTravel(): void {
    const storage = this.host.objectPoint("home_storage");
    this.host.registerInteraction({
      id: "home_storage",
      ...storage,
      label: "Open home storage",
      interact: () => gameEvents.emit(EVENT.menuRequested, { page: "items", storage: true }),
    });
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

  /**
   * Native quests may offer a Billy-specific stop, but never register another
   * world hit area. The shared actor dispatches that stop before the journal.
   */
  private questBindingHost(): NeighborhoodQuestHost {
    return {
      ...this.host,
      registerRegionInteraction: (interaction) => {
        if (interaction.id === BILLY_QUEST_ACTION_ID) {
          this.billyQuestAction = interaction;
          return;
        }
        this.host.registerRegionInteraction(interaction);
      },
      unregisterRegionInteraction: (id) => {
        if (id === BILLY_QUEST_ACTION_ID) {
          this.billyQuestAction = undefined;
          return;
        }
        this.host.unregisterRegionInteraction(id);
      },
    };
  }

  private renderBillyHost(): void {
    const billy = this.host.objectPoint("billy");
    this.characters.push(
      CharacterFactory.styleNpc(this.host.world.add.sprite(billy.x, billy.y, "billy"), { id: "billy", depth: 45 }),
      this.host.addLabel(billy.x, billy.y - 55, "Billy", "#315f4c"),
    );
    this.host.registerRegionInteraction({
      id: "billy",
      ...billy,
      width: 220,
      height: 110,
      label: "Talk to Billy",
      interact: () => this.dispatchBillyInteraction(),
    });
  }

  private dispatchBillyInteraction(): void {
    const state = gameStore.getState();
    const questActionAvailable = this.billyQuestAction !== undefined
      && (this.billyQuestAction.isAvailable?.() ?? true);
    const mode = selectBillyInteractionMode(state.activeQuestId, state.questStage, questActionAvailable);
    if (mode === "quest_action") {
      const action = this.billyQuestAction;
      if (!action) return;
      this.host.showChoice({
        speaker: "Billy",
        prompt: "What do you want to do?",
        options: createBillyQuestChoices(action.label),
        onSelect: (id) => {
          if (id === "quest_action") action.interact();
          else if (id === "quest_journal") gameEvents.emit(EVENT.questJournalRequested);
        },
      });
      return;
    }
    if (mode === "first_quest_intro") {
      const nickname = gameStore.getPlayerProfile()?.nickname ?? "neighbor";
      this.host.showDialogue([
        { speaker: "Billy", text: `Hey, ${nickname}! Welcome to Wheatfield Drive.` },
        { speaker: "Billy", text: "I keep track of neighborhood quests. Come back anytime you want a new one—or need to restart one." },
        { speaker: "Billy", text: "First up: Jeremy lost his Xbox controller. Talk to him and find out what happened." },
      ], () => {
        gameStore.beginMissingControllerQuest();
        this.host.refreshQuestBindings();
      });
      return;
    }
    // No urgent quest handoff right now — offer the journal alongside every
    // Milton Estates leaderboard instead of jumping straight into the journal.
    this.host.showChoice({
      speaker: "Billy",
      prompt: "What do you want to do?",
      options: createBillyIdleChoices(),
      onSelect: (id) => {
        if (id === "quest_journal") gameEvents.emit(EVENT.questJournalRequested);
        else if (id === "leaderboards") gameEvents.emit(EVENT.menuRequested, { page: "leaderboards" });
      },
    });
  }

  private renderLegacyCharacters(): void {
    const state = gameStore.getState();
    if (state.activeQuestId === "catch_ryan"
      && (state.questStage === "invite" || state.questStage === "choose_destination")) {
      const ryan = this.host.objectPoint("ryan_invite");
      this.characters.push(
        CharacterFactory.styleNpc(this.host.world.add.sprite(ryan.x, ryan.y, "ryan"), { id: "ryan", depth: 45 }),
        this.host.addLabel(ryan.x, ryan.y - 48, "Ryan!", "#315f92"),
      );
    }

    const finaleMeetup = state.activeQuestId === "missing_controller"
      && (state.questStage === "return_to_jeremy" || state.questStage === "complete");
    const andrew = this.host.objectPoint(finaleMeetup ? "jeremy_driveway" : "andrew");
    const jeremy = this.host.objectPoint("jeremy");
    this.characters.push(
      CharacterFactory.styleNpc(this.host.world.add.sprite(andrew.x, andrew.y, "andrew"), { id: "andrew", depth: 45 }),
      CharacterFactory.styleNpc(this.host.world.add.sprite(jeremy.x, jeremy.y, "jeremy"), { id: "jeremy", depth: 45 }),
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
      isAvailable: () => (gameStore.isQuestActive("missing_controller")
        && !gameStore.isAtStage("talk_to_billy")
        && !gameStore.isAtStage("complete"))
        || selectUnlockedMinigames(gameStore.getState()).length > 0,
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
    if (state.activeQuestId !== "missing_controller" || state.questStage === "complete") {
      this.openJeremyGames();
      return;
    }
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

  private openJeremyGames(): void {
    const games = selectUnlockedMinigames(gameStore.getState());
    if (games.length === 0) return;
    const names = games.map((game) => game.title).join(" and ");
    this.host.showDialogue([
      { speaker: "Jeremy", text: `Want another shot? I've got ${names} ready to replay.` },
      { speaker: "Jeremy", text: "Every game you beat gets added to the Games page in your backpack." },
    ], () => gameEvents.emit(EVENT.menuRequested, { page: "games" }));
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
