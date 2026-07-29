import Phaser from "phaser";
import {
  CHAPTER_REGISTRY,
  selectChapterProgress,
  selectOptionalProgress,
  selectQuestState,
  type QuestDefinition,
} from "../content/chapters";
import { EVENT, gameEvents, type InputActionEvent } from "../game/events";
import { gameStore } from "../game/GameStore";
import type { PlayerSettings, SaveData } from "../game/types";
import { createPresentationPolicy, cycleTextSize, nextVolume } from "../presentation/presentationPolicy";
import { SCRAPBOOK, scrapbookButton, scrapbookCard, scrapbookText, TextFocusController } from "../presentation/scrapbook";

type FrontPage = "title" | "intro" | "chapters" | "quests" | "settings";

const PAPER = SCRAPBOOK.paper;
const INK = SCRAPBOOK.ink;
const MUTED_INK = SCRAPBOOK.mutedInk;
const BLUE_INK = SCRAPBOOK.blueInk;
const RED_INK = "#a34237";

export class FrontEndScene extends Phaser.Scene {
  private page: FrontPage = "title";
  private content!: Phaser.GameObjects.Container;
  private state: SaveData = gameStore.getState();
  private newGameArmed = false;
  private selectedQuestIndex = 0;
  private readonly focus = new TextFocusController();

  constructor() { super("front-end"); }

  create(): void {
    this.page = "title";
    this.newGameArmed = false;
    this.selectedQuestIndex = 0;
    this.focus.reset();
    this.cameras.main.setBackgroundColor("#315948");
    this.content = this.add.container(0, 0);
    gameEvents.on(EVENT.inputAction, this.handleInputAction, this);
    this.render();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  private render(): void {
    this.state = gameStore.getState();
    this.content.removeAll(true);
    this.focus.reset();
    this.drawDesk();
    switch (this.page) {
      case "title": this.renderTitle(); break;
      case "intro": this.renderIntro(); break;
      case "chapters": this.renderChapters(); break;
      case "quests": this.renderQuests(); break;
      case "settings": this.renderSettings(); break;
    }
    this.focus.refresh();
  }

  private drawDesk(): void {
    const g = this.add.graphics();
    g.fillStyle(0x315948).fillRect(0, 0, 960, 540);
    for (let y = 12; y < 540; y += 24) {
      g.lineStyle(1, 0x78917f, 0.12).lineBetween(0, y, 960, y + 18);
    }
    g.fillStyle(0x1c332a, 0.26).fillRoundedRect(24, 20, 912, 500, 12);
    this.content.add(g);
  }

  private paper(x: number, y: number, width: number, height: number, color = PAPER): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    g.fillStyle(0x17251f, 0.25).fillRoundedRect(x + 7, y + 8, width, height, 5);
    g.fillStyle(color).fillRoundedRect(x, y, width, height, 5);
    g.lineStyle(2, 0xcdbf98, 0.8).strokeRoundedRect(x, y, width, height, 5);
    this.content.add(g);
    return g;
  }

  private card(x: number, y: number, width: number, height: number, color = 0xfff8df): Phaser.GameObjects.Graphics {
    return scrapbookCard(this, this.content, x, y, width, height, color);
  }

  private tape(x: number, y: number, angle = 0): void {
    const tape = this.add.rectangle(x, y, 72, 19, 0xe6d78f, 0.72).setAngle(angle);
    this.content.add(tape);
  }

  private text(x: number, y: number, value: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    return scrapbookText(this, this.content, x, y, value, style, createPresentationPolicy(this.state.settings).textScale);
  }

  private button(x: number, y: number, label: string, action: () => void, options?: {
    width?: number;
    color?: string;
    ink?: string;
    focusColor?: string;
    focusInk?: string;
    audio?: boolean;
  }): Phaser.GameObjects.Text {
    return scrapbookButton(this, this.content, this.focus, x, y, label, () => {
      if (options?.audio !== false) gameEvents.emit(EVENT.audioCue, "confirm");
      action();
    }, { ...options, textScale: createPresentationPolicy(this.state.settings).textScale });
  }

