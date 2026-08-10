import Phaser from "phaser";

import { PAPER_AIRPLANE_ADVICE, PAPER_AIRPLANE_DECODED, PAPER_AIRPLANE_LAUNCH, PAPER_AIRPLANE_MATERIAL_COPY } from "../../content/chapters/chapter-01/quests/paper-airplane-relay/dialogue";
import {
  PAPER_AIRPLANE_MATERIALS,
  type PaperAirplaneAdvisor,
  type PaperAirplaneMaterial,
} from "../../content/chapters/chapter-01/quests/paper-airplane-relay/rules";
import { EVENT, gameEvents, inputCapture, type InputActionEvent } from "../../game/events";
import { gameStore } from "../../game/GameStore";
import type { ExplorationInteractionHost, QuestRuntimeBinding } from "../contracts";

const INTERACTION_IDS = [
  "paper-relay-ryan", "paper-relay-clean-sheet", "paper-relay-card-wing", "paper-relay-message-strip",
  "paper-relay-launch", "paper-relay-gust-0", "paper-relay-gust-1", "paper-relay-gust-2", "paper-relay-decode",
] as const;

type CampusAnchor = "ryan_post" | "school_front" | "service_side" | "athletic_field" | "playground" | "bus_loop" | "basketball_court";

/** Reidenbaugh-only presentation for the airplane collection, fold, and flight. */
export class PaperAirplaneRelayController implements QuestRuntimeBinding {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private plane?: Phaser.GameObjects.Container;
  private minigame?: Phaser.GameObjects.Container;
  /** Flight can be retried after a map reload without adding an unnecessary save field. */
  private flightLaunched = false;
  private foldDragListener?: (_pointer: Phaser.Input.Pointer, object: Phaser.GameObjects.GameObject, x: number, y: number) => void;
  private foldEndListener?: (_pointer: Phaser.Input.Pointer, object: Phaser.GameObjects.GameObject) => void;
  private minigameActionHandler?: (event: InputActionEvent) => void;

  public constructor(private readonly host: ExplorationInteractionHost) {}

  public mount(): void {
    this.dispose();
    const state = gameStore.getState();
    if (state.activeQuestId !== "paper_airplane_relay" || state.questProgress.paperAirplaneRelay.stage === "complete") return;
    const progress = state.questProgress.paperAirplaneRelay;
    switch (progress.stage) {
      case "ask_for_advice": this.mountRyanAdvice(); break;
      case "find_materials": this.mountMaterials(); break;
      case "fold_plane": this.mountFoldStation(); break;
      case "chase_plane": this.mountFlight(); break;
      case "decode_message": this.mountDecoder(); break;
      default: break;
    }
  }

  public dispose(): void {
    for (const id of INTERACTION_IDS) {
      this.host.unregisterInteraction(id);
      this.host.unregisterRegionInteraction(id);
    }
    this.destroyMiniGame();
    this.plane?.destroy(true);
    this.plane = undefined;
    for (const object of this.objects) object.destroy();
    this.objects.length = 0;
  }

  /** Used by the neighborhood binding for Billy and Andrew's pre-flight advice. */
  public static consultAdvisor(advisor: PaperAirplaneAdvisor, complete: () => void): void {
    gameStore.advancePaperAirplaneRelay({ type: "advisor_consulted", advisor });
    complete();
  }

  private mountRyanAdvice(): void {
    if (this.hasAdvisor("ryan")) return;
    this.register("paper-relay-ryan", "ryan_post", "Ask Ryan about the relay", () => {
      this.host.showDialogue(PAPER_AIRPLANE_ADVICE.ryan, () => {
        gameStore.advancePaperAirplaneRelay({ type: "advisor_consulted", advisor: "ryan" });
        this.mount();
      });
    });
    this.addRyanMarker();
  }

