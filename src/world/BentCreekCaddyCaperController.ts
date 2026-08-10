import Phaser from "phaser";
import { CADDY_CAPER_DIALOGUE } from "../content/chapters/chapter-01/quests/bent-creek-caddy-caper/dialogue";
import { advanceCaddyCaperStage, type CaddyCaperStage } from "../content/chapters/chapter-01/quests/bent-creek-caddy-caper/rules";
import { EVENT, gameEvents } from "../game/events";
import { gameStore } from "../game/GameStore";
import type { ExplorationInteractionHost } from "./contracts";

export interface BentCreekCaddyCaperRecord {
  stage: CaddyCaperStage;
  clueIndex: number;
  puttGates: number;
  sprinklerIndex: number;
  bestRematchScore: number | null;
}

interface CaddyCaperStore {
  getBentCreekCaddyCaperRecord(): BentCreekCaddyCaperRecord;
  setBentCreekCaddyCaperRecord(record: BentCreekCaddyCaperRecord): void;
  addInventoryItem(item: "bent_creek_visitor_badge"): void;
}

export interface BentCreekCaddyCaperHost extends ExplorationInteractionHost {
  readonly settings: { reducedMotion: boolean };
}

const IDS = ["caper_schwartz", "caper_display", "caper_clue_0", "caper_clue_1", "caper_clue_2", "caper_putt_0", "caper_putt_1", "caper_putt_2", "caper_valve_0", "caper_valve_1", "caper_valve_2", "caper_trophy", "caper_return", "caper_rematch"] as const;
const CLUE_POINTS = ["golf_cart_path_00", "golf_cart_path_03", "golf_cart_path_06"] as const;
const PUTT_POINTS = ["golf_cart_path_04", "golf_cart_path_07", "golf_cart_path_10"] as const;
const VALVE_COLORS = [0x539ec9, 0xe6bd4d, 0x5b9b63] as const;

/**
 * Bent Creek-only presentation and interaction binding. Its compact record
 * adapter keeps save-schema ownership in GameStore, not in a Phaser scene.
 */
export class BentCreekCaddyCaperController {
  private readonly store = gameStore as unknown as CaddyCaperStore;
  private visuals: Phaser.GameObjects.GameObject[] = [];
  private trophy?: Phaser.GameObjects.Container;
  private rematchStartedAt = 0;

  public constructor(private readonly host: BentCreekCaddyCaperHost) {}

  public mount(): void {
    this.dispose();
    const state = gameStore.getState();
    // The unlocked gate is the quest's journal prerequisite. Mickey's drag
    // race stays optional; selecting this memory must never strand Billy in
    // an otherwise empty Bent Creek map.
    if (state.activeQuestId !== "bent_creek_caddy_caper"
      && state.questProgress.bentCreekCaddyCaper.stage !== "complete") return;
    this.drawPresentation();
    this.registerInteractions();
  }

  public dispose(): void {
    for (const id of IDS) this.host.unregisterInteraction(id);
    this.visuals.forEach((visual) => visual.destroy());
    this.visuals = [];
    this.trophy = undefined;
  }

  private record(): BentCreekCaddyCaperRecord { return this.store.getBentCreekCaddyCaperRecord(); }

  private update(patch: Partial<BentCreekCaddyCaperRecord>): BentCreekCaddyCaperRecord {
    const next = { ...this.record(), ...patch };
    this.store.setBentCreekCaddyCaperRecord(next);
    return next;
  }

  private advance(event: Parameters<typeof advanceCaddyCaperStage>[1], patch: Partial<BentCreekCaddyCaperRecord> = {}): void {
    const record = this.record();
    this.update({ ...patch, stage: advanceCaddyCaperStage(record.stage, event) });
    this.mount();
  }

  private point(name: string) { return this.host.objectPoint(name); }

