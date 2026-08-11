import Phaser from "phaser";
import { getCreekClubhouseDialogue } from "../content/chapters/chapter-01/quests/creek-clubhouse/dialogue";
import {
  advanceCreekClubhouseStage,
  hasAllClubhouseSupplies,
  type ClubhouseDesign,
  type ClubhouseSupply,
  type CreekClubhouseStage,
} from "../content/chapters/chapter-01/quests/creek-clubhouse/rules";
import { EVENT, gameEvents, inputCapture, type InputActionEvent } from "../game/events";
import { gameStore } from "../game/GameStore";
import type { ExplorationInteractionHost } from "./contracts";
import { CharacterFactory } from "./CharacterFactory";

type ClubhouseRecord = {
  stage: CreekClubhouseStage;
  design: ClubhouseDesign | null;
  supplies: ClubhouseSupply[];
  constructionStep: number;
  knockBeats: number[];
};
type ClubhouseStore = typeof gameStore & {
  getCreekClubhouseRecord(): ClubhouseRecord;
  setCreekClubhouseRecord(record: ClubhouseRecord): void;
};
const clubhouseStore = gameStore as ClubhouseStore;
const CLEARING = { x: 560, y: 230 };
const IDS = ["clubhouse_chalk", "clubhouse_branches", "clubhouse_build", "clubhouse_shortcut"] as const;
const BUILD_ORDER = ["floor", "frame", "tarp"] as const;

/** Creek Woods half: design board, branch gathering, playable build, knock, and persistent landmark. */
export class CreekClubhouseController {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly overlay: Phaser.GameObjects.GameObject[] = [];
  private buildPiece = 0;
  private strikes = 0;
  private knockTimes: number[] = [];
  private readonly overlayTimers: Phaser.Time.TimerEvent[] = [];
  private overlayActionHandler?: (event: InputActionEvent) => void;

  public constructor(private readonly host: ExplorationInteractionHost & { returnToNeighborhood(): void }) {}

  public mount(): void {
    this.dispose();
    const state = gameStore.getState();
    const stage = this.record().stage;
    // Completion turns the clearing into a world landmark, not a quest-only
    // prop. Keep its reveal and shortcut available after the player starts a
    // different memory from the journal.
    if (state.activeQuestId !== "creek_clubhouse" && stage !== "complete") return;
    if (stage === "choose_design" || stage === "collect_supplies") this.renderChalkBoard();
    if (stage === "build_clubhouse" || stage === "secret_knock") this.renderScaffold();
    if (stage === "complete") this.renderFinishedClubhouse(false);
    this.registerInteractions();
  }

  public dispose(): void {
    this.clearOverlay();
    this.objects.forEach((object) => object.destroy());
    this.objects.length = 0;
    IDS.forEach((id) => { this.host.unregisterInteraction(id); this.host.unregisterRegionInteraction(id); });
  }

  private registerInteractions(): void {
    this.host.registerInteraction({
      id: "clubhouse_chalk", ...CLEARING, label: "Choose a clubhouse chalk sketch",
      isAvailable: () => this.at("choose_design"), interact: () => this.chooseDesign(),
    });
    this.host.registerInteraction({
      id: "clubhouse_branches", x: 726, y: 380, label: "Gather sturdy creek branches",
      isAvailable: () => this.at("collect_supplies") && !this.record().supplies.includes("branches"),
      interact: () => this.collectBranches(),
    });
    this.host.registerInteraction({
      id: "clubhouse_build", ...CLEARING, label: "Build the clubhouse",
      isAvailable: () => this.at("build_clubhouse") || this.at("secret_knock"),
      interact: () => this.at("build_clubhouse") ? this.startConstruction() : this.startSecretKnock(),
    });
    this.host.registerRegionInteraction({
      id: "clubhouse_shortcut", ...CLEARING, width: 210, height: 120, label: "Take the hidden path to Wheatfield Drive",
      isAvailable: () => this.record().stage === "complete",
      interact: () => this.host.showDialogue(getCreekClubhouseDialogue("shortcut"), () => this.host.returnToNeighborhood()),
    });
  }

  private chooseDesign(): void {
    this.host.showChoice({
      speaker: "Andrew's chalk board", prompt: "What kind of clubhouse should the clearing become?",
      options: [
        { id: "lookout", label: "Lookout — tall flag and windows" },
        { id: "fort", label: "Fort — sturdy walls" },
        { id: "hidden_den", label: "Hidden den — low tarp camouflage" },
      ],
      onSelect: (id) => {
        if (!(["lookout", "fort", "hidden_den"] as string[]).includes(id)) return;
        const record = this.record();
        clubhouseStore.setCreekClubhouseRecord({ ...record, design: id as ClubhouseDesign });
        this.advance("design_chosen", { type: "design_chosen", design: id as ClubhouseDesign });
        gameEvents.emit(EVENT.toast, `${id.replace("_", " ")} chosen. Get rope, a blanket, and creek branches.`);
        this.mount();
      },
    });
  }

