import Phaser from "phaser";
import { getObjective } from "../content/quest";
import { EVENT, gameEvents } from "../game/events";
import type { DialogueRequest, SaveData } from "../game/types";

const UI_DEPTH = 1_000;

export class UIScene extends Phaser.Scene {
  private objectiveText!: Phaser.GameObjects.Text;
  private saveStatusText!: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text;
  private dialoguePanel!: Phaser.GameObjects.Container;
  private dialogueSpeaker!: Phaser.GameObjects.Text;
  private dialogueText!: Phaser.GameObjects.Text;
  private toastPanel!: Phaser.GameObjects.Container;
  private toastText!: Phaser.GameObjects.Text;
  private hintPanel!: Phaser.GameObjects.Container;
  private hintText!: Phaser.GameObjects.Text;
  private dialogue?: DialogueRequest;
  private dialogueIndex = 0;
  private toastTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super("ui");
  }

  create(): void {
    this.cameras.main.setScroll(0, 0);
    this.buildObjectivePanel();
    this.buildDialoguePanel();
    this.buildToast();
    this.buildHint();
    this.buildSaveStatus();
    this.buildDebugPanel();

    gameEvents.on(EVENT.stateChanged, this.handleStateChanged, this);
    gameEvents.on(EVENT.dialogue, this.handleDialogue, this);
    gameEvents.on(EVENT.toast, this.handleToast, this);
    gameEvents.on(EVENT.hint, this.handleHint, this);
    this.input.keyboard?.on("keydown-E", this.advanceDialogue, this);
    this.input.keyboard?.on("keydown-SPACE", this.advanceDialogue, this);
    this.input.keyboard?.on("keydown-F3", this.toggleDebug, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  private buildObjectivePanel(): void {
    const background = this.add
      .rectangle(20, 20, 340, 74, 0x102331, 0.9)
      .setOrigin(0)
      .setStrokeStyle(2, 0xf4d37b, 0.9);
    const heading = this.add.text(36, 31, "MISSING CONTROLLER", {
      fontFamily: "Arial, sans-serif",
      fontSize: "14px",
      color: "#f4d37b",
      fontStyle: "bold",
    });
    this.objectiveText = this.add.text(36, 55, getObjective("talk_to_jeremy"), {
      fontFamily: "Arial, sans-serif",
      fontSize: "18px",
      color: "#ffffff",
      wordWrap: { width: 305 },
    });

    this.add.container(0, 0, [background, heading, this.objectiveText]).setDepth(UI_DEPTH);
  }

  private buildDialoguePanel(): void {
    const panel = this.add
      .rectangle(40, 376, 880, 140, 0x102331, 0.96)
      .setOrigin(0)
      .setStrokeStyle(3, 0xf4d37b, 1);
    this.dialogueSpeaker = this.add.text(64, 394, "", {
      fontFamily: "Arial, sans-serif",
      fontSize: "20px",
      color: "#f4d37b",
      fontStyle: "bold",
    });
    this.dialogueText = this.add.text(64, 426, "", {
      fontFamily: "Arial, sans-serif",
      fontSize: "20px",
      color: "#ffffff",
      lineSpacing: 5,
      wordWrap: { width: 820 },
    });
    const hint = this.add
      .text(895, 492, "E / SPACE  ▶", {
        fontFamily: "Arial, sans-serif",
        fontSize: "14px",
        color: "#c9d7df",
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5);

    this.dialoguePanel = this.add
      .container(0, 0, [panel, this.dialogueSpeaker, this.dialogueText, hint])
      .setDepth(UI_DEPTH + 2)
      .setVisible(false);
  }

  private buildSaveStatus(): void {
    this.saveStatusText = this.add.text(935, 22, "AUTOSAVE ON", {
      fontFamily: "Arial, sans-serif", fontSize: "12px", color: "#d8e8df",
      backgroundColor: "#102331cc", padding: { x: 8, y: 5 },
    }).setOrigin(1, 0).setDepth(UI_DEPTH);
  }

  private buildDebugPanel(): void {
    this.debugText = this.add.text(935, 58, "", {
      fontFamily: "monospace", fontSize: "13px", color: "#d8ffe6",
      backgroundColor: "#071511e6", padding: { x: 9, y: 7 }, align: "right",
    }).setOrigin(1, 0).setDepth(UI_DEPTH + 3).setVisible(false);
  }

  private buildToast(): void {
    const background = this.add
      .rectangle(480, 342, 560, 46, 0x102331, 0.9)
      .setStrokeStyle(2, 0xffffff, 0.35);
    this.toastText = this.add
      .text(480, 342, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "17px",
        color: "#ffffff",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5);
    this.toastPanel = this.add
      .container(0, 0, [background, this.toastText])
      .setDepth(UI_DEPTH + 1)
      .setVisible(false);
  }

  private buildHint(): void {
    const background = this.add
      .rectangle(0, 0, 420, 42, 0x102331, 0.88)
      .setStrokeStyle(2, 0xf4d37b, 0.75);
    this.hintText = this.add
      .text(0, 0, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "17px",
        color: "#ffffff",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5);
    this.hintPanel = this.add
      .container(480, 505, [background, this.hintText])
      .setDepth(UI_DEPTH + 1)
      .setSize(420, 42)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => gameEvents.emit(EVENT.interactRequested))
      .setVisible(false);
  }

  private handleStateChanged(state: SaveData): void {
    this.objectiveText.setText(getObjective(state.questStage));
    const textSize = state.settings.textSize === "small" ? 16 : state.settings.textSize === "large" ? 21 : 18;
    this.objectiveText.setFontSize(textSize);
    this.dialogueText.setFontSize(textSize + 2);
    this.saveStatusText.setText(state.lastSavedAt ? "✓ SAVED" : "AUTOSAVE ON");
    this.debugText.setText([
      `map: ${state.currentMap}`,
      `quest: ${state.questStage}`,
      `inventory: ${state.inventory.join(", ") || "empty"}`,
      `save: v${state.version}`,
      "F4/F6: teleport to objective",
    ]);
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
    this.dialoguePanel.setVisible(true);
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

  private handleToast(message: string): void {
    this.toastTimer?.remove(false);
    this.toastText.setText(message);
    this.toastPanel.setVisible(true).setAlpha(1);
    this.toastTimer = this.time.delayedCall(2_400, () => {
      this.tweens.add({
        targets: this.toastPanel,
        alpha: 0,
        duration: 250,
        onComplete: () => this.toastPanel.setVisible(false).setAlpha(1),
      });
    });
  }

  private handleHint(message: string): void {
    this.hintText.setText(message);
    this.hintPanel.setVisible(message.trim().length > 0);
  }

  private cleanup(): void {
    gameEvents.off(EVENT.stateChanged, this.handleStateChanged, this);
    gameEvents.off(EVENT.dialogue, this.handleDialogue, this);
    gameEvents.off(EVENT.toast, this.handleToast, this);
    gameEvents.off(EVENT.hint, this.handleHint, this);
    this.input.keyboard?.off("keydown-E", this.advanceDialogue, this);
    this.input.keyboard?.off("keydown-SPACE", this.advanceDialogue, this);
    this.input.keyboard?.off("keydown-F3", this.toggleDebug, this);
    this.toastTimer?.remove(false);
  }
}
