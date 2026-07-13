import Phaser from "phaser";
import { getObjective } from "../content/quest";
import { EVENT, gameEvents, type InputActionEvent } from "../game/events";
import type { DialogueRequest, QuestStage, SaveData } from "../game/types";

const UI_DEPTH = 1_000;
const UI_FONT = '"Courier New", monospace';
const INK = 0x172735;
const PAPER = 0xfff5d6;
const GOLD = 0xf4d37b;
const CONTROLLER_ITEM = "xbox_controller";

export class UIScene extends Phaser.Scene {
  private objectivePanel!: Phaser.GameObjects.Container;
  private objectiveCard!: Phaser.GameObjects.Rectangle;
  private objectiveHeading!: Phaser.GameObjects.Text;
  private objectiveText!: Phaser.GameObjects.Text;
  private inventoryText!: Phaser.GameObjects.Text;
  private saveStatusText!: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text;
  private controlsPanel!: Phaser.GameObjects.Container;
  private dialoguePanel!: Phaser.GameObjects.Container;
  private dialogueSpeaker!: Phaser.GameObjects.Text;
  private dialogueText!: Phaser.GameObjects.Text;
  private toastPanel!: Phaser.GameObjects.Container;
  private toastCard!: Phaser.GameObjects.Rectangle;
  private toastLabel!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private hintPanel!: Phaser.GameObjects.Container;
  private hintCard!: Phaser.GameObjects.Rectangle;
  private hintText!: Phaser.GameObjects.Text;
  private dialogue?: DialogueRequest;
  private dialogueIndex = 0;
  private previousStage?: QuestStage;
  private previousSavedAt?: string | null;
  private toastTimer?: Phaser.Time.TimerEvent;
  private objectiveTimer?: Phaser.Time.TimerEvent;
  private saveTimer?: Phaser.Time.TimerEvent;
  private controlsTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super("ui");
  }

  create(): void {
    this.cameras.main.setScroll(0, 0);
    this.buildObjectivePanel();
    this.buildControlsGuide();
    this.buildDialoguePanel();
    this.buildToast();
    this.buildHint();
    this.buildSaveStatus();
    this.buildInventoryIndicator();
    this.buildDebugPanel();

    gameEvents.on(EVENT.stateChanged, this.handleStateChanged, this);
    gameEvents.on(EVENT.dialogue, this.handleDialogue, this);
    gameEvents.on(EVENT.toast, this.handleToast, this);
    gameEvents.on(EVENT.hint, this.handleHint, this);
    gameEvents.on(EVENT.inputAction, this.handleInputAction, this);
    this.input.keyboard?.on("keydown-F3", this.toggleDebug, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  private buildObjectivePanel(): void {
    const shadow = this.add.rectangle(23, 23, 364, 112, 0x07131c, 0.48).setOrigin(0);
    this.objectiveCard = this.add
      .rectangle(18, 18, 364, 112, PAPER, 0.96)
      .setOrigin(0)
      .setStrokeStyle(3, INK, 1);
    const rule = this.add.rectangle(36, 48, 328, 2, 0xc76b52, 0.55).setOrigin(0);
    const tape = this.add.rectangle(171, 13, 58, 13, 0xf2cf79, 0.72).setAngle(-2);
    this.objectiveHeading = this.add.text(36, 29, "QUEST JOURNAL  •  MISSING CONTROLLER", {
      fontFamily: UI_FONT,
      fontSize: "12px",
      color: "#914833",
      fontStyle: "bold",
    });
    this.objectiveText = this.add.text(36, 57, getObjective("talk_to_jeremy"), {
      fontFamily: UI_FONT,
      fontSize: "17px",
      color: "#172735",
      fontStyle: "bold",
      lineSpacing: 2,
      wordWrap: { width: 328 },
    });

    this.objectivePanel = this.add
      .container(0, 0, [shadow, this.objectiveCard, tape, rule, this.objectiveHeading, this.objectiveText])
      .setDepth(UI_DEPTH);
  }

  private buildControlsGuide(): void {
    const shadow = this.add.rectangle(489, 25, 190, 78, 0x07131c, 0.42).setOrigin(0.5, 0);
    const card = this.add
      .rectangle(480, 20, 190, 78, PAPER, 0.94)
      .setOrigin(0.5, 0)
      .setStrokeStyle(2, INK, 0.9);
    const tape = this.add.rectangle(480, 17, 46, 11, 0xf2cf79, 0.7).setAngle(2);
    const heading = this.add.text(480, 31, "BILLY'S FIELD NOTES", {
      fontFamily: UI_FONT, fontSize: "12px", color: "#914833", fontStyle: "bold",
    }).setOrigin(0.5, 0);
    const controls = this.add.text(480, 52, "MOVE   WASD / ARROWS\nACT    E / SPACE   •   BAG   B / ESC", {
      fontFamily: UI_FONT, fontSize: "10px", color: "#172735", fontStyle: "bold",
      align: "center", lineSpacing: 3,
    }).setOrigin(0.5, 0);
    this.controlsPanel = this.add.container(0, 0, [shadow, card, tape, heading, controls])
      .setDepth(UI_DEPTH)
      .setAlpha(0);
    this.tweens.add({ targets: this.controlsPanel, alpha: 1, duration: 220 });
    this.controlsTimer = this.time.delayedCall(7_500, () => this.hideControlsGuide());
  }

  private hideControlsGuide(): void {
    if (!this.controlsPanel.visible) return;
    this.tweens.add({
      targets: this.controlsPanel,
      alpha: 0,
      y: -6,
      duration: 250,
      onComplete: () => this.controlsPanel.setVisible(false),
    });
  }

  private buildDialoguePanel(): void {
    const shadow = this.add.rectangle(45, 381, 870, 137, 0x07131c, 0.55).setOrigin(0);
    const panel = this.add
      .rectangle(40, 376, 880, 140, PAPER, 0.98)
      .setOrigin(0)
      .setStrokeStyle(4, INK, 1)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.advanceDialogue());
    const rule = this.add.rectangle(64, 421, 832, 2, 0xc76b52, 0.48).setOrigin(0);
    const tape = this.add.rectangle(480, 374, 68, 14, 0xf2cf79, 0.72).setAngle(-1);
    this.dialogueSpeaker = this.add.text(64, 394, "", {
      fontFamily: UI_FONT,
      fontSize: "18px",
      color: "#914833",
      fontStyle: "bold",
    });
    this.dialogueText = this.add.text(64, 432, "", {
      fontFamily: UI_FONT,
      fontSize: "18px",
      color: "#172735",
      fontStyle: "bold",
      lineSpacing: 5,
      wordWrap: { width: 815 },
    });
    const hint = this.add
      .text(894, 495, "E / SPACE / TAP  ▶", {
        fontFamily: UI_FONT,
        fontSize: "12px",
        color: "#536575",
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5);

    this.dialoguePanel = this.add
      .container(0, 0, [shadow, panel, tape, rule, this.dialogueSpeaker, this.dialogueText, hint])
      .setDepth(UI_DEPTH + 4)
      .setVisible(false);
  }

  private buildSaveStatus(): void {
    this.saveStatusText = this.add.text(938, 16, "AUTOSAVE • ON", {
      fontFamily: UI_FONT,
      fontSize: "11px",
      color: "#fff5d6",
      fontStyle: "bold",
      backgroundColor: "#172735e8",
      padding: { x: 9, y: 6 },
    }).setOrigin(1, 0).setDepth(UI_DEPTH + 2);
  }

  private buildInventoryIndicator(): void {
    const shadow = this.add.rectangle(938, 53, 178, 48, 0x07131c, 0.42).setOrigin(1, 0);
    const card = this.add.rectangle(934, 49, 178, 48, PAPER, 0.95)
      .setOrigin(1, 0)
      .setStrokeStyle(2, INK, 1);
    const controller = this.add.image(778, 73, "controller").setScale(0.8).setTint(INK);
    this.inventoryText = this.add.text(798, 61, "BACKPACK\nCONTROLLER  0 / 1", {
      fontFamily: UI_FONT,
      fontSize: "11px",
      color: "#172735",
      fontStyle: "bold",
      lineSpacing: 1,
    });
    this.add.container(0, 0, [shadow, card, controller, this.inventoryText]).setDepth(UI_DEPTH);
  }

  private buildDebugPanel(): void {
    this.debugText = this.add.text(938, 108, "", {
      fontFamily: UI_FONT, fontSize: "12px", color: "#d8ffe6",
      backgroundColor: "#071511e6", padding: { x: 9, y: 7 }, align: "right",
    }).setOrigin(1, 0).setDepth(UI_DEPTH + 5).setVisible(false);
  }

  private buildToast(): void {
    const shadow = this.add.rectangle(484, 335, 570, 64, 0x07131c, 0.5);
    this.toastCard = this.add
      .rectangle(480, 330, 570, 64, PAPER, 0.98)
      .setStrokeStyle(3, INK, 1);
    this.toastLabel = this.add.text(218, 316, "FIELD NOTE", {
      fontFamily: UI_FONT,
      fontSize: "11px",
      color: "#914833",
      fontStyle: "bold",
    }).setOrigin(0, 0.5);
    this.toastText = this.add
      .text(480, 339, "", {
        fontFamily: UI_FONT,
        fontSize: "16px",
        color: "#172735",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: 520 },
      })
      .setOrigin(0.5);
    this.toastPanel = this.add
      .container(0, 0, [shadow, this.toastCard, this.toastLabel, this.toastText])
      .setDepth(UI_DEPTH + 3)
      .setVisible(false);
  }

  private buildHint(): void {
    const shadow = this.add.rectangle(4, 5, 460, 50, 0x07131c, 0.5);
    this.hintCard = this.add
      .rectangle(0, 0, 460, 50, INK, 0.96)
      .setStrokeStyle(3, GOLD, 1);
    this.hintText = this.add
      .text(0, 0, "", {
        fontFamily: UI_FONT,
        fontSize: "16px",
        color: "#fff5d6",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: 420 },
      })
      .setOrigin(0.5);
    this.hintPanel = this.add
      .container(480, 505, [shadow, this.hintCard, this.hintText])
      .setDepth(UI_DEPTH + 2)
      .setSize(460, 50)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => this.hintCard.setFillStyle(0x284152, 1))
      .on("pointerout", () => this.hintCard.setFillStyle(INK, 0.96))
      .on("pointerdown", () => gameEvents.emit(EVENT.interactRequested))
      .setVisible(false);
  }

  private handleStateChanged(state: SaveData): void {
    const stageChanged = this.previousStage !== undefined && this.previousStage !== state.questStage;
    const saveChanged = this.previousSavedAt !== undefined
      && state.lastSavedAt !== null
      && state.lastSavedAt !== this.previousSavedAt;

    this.objectiveText.setText(getObjective(state.questStage));
    const textSize = state.settings.textSize === "small" ? 15 : state.settings.textSize === "large" ? 18 : 16;
    this.objectiveText.setFontSize(textSize);
    this.dialogueText.setFontSize(textSize + 1);
    const hasController = state.inventory.includes(CONTROLLER_ITEM);
    this.inventoryText
      .setText(`BACKPACK\nCONTROLLER  ${hasController ? "1 / 1  ✓" : "0 / 1"}`)
      .setColor(hasController ? "#32704a" : "#172735");
    this.setSavedStatus(state.lastSavedAt);

    if (stageChanged) {
      this.showObjectiveUpdate(state.questStage);
      this.hideControlsGuide();
      if (state.questStage === "complete") {
        this.handleToast("Quest complete — The Missing Controller!");
      }
    }
    if (saveChanged) this.pulseSavedStatus(state.lastSavedAt);

    this.debugText.setText([
      `map: ${state.currentMap}`,
      `quest: ${state.questStage}`,
      `inventory: ${state.inventory.join(", ") || "empty"}`,
      `save: v${state.version}`,
      "F4/F6: teleport to objective",
    ]);
    this.previousStage = state.questStage;
    this.previousSavedAt = state.lastSavedAt;
  }

  private showObjectiveUpdate(stage: QuestStage): void {
    this.objectiveTimer?.remove(false);
    this.tweens.killTweensOf(this.objectivePanel);
    this.objectiveHeading.setText(stage === "complete" ? "★ QUEST COMPLETE  •  MISSING CONTROLLER" : "✦ JOURNAL UPDATED  •  NEW OBJECTIVE");
    this.objectiveCard.setFillStyle(stage === "complete" ? 0xffe7a6 : 0xfff1bd, 1);
    this.objectivePanel.setAlpha(0.7).setScale(1);
    this.tweens.add({
      targets: this.objectivePanel,
      alpha: 1,
      scaleX: 1.018,
      scaleY: 1.018,
      yoyo: true,
      duration: 170,
    });
    this.objectiveTimer = this.time.delayedCall(1_800, () => {
      this.objectiveHeading.setText("QUEST JOURNAL  •  MISSING CONTROLLER");
      this.objectiveCard.setFillStyle(PAPER, 0.96);
    });
  }

  private setSavedStatus(savedAt: string | null): void {
    if (!savedAt) {
      this.saveStatusText.setText("AUTOSAVE • ON");
      return;
    }
    const time = new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    this.saveStatusText.setText(`✓ SAVED • ${time}`);
  }

  private pulseSavedStatus(savedAt: string | null): void {
    this.saveTimer?.remove(false);
    this.tweens.killTweensOf(this.saveStatusText);
    this.saveStatusText.setText("✓ SAVED JUST NOW").setBackgroundColor("#32704af2").setScale(1);
    this.tweens.add({ targets: this.saveStatusText, scaleX: 1.05, scaleY: 1.05, yoyo: true, duration: 150 });
    this.saveTimer = this.time.delayedCall(1_350, () => {
      this.saveStatusText.setBackgroundColor("#172735e8");
      this.setSavedStatus(savedAt);
    });
  }

  private toggleDebug(): void {
    if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
    this.debugText.setVisible(!this.debugText.visible);
  }

  private handleDialogue(request: DialogueRequest): void {
    if (!request.lines.length) {
      request.onComplete?.();
      gameEvents.emit(EVENT.dialogueClosed);
      return;
    }

    this.dialogue = request;
    this.dialogueIndex = 0;
    this.showDialogueLine();
    this.dialoguePanel.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.dialoguePanel, alpha: 1, duration: 140 });
  }

  private showDialogueLine(): void {
    const line = this.dialogue?.lines[this.dialogueIndex];
    if (!line) return;
    this.dialogueSpeaker.setText(line.speaker.toUpperCase());
    this.dialogueText.setText(line.text);
  }

  private advanceDialogue(event?: KeyboardEvent): void {
    if (!this.dialogue || !this.dialoguePanel.visible) return;
    event?.preventDefault();
    gameEvents.emit(EVENT.audioCue, "dialogueAdvance");

    this.dialogueIndex += 1;
    if (this.dialogueIndex < this.dialogue.lines.length) {
      this.showDialogueLine();
      return;
    }

    const completedDialogue = this.dialogue;
    this.dialogue = undefined;
    this.dialoguePanel.setVisible(false);
    completedDialogue.onComplete?.();
    gameEvents.emit(EVENT.dialogueClosed);
  }

  private handleInputAction(event: InputActionEvent): void {
    if (event.action === "interact" && event.pressed && !this.sys.isPaused()) this.advanceDialogue();
  }

  private handleToast(message: string): void {
    this.toastTimer?.remove(false);
    this.tweens.killTweensOf(this.toastPanel);
    const lower = message.toLowerCase();
    const isCompletion = lower.includes("quest complete") || lower.includes("mission complete");
    const isPickup = lower.includes("added to your backpack") || lower.includes("found:");
    const isSave = lower.includes("saved");
    this.toastLabel.setText(isCompletion ? "★ QUEST COMPLETE" : isPickup ? "✦ FOUND" : isSave ? "✓ BACKPACK SAVED" : "FIELD NOTE");
    this.toastCard.setFillStyle(isCompletion ? 0xffe4a1 : isPickup ? 0xe8f3c7 : PAPER, 1);
    this.toastText.setText(message);
    this.toastPanel.setVisible(true).setAlpha(0).setY(8);
    this.tweens.add({ targets: this.toastPanel, alpha: 1, y: 0, duration: 180 });
    this.toastTimer = this.time.delayedCall(isCompletion ? 4_200 : 2_800, () => {
      this.tweens.add({
        targets: this.toastPanel,
        alpha: 0,
        y: -6,
        duration: 250,
        onComplete: () => this.toastPanel.setVisible(false).setAlpha(1).setY(0),
      });
    });
  }

  private handleHint(message: string): void {
    this.hintText.setText(message);
    const visible = message.trim().length > 0;
    this.hintPanel.setVisible(visible);
    if (visible) {
      this.hintPanel.setAlpha(0).setScale(0.98);
      this.tweens.add({ targets: this.hintPanel, alpha: 1, scaleX: 1, scaleY: 1, duration: 120 });
    }
  }

  private cleanup(): void {
    gameEvents.off(EVENT.stateChanged, this.handleStateChanged, this);
    gameEvents.off(EVENT.dialogue, this.handleDialogue, this);
    gameEvents.off(EVENT.toast, this.handleToast, this);
    gameEvents.off(EVENT.hint, this.handleHint, this);
    gameEvents.off(EVENT.inputAction, this.handleInputAction, this);
    this.input.keyboard?.off("keydown-F3", this.toggleDebug, this);
    this.toastTimer?.remove(false);
    this.objectiveTimer?.remove(false);
    this.saveTimer?.remove(false);
    this.controlsTimer?.remove(false);
  }
}