  private renderTitle(): void {
    this.paper(45, 42, 870, 456);
    this.tape(480, 48, -2);

    const photo = this.add.graphics();
    photo.fillStyle(0xfaf4df).fillRoundedRect(520, 92, 330, 318, 4);
    photo.lineStyle(3, 0x475f50, 0.8).strokeRoundedRect(520, 92, 330, 318, 4);
    this.content.add(photo);
    const coverKey = CHAPTER_REGISTRY[0]?.coverAssetKey ?? "chapter-1-cover";
    this.content.add(this.add.image(685, 213, coverKey).setDisplaySize(298, 210));
    this.tape(542, 102, -8);
    this.tape(827, 101, 9);
    this.text(685, 337, "Wheatfield Drive, Summer 2007", {
      fontFamily: "Comic Sans MS, cursive", fontSize: "16px", color: MUTED_INK,
    }).setOrigin(0.5);

    this.text(82, 78, "MILTON ESTATES", { fontSize: "43px", fontStyle: "bold", color: BLUE_INK });
    this.text(86, 128, "A summer scrapbook", {
      fontFamily: "Comic Sans MS, cursive", fontSize: "23px", color: RED_INK,
    }).setAngle(-2);
    this.text(84, 174, "Long days. Secret trails.\nOne missing controller.", {
      fontSize: "19px", color: INK, lineSpacing: 6,
    });

    this.button(82, 262, "CONTINUE", () => this.launchGameplay(), { width: 360 });
    this.button(82, 316, this.newGameArmed ? "CONFIRM NEW GAME" : "NEW GAME", () => this.newGame(), {
      width: 360, color: this.newGameArmed ? "#a34237" : "#275c73",
    });
    this.button(82, 370, "CHAPTER SELECT", () => this.openPage("chapters"), { width: 360 });
    this.button(82, 424, "SETTINGS", () => this.openPage("settings"), { width: 360, color: "#50675b" });
  }

  private newGame(): void {
    if (!this.newGameArmed) {
      this.newGameArmed = true;
      this.render();
      return;
    }
    gameStore.newGame();
    this.newGameArmed = false;
    this.openPage("intro");
  }

  /** A one-time, skippable arrival moment before the player reaches the world. */
  private renderIntro(): void {
    const policy = createPresentationPolicy(this.state.settings);
    this.paper(45, 42, 870, 456);
    this.tape(480, 48, -2);
    this.text(90, 77, "WELCOME TO MILTON ESTATES", {
      fontSize: "32px", fontStyle: "bold", color: BLUE_INK,
    });
    this.text(92, 124, "Summer is waiting. Billy has one mystery to solve.", {
      fontFamily: "Comic Sans MS, cursive", fontSize: "18px", color: RED_INK,
    });

    const yard = this.add.graphics();
    yard.fillStyle(0xb9d992).fillRoundedRect(78, 178, 354, 214, 8);
    yard.fillStyle(0x80b96f).fillRoundedRect(78, 316, 354, 76, 8);
    yard.fillStyle(0xf1dfb7).fillRect(100, 202, 92, 116);
    yard.fillStyle(0x9c563e).fillTriangle(88, 204, 146, 160, 204, 204);
    yard.fillStyle(0x315948).fillCircle(370, 215, 33).fillCircle(398, 236, 41);
    this.content.add(yard);

    const billy = this.add.sprite(164, 318, "billy", 0).setScale(0.25).setDepth(2);
    billy.anims.play("billy-walk-side");
    this.content.add(billy);
    if (!policy.reducedMotion) {
      this.tweens.add({
        targets: billy,
        x: 308,
        duration: policy.duration(1_500),
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });
    } else {
      billy.setPosition(260, 318).anims.play("billy-idle-side");
    }

    this.card(472, 174, 360, 224, 0xfff8df);
    this.text(500, 198, "HOW TO EXPLORE", { fontSize: "18px", fontStyle: "bold", color: RED_INK });
    this.text(500, 237, "MOVE", { fontSize: "13px", fontStyle: "bold", color: BLUE_INK });
    this.text(500, 261, "WASD or arrow keys", { fontSize: "18px", color: INK });
    this.text(500, 300, "TALK & INSPECT", { fontSize: "13px", fontStyle: "bold", color: BLUE_INK });
    this.text(500, 324, "E or Space", { fontSize: "18px", color: INK });
    this.text(500, 363, "BACKPACK & HELP", { fontSize: "13px", fontStyle: "bold", color: BLUE_INK });
    this.text(500, 387, "B or Esc  •  Help lives in the backpack", { fontSize: "15px", color: INK, wordWrap: { width: 305 } });
    this.button(278, 432, "START EXPLORING  →", () => this.launchGameplay(), {
      width: 405, color: "#a34237", focusColor: "#a34237", focusInk: "#f9f1d7",
    });
  }

