import Phaser from "phaser";
import { hasAvailableQuest, QUEST_BY_ID } from "../content/chapters";
import { getObjective } from "../content/quest";
import { EVENT, gameEvents, inputCapture, type ChoiceOption, type ChoiceRequest, type InputActionEvent, type TextEntryRequest } from "../game/events";
import { gameStore } from "../game/GameStore";
import type { DialogueRequest, GameState, QuestId, QuestStage } from "../game/types";
import { selectHudInventory } from "../presentation/hudInventory";
import { createPresentationPolicy } from "../presentation/presentationPolicy";
import { TextEntryModal } from "../ui/TextEntryModal";
import { formatLeaderboardTime, getLeaderboardElapsedMs } from "../platform/leaderboards";

const UI_DEPTH = 1_000;
const UI_FONT = '"Courier New", monospace';
const INK = 0x172735;
const PAPER = 0xfff5d6;
const GOLD = 0xf4d37b;

export class UIScene extends Phaser.Scene {
  private objectivePanel!: Phaser.GameObjects.Container;
  private objectiveCard!: Phaser.GameObjects.Rectangle;
  private objectiveHeading!: Phaser.GameObjects.Text;
  private objectiveText!: Phaser.GameObjects.Text;
  private inventoryIcon!: Phaser.GameObjects.Image;
  private inventoryText!: Phaser.GameObjects.Text;
  private saveStatusText!: Phaser.GameObjects.Text;
  private mushroomTimerText!: Phaser.GameObjects.Text;
  private debugText?: Phaser.GameObjects.Text;
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
  private choice?: ChoiceRequest;
  private choicePanel?: Phaser.GameObjects.Container;
  private choiceEntries: Array<{ option: ChoiceOption; card: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; reason?: Phaser.GameObjects.Text }> = [];
  private choiceFocus = 0;
  private textEntryModal?: TextEntryModal;
  private latestHint = "";
  private previousStage?: QuestStage;
  private previousQuestId?: QuestId;
  private previousCompletedQuestIds?: readonly QuestId[];
  private previousSavedAt?: string | null;
  private toastTimer?: Phaser.Time.TimerEvent;
  private objectiveTimer?: Phaser.Time.TimerEvent;
  private saveTimer?: Phaser.Time.TimerEvent;
  private objectiveFontSize = 16;
  private dialogueFontSize = 17;

  constructor() {
    super("ui");
  }

