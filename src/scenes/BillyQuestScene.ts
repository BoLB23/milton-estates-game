import Phaser from "phaser";
import { CHAPTER_REGISTRY, hasAvailableQuest, selectQuestState, type QuestDefinition } from "../content/chapters";
import { selectDefaultQuestId, selectQuestJournalAction } from "../content/questJournal";
import { getObjective } from "../content/quest";
import { EVENT, gameEvents, inputCapture, type InputActionEvent } from "../game/events";
import { gameStore } from "../game/GameStore";
import type { GameState, QuestId } from "../game/types";
import { createPresentationPolicy } from "../presentation/presentationPolicy";
import { SCRAPBOOK, scrapbookButton, scrapbookCard, scrapbookText, TextFocusController } from "../presentation/scrapbook";
import { ScrollablePanel } from "../presentation/ScrollablePanel";
import { returnToCurrentAdventure } from "./MenuScene";

/**
 * Billy's quest journal is a conversation-owned modal, deliberately separate
 * from the player's Backpack. Nothing in this scene changes MenuScene state.
 */
export class BillyQuestScene extends Phaser.Scene {
  private overlay!: Phaser.GameObjects.Container;
  private content!: Phaser.GameObjects.Container;
  private state: GameState = gameStore.getState();
  private readonly focus = new TextFocusController();
  private selectedQuestIndex = 0;
  private resetArmedQuestId?: QuestId;
  private isOpen = false;
  private listPanel?: ScrollablePanel;
  private scrollPointerY?: number;

  constructor() { super("billy-quest-journal"); }

  create(): void {
    this.state = gameStore.getState();
    this.isOpen = false;
    this.selectedQuestIndex = 0;
    this.resetArmedQuestId = undefined;

    const shade = this.add.rectangle(0, 0, 960, 540, 0x09130f, 0.9).setOrigin(0);
    const cover = this.add.rectangle(27, 20, 906, 502, 0x244d3d, 1)
      .setOrigin(0).setStrokeStyle(5, 0x122d26, 1);
    const binding = this.add.rectangle(42, 34, 876, 474, 0xb86f3d, 1)
      .setOrigin(0).setStrokeStyle(2, 0x5a3226, 1);
    const paper = this.add.rectangle(49, 39, 862, 462, 0xf1dfb7, 1)
      .setOrigin(0).setStrokeStyle(2, 0x8b6745, 1);
    const header = this.add.rectangle(49, 39, 862, 64, 0x315f4c, 1).setOrigin(0);
    const title = this.add.text(68, 51, "BILLY'S QUEST JOURNAL", {
      fontFamily: SCRAPBOOK.fontFamily, fontSize: "25px", color: "#fff3c9", fontStyle: "bold",
    });
    const subtitle = this.add.text(70, 80, "PICK A MEMORY  •  RESET A QUEST  •  COME BACK ANYTIME", {
      fontFamily: SCRAPBOOK.fontFamily, fontSize: "10px", color: "#d7e0bc", fontStyle: "bold",
    });
    const closeHint = this.add.text(892, 60, "ESC  LEAVE ×", {
      fontFamily: SCRAPBOOK.fontFamily, fontSize: "13px", color: "#fff3c9", fontStyle: "bold",
    }).setOrigin(1, 0);
    this.content = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0, [shade, cover, binding, paper, header, title, subtitle, closeHint, this.content])
      .setDepth(2_100).setVisible(false);

