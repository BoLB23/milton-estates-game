import Phaser from "phaser";

import { BENT_CREEK_MAP, getIllustratedMapLayers } from "../content/maps";
import { EVENT, gameEvents } from "../game/events";
import { gameStore } from "../game/GameStore";
import { normalizeTextEntryForComparison } from "../ui/textEntry";
import { TiledRuntimeWorld } from "../world/tiledRuntime";
import { BaseExplorationScene } from "./BaseExplorationScene";

const GATE_ANSWER_PROMPT = "Who are you here to visit?";
const INVALID_GATE_RESPONSE = "I don’t think so, come back when you have someone real to visit";

/** Bent Creek's staffed gate, its persistent unlock, and Mickey's challenge. */
export class BentCreekScene extends BaseExplorationScene {
  private tiledWorld!: TiledRuntimeWorld;
  private gateOpen = false;
  private gateBarrierVisual?: Phaser.GameObjects.Graphics;
  private gateStatusLabel?: Phaser.GameObjects.Text;
  private mickeyVisual?: Phaser.GameObjects.Container;

  public constructor() { super("bent_creek"); }

  public preload(): void {
    this.preloadMapAssets(BENT_CREEK_MAP);
  }

  public create(_data?: { spawn?: "gate_exterior" | "fruitville" }): void {
    this.gateOpen = gameStore.getMickeyDragRaceRecord().unlocked;
    gameStore.setCurrentMap("bent_creek");
    this.tiledWorld = new TiledRuntimeWorld(this.make.tilemap({ key: BENT_CREEK_MAP.tiledMapKey }));
    // Both a fresh Fruitville arrival and an explicit exterior arrival must
    // stop at the staffed gate. `spawn_fruitville` remains an authored,
    // post-gate safe point for future retry/reload flows.
    const spawn = "spawn_gate_exterior";
    this.initializeWorld("bent_creek", this.tiledWorld.point(spawn));
    this.mountCollisionGrid(this.tiledWorld);
    this.drawWorld();
    this.renderGateBarrier(this.gateOpen);
    this.mountInteractions();
    if (this.gateOpen && !gameStore.getMickeyDragRaceRecord().beaten) this.mountMickey(false);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.gateOpen = false;
      this.gateBarrierVisual = undefined;
      this.gateStatusLabel = undefined;
      this.mickeyVisual = undefined;
    });
  }

  public override objectPoint(name: string) { return this.tiledWorld.point(name); }

  private drawWorld(): void {
    for (const layer of getIllustratedMapLayers("bent_creek")) {
      this.add.image(layer.x, layer.y, layer.textureKey)
        .setOrigin(0, 0)
        .setDepth(layer.depth);
    }
  }

  private mountInteractions(): void {
    const attendant = this.tiledWorld.point("gate_attendant");
    this.registerInteraction({
      id: "gate_attendant",
      x: attendant.x,
      y: attendant.y,
      label: "Speak to the gate attendant",
      isAvailable: () => !this.gateOpen,
      interact: () => this.openGatePrompt(),
    });
    const raceRecord = gameStore.getMickeyDragRaceRecord();
    if (raceRecord.unlocked && !raceRecord.beaten) {
      const gateEntry = this.tiledWorld.point("gate_entry");
      this.registerInteraction({
        id: "mickey_drag_race",
        x: gateEntry.x + 18,
        y: gateEntry.y + 128,
        label: raceRecord.introSeen ? "Race Mickey" : "Talk to Mickey",
        interact: () => this.beginMickeyChallenge(),
      });
    }
    const gatehouse = this.tiledWorld.point("gatehouse");
    this.registerInteraction({
      id: "gatehouse",
      x: gatehouse.x,
      y: gatehouse.y,
      label: "Look at the gatehouse",
      interact: () => this.showDialogue([
        { speaker: "Billy", text: "The Bent Creek gatehouse has someone posted beside the entry lane." },
        { speaker: "Billy", text: "A brass visitor board lists two family names: Schwartz and Votilla." },
      ]),
    });
    const clubhouse = this.tiledWorld.point("clubhouse");
    this.registerInteraction({
      id: "clubhouse",
      x: clubhouse.x,
      y: clubhouse.y,
      label: "Look toward the clubhouse",
      interact: () => this.showDialogue([{ speaker: "Billy", text: "The clubhouse sits beyond the guarded road and the cart paths." }]),
    });
    const cartPath = this.tiledWorld.point("golf_cart_path_00");
    this.registerInteraction({
      id: "golf_cart_path_00",
      x: cartPath.x,
      y: cartPath.y,
      label: "Inspect the cart path",
      interact: () => this.showDialogue([{ speaker: "Billy", text: "Golf carts hum along the pale path beyond the gate." }]),
    });
    const exit = this.tiledWorld.rectangle("exit_fruitville");
    this.registerRegionInteraction({
      id: "exit_fruitville",
      x: exit.x + exit.width / 2,
      y: exit.y + exit.height / 2,
      width: exit.width,
      height: exit.height,
      label: "Return to Fruitville Pike",
      isAvailable: () => gameStore.isMapUnlocked("fruitville_pike"),
      interact: () => {
        gameStore.setCurrentMap("fruitville_pike");
        this.scene.start("fruitville_pike", { spawn: "bent_creek" });
      },
    });
  }

  private openGatePrompt(): void {
    if (this.gateOpen) return;
    this.showTextEntry({
      prompt: GATE_ANSWER_PROMPT,
      maxLength: 24,
      onSubmit: (value) => this.resolveGateAnswer(value),
      onCancel: () => gameEvents.emit(EVENT.toast, "The gate attendant waits for a proper introduction."),
    });
  }

  private resolveGateAnswer(value: string): void {
    const answer = normalizeTextEntryForComparison(value, 24);
    if (answer !== "schwartz" && answer !== "votilla") {
      this.showDialogue([{ speaker: "Gate attendant", text: INVALID_GATE_RESPONSE }]);
      return;
    }
    this.gateOpen = true;
    this.removeDynamicObstacle("gate_barrier");
    this.renderGateBarrier(true);
    gameStore.openBentCreekGate();
    gameEvents.emit(EVENT.toast, "The gate attendant lifts the barrier.");
    this.mountMickey(true);
    this.beginMickeyChallenge(true);
  }

  private beginMickeyChallenge(includeAttendant = false): void {
    const raceRecord = gameStore.getMickeyDragRaceRecord();
    if (raceRecord.introSeen) {
      this.startMickeyRace();
      return;
    }
    this.showDialogue([
      ...(includeAttendant ? [{ speaker: "Gate attendant", text: "All right. Head on through." }] : []),
      { speaker: "Mickey", text: "If you want to stick around these parts, you gotta learn to race." },
      { speaker: "Mickey", text: "Meet me on the road. Perfect shifts only." },
    ], () => {
      gameStore.markMickeyDragRaceIntroSeen();
      this.startMickeyRace();
    });
  }

  /** A simple silver early-2000s four-door sedan and its orange-haired driver. */
  private mountMickey(arriving: boolean): void {
    if (this.mickeyVisual) return;
    const entry = this.tiledWorld.point("gate_entry");
    const car = this.add.graphics();
    car.fillStyle(0x202a2f, 0.62).fillEllipse(0, 20, 116, 24);
    car.fillStyle(0xbcc4cb, 1).fillRoundedRect(-54, -15, 108, 35, 8);
    car.fillStyle(0xdfe6e9, 1).fillRoundedRect(-24, -37, 60, 26, 6);
    car.fillStyle(0x52616a, 1).fillRect(-17, -33, 24, 16).fillRect(11, -33, 20, 16);
    car.lineStyle(2, 0x68747a, 1).lineBetween(-1, -35, -1, 18).lineBetween(23, -35, 23, 18);
    car.fillStyle(0x1e2528, 1).fillCircle(-32, 20, 12).fillCircle(31, 20, 12);
    car.fillStyle(0xbec9cf, 1).fillCircle(-32, 20, 5).fillCircle(31, 20, 5);
    car.fillStyle(0xe6cf89, 1).fillRect(49, -4, 5, 10);
    const mickey = this.add.graphics();
    mickey.fillStyle(0xf0b07f, 1).fillCircle(72, -42, 10);
    mickey.lineStyle(6, 0xe06f2e, 1).lineBetween(66, -53, 64, -28).lineBetween(72, -54, 75, -28).lineBetween(78, -51, 82, -31);
    mickey.fillStyle(0x315f4c, 1).fillRoundedRect(63, -30, 19, 27, 5);
    mickey.lineStyle(3, 0xf0b07f, 1).lineBetween(66, -5, 62, 10).lineBetween(79, -5, 84, 10);
    mickey.lineStyle(3, 0x2f3440, 1).lineBetween(68, -2, 67, 17).lineBetween(78, -2, 79, 17);
    const name = this.add.text(72, -68, "MICKEY", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "11px", fontStyle: "bold", color: "#fff5d6",
      backgroundColor: "#173d32dd", padding: { x: 4, y: 2 },
    }).setOrigin(0.5);
    this.mickeyVisual = this.add.container(entry.x + 135, entry.y + 119, [car, mickey, name]).setDepth(53);
    if (arriving) {
      this.mickeyVisual.x += 160;
      this.tweens.add({ targets: this.mickeyVisual, x: entry.x + 135, duration: 700, ease: "Quad.easeOut" });
    }
  }

  private startMickeyRace(): void {
    this.scene.start("mickey_drag_race", { returnMap: "bent_creek" });
  }

  /**
   * The illustrated master contains the gate scenery, so this stateful arm
   * makes the gameplay state unmistakable: horizontal/red while closed and
   * raised/green after the attendant removes the matching collider.
   */
  private renderGateBarrier(open: boolean): void {
    const barrier = this.tiledWorld.rectangle("gate_barrier");
    const x = barrier.x + 12;
    const y = barrier.y + barrier.height / 2;
    const length = Math.max(56, barrier.width - 24);
    const visual = this.gateBarrierVisual ?? this.add.graphics().setDepth(54);
    this.gateBarrierVisual = visual;
    visual.clear();
    visual.fillStyle(0x22362e, 1).fillCircle(x, y, 8);
    visual.lineStyle(11, 0xfff3cf, 1);
    if (open) visual.lineBetween(x, y, x + Math.min(length, barrier.height * 0.55), y - Math.min(length, barrier.height * 0.72));
    else visual.lineBetween(x, y, x + length, y);
    visual.lineStyle(5, open ? 0x4f8c68 : 0xc84c3f, 1);
    if (open) visual.lineBetween(x, y, x + Math.min(length, barrier.height * 0.55), y - Math.min(length, barrier.height * 0.72));
    else visual.lineBetween(x, y, x + length, y);

    const label = this.gateStatusLabel ?? this.add.text(
      barrier.x + barrier.width / 2,
      barrier.y - 10,
      "",
      {
        fontFamily: "system-ui, sans-serif",
        fontSize: "13px",
        fontStyle: "bold",
        color: "#fff9d8",
        backgroundColor: "#173d32dd",
        padding: { x: 6, y: 3 },
      },
    ).setOrigin(0.5).setDepth(55);
    this.gateStatusLabel = label;
    label.setText(open ? "GATE OPEN" : "STOP • ATTENDANT")
      .setColor(open ? "#c9f3d6" : "#fff9d8");
  }

  protected override getDebugObjectivePosition(): { x: number; y: number } {
    return this.tiledWorld.point(this.gateOpen ? "clubhouse" : "gate_attendant");
  }
}
