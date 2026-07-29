import Phaser from "phaser";
import {
  getAndrewDialogue,
  getBlockedRouteDialogue,
  getClueDialogue,
  getJeremyDialogue,
  getMushroomDialogue,
  getQuestCompletionDialogue,
  getSportsDialogue,
} from "../content/dialogue";
import {
  advanceMissingControllerStage,
  advanceMushroomStage,
  advanceSportsStage,
  type MissingControllerQuestEvent,
  type MushroomQuestEvent,
  type SportsQuestEvent,
} from "../game/quests/specs";
import { CONTROLLER_ITEM, gameStore } from "../game/GameStore";
import type { MissingControllerStage } from "../game/types";
import type { ExplorationInteractionHost } from "./contracts";
import { isSportsMeetupStage, SPORTS_MEETUPS, type SportsMeetupStage } from "./neighborhoodPresentation";
import { RYAN_DECLINE, RYAN_DEPARTURE, RYAN_DESTINATION_LEAD, RYAN_INVITATION } from "../content/ryanRideDialogue";

const INTERACTION_IDS = [
  "jeremy", "andrew", "billy_home", "side_yard_gap", "woods_gate",
  "blocked_bent_creek", "blocked_stonehenge", "blocked_reidenbaugh", "blocked_fruitville",
  "ryan", "reidenbaugh_exit",
] as const;

export interface NeighborhoodQuestControllerHost extends ExplorationInteractionHost {
  enterWoods(): void;
  refreshMushroomHunt(): void;
  onRideSelected(): void;
  enterReidenbaughRoad(): void;
}

/**
 * Owns every quest-specific character, meetup decoration, and interaction on
 * Wheatfield Drive. The scene remains responsible for map/layer/collider setup.
 */
export class NeighborhoodQuestController {
  private readonly characters: Phaser.GameObjects.GameObject[] = [];
  private readonly sportsObjects: Phaser.GameObjects.GameObject[] = [];

  public constructor(private readonly host: NeighborhoodQuestControllerHost) {}

  public mount(): void {
    this.dispose();
    this.renderCharacters();
    this.registerInteractions();
  }

  public dispose(): void {
    for (const object of [...this.characters, ...this.sportsObjects]) object.destroy();
    this.characters.length = 0;
    this.sportsObjects.length = 0;
    for (const id of INTERACTION_IDS) {
      this.host.unregisterInteraction(id);
      this.host.unregisterRegionInteraction(id);
    }
  }

  private renderCharacters(): void {
    const state = gameStore.getState();
    if (state.activeQuestId === "three_player_sports" && isSportsMeetupStage(state.questStage)) {
      this.addSportsMeetup(state.questStage);
      return;
    }

    if (state.activeQuestId === "catch_ryan" && (state.questStage === "invite" || state.questStage === "choose_destination")) {
      const ryan = this.host.objectPoint("ryan_invite");
      this.characters.push(this.host.world.add.sprite(ryan.x, ryan.y, "ryan").setDepth(45).setScale(1.2));
      this.characters.push(this.host.addLabel(ryan.x, ryan.y - 48, "Ryan!", "#315f92"));
    }

    const finaleMeetup = state.activeQuestId === "missing_controller"
      && (state.questStage === "return_to_jeremy" || state.questStage === "complete");
    const andrew = this.host.objectPoint(finaleMeetup ? "jeremy_driveway" : "andrew");
    const jeremy = this.host.objectPoint("jeremy");
    this.characters.push(
      this.host.world.add.sprite(andrew.x, andrew.y, "andrew").setDepth(45),
      this.host.world.add.sprite(jeremy.x, jeremy.y, "jeremy").setDepth(45),
    );
    this.characters.push(
      this.host.addLabel(andrew.x, andrew.y - 55, "Andrew", "#7d461b"),
      this.host.addLabel(jeremy.x, jeremy.y - 55, "Jeremy", "#7a2630"),
    );
  }