    gameEvents.on(EVENT.questJournalRequested, this.openJournal, this);
    gameEvents.on(EVENT.inputAction, this.handleInputAction, this);
    gameEvents.on(EVENT.stateChanged, this.handleStateChanged, this);
    this.input.on("wheel", this.handleScrollWheel, this);
    this.input.on("pointerdown", this.handleScrollPointerDown, this);
    this.input.on("pointermove", this.handleScrollPointerMove, this);
    this.input.on("pointerup", this.handleScrollPointerUp, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  private openJournal(): void {
    this.state = gameStore.getState();
    const chapter = this.activeChapter();
    const defaultQuestId = selectDefaultQuestId(this.state);
    const defaultIndex = chapter.quests.findIndex((quest) => quest.id === defaultQuestId);
    this.selectedQuestIndex = defaultIndex >= 0 ? defaultIndex : 0;
    this.resetArmedQuestId = undefined;
    if (!this.isOpen) {
      this.isOpen = true;
      inputCapture.capture("billy-quest-journal", { blockMenuToggle: true });
      this.scene.bringToTop();
      this.scene.pause(this.state.currentMap);
      this.scene.pause("ui");
      this.overlay.setVisible(true);
    }
    this.render();
  }

  private closeJournal(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.resetArmedQuestId = undefined;
    inputCapture.release("billy-quest-journal");
    this.listPanel?.destroy();
    this.listPanel = undefined;
    this.overlay.setVisible(false);
    this.scene.resume("ui");
    this.scene.resume(gameStore.getState().currentMap);
  }

  private render(): void {
    this.listPanel?.destroy();
    this.listPanel = undefined;
    this.content.removeAll(true);
    this.focus.reset();

    const chapter = this.activeChapter();
    this.selectedQuestIndex = Phaser.Math.Clamp(this.selectedQuestIndex, 0, Math.max(0, chapter.quests.length - 1));
    const selected = chapter.quests[this.selectedQuestIndex] ?? chapter.quests[0]!;
    const status = selectQuestState(selected, this.state);
    const action = selectQuestJournalAction(selected, {
      ...this.state,
      replayComplete: this.state.replayQuestId === selected.id && this.state.questStage === "complete",
    });
    const policy = createPresentationPolicy(this.state.settings);

    scrapbookText(this, this.content, 68, 119, "QUESTS WITH BILLY", {
      fontSize: "24px", color: "#3c3026", fontStyle: "bold",
    }, policy.textScale);
    scrapbookText(this, this.content, 68, 151,
      hasAvailableQuest(this.state)
        ? "Billy has a new adventure ready. Pick one from the journal."
        : "Review your current quest, restart it, or revisit a completed memory.", {
        fontSize: "14px", color: "#675544", wordWrap: { width: 795 },
      }, policy.textScale);

    scrapbookCard(this, this.content, 68, 188, 270, 292, 0xe9d29e, false);
    this.listPanel = new ScrollablePanel(this, this.content, { x: 76, y: 196, width: 254, height: 276 });
    chapter.quests.forEach((quest, index) => {
      const questStatus = selectQuestState(quest, this.state);
      const y = 198 + index * 42;
      const selectedRow = index === this.selectedQuestIndex;
      const row = this.add.rectangle(80, y, 242, 38, selectedRow ? 0xfff2a1 : 0xf8dfb5, 1)
        .setOrigin(0)
        .setStrokeStyle(selectedRow ? 3 : 1, selectedRow ? 0x315f4c : 0xa7865f, 0.9)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          this.selectedQuestIndex = index;
          this.resetArmedQuestId = undefined;
          gameEvents.emit(EVENT.audioCue, "menuNavigate");
          this.render();
        });
      this.listPanel!.content.add(row);
      const name = scrapbookText(this, this.listPanel!.content, 92, y + 4, quest.title, {
        fontSize: "12px", color: "#43372d", fontStyle: "bold", wordWrap: { width: 214 },
      }, policy.textScale);
      this.fitText(name, 214, 15, 9);
      scrapbookText(this, this.listPanel!.content, 92, y + 21, this.statusLabel(questStatus), {
        fontSize: "9px", color: this.statusColor(questStatus), fontStyle: "bold",
      }, policy.textScale);
    });
    this.listPanel.setContentHeight(Math.max(276, chapter.quests.length * 42 + 4));
    this.listPanel.scrollIntoView(198 + this.selectedQuestIndex * 42, 38);

    scrapbookCard(this, this.content, 356, 188, 506, 292, 0xfff8df, false);
    scrapbookText(this, this.content, 380, 207, `${selected.kind.toUpperCase()} QUEST`, {
      fontSize: "11px", color: "#9a573a", fontStyle: "bold",
    }, policy.textScale);
    const selectedTitle = scrapbookText(this, this.content, 380, 230, selected.title, {
      fontSize: "23px", color: "#315f4c", fontStyle: "bold", wordWrap: { width: 450 },
    }, policy.textScale);
    this.fitText(selectedTitle, 450, 48, 15);
    const description = scrapbookText(this, this.content, 380, 282, selected.description, {
      fontSize: "14px", color: "#675544", wordWrap: { width: 450 }, lineSpacing: 3,
    }, policy.textScale);
    this.fitText(description, 450, 42, 10);
    const detail = scrapbookText(this, this.content, 380, 331, this.questDetail(selected, status), {
      fontSize: "13px", color: status === "locked" ? "#a34237" : "#315f4c", wordWrap: { width: 450 }, lineSpacing: 4,
    }, policy.textScale);
    this.fitText(detail, 450, 48, 10);