  private renderChapters(): void {
    const chapter = CHAPTER_REGISTRY[0];
    const progress = selectChapterProgress(chapter, this.state.completedQuestIds);
    const optional = selectOptionalProgress(chapter, this.state.completedQuestIds);
    this.paper(45, 42, 870, 456);
    this.tape(480, 48, -2);
    this.text(80, 76, "CHAPTER SCRAPBOOK", { fontSize: "31px", fontStyle: "bold", color: BLUE_INK });
    this.text(80, 121, `CHAPTER ${chapter.number}  •  ${chapter.dateLabel}`, { fontSize: "13px", fontStyle: "bold", color: RED_INK });
    this.text(80, 153, chapter.title, { fontSize: "25px", fontStyle: "bold", color: INK, wordWrap: { width: 475 } });
    this.text(80, 198, chapter.description, { fontSize: "16px", color: MUTED_INK, wordWrap: { width: 480 }, lineSpacing: 5 });
    this.text(80, 270, `${chapter.quests.length} memories in this chapter`, { fontSize: "15px", fontStyle: "bold", color: BLUE_INK });
    this.text(80, 298, `${progress.completed}/${progress.total} complete  •  ${optional.completed}/${optional.total} optional`, { fontSize: "14px", color: MUTED_INK });
    this.card(80, 340, 500, 116, 0xe9d29e);
    this.text(100, 358, "QUEST JOURNAL", { fontSize: "13px", fontStyle: "bold", color: RED_INK });
    this.text(100, 386, chapter.quests.map((quest, index) => `${index + 1}. ${quest.title}`).join("\n"), { fontSize: "14px", color: INK, lineSpacing: 5 });
    this.content.add(this.add.image(735, 220, chapter.coverAssetKey).setDisplaySize(230, 162));
    this.text(735, 314, "Summer 2007", { fontFamily: "Comic Sans MS, cursive", fontSize: "15px", color: MUTED_INK }).setOrigin(0.5);
    this.button(630, 402, "OPEN QUEST JOURNAL  →", () => this.openPage("quests"), { width: 230, color: "#a34237", focusColor: "#a34237", focusInk: "#f9f1d7" });
    this.backButton();
  }