  private mountMaterials(): void {
    const materialAnchors: Readonly<Record<PaperAirplaneMaterial, CampusAnchor>> = {
      clean_sheet: "school_front",
      card_wing: "service_side",
      message_strip: "athletic_field",
    };
    const labels: Readonly<Record<PaperAirplaneMaterial, string>> = {
      clean_sheet: "Pick up clean sheet",
      card_wing: "Pick up stiff card wing",
      message_strip: "Pick up message strip",
    };
    for (const material of PAPER_AIRPLANE_MATERIALS) {
      if (this.hasMaterial(material)) continue;
      const anchor = materialAnchors[material];
      this.register(`paper-relay-${material.replace("_", "-")}`, anchor, labels[material], () => {
        this.host.showDialogue(PAPER_AIRPLANE_MATERIAL_COPY[material], () => {
          gameStore.advancePaperAirplaneRelay({ type: "material_found", material });
          this.mount();
        });
      });
      this.addSparklingPickup(anchor, material === "clean_sheet" ? 0xfff5d6 : material === "card_wing" ? 0xd6b36a : 0x7ac8d1);
    }
  }

  private mountFoldStation(): void {
    this.register("paper-relay-launch", "playground", "Fold Ryan's airplane", () => this.openFoldingGame());
    const point = this.host.objectPoint("playground");
    const chalk = this.host.world.add.text(point.x, point.y - 42, "FOLDING TABLE", {
      fontFamily: "monospace", fontSize: "12px", fontStyle: "bold", color: "#315f4c",
      backgroundColor: "#fff5d6dd", padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(55);
    this.objects.push(chalk);
  }

  private openFoldingGame(): void {
    if (this.minigame) return;
    const scene = this.host.world;
    const camera = scene.cameras.main;
    const width = camera.width;
    const height = camera.height;
    const ui = scene.add.container(camera.width / 2, camera.height / 2).setScrollFactor(0).setDepth(500);
    const shade = scene.add.rectangle(0, 0, width, height, 0x112a30, 0.78).setInteractive();
    const panel = scene.add.rectangle(0, 0, 500, 310, 0xfff5d6, 1).setStrokeStyle(4, 0x315f4c);
    const heading = scene.add.text(0, -122, "FOLD THE PLANE", { fontFamily: "monospace", fontSize: "21px", fontStyle: "bold", color: "#315f4c" }).setOrigin(0.5);
    const directions = scene.add.text(0, -86, "Drag the blue wing onto its dashed mirror outline, or press E to align it.", { fontFamily: "system-ui", fontSize: "15px", color: "#253b42", wordWrap: { width: 430 }, align: "center" }).setOrigin(0.5);
    const nose = scene.add.triangle(0, 32, 0, -58, 0, 58, 112, 0, 0xf1e2b8).setStrokeStyle(3, 0x315f4c);
    const leftWing = scene.add.triangle(-76, 32, -92, -48, 0, 0, -10, 70, 0xf1e2b8).setStrokeStyle(3, 0x315f4c);
    const target = scene.add.triangle(76, 32, 92, -48, 0, 0, 10, 70, 0xffffff, 0).setStrokeStyle(3, 0x67a6b6, 0.8);
    const wing = scene.add.triangle(190, 88, 92, -48, 0, 0, 10, 70, 0x78c8d9).setStrokeStyle(3, 0x315f4c).setInteractive({ draggable: true, useHandCursor: true });
    const hint = scene.add.text(0, 126, "E / SPACE align  •  ESC cancel", { fontFamily: "system-ui", fontSize: "13px", color: "#6c5144" }).setOrigin(0.5);
    ui.add([shade, panel, heading, directions, nose, leftWing, target, wing, hint]);
    this.minigame = ui;
    scene.input.setDraggable(wing);
    const drag = (pointer: Phaser.Input.Pointer, object: Phaser.GameObjects.GameObject): void => {
      if (object === wing) wing.setPosition(pointer.x - ui.x, pointer.y - ui.y);
    };
    const finishFold = (): void => {
      if (this.minigame !== ui) return;
      scene.input.off("drag", drag);
      scene.input.off("dragend", end);
      this.foldDragListener = undefined;
      this.foldEndListener = undefined;
      wing.disableInteractive().setPosition(target.x, target.y);
      const complete = (): void => {
        this.destroyMiniGame();
        gameStore.advancePaperAirplaneRelay({ type: "plane_folded" });
        gameEvents.emit(EVENT.toast, "Perfectly balanced! Launch the paper airplane from the playground.");
        this.mount();
      };
      if (this.reducedMotion) {
        complete();
        return;
      }
      scene.tweens.add({ targets: [leftWing, wing], scaleY: 0.18, duration: 280, yoyo: true, repeat: 1, ease: "Sine.inOut" });
      scene.tweens.add({ targets: ui, alpha: 0, delay: 720, duration: 260, onComplete: complete });
    };
    const end = (_pointer: Phaser.Input.Pointer, object: Phaser.GameObjects.GameObject): void => {
      if (object !== wing || Phaser.Math.Distance.Between(wing.x, wing.y, target.x, target.y) > 34) {
        if (this.reducedMotion) wing.setPosition(190, 88);
        else scene.tweens.add({ targets: wing, x: 190, y: 88, duration: 250, ease: "Back.out" });
        return;
      }
      finishFold();
    };
    this.foldDragListener = drag;
    this.foldEndListener = end;
    scene.input.on("drag", drag);
    scene.input.on("dragend", end);
    this.captureMinigameInput((event) => {
      if (event.action === "interact") finishFold();
    });
    this.objects.push(ui);
  }

  private mountFlight(): void {
    const progress = gameStore.getState().questProgress.paperAirplaneRelay;
    if (progress.windHits === 0 && !this.flightLaunched) {
      this.register("paper-relay-launch", "playground", "Launch paper airplane", () => {
        this.host.showDialogue(PAPER_AIRPLANE_LAUNCH, () => this.launchPlane("playground", "bus_loop"));
      });
      return;
    }
    const gusts: readonly CampusAnchor[] = ["bus_loop", "athletic_field", "basketball_court"];
    const anchor = gusts[progress.windHits]!;
    this.register(`paper-relay-gust-${progress.windHits}`, anchor, "Press E to catch the wind gust", () => this.catchGust(anchor));
    this.addWindMarker(anchor);
  }

  private launchPlane(from: CampusAnchor, to: CampusAnchor): void {
    this.createPlaneAt(from);
    this.flyPlane(to, () => {
      this.flightLaunched = true;
      gameEvents.emit(EVENT.toast, "The plane banks toward the bus loop — get beneath the wind trail!");
      this.mountFlight();
    });
  }

  private catchGust(anchor: CampusAnchor): void {
    const current = gameStore.getState().questProgress.paperAirplaneRelay.windHits;
    const destinations: readonly CampusAnchor[] = ["athletic_field", "basketball_court", "basketball_court"];
    const finalCatch = current >= 2;
    this.createPlaneAt(anchor);
    this.flyPlane(destinations[current]!, () => {
      gameStore.advancePaperAirplaneRelay({ type: "wind_gust_caught" });
      gameEvents.emit(EVENT.toast, finalCatch ? "Dramatic catch! The message strip fluttered onto the court." : "Nice gust catch — keep chasing it!");
      this.mount();
    });
  }

  private mountDecoder(): void {
    this.register("paper-relay-decode", "basketball_court", "Decode painted court symbols", () => this.openDecoder());
    const point = this.host.objectPoint("basketball_court");
    const symbols = this.host.world.add.text(point.x, point.y - 38, "△  ○  ≡", {
      fontFamily: "monospace", fontSize: "22px", color: "#f5d57a", stroke: "#315f4c", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(56);
    this.objects.push(symbols);
  }

  private openDecoder(): void {
    if (this.minigame) return;
    const scene = this.host.world;
    const camera = scene.cameras.main;
    const ui = scene.add.container(camera.width / 2, camera.height / 2).setScrollFactor(0).setDepth(500);
    const shade = scene.add.rectangle(0, 0, camera.width, camera.height, 0x112a30, 0.78).setInteractive();
    const panel = scene.add.rectangle(0, 0, 500, 278, 0xfff5d6, 1).setStrokeStyle(4, 0x315f4c);
    const title = scene.add.text(0, -105, "DECODE THE COURT MARKS", { fontFamily: "monospace", fontSize: "19px", fontStyle: "bold", color: "#315f4c" }).setOrigin(0.5);
    const prompt = scene.add.text(0, -68, "Tap the symbols in court order: △  ○  ≡", { fontFamily: "system-ui", fontSize: "15px", color: "#253b42" }).setOrigin(0.5);
    const feedback = scene.add.text(0, 96, "", { fontFamily: "system-ui", fontSize: "14px", color: "#914833" }).setOrigin(0.5);
    const controls = scene.add.text(0, 128, "← → choose  •  E / SPACE confirm  •  ESC cancel", { fontFamily: "system-ui", fontSize: "12px", color: "#6c5144" }).setOrigin(0.5);
    ui.add([shade, panel, title, prompt, feedback, controls]);
    this.minigame = ui;
    const expected = ["△", "○", "≡"];
    let selected: string[] = [];
    let focused = 0;
    const buttons: Phaser.GameObjects.Rectangle[] = [];
    const labels: Phaser.GameObjects.Text[] = [];
    const updateFocus = (): void => {
      buttons.forEach((button, index) => button.setStrokeStyle(index === focused ? 5 : 3, index === focused ? 0xffffff : 0x315f4c));
    };
    const finishDecode = (): void => {
      if (this.minigame !== ui) return;
      const complete = (): void => {
        this.destroyMiniGame();
        gameStore.advancePaperAirplaneRelay({ type: "message_decoded" });
        this.host.showDialogue(PAPER_AIRPLANE_DECODED);
        this.mount();
      };
      if (this.reducedMotion) complete();
      else scene.tweens.add({ targets: ui, alpha: 0, delay: 350, duration: 220, onComplete: complete });
    };
    const selectSymbol = (index: number): void => {
      const symbol = expected[index]!;
      const button = buttons[index]!;
      const text = labels[index]!;
      selected = [...selected, symbol];
      button.setFillStyle(0xf5d57a);
      if (selected[selected.length - 1] !== expected[selected.length - 1]) {
        selected = [];
        feedback.setText("That pattern drifts off course — try again.");
        if (!this.reducedMotion) scene.tweens.add({ targets: [button, text], x: "+=8", duration: 45, yoyo: true, repeat: 3 });
        return;
      }
      if (selected.length === expected.length) finishDecode();
    };
    expected.forEach((symbol, index) => {
      const button = scene.add.rectangle(-112 + index * 112, 4, 82, 66, 0x78c8d9, 1).setStrokeStyle(3, 0x315f4c).setInteractive({ useHandCursor: true });
      const text = scene.add.text(button.x, button.y, symbol, { fontFamily: "monospace", fontSize: "30px", color: "#173d32" }).setOrigin(0.5);
      button.on("pointerdown", () => selectSymbol(index));
      buttons.push(button);
      labels.push(text);
      ui.add([button, text]);
    });
    updateFocus();
    this.captureMinigameInput((event) => {
      if (event.action === "moveLeft" || event.action === "tabPrevious") {
        focused = (focused + expected.length - 1) % expected.length;
        updateFocus();
      } else if (event.action === "moveRight" || event.action === "tabNext") {
        focused = (focused + 1) % expected.length;
        updateFocus();
      } else if (event.action === "interact") {
        selectSymbol(focused);
      }
    });
    this.objects.push(ui);
  }

  private createPlaneAt(anchor: CampusAnchor): void {
    this.plane?.destroy(true);
    const point = this.host.objectPoint(anchor);
    const graphics = this.host.world.add.graphics();
    graphics.fillStyle(0xfff5d6, 1).lineStyle(3, 0x315f4c, 1);
    graphics.fillTriangle(-26, -9, 27, 0, -26, 10).strokeTriangle(-26, -9, 27, 0, -26, 10);
    graphics.lineBetween(-9, -7, -9, 7);
    this.plane = this.host.world.add.container(point.x, point.y - 24, [graphics]).setDepth(70);
    this.objects.push(this.plane);
  }

  private flyPlane(destination: CampusAnchor, onComplete: () => void): void {
    const plane = this.plane;
    if (!plane) return;
    const end = this.host.objectPoint(destination);
    const trails = [0, 1, 2].map((index) => this.host.world.add.text(plane.x - 20 - index * 15, plane.y + index * 10, "≈", {
      fontFamily: "monospace", fontSize: "22px", color: "#b8e6ef",
    }).setDepth(68));
    this.objects.push(...trails);
    if (this.reducedMotion) {
      trails.forEach((trail) => trail.destroy());
      plane.setPosition(end.x, end.y - 24).setAngle(0);
      onComplete();
      return;
    }
    this.host.world.tweens.add({ targets: trails, alpha: 0, x: "-=55", duration: 850, ease: "Sine.out" });
    this.host.world.tweens.add({ targets: plane, x: end.x, y: end.y - 24, angle: -10, duration: 1_000, ease: "Sine.inOut", onComplete: () => {
      this.host.world.tweens.add({ targets: plane, y: "+=14", angle: 8, duration: 150, yoyo: true, repeat: 1, onComplete });
    } });
  }

  private addRyanMarker(): void {
    const point = this.host.objectPoint("ryan_post");
    const marker = this.host.world.add.text(point.x, point.y - 82, "PAPER RELAY!", {
      fontFamily: "monospace", fontSize: "12px", fontStyle: "bold", color: "#fff9d8", backgroundColor: "#de6a3ce8", padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(60);
    if (!this.reducedMotion) this.host.world.tweens.add({ targets: marker, y: marker.y - 7, duration: 600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    this.objects.push(marker);
  }

  private addSparklingPickup(anchor: CampusAnchor, color: number): void {
    const point = this.host.objectPoint(anchor);
    const sparkle = this.host.world.add.graphics().setPosition(point.x, point.y - 20).setDepth(58);
    sparkle.fillStyle(color, 1).fillCircle(0, 0, 9).fillCircle(-13, -10, 3).fillCircle(14, -7, 3);
    if (!this.reducedMotion) this.host.world.tweens.add({ targets: sparkle, y: sparkle.y - 8, alpha: 0.55, duration: 550, yoyo: true, repeat: -1 });
    this.objects.push(sparkle);
  }

  private addWindMarker(anchor: CampusAnchor): void {
    const point = this.host.objectPoint(anchor);
    const wind = this.host.world.add.text(point.x, point.y - 70, "≈ ≈ ≈", { fontFamily: "monospace", fontSize: "24px", color: "#b8e6ef", stroke: "#315f4c", strokeThickness: 2 }).setOrigin(0.5).setDepth(60);
    if (!this.reducedMotion) this.host.world.tweens.add({ targets: wind, x: wind.x + 16, duration: 520, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    this.objects.push(wind);
  }

  private register(id: string, anchor: CampusAnchor, label: string, interact: () => void): void {
    this.host.registerInteraction({ id, ...this.host.objectPoint(anchor), label, interact });
  }

  private hasAdvisor(advisor: PaperAirplaneAdvisor): boolean {
    return gameStore.getState().questProgress.paperAirplaneRelay.adviceIds.includes(advisor);
  }

  private hasMaterial(material: PaperAirplaneMaterial): boolean {
    return gameStore.getState().questProgress.paperAirplaneRelay.materialIds.includes(material);
  }

  private get reducedMotion(): boolean { return gameStore.getState().settings.reducedMotion; }

  private captureMinigameInput(handle: (event: InputActionEvent) => void): void {
    inputCapture.capture("paper-airplane-relay-minigame", { blockMenuToggle: true });
    this.minigameActionHandler = (event) => {
      if (!event.pressed) return;
      if (event.action === "back" || event.action === "menu") {
        this.destroyMiniGame();
        return;
      }
      handle(event);
    };
    gameEvents.on(EVENT.inputAction, this.minigameActionHandler);
  }

  private destroyMiniGame(): void {
    if (this.foldDragListener) this.host.world.input.off("drag", this.foldDragListener);
    if (this.foldEndListener) this.host.world.input.off("dragend", this.foldEndListener);
    this.foldDragListener = undefined;
    this.foldEndListener = undefined;
    if (this.minigameActionHandler) gameEvents.off(EVENT.inputAction, this.minigameActionHandler);
    this.minigameActionHandler = undefined;
    inputCapture.release("paper-airplane-relay-minigame");
    this.minigame?.destroy(true);
    this.minigame = undefined;
  }
}