  private collectBranches(): void {
    this.host.showDialogue(getCreekClubhouseDialogue("branches"), () => {
      const record = this.record();
      const supplies: ClubhouseSupply[] = record.supplies.includes("branches")
        ? record.supplies
        : [...record.supplies, "branches"];
      clubhouseStore.setCreekClubhouseRecord({ ...record, supplies });
      this.tryAdvanceSupplies();
      this.mount();
    });
  }

  private tryAdvanceSupplies(): void {
    const record = this.record();
    if (!hasAllClubhouseSupplies(record.supplies) || record.stage !== "collect_supplies") return;
    this.host.showDialogue(getCreekClubhouseDialogue("supplies_ready"), () => {
      this.advance("supplies_collected", { type: "supplies_collected" });
      this.mount();
    });
  }

  private startConstruction(): void {
    this.clearOverlay();
    // A player can leave the clearing between pieces; keep the completed
    // ordering work in the save instead of silently restarting the mini-game.
    this.buildPiece = Math.min(this.record().constructionStep, BUILD_ORDER.length - 1);
    this.strikes = 0;
    this.host.showDialogue(getCreekClubhouseDialogue("construction"), () => this.showPiecePicker());
  }

  private showPiecePicker(): void {
    this.clearOverlay();
    const expected = BUILD_ORDER[this.buildPiece]!;
    this.addOverlayText(512, 92, `Build order: FLOOR → FRAME → TARP\nChoose the next piece (${this.buildPiece + 1}/3).`, 18);
    this.addOverlayText(512, 264, "← → choose  •  E / SPACE confirm  •  ESC cancel", 13);
    let selected = this.buildPiece;
    const buttons: Phaser.GameObjects.Rectangle[] = [];
    const selectPiece = (piece: string): void => {
      if (piece !== expected) {
        gameEvents.emit(EVENT.toast, `${piece} is not next — check Andrew's order.`);
        return;
      }
      this.startHammerTiming(piece);
    };
    const updateSelection = (): void => {
      buttons.forEach((button, index) => {
        const focused = index === selected;
        button.setFillStyle(index === this.buildPiece ? 0x4d7953 : 0x7d5f42);
        button.setStrokeStyle(focused ? 5 : 3, focused ? 0xffffff : 0xfff0ad);
      });
    };
    BUILD_ORDER.forEach((piece, index) => {
      const button = this.host.world.add.rectangle(350 + index * 165, 190, 145, 52, piece === expected ? 0x4d7953 : 0x7d5f42)
        .setScrollFactor(0).setDepth(200).setStrokeStyle(3, 0xfff0ad).setInteractive({ useHandCursor: true });
      const label = this.host.world.add.text(button.x, button.y, piece.toUpperCase(), { fontFamily: "system-ui", fontSize: "15px", fontStyle: "bold", color: "#fff9d8" })
        .setOrigin(0.5).setScrollFactor(0).setDepth(201);
      button.on("pointerdown", () => {
        selectPiece(piece);
      });
      buttons.push(button);
      this.overlay.push(button, label);
    });
    updateSelection();
    this.captureOverlayInput((event) => {
      if (event.action === "moveLeft" || event.action === "tabPrevious") {
        selected = (selected + BUILD_ORDER.length - 1) % BUILD_ORDER.length;
        updateSelection();
      } else if (event.action === "moveRight" || event.action === "tabNext") {
        selected = (selected + 1) % BUILD_ORDER.length;
        updateSelection();
      } else if (event.action === "interact") {
        selectPiece(BUILD_ORDER[selected]!);
      }
    });
  }