  private addSportsMeetup(stage: SportsMeetupStage): void {
    const meetup = SPORTS_MEETUPS[stage];
    const center = this.host.objectPoint(meetup.anchor);
    const { x, y } = center;
    const andrew = this.host.world.add.sprite(x - 44, y + 10, "andrew").setDepth(45);
    const jeremy = this.host.world.add.sprite(x + 44, y + 10, "jeremy").setDepth(45);
    const activity = this.host.world.add.text(x, y - 76, meetup.activity, {
      fontFamily: "monospace", fontSize: "12px", fontStyle: "bold", color: "#fff9d8",
      backgroundColor: `#${meetup.color.toString(16).padStart(6, "0")}e6`, padding: { x: 7, y: 4 },
    }).setOrigin(0.5).setDepth(60);
    const prop = this.host.world.add.graphics().setDepth(42);
    prop.lineStyle(4, meetup.color, 0.95);
    if (meetup.prop === "skateboard") {
      prop.strokeRoundedRect(x - 32, y + 46, 64, 8, 4);
      prop.fillStyle(0x26364a).fillCircle(x - 23, y + 58, 5).fillCircle(x + 23, y + 58, 5);
    } else if (meetup.prop === "baseball") {
      prop.lineBetween(x - 25, y + 52, x + 24, y + 13);
      prop.fillStyle(0xffffff).fillCircle(x + 44, y + 45, 7);
      prop.lineStyle(2, 0xc64f32).strokeCircle(x + 44, y + 45, 5);
    } else {
      prop.lineStyle(5, 0x4d565a).lineBetween(x + 46, y - 8, x + 46, y + 65);
      prop.lineStyle(4, 0xe44c36).strokeCircle(x + 46, y - 16, 13);
      prop.lineStyle(2, 0xf6d48a).strokeCircle(x + 46, y - 16, 8);
    }
    this.sportsObjects.push(andrew, jeremy, activity, prop);
  }

  private registerInteractions(): void {
    this.host.registerRegionInteraction({
      id: "jeremy", ...this.host.objectPoint("jeremy"), width: 190, height: 105, label: "Talk to Jeremy",
      isAvailable: () => (gameStore.isQuestActive("missing_controller") && !gameStore.isAtStage("complete"))
        || gameStore.isQuestAt("andrew_mushroom_hunt", "feed_mushroom_to_jeremy")
        || gameStore.isQuestAt("three_player_sports", "meet_jeremy_to_skateboard"),
      interact: () => this.talkToJeremy(),
    });
    this.host.registerRegionInteraction({
      id: "ryan", ...this.host.objectPoint("ryan_invite"), width: 180, height: 110, label: "Talk to Ryan",
      isAvailable: () => gameStore.isRyanRideStage("invite") || gameStore.isRyanRideStage("choose_destination"),
      interact: () => this.talkToRyan(),
    });
    this.host.registerRegionInteraction({
      id: "andrew", ...this.host.objectPoint("andrew"), width: 190, height: 105, label: "Talk to Andrew",
      isAvailable: () => gameStore.isQuestAt("missing_controller", "talk_to_andrew")
        || gameStore.isQuestAt("andrew_mushroom_hunt", "talk_to_andrew_for_mushrooms")
        || gameStore.isQuestAt("andrew_mushroom_hunt", "give_mushrooms_to_andrew")
        || gameStore.isQuestAt("three_player_sports", "meet_andrew_to_play_basketball"),
      interact: () => this.talkToAndrew(),
    });
    this.host.registerRegionInteraction({
      id: "billy_home", ...this.host.objectPoint("billy"), width: 220, height: 110, label: "Go to Billy's house",
      isAvailable: () => gameStore.isQuestAt("andrew_mushroom_hunt", "place_mushroom_at_billy")
        || gameStore.isQuestAt("three_player_sports", "meet_billy_to_play_baseball"),
      interact: () => this.visitBillyHome(),
    });
    this.host.registerInteraction({
      id: "side_yard_gap", ...this.host.objectPoint("side_yard_gap"), label: "Inspect bent grass",
      isAvailable: () => gameStore.isQuestAt("missing_controller", "search_creek"),
      interact: () => this.inspectGap(),
    });
    this.host.registerRegionInteraction({
      id: "woods_gate", ...this.host.objectPoint("woods_gate"), width: 180, height: 100, label: "Enter the creek woods",
      interact: () => this.host.enterWoods(),
    });
    for (const route of ["bent_creek", "stonehenge", "reidenbaugh", "fruitville"] as const) {
      const anchor = this.host.objectPoint(`blocked_${route}`);
      this.host.registerInteraction({
        id: `blocked_${route}`, x: anchor.x, y: anchor.y, label: "Check the way ahead",
        isAvailable: () => gameStore.isQuestActive("missing_controller"),
        interact: () => this.host.showDialogue(getBlockedRouteDialogue(route, gameStore.getState().questStage)),
      });
    }
    const exit = this.host.objectPoint("reidenbaugh_exit");
    this.host.registerRegionInteraction({
      id: "reidenbaugh_exit", ...exit, width: 170, height: 120, label: "Ride to Reidenbaugh",
      isAvailable: () => gameStore.isRyanRideStage("complete"),
      interact: () => this.host.enterReidenbaughRoad(),
    });
  }