  private registerInteractions(): void {
    const stage = this.record().stage;
    const schwartz = this.point("golf_cart_path_10");
    this.host.registerInteraction({
      id: "caper_schwartz", x: schwartz.x + 36, y: schwartz.y - 30, label: "Talk to Schwartz about the trophy",
      isAvailable: () => stage === "inspect_display", interact: () => this.host.showDialogue(CADDY_CAPER_DIALOGUE.inspect_display as any),
    });
    const clubhouse = this.point("clubhouse");
    this.host.registerInteraction({
      id: "caper_display", x: clubhouse.x - 36, y: clubhouse.y + 38, label: "Inspect the ceremonial trophy display",
      isAvailable: () => stage === "inspect_display", interact: () => this.inspectDisplay(),
    });
    CLUE_POINTS.forEach((name, index) => {
      const point = this.point(name);
      this.host.registerInteraction({
        id: `caper_clue_${index}`, x: point.x, y: point.y, label: `Follow golf-ball clue ${index + 1}`,
        isAvailable: () => this.record().stage === "follow_clues" && this.record().clueIndex === index,
        interact: () => this.crossCartLane(index),
      });
    });
    PUTT_POINTS.forEach((name, index) => {
      const point = this.point(name);
      this.host.registerInteraction({
        id: `caper_putt_${index}`, x: point.x - 22, y: point.y + 24, label: `Putt through practice gate ${index + 1}`,
        isAvailable: () => this.record().stage === "putt_gates" && this.record().puttGates === index,
        interact: () => this.puttGate(index),
      });
    });
    const yard = this.host.objectPoint("maintenance_yard");
    [0, 1, 2].forEach((index) => this.host.registerInteraction({
      id: `caper_valve_${index}`, x: yard.x + 48 + index * 58, y: yard.y + 95,
      label: `Turn ${["blue", "gold", "green"][index]} sprinkler valve`,
      isAvailable: () => this.record().stage === "sprinklers",
      interact: () => this.turnValve(index),
    }));
    const trophyPoint = this.point("golf_cart_path_11");
    this.host.registerInteraction({
      id: "caper_trophy", x: trophyPoint.x, y: trophyPoint.y, label: "Catch the rolling trophy",
      isAvailable: () => this.record().stage === "chase_trophy", interact: () => this.catchTrophy(),
    });
    this.host.registerInteraction({
      id: "caper_return", x: clubhouse.x - 12, y: clubhouse.y + 62, label: "Return the trophy to Schwartz",
      isAvailable: () => this.record().stage === "return_trophy", interact: () => this.returnTrophy(),
    });
    this.host.registerInteraction({
      id: "caper_rematch", x: schwartz.x + 92, y: schwartz.y + 18, label: "Try Mickey's trophy-roll rematch",
      isAvailable: () => this.record().stage === "complete", interact: () => this.startRematch(),
    });
  }

  private inspectDisplay(): void {
    this.host.showDialogue([
      { speaker: "You", text: "The empty velvet stand reads: BENT CREEK CEREMONIAL CUP — return before sunset." },
      { speaker: "Billy", text: "Gold cup, little flag handle. Got it. The golf balls should show where Mickey went." },
    ], () => {
      this.advance({ type: "display_inspected" });
      gameEvents.emit(EVENT.toast, "Objective updated: follow the golf-ball trail.");
    });
  }

  private crossCartLane(index: number): void {
    this.host.showChoice({ speaker: "Billy", prompt: "A cart is humming toward the crossing. What do you do?", options: [
      { id: "wait", label: "Wait for the gap" }, { id: "dash", label: "Dash across" },
    ], onSelect: (answer) => {
      if (answer !== "wait") { gameEvents.emit(EVENT.toast, "Cart bell! Better wait for a clear lane."); return; }
      const next = index + 1;
      if (next === CLUE_POINTS.length) {
        this.host.showDialogue([{ speaker: "Billy", text: "The last ball rolled straight through the practice gates." }], () => this.advance({ type: "clues_followed" }, { clueIndex: next }));
      } else {
        this.update({ clueIndex: next }); this.mount(); gameEvents.emit(EVENT.toast, "Safe crossing — follow the next golf ball.");
      }
    }});
  }