  private startHammerTiming(piece: string): void {
    this.clearOverlay();
    this.strikes = 0;
    const panel = this.host.world.add.rectangle(512, 150, 430, 132, 0x203a35, 0.94).setScrollFactor(0).setDepth(200).setStrokeStyle(3, 0xf6d48a);
    const meter = this.host.world.add.rectangle(512, 165, 330, 18, 0x586f66).setScrollFactor(0).setDepth(201);
    const sweet = this.host.world.add.rectangle(512, 165, 52, 26, 0xf6d48a, 0.72).setScrollFactor(0).setDepth(202);
    const marker = this.host.world.add.rectangle(347, 165, 8, 34, 0xfffbdb).setScrollFactor(0).setDepth(203);
    const instruction = this.addOverlayText(512, 104, `Hammer the ${piece}: hit the bright mark twice.\nE / SPACE strikes  •  ESC cancel`, 16);
    const button = this.host.world.add.rectangle(512, 222, 175, 42, 0xb85b35).setScrollFactor(0).setDepth(202).setInteractive({ useHandCursor: true });
    const buttonText = this.host.world.add.text(512, 222, "STRIKE!", { fontFamily: "system-ui", fontSize: "16px", fontStyle: "bold", color: "#fff9d8" }).setOrigin(0.5).setScrollFactor(0).setDepth(203);
    if (!this.reducedMotion) {
      const tick = this.host.world.time.addEvent({ delay: 16, loop: true, callback: () => {
        if (!marker.active) return;
        marker.x = 347 + ((Math.sin(this.host.world.time.now / 180) + 1) / 2) * 330;
      } });
      this.overlayTimers.push(tick);
    } else {
      marker.x = 512;
    }
    const strike = (): void => {
      const centered = Math.abs(marker.x - 512) <= 32;
      if (!centered) { gameEvents.emit(EVENT.toast, "Too early! Wait for the bright mark."); return; }
      this.strikes += 1;
      marker.setFillStyle(0x8de0a2);
      if (!this.reducedMotion) this.host.world.tweens.add({ targets: marker, scaleY: 1.7, yoyo: true, duration: 110 });
      if (this.strikes < 2) { gameEvents.emit(EVENT.toast, "Solid hit — one more."); return; }
      this.buildPiece += 1;
      const record = this.record();
      clubhouseStore.setCreekClubhouseRecord({ ...record, constructionStep: this.buildPiece });
      this.clearOverlay();
      if (this.buildPiece < BUILD_ORDER.length) this.showPiecePicker();
      else {
        this.advance("construction_finished", { type: "construction_finished" });
        this.mount();
        gameEvents.emit(EVENT.toast, "The clubhouse stands. Now for the secret knock.");
      }
    };
    button.on("pointerdown", strike);
    this.overlay.push(panel, meter, sweet, marker, instruction, button, buttonText);
    this.captureOverlayInput((event) => {
      if (event.action === "interact") strike();
    });
  }

  private startSecretKnock(): void {
    this.clearOverlay();
    this.knockTimes = [];
    const panel = this.host.world.add.rectangle(512, 155, 450, 155, 0x26364a, 0.96).setScrollFactor(0).setDepth(200).setStrokeStyle(3, 0xf6d48a);
    const clue = this.addOverlayText(512, 104, "Secret knock: TAP, TAP, pause, TAP", 18);
    const status = this.addOverlayText(512, 140, "Listen for the rhythm, then knock. E / SPACE knocks.", 14);
    const button = this.host.world.add.rectangle(512, 220, 180, 52, 0x4d7953).setScrollFactor(0).setDepth(201).setInteractive({ useHandCursor: true });
    const label = this.host.world.add.text(512, 220, "KNOCK", { fontFamily: "system-ui", fontSize: "18px", fontStyle: "bold", color: "#fff9d8" }).setOrigin(0.5).setScrollFactor(0).setDepth(202);
    const knock = (): void => {
      const now = this.host.world.time.now;
      this.knockTimes.push(now);
      const count = this.knockTimes.length;
      if (count > 1) {
        const gap = now - this.knockTimes[count - 2]!;
        const expectedPause = count === 3;
        const valid = expectedPause ? gap >= 470 && gap <= 1500 : gap >= 75 && gap <= 700;
        if (!valid) { this.knockTimes = [now]; status.setText("Not quite — start again: tap, tap, pause, tap."); return; }
      }
      status.setText(count < 4 ? `Good — ${count}/4` : "That's the knock!");
      if (count !== 4) return;
      this.clearOverlay();
      const record = this.record();
      // Persist the authored rhythm, not absolute scene-clock timestamps.
      // The latter would fail save validation and have no meaning after reload.
      clubhouseStore.setCreekClubhouseRecord({ ...record, knockBeats: [1, 1, 3, 1] });
      this.advance("knock_matched", { type: "knock_matched" });
      gameStore.addSecret("creek_clubhouse_shortcut");
      gameStore.addSecret("creek_clubhouse_landmark");
      gameStore.addInventoryItem("clubhouse_journal_page");
      this.renderFinishedClubhouse(true);
      this.host.showDialogue(getCreekClubhouseDialogue("complete"), () => this.mount());
    };
    button.on("pointerdown", knock);
    this.overlay.push(panel, clue, status, button, label);
    this.captureOverlayInput((event) => {
      if (event.action === "interact") knock();
    });
  }

  private renderChalkBoard(): void {
    // The early design choice now uses the supplied half-built clubhouse
    // illustration as its pinboard instead of a plain world rectangle.
    const board = this.host.world.add.image(CLEARING.x, CLEARING.y + 22, "clubhouse-halfBuilt")
      .setOrigin(0.5, 0.9).setDisplaySize(150, 140).setDepth(38).setAlpha(0.84);
    const words = this.host.world.add.text(CLEARING.x, CLEARING.y - 7, "LOOKOUT  FORT\n  HIDDEN DEN", { fontFamily: "cursive", fontSize: "13px", color: "#f7e6a3", align: "center" }).setOrigin(0.5).setDepth(39);
    this.objects.push(board, words, this.host.addLabel(CLEARING.x, CLEARING.y - 69, "Andrew's chalk sketches", "#fff9d8"));
  }