  private renderQuests(): void {
    const chapter = CHAPTER_REGISTRY[0];
    const selected = chapter.quests[this.selectedQuestIndex] ?? chapter.quests[0];
    const state = selectQuestState(selected, this.state);
    this.paper(45, 42, 870, 456);
    this.tape(480, 48, 2);
    this.text(80, 76, "QUEST JOURNAL", { fontSize: "31px", fontStyle: "bold", color: BLUE_INK });
    this.text(80, 121, "CHAPTER 1  •  SELECT A MEMORY", { fontSize: "13px", fontStyle: "bold", color: RED_INK });
    chapter.quests.forEach((quest, index) => {
      const questState = selectQuestState(quest, this.state);
      const y = 154 + index * 50;
      const zone = this.add.rectangle(80, y, 330, 42, index === this.selectedQuestIndex ? 0xfff2a1 : 0xe9d29e, 1)
        .setOrigin(0).setStrokeStyle(index === this.selectedQuestIndex ? 3 : 1, index === this.selectedQuestIndex ? 0x315f4c : 0xa7865f, 0.9)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          gameEvents.emit(EVENT.audioCue, "menuNavigate");
          this.selectedQuestIndex = index;
          this.render();
      });
      this.content.add(zone);
      this.text(100, y + 4, quest.title, { fontSize: "12px", fontStyle: "bold", color: INK, wordWrap: { width: 285 } });
      this.text(100, y + 23, this.frontQuestStatus(questState), { fontSize: "10px", color: this.frontQuestStatusColor(questState), fontStyle: "bold" });
    });
    this.card(450, 154, 415, 248, 0xfff8df);
    this.text(474, 176, `${selected.kind.toUpperCase()}  •  ${state.toUpperCase()}`, { fontSize: "12px", color: state === "locked" ? RED_INK : BLUE_INK, fontStyle: "bold" });
    this.text(474, 206, selected.title, { fontSize: "23px", fontStyle: "bold", color: INK, wordWrap: { width: 360 } });
    this.text(474, 262, selected.description, { fontSize: "15px", color: MUTED_INK, wordWrap: { width: 355 }, lineSpacing: 5 });
    if (state === "locked") {
      const prereq = selected.prerequisiteQuestIds.length
        ? selected.prerequisiteQuestIds.map((id) => chapter.quests.find((quest) => quest.id === id)?.title ?? id).join(", ")
        : "the previous Chapter 1 memory";
      const reason = !selected.implemented
        ? selected.kind === "finale" ? "Finish every required Chapter 1 memory to reveal the finale." : "This memory has not been added to the game yet."
        : `Complete ${prereq} first.`;
      this.text(474, 335, `🔒 ${reason}`, { fontSize: "13px", color: RED_INK, wordWrap: { width: 350 }, lineSpacing: 4 });
    } else {
      const action = state === "completed" ? "REPLAY" : state === "active" ? "CONTINUE" : "START";
      this.text(474, 335, state === "completed" ? "Replay is isolated from your canonical save." : "Ready whenever you are.", { fontSize: "13px", color: "#315f4c", wordWrap: { width: 350 } });
      this.button(585, 420, `${action} QUEST  →`, () => this.playQuest(selected), {
        width: 220, color: "#a34237", focusColor: "#a34237", focusInk: "#f9f1d7",
      });
    }
    this.text(474, 468, "← / → changes the selected quest", { fontSize: "12px", color: MUTED_INK, fontStyle: "italic" });
    this.backButton();
  }

  private frontQuestStatus(status: ReturnType<typeof selectQuestState>): string {
    return status === "completed" ? "✓ COMPLETED" : status === "active" ? "● ACTIVE" : status === "available" ? "○ AVAILABLE" : "🔒 LOCKED";
  }

  private frontQuestStatusColor(status: ReturnType<typeof selectQuestState>): string {
    return status === "locked" ? RED_INK : status === "completed" || status === "active" ? "#3b765b" : BLUE_INK;
  }

  private playQuest(quest: QuestDefinition): void {
    const state = selectQuestState(quest, this.state);
    if (!quest.implemented || state === "locked") return;
    if (state === "completed") gameStore.startQuestReplay(quest.id);
    else gameStore.setActiveQuest(quest.chapterId, quest.id);
    gameStore.setCurrentMap("neighborhood");
    this.launchGameplay();
  }

  private renderSettings(): void {
    this.paper(160, 65, 640, 410);
    this.tape(480, 70, 2);
    const settings = this.state.settings;
    this.text(205, 102, "SETTINGS", { fontSize: "31px", fontStyle: "bold", color: BLUE_INK });
    this.text(205, 146, "Saved automatically — even when you start a new scrapbook.", {
      fontFamily: "Comic Sans MS, cursive", fontSize: "15px", color: MUTED_INK,
    });
    this.button(205, 205, settings.muted ? "SOUND: MUTED" : "SOUND: ON", () => this.changeSettings({ muted: !settings.muted }), { width: 550 });
    this.button(205, 263, `VOLUME: ${Math.round(settings.masterVolume * 100)}%`, () => {
      this.changeSettings({ masterVolume: nextVolume(settings.masterVolume) });
    }, { width: 550 });
    this.button(205, 321, `TEXT SIZE: ${settings.textSize.toUpperCase()}`, () => {
      this.changeSettings({ textSize: cycleTextSize(settings.textSize) });
    }, { width: 550 });
    this.button(205, 379, settings.reducedMotion ? "REDUCED MOTION: ON" : "REDUCED MOTION: OFF", () => {
      this.changeSettings({ reducedMotion: !settings.reducedMotion });
    }, { width: 550, color: "#50675b" });
    this.backButton();
  }

  private changeSettings(changes: Partial<PlayerSettings>): void {
    gameStore.updateSettings(changes);
    const settings = gameStore.getState().settings;
    this.sound.mute = settings.muted;
    this.sound.volume = settings.masterVolume;
    this.render();
  }

  private openPage(page: FrontPage): void {
    this.page = page;
    this.newGameArmed = false;
    this.render();
  }

  private backButton(): void {
    this.button(735, 45, "← BACK", () => this.goBack(), { width: 160, color: "#50675b", audio: false });
  }

  private goBack(event?: KeyboardEvent): void {
    event?.preventDefault();
    gameEvents.emit(EVENT.audioCue, "back");
    if (this.page === "quests") this.openPage("chapters");
    else if (this.page !== "title") this.openPage("title");
    else if (this.newGameArmed) { this.newGameArmed = false; this.render(); }
  }

  private selectPreviousQuest(): void {
    if (this.page !== "quests") return;
    gameEvents.emit(EVENT.audioCue, "menuNavigate");
    const count = CHAPTER_REGISTRY[0].quests.length;
    this.selectedQuestIndex = (this.selectedQuestIndex + count - 1) % count;
    this.render();
  }

  private selectNextQuest(): void {
    if (this.page !== "quests") return;
    gameEvents.emit(EVENT.audioCue, "menuNavigate");
    this.selectedQuestIndex = (this.selectedQuestIndex + 1) % CHAPTER_REGISTRY[0].quests.length;
    this.render();
  }

  private moveFocus(delta: number): void {
    if (!this.focus.hasButtons) return;
    gameEvents.emit(EVENT.audioCue, "menuNavigate");
    this.focus.move(delta);
  }

  private activateFocused(): void {
    if (!this.focus.hasButtons) return;
    this.focus.activate();
  }

  private handleInputAction(event: InputActionEvent): void {
    if (!event.pressed || !this.sys.isActive()) return;
    switch (event.action) {
      case "moveUp": this.moveFocus(-1); break;
      case "moveDown": this.moveFocus(1); break;
      case "moveLeft": this.page === "quests" ? this.selectPreviousQuest() : this.moveFocus(-1); break;
      case "moveRight": this.page === "quests" ? this.selectNextQuest() : this.moveFocus(1); break;
      case "tabPrevious": this.selectPreviousQuest(); break;
      case "tabNext": this.selectNextQuest(); break;
      case "interact": this.activateFocused(); break;
      case "back":
      case "menu": this.goBack(); break;
    }
  }

  private launchGameplay(): void {
    this.scene.launch("ui");
    this.scene.launch("menu");
    this.scene.start(gameStore.getState().currentMap);
  }

  private cleanup(): void {
    gameEvents.off(EVENT.inputAction, this.handleInputAction, this);
  }
}