  create(): void {
    this.resetRunState();
    this.cameras.main.setScroll(0, 0);
    this.buildObjectivePanel();
    this.buildDialoguePanel();
    this.buildToast();
    this.buildHint();
    this.buildSaveStatus();
    this.buildMushroomTimer();
    this.buildInventoryIndicator();
    if (import.meta.env.DEV) this.buildDebugPanel();

    gameEvents.on(EVENT.stateChanged, this.handleStateChanged, this);
    gameEvents.on(EVENT.dialogue, this.handleDialogue, this);
    gameEvents.on(EVENT.dialogueCancelled, this.cancelDialogue, this);
    gameEvents.on(EVENT.choice, this.handleChoice, this);
    gameEvents.on(EVENT.choiceCancelled, this.cancelChoice, this);
    gameEvents.on(EVENT.textEntry, this.handleTextEntry, this);
    gameEvents.on(EVENT.textEntryCancelled, this.cancelTextEntry, this);
    gameEvents.on(EVENT.toast, this.handleToast, this);
    gameEvents.on(EVENT.hint, this.handleHint, this);
    gameEvents.on(EVENT.inputAction, this.handleInputAction, this);
    if (import.meta.env.DEV) this.input.keyboard?.on("keydown-F3", this.toggleDebug, this);
    this.handleStateChanged(gameStore.getState());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  update(): void {
    const state = gameStore.getState();
    const running = state.activeQuestId === "andrew_mushroom_hunt"
      && state.questProgress.mushrooms.stage !== "talk_to_andrew_for_mushrooms"
      && state.questProgress.mushrooms.stage !== "complete";
    const elapsed = getLeaderboardElapsedMs("mushroomHunt");
    this.mushroomTimerText.setVisible(running && elapsed !== undefined);
    if (running && elapsed !== undefined) this.mushroomTimerText.setText(`MUSHROOM HUNT  ${formatLeaderboardTime(elapsed)}`);
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

  private buildMushroomTimer(): void {
    this.mushroomTimerText = this.add.text(938, 92, "", {
      fontFamily: UI_FONT,
      fontSize: "11px",
      color: "#fff5d6",
      fontStyle: "bold",
      backgroundColor: "#7d461be8",
      padding: { x: 9, y: 6 },
    }).setOrigin(1, 0).setDepth(UI_DEPTH + 2).setVisible(false);
  }

  private buildInventoryIndicator(): void {
    const shadow = this.add.rectangle(938, 53, 178, 48, 0x07131c, 0.42).setOrigin(1, 0);
    const card = this.add.graphics();
    card.fillStyle(PAPER, 1).fillRect(756, 49, 178, 48);
    card.lineStyle(2, INK, 1).strokeRect(756, 49, 178, 48);
    this.inventoryIcon = this.add.image(778, 73, "controller").setScale(0.8).setTint(INK).setVisible(false);
    this.inventoryText = this.add.text(798, 61, "BACKPACK\nEMPTY", {
      fontFamily: UI_FONT,
      fontSize: "11px",
      color: "#172735",
      fontStyle: "bold",
      lineSpacing: 1,
    });
    this.add.container(0, 0, [shadow, card, this.inventoryIcon, this.inventoryText]).setDepth(UI_DEPTH + 1);
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
    const newlyCompleted = this.previousCompletedQuestIds === undefined
      ? []
      : state.completedQuestIds.filter((questId) => !this.previousCompletedQuestIds!.includes(questId));

    const questTitle = QUEST_BY_ID[state.activeQuestId]?.title ?? "Current Memory";
    this.setObjectiveHeading(`QUEST JOURNAL  •  ${questTitle.toUpperCase()}`);
    this.applyTextScale();
    if (this.policy.reducedMotion) this.finishActiveMotion();
    this.objectiveFontSize = this.policy.fontSize(16);
    this.dialogueFontSize = this.objectiveFontSize + 1;
    this.fitText(this.objectiveText, getObjective(state.questStage, state.activeQuestId), this.objectiveFontSize, 328, 62, 12);
    const carried = selectHudInventory(state);
    const itemLines = [
      carried.controllerCount > 0 ? "CONTROLLER 1/1" : undefined,
      carried.mushroomCount > 0 ? `MUSHROOMS ${carried.mushroomCount}/10` : undefined,
    ].filter((line): line is string => line !== undefined);
    const hasCarriedItems = itemLines.length > 0;
    this.inventoryText
      .setText(["BACKPACK", ...(hasCarriedItems ? itemLines : ["EMPTY"])])
      .setColor(hasCarriedItems ? "#32704a" : "#172735");
    this.inventoryIcon
      .setTexture(carried.controllerCount > 0 ? "controller" : "mushroom")
      .setVisible(hasCarriedItems);
    this.setSavedStatus(state.lastSavedAt);

    // A completed save resumes without re-pinning an already acknowledged quest.
    if (this.previousStage === undefined && state.questStage === "complete") {
      this.objectivePanel.setVisible(false);
    }

    if (newlyCompleted.length > 0) {
      const completedQuestId = newlyCompleted[newlyCompleted.length - 1]!;
      const completedTitle = QUEST_BY_ID[completedQuestId]?.title ?? "Current Memory";
      this.showObjectiveUpdate("complete", completedQuestId);
      const newQuestNote = hasAvailableQuest(state) ? " A new quest is waiting in your backpack." : "";
      this.handleToast(`Quest complete — ${completedTitle}!${newQuestNote}`);
    } else if (stageChanged) {
      this.showObjectiveUpdate(state.questStage, state.activeQuestId);
      if (state.questStage === "complete") {
        const newQuestNote = hasAvailableQuest(state)
          ? " A new quest is waiting in your backpack."
          : "";
        this.handleToast(`Quest complete — ${questTitle}!${newQuestNote}`);
      }
    }
    if (saveChanged) this.pulseSavedStatus(state.lastSavedAt);

    this.debugText?.setText([
      `map: ${state.currentMap}`,
      `quest: ${state.activeQuestId} / ${state.questStage}`,
      `inventory: ${state.inventory.map((stack) => `${stack.itemId} x${stack.quantity}`).join(", ") || "empty"}`,
      `save: v${state.version}`,
      "F2: geometry overlay",
      "F4: teleport to objective",
      "F6: collision inspector",
    ]);
    this.previousStage = state.questStage;
    this.previousQuestId = state.activeQuestId;
    this.previousCompletedQuestIds = [...state.completedQuestIds];
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
    this.objectivePanel.setVisible(true).setAlpha(this.policy.reducedMotion ? 1 : 0.7).setScale(1);
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
      if (stage === "complete") {
        this.hideCompletedObjectivePanel();
        return;
      }
      this.setObjectiveHeading(`QUEST JOURNAL  •  ${questTitle.toUpperCase()}`);
      this.objectiveCard.setFillStyle(PAPER, 0.96);
    });
  }