  private talkToJeremy(): void {
    const state = gameStore.getState();
    if (state.activeQuestId === "andrew_mushroom_hunt" && state.questStage === "feed_mushroom_to_jeremy") {
      this.host.showDialogue(getMushroomDialogue("feed_jeremy"), () => this.advanceMushroom({ type: "fed_mushroom_to_jeremy" }));
    } else if (state.activeQuestId === "three_player_sports" && state.questStage === "meet_jeremy_to_skateboard") {
      this.host.showDialogue(getSportsDialogue("jeremy"), () => this.advanceSports({ type: "skateboarded_with_jeremy" }));
    } else if (state.activeQuestId === "missing_controller") {
      if (state.questStage === "return_to_jeremy" && gameStore.hasInventoryItem(CONTROLLER_ITEM)) {
        this.host.showDialogue(getQuestCompletionDialogue(), () => this.advanceMissing({ type: "returned_controller" }));
      } else {
        const stage = state.questStage as MissingControllerStage;
        this.host.showDialogue(getJeremyDialogue(stage), () => {
          if (stage === "talk_to_jeremy") this.advanceMissing({ type: "talked_to_jeremy" });
        });
      }
    }
  }

  private talkToAndrew(): void {
    const state = gameStore.getState();
    if (state.activeQuestId === "andrew_mushroom_hunt") {
      if (state.questStage === "talk_to_andrew_for_mushrooms") {
        this.host.showDialogue(getMushroomDialogue("ask_andrew"), () => this.advanceMushroom({ type: "talked_to_andrew_for_mushrooms" }));
      } else if (state.questStage === "give_mushrooms_to_andrew") {
        this.host.showDialogue(getMushroomDialogue("give_andrew"), () => this.advanceMushroom({ type: "gave_mushrooms_to_andrew" }));
      }
    } else if (state.activeQuestId === "three_player_sports" && state.questStage === "meet_andrew_to_play_basketball") {
      this.host.showDialogue(getSportsDialogue("andrew"), () => this.advanceSports({ type: "played_basketball_with_andrew" }));
    } else if (state.activeQuestId === "missing_controller") {
      const stage = state.questStage as MissingControllerStage;
      this.host.showDialogue(getAndrewDialogue(stage), () => {
        if (stage === "talk_to_andrew") this.advanceMissing({ type: "talked_to_andrew" });
      });
    }
  }

  private visitBillyHome(): void {
    const state = gameStore.getState();
    if (state.activeQuestId === "andrew_mushroom_hunt" && state.questStage === "place_mushroom_at_billy") {
      this.host.showDialogue(getMushroomDialogue("place_billy"), () => this.advanceMushroom({ type: "placed_mushroom_at_billy" }));
    } else if (state.activeQuestId === "three_player_sports" && state.questStage === "meet_billy_to_play_baseball") {
      this.host.showDialogue(getSportsDialogue("billy"), () => this.advanceSports({ type: "played_baseball_with_billy" }));
    }
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
        { id: "bent_creek", label: "Bent Creek — Coming later", enabled: false, disabledReason: "Coming later" },
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

  private advanceMushroom(event: MushroomQuestEvent): void {
    const current = gameStore.getState().questProgress.mushrooms.stage;
    const next = advanceMushroomStage(current, event);
    gameStore.setQuestStage(next);
    if (current === "talk_to_andrew_for_mushrooms" && next === "search_mushrooms") this.host.refreshMushroomHunt();
  }

  private advanceSports(event: SportsQuestEvent): void {
    const current = gameStore.getState().questProgress.sports.stage;
    gameStore.setQuestStage(advanceSportsStage(current, event));
    this.remountForNewState();
  }

  private remountForNewState(): void {
    this.mount();
  }
}
