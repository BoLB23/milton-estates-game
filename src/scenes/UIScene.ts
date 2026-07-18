import Phaser from "phaser";
import { QUEST_BY_ID } from "../content/chapters";
import { getObjective } from "../content/quest";
import { EVENT, gameEvents, inputCapture, type InputActionEvent } from "../game/events";
import { gameStore } from "../game/GameStore";
import type { DialogueRequest, GameState, QuestId, QuestStage } from "../game/types";
import { createPresentationPolicy } from "../presentation/presentationPolicy";

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
  private debugText?: Phaser.GameObjects.Text;
  private controlsPanel!: Phaser.GameObjects.Container;
  private dialoguePanel!: Phaser.GameObjects.Container;
  private dialogueSpeaker!: Phaser.GameObjects.Text;
  private dialogueText!: Phaser.GameObjects.Text;
  private toastPanel!: Phaser.GameObjects.Container;
  private toastCard!: Phaser.GameObjects.Rectangle;
  private toastLabel!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private hintPanel!: Phaser.GameObjects.Container;
  private hintShadow!: Phaser.GameObjects.Rectangle;
  private hintCard!: Phaser.GameObjects.Rectangle;
  private hintText!: Phaser.GameObjects.Text;
  private dialogue?: DialogueRequest;
  private dialogueIndex = 0;
  private previousStage?: QuestStage;
  private previousQuestId?: QuestId;
  private previousSavedAt?: string | null;
  private toastTimer?: Phaser.Time.TimerEvent;
  private objectiveTimer?: Phaser.Time.TimerEvent;
  private saveTimer?: Phaser.Time.TimerEvent;
  private controlsTimer?: Phaser.Time.TimerEvent;
  private objectiveFontSize = 16;
  private dialogueFontSize = 17;

  constructor() {
    super("ui");
  }

  create(): void {
    this.resetRunState();
    this.cameras.main.setScroll(0, 0);
    this.buildObjectivePanel();
    this.buildControlsGuide();
    this.buildDialoguePanel();
    this.buildToast();
    this.buildHint();
    this.buildSaveStatus();
    this.buildInventoryIndicator();
    if (import.meta.env.DEV) this.buildDebugPanel();

    gameEvents.on(EVENT.stateChanged, this.handleStateChanged, this);
    gameEvents.on(EVENT.dialogue, this.handleDialogue, this);
    gameEvents.on(EVENT.dialogueCancelled, this.cancelDialogue, this);
    gameEvents.on(EVENT.toast, this.handleToast, this);
    gameEvents.on(EVENT.hint, this.handleHint, this);
    gameEvents.on(EVENT.inputAction, this.handleInputAction, this);
    if (import.meta.env.DEV) this.input.keyboard?.on("keydown-F3", this.toggleDebug, this);
    this.handleStateChanged(gameStore.getState());

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
    this.objectiveText = this.add.text(36, 57, getObjective("talk_to_jeremy", "missing_controller"), {
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
    if (this.policy.reducedMotion) this.controlsPanel.setAlpha(1);
    else this.tweens.add({ targets: this.controlsPanel, alpha: 1, duration: this.policy.duration(220) });
    this.controlsTimer = this.time.delayedCall(7_500, () => this.hideControlsGuide());
  }

  private hideControlsGuide(): void {
    if (!this.controlsPanel.visible) return;
    if (this.policy.reducedMotion) {
      this.controlsPanel.setAlpha(0).setY(-6).setVisible(false);
      return;
    }
    this.tweens.add({
      targets: this.controlsPanel,
      alpha: 0,
      y: -6,
      duration: this.policy.duration(250),
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
    this.inventoryText = this.add.text(798, 61, "BACKPACK\nCONTROLLER 0/1\nMUSHROOMS 0/10", {
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
    this.hintShadow = this.add.rectangle(4, 5, 460, 50, 0x07131c, 0.5);
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
      .container(480, 498, [this.hintShadow, this.hintCard, this.hintText])
      .setDepth(UI_DEPTH + 2)
      .setSize(460, 50)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => this.hintCard.setFillStyle(0x284152, 1))
      .on("pointerout", () => this.hintCard.setFillStyle(INK, 0.96))
      .on("pointerdown", () => gameEvents.emit(EVENT.interactRequested))
      .setVisible(false);
  }

  private handleStateChanged(state: GameState): void {
    const stageChanged = this.previousStage !== undefined
      && (this.previousStage !== state.questStage || this.previousQuestId !== state.activeQuestId);
    const saveChanged = this.previousSavedAt !== undefined
      && state.lastSavedAt !== null
      && state.lastSavedAt !== this.previousSavedAt;

    const questTitle = QUEST_BY_ID[state.activeQuestId]?.title ?? "Current Memory";
    this.setObjectiveHeading(`QUEST JOURNAL  •  ${questTitle.toUpperCase()}`);
    this.applyTextScale();
    if (this.policy.reducedMotion) this.finishActiveMotion();
    this.objectiveFontSize = this.policy.fontSize(16);
    this.dialogueFontSize = this.objectiveFontSize + 1;
    this.fitText(this.objectiveText, getObjective(state.questStage, state.activeQuestId), this.objectiveFontSize, 328, 62, 12);
    const hasController = state.inventory.includes(CONTROLLER_ITEM);
    const mushroomCount = state.questProgress.mushrooms.collectedIds.length;
    this.inventoryText
      .setText(`BACKPACK\nCONTROLLER ${hasController ? "1/1 ✓" : "0/1"}\nMUSHROOMS ${mushroomCount}/10`)
      .setColor(hasController || mushroomCount > 0 ? "#32704a" : "#172735");
    this.setSavedStatus(state.lastSavedAt);

    if (stageChanged) {
      this.showObjectiveUpdate(state.questStage, state.activeQuestId);
      this.hideControlsGuide();
      if (state.questStage === "complete") {
        this.handleToast(`Quest complete — ${questTitle}!`);
      }
    }
    if (saveChanged) this.pulseSavedStatus(state.lastSavedAt);

    this.debugText?.setText([
      `map: ${state.currentMap}`,
      `quest: ${state.activeQuestId} / ${state.questStage}`,
      `inventory: ${state.inventory.join(", ") || "empty"}`,
      `save: v${state.version}`,
      "F4: teleport to objective",
    ]);
    this.previousStage = state.questStage;
    this.previousQuestId = state.activeQuestId;
    this.previousSavedAt = state.lastSavedAt;
  }

  private showObjectiveUpdate(stage: QuestStage, questId: QuestId): void {
    this.objectiveTimer?.remove(false);
    this.tweens.killTweensOf(this.objectivePanel);
    const questTitle = QUEST_BY_ID[questId]?.title ?? "Current Memory";
    this.setObjectiveHeading(stage === "complete"
      ? `★ QUEST COMPLETE  •  ${questTitle.toUpperCase()}`
      : `✦ JOURNAL UPDATED  •  ${questTitle.toUpperCase()}`);
    this.objectiveCard.setFillStyle(stage === "complete" ? 0xffe7a6 : 0xfff1bd, 1);
    this.objectivePanel.setAlpha(this.policy.reducedMotion ? 1 : 0.7).setScale(1);
    if (!this.policy.reducedMotion) {
      this.tweens.add({
        targets: this.objectivePanel,
        alpha: 1,
        scaleX: 1.018,
        scaleY: 1.018,
        yoyo: true,
        duration: this.policy.duration(170),
      });
    }
    this.objectiveTimer = this.time.delayedCall(1_800, () => {
      this.setObjectiveHeading(`QUEST JOURNAL  •  ${questTitle.toUpperCase()}`);
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
    if (!this.policy.reducedMotion) {
      this.tweens.add({ targets: this.saveStatusText, scaleX: 1.05, scaleY: 1.05, yoyo: true, duration: this.policy.duration(150) });
    }
    this.saveTimer = this.time.delayedCall(1_350, () => {
      this.saveStatusText.setBackgroundColor("#172735e8");
      this.setSavedStatus(savedAt);
    });
  }

  private toggleDebug(): void {
    if (!import.meta.env.DEV || !this.debugText) return;
    this.debugText.setVisible(!this.debugText.visible);
  }

  private handleDialogue(request: DialogueRequest): void {
    if (!request.lines.length) {
      request.onComplete?.();
      return;
    }

    inputCapture.capture("dialogue");
    this.dialogue = request;
    this.dialogueIndex = 0;
    this.showDialogueLine();
    this.dialoguePanel.setVisible(true).setAlpha(this.policy.reducedMotion ? 1 : 0);
    if (!this.policy.reducedMotion) this.tweens.add({ targets: this.dialoguePanel, alpha: 1, duration: this.policy.duration(140) });
  }

  private showDialogueLine(): void {
    const line = this.dialogue?.lines[this.dialogueIndex];
    if (!line) return;
    this.dialogueSpeaker.setText(line.speaker.toUpperCase());
    this.fitText(this.dialogueText, line.text, this.dialogueFontSize, 815, 52, 13);
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
    inputCapture.release("dialogue");
    this.dialoguePanel.setVisible(false);
    completedDialogue.onComplete?.();
  }

  private cancelDialogue(): void {
    if (!this.dialogue && !this.dialoguePanel.visible) return;
    this.dialogue = undefined;
    this.dialogueIndex = 0;
    inputCapture.release("dialogue");
    this.tweens.killTweensOf(this.dialoguePanel);
    this.dialoguePanel.setVisible(false).setAlpha(1);
  }

  private handleInputAction(event: InputActionEvent): void {
    if (event.action !== "interact" || !event.pressed || this.sys.isPaused()) return;
    if (this.dialogue && this.dialoguePanel.visible) this.advanceDialogue();
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
    this.fitText(this.toastText, message, 16, 520, 50, 11);
    this.toastPanel.setVisible(true).setAlpha(this.policy.reducedMotion ? 1 : 0).setY(this.policy.reducedMotion ? 0 : 8);
    if (!this.policy.reducedMotion) this.tweens.add({ targets: this.toastPanel, alpha: 1, y: 0, duration: this.policy.duration(180) });
    this.toastTimer = this.time.delayedCall(isCompletion ? 4_200 : 2_800, () => {
      if (this.policy.reducedMotion) this.toastPanel.setVisible(false).setAlpha(1).setY(0);
      else this.tweens.add({
        targets: this.toastPanel,
        alpha: 0,
        y: -6,
        duration: this.policy.duration(250),
        onComplete: () => this.toastPanel.setVisible(false).setAlpha(1).setY(0),
      });
    });
  }

  private handleHint(message: string): void {
    this.fitText(this.hintText, message, 16, 420, 56, 12);
    const height = Math.max(50, Math.min(76, this.hintText.height + 20));
    this.hintCard.setSize(460, height);
    this.hintShadow.setSize(460, height).setPosition(4, 5);
    this.hintPanel.setSize(460, height);
    const visible = message.trim().length > 0;
    this.hintPanel.setVisible(visible);
    if (visible) {
      this.hintPanel.setAlpha(this.policy.reducedMotion ? 1 : 0).setScale(this.policy.reducedMotion ? 1 : 0.98);
      if (!this.policy.reducedMotion) this.tweens.add({ targets: this.hintPanel, alpha: 1, scaleX: 1, scaleY: 1, duration: this.policy.duration(120) });
    }
  }

  private cleanup(): void {
    inputCapture.release("dialogue");
    gameEvents.off(EVENT.stateChanged, this.handleStateChanged, this);
    gameEvents.off(EVENT.dialogue, this.handleDialogue, this);
    gameEvents.off(EVENT.dialogueCancelled, this.cancelDialogue, this);
    gameEvents.off(EVENT.toast, this.handleToast, this);
    gameEvents.off(EVENT.hint, this.handleHint, this);
    gameEvents.off(EVENT.inputAction, this.handleInputAction, this);
    if (import.meta.env.DEV) this.input.keyboard?.off("keydown-F3", this.toggleDebug, this);
    this.toastTimer?.remove(false);
    this.objectiveTimer?.remove(false);
    this.saveTimer?.remove(false);
    this.controlsTimer?.remove(false);
  }

  /** Keeps dynamic copy inside its card even at the player's large-text setting. */
  private fitText(
    text: Phaser.GameObjects.Text,
    value: string,
    preferredSize: number,
    maxWidth: number,
    maxHeight: number,
    minimumSize: number,
  ): void {
    text.setText(value).setWordWrapWidth(maxWidth, true).setFontSize(preferredSize);
    for (let size = preferredSize; text.height > maxHeight && size > minimumSize; size -= 1) {
      text.setFontSize(size - 1);
    }
  }

  private setObjectiveHeading(value: string): void {
    this.objectiveHeading.setText(value).setFontSize(12);
    for (let size = 12; this.objectiveHeading.width > 328 && size > 9; size -= 1) {
      this.objectiveHeading.setFontSize(size - 1);
    }
  }

  private get policy() {
    return createPresentationPolicy(gameStore.getState().settings);
  }

  /** Restores Scene-local references and timers when Phaser restarts this HUD. */
  private resetRunState(): void {
    this.dialogue = undefined;
    this.dialogueIndex = 0;
    this.previousStage = undefined;
    this.previousQuestId = undefined;
    this.previousSavedAt = undefined;
    this.toastTimer = undefined;
    this.objectiveTimer = undefined;
    this.saveTimer = undefined;
    this.controlsTimer = undefined;
    this.objectiveFontSize = this.policy.fontSize(16);
    this.dialogueFontSize = this.policy.fontSize(17);
  }

  /** Applies the player's selected size to static HUD text as well as dynamic copy. */
  private applyTextScale(): void {
    const visit = (gameObject: Phaser.GameObjects.GameObject): void => {
      if (gameObject instanceof Phaser.GameObjects.Text) {
        const stored = gameObject.getData("presentationBaseFontSize") as number | undefined;
        const base = stored ?? Number.parseFloat(String(gameObject.style.fontSize ?? 16));
        if (!stored) gameObject.setData("presentationBaseFontSize", base);
        gameObject.setFontSize(this.policy.fontSize(base));
      }
      if (gameObject instanceof Phaser.GameObjects.Container) gameObject.list.forEach(visit);
    };
    this.children.list.forEach(visit);
  }

  /** Cancels an in-flight effect immediately when the comfort setting changes. */
  private finishActiveMotion(): void {
    this.tweens.killAll();
    this.objectivePanel.setAlpha(1).setScale(1);
    this.saveStatusText.setScale(1);
    if (this.controlsPanel.visible) this.controlsPanel.setAlpha(1).setY(0);
    if (this.dialoguePanel.visible) this.dialoguePanel.setAlpha(1);
    if (this.toastPanel.visible) this.toastPanel.setAlpha(1).setY(0);
    if (this.hintPanel.visible) this.hintPanel.setAlpha(1).setScale(1);
  }
}