  private puttGate(index: number): void {
    this.host.showChoice({ speaker: "Billy", prompt: `Practice gate ${index + 1}: choose your stroke.`, options: [
      { id: "soft", label: "Smooth tap" }, { id: "hard", label: "Power smash" },
    ], onSelect: (answer) => {
      if (answer !== "soft") { gameEvents.emit(EVENT.toast, "Too hard — the ball rattles past the gate."); return; }
      const point = this.point(PUTT_POINTS[index]!);
      this.animateBall(point.x - 52, point.y + 24, point.x + 30, point.y + 3);
      const next = index + 1;
      if (next === PUTT_POINTS.length) this.host.showDialogue(CADDY_CAPER_DIALOGUE.sprinklers as any, () => this.advance({ type: "gates_putted" }, { puttGates: next }));
      else { this.update({ puttGates: next }); this.mount(); gameEvents.emit(EVENT.toast, `Gate ${next} cleared!`); }
    }});
  }

  private turnValve(index: number): void {
    const record = this.record();
    if (index !== record.sprinklerIndex) {
      this.update({ sprinklerIndex: 0 }); this.mount();
      gameEvents.emit(EVENT.toast, "Wrong valve — the hedge stays dry. Blue, gold, green.");
      return;
    }
    this.sprayValve(index);
    const next = index + 1;
    if (next === 3) {
      this.host.showDialogue([
        { speaker: "Billy", text: "There it is!" },
        { speaker: "Mickey", text: "Nice find. Now try to keep up!" },
      ], () => this.beginChase());
    } else { this.update({ sprinklerIndex: next }); gameEvents.emit(EVENT.toast, "Valve set — keep the sequence going."); }
  }

  private beginChase(): void {
    this.advance({ type: "sprinklers_set" }, { sprinklerIndex: 3 });
    const start = this.point("golf_cart_path_08"); const end = this.point("golf_cart_path_11");
    this.trophy?.setPosition(start.x, start.y);
    if (this.trophy && !this.host.settings.reducedMotion) this.host.world.tweens.add({ targets: this.trophy, x: end.x, y: end.y, angle: 720, duration: 1250, ease: "Quad.easeIn" });
  }

  private catchTrophy(): void {
    this.host.showDialogue([{ speaker: "Billy", text: "Got it! Mickey nearly sent it into the rough." }], () => {
      this.advance({ type: "trophy_caught" }); gameEvents.emit(EVENT.toast, "Ceremonial trophy recovered.");
    });
  }

  private returnTrophy(): void {
    this.host.showDialogue([
      ...CADDY_CAPER_DIALOGUE.complete,
      { speaker: "Mickey", text: "Rematch later, Billy. I can make that cup roll even faster." },
    ], () => {
      this.store.addInventoryItem("bent_creek_visitor_badge");
      this.advance({ type: "trophy_returned" });
      gameEvents.emit(EVENT.toast, "Reward earned: Bent Creek visitor badge.");
    });
  }

  private startRematch(): void {
    this.rematchStartedAt = this.host.world.time.now;
    this.host.showChoice({ speaker: "Mickey", prompt: "The trophy rolls past three cones. Call your catch!", options: [
      { id: "catch", label: "Catch it!" }, { id: "watch", label: "Watch the line" },
    ], onSelect: (choice) => {
      if (choice !== "catch") { gameEvents.emit(EVENT.toast, "Mickey wins that round. Try again."); return; }
      const score = Math.max(1, Math.round(5000 - (this.host.world.time.now - this.rematchStartedAt)));
      const best = this.record().bestRematchScore;
      this.update({ bestRematchScore: best === null ? score : Math.max(best, score) });
      gameEvents.emit(EVENT.toast, `Rematch score: ${score}${!best || score > best ? " — new best!" : ""}`);
    }});
  }