  private renderScaffold(): void {
    const frame = this.host.world.add.image(558, 240, "clubhouse-frame").setOrigin(0.5, 0.9).setDisplaySize(185, 210).setDepth(39);
    this.objects.push(frame, this.host.addLabel(558, 111, "Clubhouse frame", "#fff9d8"));
  }

  private renderFinishedClubhouse(animated: boolean): void {
    const clubhouse = this.host.world.add.image(558, 274, "clubhouse-complete").setOrigin(0.5, 0.9).setDisplaySize(230, 250).setDepth(40).setAlpha(animated && !this.reducedMotion ? 0 : 1);
    const flagCloth = this.host.world.add.image(635, 131, "clubhouse-flag").setOrigin(0.08, 0.65).setDisplaySize(44, 54).setDepth(43);
    const label = this.host.addLabel(558, 89, "Creek Clubhouse", "#fff9d8");
    this.objects.push(clubhouse, flagCloth, label);
    if (!this.reducedMotion) this.host.world.tweens.add({ targets: flagCloth, angle: { from: -4, to: 5 }, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    if (!animated) return;
    if (!this.reducedMotion) {
      this.host.world.tweens.add({ targets: clubhouse, alpha: 1, scale: { from: 0.92, to: 1 }, duration: 620, ease: "Sine.easeOut" });
      const dust = Array.from({ length: 6 }, (_, i) => this.host.world.add.circle(500 + i * 24, 300, 8, 0xd8c39a, 0.8).setDepth(44));
      this.objects.push(...dust);
      this.host.world.tweens.add({ targets: dust, y: "-=28", alpha: 0, scale: 1.9, duration: 740, delay: this.host.world.tweens.stagger(70), onComplete: () => dust.forEach((puff) => puff.destroy()) });
    }
    const friends = [
      CharacterFactory.createNpc(this.host.world, { id: "andrew", x: 505, y: 302, depth: 44, scale: 0.28 }),
      CharacterFactory.createNpc(this.host.world, { id: "jeremy", x: 620, y: 302, depth: 44, scale: 0.28 }),
      CharacterFactory.createNpc(this.host.world, { id: "billy", x: 575, y: 315, depth: 44, scale: 0.28 }),
    ];
    this.objects.push(...friends);
    if (this.reducedMotion) friends.forEach((friend) => friend.setPosition(558, 270).setScale(0.2));
    else this.host.world.tweens.add({ targets: friends, x: 558, y: 270, scale: 0.2, duration: 720, delay: this.host.world.tweens.stagger(110), ease: "Sine.easeIn" });
  }

  private addOverlayText(x: number, y: number, text: string, fontSize: number): Phaser.GameObjects.Text {
    const label = this.host.world.add.text(x, y, text, { fontFamily: "system-ui", fontSize: `${fontSize}px`, fontStyle: "bold", color: "#fff9d8", align: "center", backgroundColor: "#162d2ad9", padding: { x: 9, y: 6 } }).setOrigin(0.5).setScrollFactor(0).setDepth(204);
    this.overlay.push(label);
    return label;
  }

  private get reducedMotion(): boolean { return gameStore.getState().settings.reducedMotion; }

  private captureOverlayInput(handle: (event: InputActionEvent) => void): void {
    inputCapture.capture("creek-clubhouse-minigame", { blockMenuToggle: true });
    this.overlayActionHandler = (event) => {
      if (!event.pressed) return;
      if (event.action === "back" || event.action === "menu") {
        this.clearOverlay();
        return;
      }
      handle(event);
    };
    gameEvents.on(EVENT.inputAction, this.overlayActionHandler);
  }

  private clearOverlay(): void {
    this.overlayTimers.splice(0).forEach((timer) => timer.destroy());
    if (this.overlayActionHandler) gameEvents.off(EVENT.inputAction, this.overlayActionHandler);
    this.overlayActionHandler = undefined;
    inputCapture.release("creek-clubhouse-minigame");
    this.overlay.splice(0).forEach((object) => object.destroy());
  }
  private record(): ClubhouseRecord { return clubhouseStore.getCreekClubhouseRecord(); }
  private at(stage: CreekClubhouseStage): boolean { return gameStore.isQuestAt("creek_clubhouse" as never, stage as never); }
  private advance(_name: string, event: Parameters<typeof advanceCreekClubhouseStage>[1]): void {
    const next = advanceCreekClubhouseStage(this.record().stage, event);
    gameStore.setQuestStage(next as never);
  }
}
