import Phaser from "phaser";

import { PAPER_AIRPLANE_ADVICE } from "../dialogue";
import type { PaperAirplaneAdvisor } from "../rules";
import { EVENT, gameEvents } from "../../../../../../game/events";
import { gameStore } from "../../../../../../game/GameStore";
import type { NeighborhoodQuestHost, QuestRuntimeBinding } from "../../../../../../world/contracts";

const INTERACTION_IDS = ["paper-relay-billy", "paper-relay-andrew-advice", "paper-relay-andrew-delivery"] as const;

/** Milton-side stops for the relay. Kept with the quest so Neighborhood stays map-agnostic. */
export class PaperAirplaneNeighborhoodBinding implements QuestRuntimeBinding {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];

  public constructor(private readonly host: NeighborhoodQuestHost) {}

  public mount(): void {
    this.dispose();
    const state = gameStore.getState();
    if (state.activeQuestId !== "paper_airplane_relay") return;
    const relay = state.questProgress.paperAirplaneRelay;
    if (relay.stage === "ask_for_advice") this.mountAdvice(relay.adviceIds);
    if (relay.stage === "deliver_message") this.mountDelivery();
  }

  public dispose(): void {
    for (const id of INTERACTION_IDS) {
      this.host.unregisterInteraction(id);
      this.host.unregisterRegionInteraction(id);
    }
    for (const object of this.objects) object.destroy();
    this.objects.length = 0;
  }

  private mountAdvice(adviceIds: readonly string[]): void {
    if (!adviceIds.includes("billy")) this.addAdviceStop("billy", "billy", "paper-relay-billy", "Ask Billy about paper planes");
    if (!adviceIds.includes("andrew")) this.addAdviceStop("andrew", "andrew", "paper-relay-andrew-advice", "Ask Andrew about paper planes");
  }

  private addAdviceStop(advisor: Exclude<PaperAirplaneAdvisor, "ryan">, anchor: "billy" | "andrew", id: typeof INTERACTION_IDS[number], label: string): void {
    const point = this.host.objectPoint(anchor);
    const friend = this.host.world.add.sprite(point.x, point.y + 12, advisor).setDepth(45);
    const bubble = this.host.world.add.text(point.x, point.y - 66, "✈ idea", {
      fontFamily: "monospace", fontSize: "12px", fontStyle: "bold", color: "#315f4c", backgroundColor: "#fff5d6e8", padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(60);
    if (!gameStore.getState().settings.reducedMotion) {
      this.host.world.tweens.add({ targets: bubble, y: bubble.y - 5, duration: 580, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    }
    this.objects.push(friend, bubble);
    this.host.registerRegionInteraction({
      id, x: point.x, y: point.y, width: 175, height: 105, label,
      interact: () => this.host.showDialogue(PAPER_AIRPLANE_ADVICE[advisor], () => {
        gameStore.advancePaperAirplaneRelay({ type: "advisor_consulted", advisor });
        this.host.refreshQuestBindings();
      }),
    });
  }

  private mountDelivery(): void {
    const point = this.host.objectPoint("andrew");
    const andrew = this.host.world.add.sprite(point.x, point.y + 12, "andrew").setDepth(45);
    const plane = this.host.world.add.text(point.x + 34, point.y - 24, "✈", { fontFamily: "sans-serif", fontSize: "30px", color: "#fff5d6", stroke: "#315f4c", strokeThickness: 3 }).setDepth(61);
    if (!gameStore.getState().settings.reducedMotion) {
      this.host.world.tweens.add({ targets: plane, x: plane.x + 12, y: plane.y - 9, angle: -12, duration: 500, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    }
    this.objects.push(andrew, plane);
    this.host.registerRegionInteraction({
      id: "paper-relay-andrew-delivery", x: point.x, y: point.y, width: 190, height: 110,
      label: "Deliver Ryan's decoded message to Andrew",
      interact: () => this.host.showDialogue([
        { speaker: "Andrew", text: "A Stonehenge shortcut? Ryan actually got a paper plane across the whole school?" },
        { speaker: "Andrew", text: "That deserves a permanent place in your scrapbook. Nice catch, relay crew!" },
      ], () => this.completeAtAndrew(andrew, plane)),
    });
  }

  private completeAtAndrew(andrew: Phaser.GameObjects.Sprite, plane: Phaser.GameObjects.Text): void {
    gameStore.advancePaperAirplaneRelay({ type: "message_delivered", friend: "andrew" });
    gameStore.addInventoryItem("paper_airplane");
    gameStore.addSecret("paper_airplane_shortcut");
    const cheer = this.host.world.add.text(andrew.x, andrew.y - 92, "RELAY COMPLETE!  ✈", {
      fontFamily: "monospace", fontSize: "15px", fontStyle: "bold", color: "#fff9d8", backgroundColor: "#315f4ce8", padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(70);
    this.objects.push(cheer);
    if (!gameStore.getState().settings.reducedMotion) {
      this.host.world.tweens.add({ targets: [andrew, plane], y: "-=17", duration: 180, yoyo: true, repeat: 2, ease: "Sine.inOut" });
      this.host.world.tweens.add({ targets: cheer, alpha: 0, y: cheer.y - 20, delay: 1_600, duration: 450, onComplete: () => cheer.destroy() });
    }
    gameEvents.emit(EVENT.toast, "Reward earned: paper airplane — Ryan's wind-map shortcut now points to Stonehenge.");
    this.host.refreshQuestBindings();
  }
}