  private drawPresentation(): void {
    const world = this.host.world;
    const clubhouse = this.point("clubhouse");
    const display = world.add.graphics().setDepth(41);
    display.fillStyle(0x4b3040, .92).fillRoundedRect(clubhouse.x - 70, clubhouse.y + 20, 68, 44, 5);
    display.lineStyle(3, 0xd8ae55, 1).strokeRoundedRect(clubhouse.x - 70, clubhouse.y + 20, 68, 44, 5);
    display.fillStyle(0x241d27, 1).fillRect(clubhouse.x - 51, clubhouse.y + 31, 30, 18);
    this.visuals.push(display);
    const plaque = world.add.text(clubhouse.x - 36, clubhouse.y + 69, "CEREMONIAL CUP", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "8px", color: "#ffe7a4", backgroundColor: "#302230cc", padding: { x: 3, y: 1 },
    }).setOrigin(.5).setDepth(42);
    this.visuals.push(plaque);
    // Balls make the authored trail readable even against the illustrated map.
    CLUE_POINTS.forEach((name, index) => {
      const p = this.point(name); const ball = world.add.graphics().setDepth(43);
      ball.fillStyle(0xfffcdf, 1).fillCircle(p.x, p.y, 8).lineStyle(2, 0x5f7659, 1).strokeCircle(p.x, p.y, 8);
      ball.fillStyle(0xd6b54b, 1).fillCircle(p.x + 3, p.y - 2, 2); this.visuals.push(ball);
      if (!this.host.settings.reducedMotion) world.tweens.add({ targets: ball, angle: index % 2 ? -12 : 12, duration: 640, yoyo: true, repeat: -1 });
    });
    PUTT_POINTS.forEach((name, index) => {
      const p = this.point(name); const gate = world.add.graphics().setDepth(42);
      gate.lineStyle(5, 0xf4ead0, 1).lineBetween(p.x - 14, p.y + 20, p.x - 14, p.y - 16).lineBetween(p.x - 14, p.y - 16, p.x + 14, p.y - 16).lineBetween(p.x + 14, p.y - 16, p.x + 14, p.y + 20);
      gate.lineStyle(2, [0x5a9c6a, 0xd5ac46, 0x5a87ae][index]!, 1).strokeRect(p.x - 17, p.y - 20, 34, 44); this.visuals.push(gate);
    });
    const yard = this.host.objectPoint("maintenance_yard");
    [0, 1, 2].forEach((index) => {
      const valve = world.add.graphics().setDepth(45); const x = yard.x + 48 + index * 58; const y = yard.y + 95;
      valve.fillStyle(0x343e3a, 1).fillCircle(x, y, 13).fillStyle(VALVE_COLORS[index]!, 1).fillCircle(x, y, 8); this.visuals.push(valve);
    });
    const trophyP = this.point("golf_cart_path_11"); this.trophy = this.makeTrophy(trophyP.x, trophyP.y); this.visuals.push(this.trophy);
    const mickeyPoint = this.point("golf_cart_path_08");
    const mickey = world.add.graphics().setDepth(48);
    mickey.fillStyle(0xf0b07f, 1).fillCircle(mickeyPoint.x, mickeyPoint.y - 25, 10);
    mickey.lineStyle(6, 0xe06f2e, 1).lineBetween(mickeyPoint.x - 6, mickeyPoint.y - 35, mickeyPoint.x - 8, mickeyPoint.y - 15).lineBetween(mickeyPoint.x, mickeyPoint.y - 36, mickeyPoint.x + 2, mickeyPoint.y - 15).lineBetween(mickeyPoint.x + 7, mickeyPoint.y - 34, mickeyPoint.x + 10, mickeyPoint.y - 16);
    mickey.fillStyle(0x315f4c, 1).fillRoundedRect(mickeyPoint.x - 10, mickeyPoint.y - 13, 20, 28, 5);
    mickey.lineStyle(3, 0xf0b07f, 1).lineBetween(mickeyPoint.x - 8, mickeyPoint.y - 9, mickeyPoint.x - 25, mickeyPoint.y - 23).lineBetween(mickeyPoint.x + 8, mickeyPoint.y - 9, mickeyPoint.x + 27, mickeyPoint.y - 22);
    this.visuals.push(mickey);
    if (!this.host.settings.reducedMotion) world.tweens.add({ targets: mickey, angle: { from: -3, to: 3 }, duration: 420, yoyo: true, repeat: -1 });
    this.drawMovingCarts();
  }

  private makeTrophy(x: number, y: number): Phaser.GameObjects.Container {
    const cup = this.host.world.add.graphics();
    cup.fillStyle(0x2b2630, .45).fillEllipse(0, 15, 36, 10);
    cup.fillStyle(0xf2ca54, 1).fillTriangle(-13, -17, 13, -17, 9, 8).fillTriangle(-13, -17, -9, 8, 9, 8).fillRect(-5, 8, 10, 12).fillRoundedRect(-14, 19, 28, 7, 3);
    cup.lineStyle(3, 0x9b6722, 1).lineBetween(-13, -3, -21, 7).lineBetween(13, -3, 21, 7);
    const sparkle = this.host.world.add.text(0, -30, "✦", { fontSize: "22px", color: "#fff6a5" }).setOrigin(.5);
    const trophy = this.host.world.add.container(x, y, [cup, sparkle]).setDepth(49);
    if (!this.host.settings.reducedMotion) this.host.world.tweens.add({ targets: sparkle, scale: { from: .7, to: 1.2 }, alpha: { from: .5, to: 1 }, duration: 620, yoyo: true, repeat: -1 });
    return trophy;
  }

  private drawMovingCarts(): void {
    const start = this.point("golf_cart_path_00"); const end = this.point("golf_cart_path_08");
    [0, 1].forEach((index) => {
      const cart = this.host.world.add.graphics().setDepth(44); cart.fillStyle(0x1e2630, .35).fillEllipse(0, 12, 58, 15); cart.fillStyle(index ? 0x7cba8e : 0xbec8c0, 1).fillRoundedRect(-26, -10, 52, 24, 5); cart.lineStyle(3, 0x3c4f4a, 1).lineBetween(-16, -23, 18, -23).lineBetween(-16, -23, -16, 2).lineBetween(18, -23, 18, 2); cart.fillStyle(0x222933, 1).fillCircle(-16, 14, 7).fillCircle(16, 14, 7); cart.setPosition(start.x, start.y); this.visuals.push(cart);
      if (!this.host.settings.reducedMotion) this.host.world.tweens.add({ targets: cart, x: end.x, y: end.y, duration: 3500 + index * 600, delay: index * 1200, repeat: -1, ease: "Sine.easeInOut" });
    });
  }

  private animateBall(fromX: number, fromY: number, toX: number, toY: number): void {
    const ball = this.host.world.add.graphics().setDepth(52); ball.fillStyle(0xfffdeb, 1).fillCircle(0, 0, 7); ball.setPosition(fromX, fromY); this.visuals.push(ball);
    this.host.world.tweens.add({ targets: ball, x: toX, y: toY, angle: 540, duration: this.host.settings.reducedMotion ? 1 : 520, ease: "Quad.easeOut", onComplete: () => ball.destroy() });
  }

  private sprayValve(index: number): void {
    const yard = this.host.objectPoint("maintenance_yard"); const x = yard.x + 48 + index * 58; const spray = this.host.world.add.graphics().setDepth(46);
    spray.lineStyle(3, 0xa8e8ff, .85).lineBetween(x, yard.y + 88, x - 28, yard.y + 35).lineBetween(x, yard.y + 88, x + 30, yard.y + 40); this.visuals.push(spray);
    this.host.world.tweens.add({ targets: spray, alpha: 0, duration: this.host.settings.reducedMotion ? 1 : 700, onComplete: () => spray.destroy() });
  }
}