    if (action === "continue-quest") {
      this.button(380, 397, "CONTINUE QUEST", () => this.closeJournal(), 210);
      const armed = this.resetArmedQuestId === selected.id;
      this.button(610, 397, armed ? "CONFIRM RESET" : "RESET QUEST", () => this.resetQuest(selected), 220, armed ? "#c65246" : "#d69b62");
      scrapbookText(this, this.content, 380, 452,
        armed ? "Reset starts this quest over and removes its temporary quest progress." : "Reset is available even while this quest is in progress.", {
          fontSize: "11px", color: armed ? "#a43732" : "#76624f", fontStyle: "italic", wordWrap: { width: 450 },
        }, policy.textScale);
    } else if (action === "start-quest" && selected.implemented) {
      this.button(610, 397, "START QUEST", () => this.playQuest(selected), 220);
    } else if (action === "replay-quest" && selected.implemented) {
      this.button(610, 397, "REPLAY QUEST", () => this.playQuest(selected), 220);
    } else if (action === "continue-replay") {
      this.button(380, 397, "CONTINUE REPLAY", () => this.closeJournal(), 210);
      this.button(610, 397, "RETURN TO ADVENTURE", () => this.returnToAdventure(), 220, "#b8d6a4");
    } else if (action === "return-to-adventure") {
      this.button(500, 397, "RETURN TO CURRENT ADVENTURE", () => this.returnToAdventure(), 330, "#b8d6a4");
    } else {
      const replayBlocked = this.state.replayQuestId !== null && selected.id !== this.state.replayQuestId;
      scrapbookText(this, this.content, 380, 402,
        replayBlocked ? "Return to your saved adventure before starting another quest." : status === "locked" ? "LOCKED" : "NOT AVAILABLE YET", {
        fontSize: "13px", color: "#a34237", fontStyle: "bold",
        wordWrap: { width: 450 },
      }, policy.textScale);
    }
    this.focus.refresh();
  }

  private button(x: number, y: number, label: string, action: () => void, width: number, color = "#f3c95f"): Phaser.GameObjects.Text {
    return scrapbookButton(this, this.content, this.focus, x, y, label, () => {
      gameEvents.emit(EVENT.audioCue, "confirm");
      action();
    }, {
      width, color, ink: "#2e2820", focusColor: "#fff2a1", focusInk: "#172735",
      textScale: createPresentationPolicy(this.state.settings).textScale,
    });
  }

  private selectQuest(delta: number): void {
    const quests = this.activeChapter().quests;
    this.selectedQuestIndex = (this.selectedQuestIndex + delta + quests.length) % quests.length;
    this.resetArmedQuestId = undefined;
    gameEvents.emit(EVENT.audioCue, "menuNavigate");
    this.render();
  }

  private playQuest(quest: QuestDefinition): void {
    const status = selectQuestState(quest, this.state);
    // Pointer and controller callbacks can outlive a render. Do not let a
    // stale action start or replace another active replay.
    if (gameStore.isReplaying() || status === "locked" || status === "active" || status === "replaying" || !quest.implemented) return;
    const oldMap = gameStore.getState().currentMap;
    if (status === "completed") gameStore.startQuestReplay(quest.id);
    else gameStore.setActiveQuest(quest.chapterId, quest.id);
    gameStore.setCurrentMap("neighborhood");
    this.closeJournal();
    this.relaunchNeighborhood(oldMap);
  }

  private returnToAdventure(): void {
    this.closeJournal();
    returnToCurrentAdventure(this);
  }

  private resetQuest(quest: QuestDefinition): void {
    if (this.resetArmedQuestId !== quest.id) {
      this.resetArmedQuestId = quest.id;
      this.render();
      return;
    }
    const oldMap = gameStore.getState().currentMap;
    if (!gameStore.resetActiveQuest()) {
      this.resetArmedQuestId = undefined;
      this.render();
      return;
    }
    gameStore.setCurrentMap("neighborhood");
    this.closeJournal();
    this.relaunchNeighborhood(oldMap);
    gameEvents.emit(EVENT.toast, `${quest.title} restarted.`);
  }

  private relaunchNeighborhood(oldMap: GameState["currentMap"]): void {
    this.scene.stop(oldMap);
    this.scene.launch("neighborhood", { spawn: "home" });
    this.scene.bringToTop("ui");
    this.scene.bringToTop();
  }

  private activeChapter() {
    return CHAPTER_REGISTRY.find((chapter) => chapter.id === this.state.activeChapterId) ?? CHAPTER_REGISTRY[0]!;
  }

  private statusLabel(status: ReturnType<typeof selectQuestState>): string {
    return status === "replaying" ? "↻ REPLAYING" : status === "completed" ? "✓ COMPLETED" : status === "active" ? "● ACTIVE" : status === "available" ? "○ AVAILABLE" : "🔒 LOCKED";
  }

  private statusColor(status: ReturnType<typeof selectQuestState>): string {
    return status === "completed" || status === "active" || status === "replaying" ? "#315f4c" : status === "available" ? "#275c73" : "#a34237";
  }

  private questDetail(quest: QuestDefinition, status: ReturnType<typeof selectQuestState>): string {
    if (status === "replaying") return this.state.questStage === "complete"
      ? "Replay complete. Return to your current adventure when you are ready."
      : `Replay objective: ${getObjective(this.state.questStage, this.state.activeQuestId)}`;
    if (status === "completed") return "Complete. Replaying this memory leaves your real adventure untouched.";
    if (status === "active") return `Current objective: ${getObjective(this.state.questStage, this.state.activeQuestId)}`;
    if (status === "available") return "Ready to begin whenever you are.";
    if (!quest.implemented) return quest.kind === "finale" ? "Finish the required memories to reveal this finale." : "Billy is still planning this adventure.";
    const prerequisites = quest.prerequisiteQuestIds.map((id) =>
      CHAPTER_REGISTRY.flatMap((chapter) => chapter.quests).find((candidate) => candidate.id === id)?.title ?? id,
    );
    return `Complete first: ${prerequisites.join(", ") || "the previous memory"}.`;
  }

  private fitText(text: Phaser.GameObjects.Text, maxWidth: number, maxHeight: number, minimumSize: number): void {
    text.setWordWrapWidth(maxWidth, true);
    const preferredSize = Number.parseInt(String(text.style.fontSize ?? 16), 10);
    for (let size = preferredSize; text.height > maxHeight && size > minimumSize; size -= 1) text.setFontSize(size - 1);
  }

  private handleInputAction(event: InputActionEvent): void {
    if (!this.isOpen || !event.pressed) return;
    switch (event.action) {
      case "menu":
      case "back": this.closeJournal(); break;
      case "tabPrevious":
      case "moveLeft": this.selectQuest(-1); break;
      case "tabNext":
      case "moveRight": this.selectQuest(1); break;
      case "moveUp": this.focus.move(-1); gameEvents.emit(EVENT.audioCue, "menuNavigate"); break;
      case "moveDown": this.focus.move(1); gameEvents.emit(EVENT.audioCue, "menuNavigate"); break;
      case "interact": this.focus.activate(); break;
    }
  }

  private handleStateChanged(state: GameState): void {
    this.state = state;
    if (this.isOpen) this.render();
  }

  private handleScrollWheel(pointer: Phaser.Input.Pointer, _over: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number): void {
    if (this.isOpen && this.listPanel?.contains(pointer.x, pointer.y)) this.listPanel.scrollBy(deltaY);
  }

  private handleScrollPointerDown(pointer: Phaser.Input.Pointer): void {
    this.scrollPointerY = this.isOpen && this.listPanel?.contains(pointer.x, pointer.y) ? pointer.y : undefined;
  }

  private handleScrollPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.scrollPointerY === undefined || !pointer.isDown || !this.listPanel) return;
    this.listPanel.scrollBy(this.scrollPointerY - pointer.y);
    this.scrollPointerY = pointer.y;
  }

  private handleScrollPointerUp(): void { this.scrollPointerY = undefined; }

  private cleanup(): void {
    inputCapture.release("billy-quest-journal");
    this.listPanel?.destroy();
    this.input.off("wheel", this.handleScrollWheel, this);
    this.input.off("pointerdown", this.handleScrollPointerDown, this);
    this.input.off("pointermove", this.handleScrollPointerMove, this);
    this.input.off("pointerup", this.handleScrollPointerUp, this);
    gameEvents.off(EVENT.questJournalRequested, this.openJournal, this);
    gameEvents.off(EVENT.inputAction, this.handleInputAction, this);
    gameEvents.off(EVENT.stateChanged, this.handleStateChanged, this);
  }
}
