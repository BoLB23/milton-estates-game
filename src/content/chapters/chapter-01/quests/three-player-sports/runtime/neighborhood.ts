import type Phaser from "phaser";

import { gameStore } from "../../../../../../game/GameStore";
import type {
  NeighborhoodQuestHost,
  QuestRuntimeBinding,
} from "../../../../../../world/contracts";
import { getSportsDialogue, type SportsStop } from "../dialogue";
import {
  isSportsMeetupStage,
  SPORTS_MEETUPS,
  type SportsMeetupStage,
} from "../presentation";
import {
  advanceSportsStage,
  type SportsQuestEvent,
} from "../rules";

const INTERACTION_IDS = ["jeremy", "billy_home", "andrew"] as const;

/** Neighborhood actors and stops owned only by Three-Player Sports. */
export class SportsNeighborhoodBinding implements QuestRuntimeBinding {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];

  public constructor(private readonly host: NeighborhoodQuestHost) {}

  public mount(): void {
    this.dispose();
    const state = gameStore.getState();
    if (state.activeQuestId !== "three_player_sports"
      || !isSportsMeetupStage(state.questStage)) return;
    this.renderMeetup(state.questStage);
    this.registerStop(state.questStage);
  }

  public dispose(): void {
    for (const object of this.objects) object.destroy();
    this.objects.length = 0;
    for (const id of INTERACTION_IDS) {
      this.host.unregisterInteraction(id);
      this.host.unregisterRegionInteraction(id);
    }
  }

  private registerStop(stage: SportsMeetupStage): void {
    const stopByStage: Readonly<Record<SportsMeetupStage, {
      id: typeof INTERACTION_IDS[number];
      anchor: SportsStop;
      label: string;
      event: SportsQuestEvent;
    }>> = {
      meet_jeremy_to_skateboard: {
        id: "jeremy",
        anchor: "jeremy",
        label: "Meet Jeremy to skateboard",
        event: { type: "skateboarded_with_jeremy" },
      },
      meet_billy_to_play_baseball: {
        id: "billy_home",
        anchor: "billy",
        label: "Play baseball at Billy's house",
        event: { type: "played_baseball_with_billy" },
      },
      meet_andrew_to_play_basketball: {
        id: "andrew",
        anchor: "andrew",
        label: "Meet Andrew to play basketball",
        event: { type: "played_basketball_with_andrew" },
      },
    };
    const stop = stopByStage[stage];
    this.host.registerRegionInteraction({
      id: stop.id,
      ...this.host.objectPoint(stop.anchor),
      width: stop.id === "billy_home" ? 220 : 190,
      height: stop.id === "billy_home" ? 110 : 105,
      label: stop.label,
      interact: () => this.host.showDialogue(getSportsDialogue(stop.anchor), () => {
        const current = gameStore.getState().questProgress.sports.stage;
        gameStore.setQuestStage(advanceSportsStage(current, stop.event));
        this.host.refreshQuestBindings();
      }),
    });
  }

  private renderMeetup(stage: SportsMeetupStage): void {
    const meetup = SPORTS_MEETUPS[stage];
    const { x, y } = this.host.objectPoint(meetup.anchor);
    const andrew = this.host.world.add.sprite(x - 44, y + 10, "andrew").setDepth(45);
    const jeremy = this.host.world.add.sprite(x + 44, y + 10, "jeremy").setDepth(45);
    const activity = this.host.world.add.text(x, y - 76, meetup.activity, {
      fontFamily: "monospace",
      fontSize: "12px",
      fontStyle: "bold",
      color: "#fff9d8",
      backgroundColor: `#${meetup.color.toString(16).padStart(6, "0")}e6`,
      padding: { x: 7, y: 4 },
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
    this.objects.push(andrew, jeremy, activity, prop);
  }
}