  /** Completion is acknowledged briefly, then leaves the world HUD uncluttered. */
  private hideCompletedObjectivePanel(): void {
    if (this.policy.reducedMotion) {
      this.objectivePanel.setVisible(false).setAlpha(1).setY(0);
      return;
    }
    this.tweens.add({
      targets: this.objectivePanel,
      alpha: 0,
      y: -10,
      duration: this.policy.duration(220),
      onComplete: () => this.objectivePanel.setVisible(false).setAlpha(1).setY(0),
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
    if (this.choice) this.cancelChoice();
    if (!request.lines.length) {
      request.onComplete?.();
      return;
    }

    inputCapture.capture("dialogue");
    this.dialogue = request;
    this.dialogueIndex = 0;
    this.showDialogueLine();
    this.updateHintVisibility();
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
    this.updateHintVisibility();
    completedDialogue.onComplete?.();
  }

  private cancelDialogue(): void {
    if (!this.dialogue && !this.dialoguePanel.visible) return;
    this.dialogue = undefined;
    this.dialogueIndex = 0;
    inputCapture.release("dialogue");
    this.tweens.killTweensOf(this.dialoguePanel);
    this.dialoguePanel.setVisible(false).setAlpha(1);
    this.updateHintVisibility();
  }

  private handleChoice(request: ChoiceRequest): void {
    if (!request.options.some((option) => option.enabled !== false)) {
      request.onCancel?.();
      return;
    }
    this.cancelDialogue();
    this.clearChoice();
    this.choice = request;
    this.choiceFocus = Math.max(0, request.options.findIndex((option) => option.enabled !== false));
    inputCapture.capture("choice", { blockMenuToggle: true });
    this.updateHintVisibility();

    const shadow = this.add.rectangle(480, 315, 660, 250, 0x07131c, 0.58);
    const paper = this.add.rectangle(480, 310, 660, 250, PAPER, 0.99).setStrokeStyle(4, INK, 1);
    const tape = this.add.rectangle(480, 184, 72, 14, 0xf2cf79, 0.72).setAngle(-1);
    const speaker = this.add.text(170, 204, request.speaker.toUpperCase(), {
      fontFamily: UI_FONT, fontSize: "18px", color: "#914833", fontStyle: "bold",
    });
    const prompt = this.add.text(170, 232, request.prompt, {
      fontFamily: UI_FONT, fontSize: "18px", color: "#172735", fontStyle: "bold", wordWrap: { width: 620 },
    });
    const children: Phaser.GameObjects.GameObject[] = [shadow, paper, tape, speaker, prompt];
    this.choiceEntries = request.options.map((option, index) => {
      const y = 290 + index * 48;
      const enabled = option.enabled !== false;
      const card = this.add.rectangle(480, y, 590, 38, enabled ? 0xe8f3c7 : 0xd5d0c1, 1)
        .setStrokeStyle(2, INK, enabled ? 0.72 : 0.3);
      const label = this.add.text(204, y, option.label, {
        fontFamily: UI_FONT, fontSize: "16px", color: enabled ? "#172735" : "#6c6d6c", fontStyle: "bold",
      }).setOrigin(0, 0.5);
      const reason = !enabled && option.disabledReason
        ? this.add.text(748, y, option.disabledReason, {
          fontFamily: UI_FONT, fontSize: "11px", color: "#6c6d6c", fontStyle: "italic",
        }).setOrigin(1, 0.5)
        : undefined;
      if (enabled) card.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.selectChoice(index));
      children.push(card, label);
      if (reason) children.push(reason);
      return { option, card, label, reason };
    });
    const footer = this.add.text(810, 418, "↑ ↓ / TAP  •  E CONFIRM  •  ESC BACK", {
      fontFamily: UI_FONT, fontSize: "11px", color: "#536575", fontStyle: "bold",
    }).setOrigin(1, 0.5);
    children.push(footer);
    this.choicePanel = this.add.container(0, 0, children).setDepth(UI_DEPTH + 5);
    this.updateChoiceFocus();
  }

  private handleTextEntry(request: TextEntryRequest): void {
    const previousModal = this.textEntryModal;
    if (previousModal) {
      previousModal.cancel();
      // A cancellation callback may synchronously publish a newer request.
      if (this.textEntryModal && this.textEntryModal !== previousModal) return;
    }
    this.cancelDialogue();
    this.clearChoice();
    let modal: TextEntryModal | undefined;
    modal = TextEntryModal.mount(this, request, {
      capture: inputCapture,
      owner: "text-entry-ui",
      onResolve: () => this.clearTextEntryModal(modal),
    });
    this.textEntryModal = modal;
    this.updateHintVisibility();
  }

  private cancelTextEntry(): void {
    const modal = this.textEntryModal;
    if (!modal) return;
    if (!modal.cancel()) this.clearTextEntryModal(modal);
  }

  /** Clears the exact resolved modal before its caller-owned callback runs. */
  private clearTextEntryModal(modal: TextEntryModal | undefined): void {
    if (!modal || this.textEntryModal !== modal) return;
    this.textEntryModal = undefined;
    this.updateHintVisibility();
  }

  private selectChoice(index = this.choiceFocus): void {
    const entry = this.choiceEntries[index];
    const request = this.choice;
    if (!entry || !request || entry.option.enabled === false) return;
    this.clearChoice();
    this.updateHintVisibility();
    request.onSelect(entry.option.id);
  }

  private cancelChoice(): void {
    const request = this.choice;
    this.clearChoice();
    this.updateHintVisibility();
    request?.onCancel?.();
  }

  private clearChoice(): void {
    inputCapture.release("choice");
    this.choicePanel?.destroy(true);
    this.choicePanel = undefined;
    this.choice = undefined;
    this.choiceEntries = [];
    this.choiceFocus = 0;
  }

  private moveChoiceFocus(direction: -1 | 1): void {
    if (!this.choiceEntries.length) return;
    for (let offset = 1; offset <= this.choiceEntries.length; offset += 1) {
      const candidate = (this.choiceFocus + direction * offset + this.choiceEntries.length) % this.choiceEntries.length;
      if (this.choiceEntries[candidate]?.option.enabled !== false) {
        this.choiceFocus = candidate;
        this.updateChoiceFocus();
        gameEvents.emit(EVENT.audioCue, "menuNavigate");
        return;
      }
    }
  }

  private updateChoiceFocus(): void {
    this.choiceEntries.forEach((entry, index) => {
      const focused = index === this.choiceFocus && entry.option.enabled !== false;
      entry.card.setFillStyle(focused ? 0xf4d37b : entry.option.enabled === false ? 0xd5d0c1 : 0xe8f3c7, 1);
      entry.card.setStrokeStyle(focused ? 3 : 2, INK, focused ? 1 : entry.option.enabled === false ? 0.3 : 0.72);
    });
  }

  private handleInputAction(event: InputActionEvent): void {
    if (!event.pressed || this.sys.isPaused()) return;
    if (this.textEntryModal) return;
    if (this.choice) {
      if (event.action === "moveUp") this.moveChoiceFocus(-1);
      else if (event.action === "moveDown") this.moveChoiceFocus(1);
      else if (event.action === "interact") this.selectChoice();
      else if (event.action === "back" || event.action === "menu") this.cancelChoice();
      return;
    }
    if (event.action === "interact" && this.dialogue && this.dialoguePanel.visible) this.advanceDialogue();
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
    this.latestHint = message;
    this.fitText(this.hintText, message, 16, 420, 56, 12);
    const height = Math.max(50, Math.min(76, this.hintText.height + 20));
    this.hintCard.setSize(460, height);
    this.hintShadow.setSize(460, height).setPosition(4, 5);
    this.hintPanel.setSize(460, height);
    this.updateHintVisibility();
  }

  private updateHintVisibility(): void {
    const visible = this.latestHint.trim().length > 0 && !this.dialogue && !this.choice && !this.textEntryModal;
    this.hintPanel.setVisible(visible);
    this.tweens.killTweensOf(this.hintPanel);
    if (!visible) {
      this.hintPanel.setAlpha(1).setScale(1);
      return;
    }
    this.hintPanel.setAlpha(this.policy.reducedMotion ? 1 : 0).setScale(this.policy.reducedMotion ? 1 : 0.98);
    if (!this.policy.reducedMotion) this.tweens.add({ targets: this.hintPanel, alpha: 1, scaleX: 1, scaleY: 1, duration: this.policy.duration(120) });
  }

  private cleanup(): void {
    inputCapture.release("dialogue");
    this.clearChoice();
    gameEvents.off(EVENT.stateChanged, this.handleStateChanged, this);
    gameEvents.off(EVENT.dialogue, this.handleDialogue, this);
    gameEvents.off(EVENT.dialogueCancelled, this.cancelDialogue, this);
    gameEvents.off(EVENT.choice, this.handleChoice, this);
    gameEvents.off(EVENT.choiceCancelled, this.cancelChoice, this);
    gameEvents.off(EVENT.textEntry, this.handleTextEntry, this);
    gameEvents.off(EVENT.textEntryCancelled, this.cancelTextEntry, this);
    gameEvents.off(EVENT.toast, this.handleToast, this);
    gameEvents.off(EVENT.hint, this.handleHint, this);
    gameEvents.off(EVENT.inputAction, this.handleInputAction, this);
    if (import.meta.env.DEV) this.input.keyboard?.off("keydown-F3", this.toggleDebug, this);
    this.toastTimer?.remove(false);
    this.objectiveTimer?.remove(false);
    this.saveTimer?.remove(false);
    this.textEntryModal?.destroy();
    this.textEntryModal = undefined;
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
    this.choice = undefined;
    this.choicePanel = undefined;
    this.choiceEntries = [];
    this.choiceFocus = 0;
    this.textEntryModal = undefined;
    this.latestHint = "";
    this.previousStage = undefined;
    this.previousQuestId = undefined;
    this.previousCompletedQuestIds = undefined;
    this.previousSavedAt = undefined;
    this.toastTimer = undefined;
    this.objectiveTimer = undefined;
    this.saveTimer = undefined;
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
    if (this.dialoguePanel.visible) this.dialoguePanel.setAlpha(1);
    if (this.toastPanel.visible) this.toastPanel.setAlpha(1).setY(0);
    if (this.hintPanel.visible) this.hintPanel.setAlpha(1).setScale(1);
  }
}
