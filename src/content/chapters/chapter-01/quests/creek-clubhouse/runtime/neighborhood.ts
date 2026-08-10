import type Phaser from "phaser";
import { gameStore } from "../../../../../../game/GameStore";
import type { NeighborhoodQuestHost, QuestRuntimeBinding } from "../../../../../../world/contracts";
import { getCreekClubhouseDialogue } from "../dialogue";
import { advanceCreekClubhouseStage, hasAllClubhouseSupplies, type ClubhouseSupply, type CreekClubhouseStage } from "../rules";

type ClubhouseRecord = {
  stage: CreekClubhouseStage;
  design: "lookout" | "fort" | "hidden_den" | null;
  supplies: ClubhouseSupply[];
  constructionStep: number;
  knockBeats: number[];
};
type ClubhouseStore = typeof gameStore & {
  getCreekClubhouseRecord(): ClubhouseRecord;
  setCreekClubhouseRecord(record: ClubhouseRecord): void;
};
const clubhouseStore = gameStore as ClubhouseStore;

const INTERACTION_IDS = ["andrew", "jeremy", "billy_home"] as const;

/** Neighborhood half of the clubhouse quest: Andrew's pitch and the two yard supplies. */
export class CreekClubhouseNeighborhoodBinding implements QuestRuntimeBinding {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];

  public constructor(private readonly host: NeighborhoodQuestHost) {}

  public mount(): void {
    this.dispose();
    if (gameStore.getState().activeQuestId !== "creek_clubhouse") return;
    this.renderFriends();
    this.registerStops();
  }

  public dispose(): void {
    this.objects.forEach((object) => object.destroy());
    this.objects.length = 0;
    INTERACTION_IDS.forEach((id) => {
      this.host.unregisterInteraction(id);
      this.host.unregisterRegionInteraction(id);
    });
  }

  private renderFriends(): void {
    for (const [id, texture, name, color] of [
      ["andrew", "andrew", "Andrew", "#7d461b"],
      ["jeremy", "jeremy", "Jeremy", "#7a2630"],
    ] as const) {
      const point = this.host.objectPoint(id);
      this.objects.push(
        this.host.world.add.sprite(point.x, point.y, texture).setDepth(45),
        this.host.addLabel(point.x, point.y - 55, name, color),
      );
    }
  }

  private registerStops(): void {
    this.host.registerRegionInteraction({
      id: "andrew", ...this.host.objectPoint("andrew"), width: 190, height: 105,
      label: "Talk to Andrew about the clubhouse",
      isAvailable: () => this.at("talk_to_andrew"),
      interact: () => this.host.showDialogue(getCreekClubhouseDialogue("pitch"), () => {
        this.advance("talked_to_andrew");
        this.host.refreshQuestBindings();
      }),
    });
    this.host.registerRegionInteraction({
      id: "jeremy", ...this.host.objectPoint("jeremy"), width: 190, height: 105,
      label: "Borrow Jeremy's dinosaur blanket",
      isAvailable: () => this.at("collect_supplies") && !this.record().supplies.includes("blanket"),
      interact: () => this.collect("blanket", "blanket"),
    });
    // NeighborhoodQuestController routes this ID through its single Billy actor.
    this.host.registerRegionInteraction({
      id: "billy_home", ...this.host.objectPoint("billy"), width: 220, height: 110,
      label: "Borrow Billy's rope",
      isAvailable: () => this.at("collect_supplies") && !this.record().supplies.includes("rope"),
      interact: () => this.collect("rope", "rope"),
    });
  }

  private collect(supply: ClubhouseSupply, dialogue: "rope" | "blanket"): void {
    this.host.showDialogue(getCreekClubhouseDialogue(dialogue), () => {
      const record = this.record();
      if (!record.supplies.includes(supply)) {
        clubhouseStore.setCreekClubhouseRecord({ ...record, supplies: [...record.supplies, supply] });
      }
      const updated = this.record();
      if (updated.stage === "collect_supplies" && hasAllClubhouseSupplies(updated.supplies)) {
        this.host.showDialogue(getCreekClubhouseDialogue("supplies_ready"), () => {
          gameStore.setQuestStage(advanceCreekClubhouseStage(updated.stage, { type: "supplies_collected" }) as never);
          this.host.refreshQuestBindings();
        });
      } else this.host.refreshQuestBindings();
    });
  }

  private advance(event: "talked_to_andrew"): void {
    const current = this.record().stage;
    gameStore.setQuestStage(advanceCreekClubhouseStage(current, { type: event }) as never);
  }

  private record(): ClubhouseRecord { return clubhouseStore.getCreekClubhouseRecord(); }
  private at(stage: CreekClubhouseStage): boolean {
    return gameStore.isQuestAt("creek_clubhouse" as never, stage as never);
  }
}
