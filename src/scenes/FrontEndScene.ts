import Phaser from "phaser";
import {
  CHAPTER_REGISTRY,
  selectChapterProgress,
  selectChapterState,
  selectOptionalProgress,
  selectQuestState,
  type QuestDefinition,
} from "../content/chapters";
import { EVENT, gameEvents, type InputActionEvent } from "../game/events";
import { gameStore } from "../game/GameStore";
import type { PlayerSettings, SaveData } from "../game/types";

type FrontPage = "title" | "chapters" | "quests" | "settings";

const PAPER = 0xf3e7c5;
const INK = "#26352f";
const MUTED_INK = "#687068";
const BLUE_INK = "#275c73";
const RED_INK = "#a34237";

export class FrontEndScene extends Phaser.Scene {
  private page: FrontPage = "title";
  private content!: Phaser.GameObjects.Container;
  private state: SaveData = gameStore.getState();
  private newGameArmed = false;
  private selectedQuestIndex = 0;
  private focusables: Phaser.GameObjects.Text[] = [];
  private focusedIndex = 0;

  constructor() { super("front-end"); }

  create(): void {
    this.cameras.main.setBackgroundColor("#315948");
    this.content = this.add.container(0, 0);
    gameEvents.on(EVENT.inputAction, this.handleInputAction, this);
    gameStore.getState();
    this.render();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  private render(): void {
    this.state = gameStore.getState();
    this.content.removeAll(true);
    this.focusables = [];
    this.drawDesk();
    switch (this.page) {
      case "title": this.renderTitle(); break;
      case "chapters": this.renderChapters(); break;
      case "quests": this.renderQuests(); break;
      case "settings": this.renderSettings(); break;
    }
    this.focusedIndex = Phaser.Math.Clamp(this.focusedIndex, 0, Math.max(0, this.focusables.length - 1));
    this.refreshFocus();
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

  private tape(x: number, y: number, angle = 0): void {
    const tape = this.add.rectangle(x, y, 72, 19, 0xe6d78f, 0.72).setAngle(angle);
    this.content.add(tape);
  }

  private text(x: number, y: number, value: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    const object = this.add.text(x, y, value, { fontFamily: "Trebuchet MS, Arial, sans-serif", ...style });
    this.content.add(object);
    return object;
  }

  private button(x: number, y: number, label: string, action: () => void, options?: { width?: number; color?: string; ink?: string; audio?: boolean }): Phaser.GameObjects.Text {
    const button = this.text(x, y, label, {
      fontSize: "17px", fontStyle: "bold", color: options?.ink ?? "#f9f1d7",
      backgroundColor: options?.color ?? "#275c73", fixedWidth: options?.width ?? 250,
      align: "center", padding: { x: 12, y: 11 },
    }).setInteractive({ useHandCursor: true }).on("pointerdown", () => {
      if (options?.audio !== false) gameEvents.emit(EVENT.audioCue, "confirm");
      action();
    });
    button
      .setData("action", action)
      .setData("baseColor", options?.color ?? "#275c73")
      .setData("baseInk", options?.ink ?? "#f9f1d7");
    button.on("pointerover", () => {
      this.focusedIndex = this.focusables.indexOf(button);
      this.refreshFocus();
    });
    this.focusables.push(button);
    return button;
  }

  private renderTitle(): void {
    this.paper(45, 42, 870, 456);
    this.tape(480, 48, -2);

    const photo = this.add.graphics();
    photo.fillStyle(0xfaf4df).fillRoundedRect(520, 92, 330, 318, 4);
    photo.lineStyle(3, 0x475f50, 0.8).strokeRoundedRect(520, 92, 330, 318, 4);
    this.content.add(photo);
    this.content.add(this.add.image(685, 213, "chapter-1-cover").setDisplaySize(298, 210));
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
    this.openPage("chapters");
  }

  private renderChapters(): void {
    this.paper(35, 32, 890, 476);
    this.tape(480, 38, 1);
    this.text(64, 52, "THE CHAPTER SCRAPBOOK", { fontSize: "28px", fontStyle: "bold", color: BLUE_INK });
    this.text(66, 88, "Every page is a summer we still talk about.", {
      fontFamily: "Comic Sans MS, cursive", fontSize: "16px", color: MUTED_INK,
    });

    const chapter = CHAPTER_REGISTRY[0];
    const progress = selectChapterProgress(chapter, this.state.completedQuestIds);
    const optional = selectOptionalProgress(chapter, this.state.completedQuestIds);
    const chapterState = selectChapterState(chapter, this.state);
    const cover = this.add.graphics();
    cover.fillStyle(0xffffff).fillRoundedRect(64, 132, 314, 282, 4);
    cover.lineStyle(3, 0xc9b890).strokeRoundedRect(64, 132, 314, 282, 4);
    this.content.add(cover);
    this.content.add(this.add.image(221, 250, "chapter-1-cover").setDisplaySize(286, 208));
    this.tape(86, 137, -7);
    this.text(221, 372, chapter.dateLabel, {
      fontFamily: "Comic Sans MS, cursive", fontSize: "17px", color: MUTED_INK,
    }).setOrigin(0.5);

    this.text(412, 130, `CHAPTER ${chapter.number}`, { fontSize: "15px", fontStyle: "bold", color: RED_INK });
    this.text(412, 153, chapter.title, { fontSize: "28px", fontStyle: "bold", color: INK, wordWrap: { width: 455 } });
    this.text(412, 195, chapter.description, { fontSize: "17px", color: MUTED_INK, wordWrap: { width: 445 }, lineSpacing: 4 });
    this.text(412, 262, `${progress.completed} / ${progress.total} memories complete  •  ${progress.percentage}%`, {
      fontSize: "17px", fontStyle: "bold", color: BLUE_INK,
    });
    this.text(412, 296, `STATE      ${chapterState.toUpperCase()}\nFINALE     ${progress.finaleUnlocked ? "UNLOCKED" : "LOCKED"}\nSECRETS    ${optional.completed} / ${optional.total}`, {
      fontFamily: "monospace", fontSize: "15px", color: INK, lineSpacing: 7,
    });
    this.button(412, 376, "OPEN QUEST JOURNAL  →", () => this.openPage("quests"), { width: 446 });

    this.futurePage(66, 438, "CHAPTER ?", "The next pages are still stuck together…");
    this.futurePage(493, 438, "CHAPTER ??", "A faded photo. No date. No names.");
    this.backButton();
  }

  private futurePage(x: number, y: number, label: string, teaser: string): void {
    const g = this.add.graphics();
    g.fillStyle(0xded6bd).fillRoundedRect(x, y, 398, 45, 3);
    g.lineStyle(1, 0xa99e83).strokeRoundedRect(x, y, 398, 45, 3);
    this.content.add(g);
    this.text(x + 13, y + 7, `${label}  •  ${teaser}`, { fontSize: "13px", color: MUTED_INK, wordWrap: { width: 370 } });
  }

  private renderQuests(): void {
    const chapter = CHAPTER_REGISTRY[0];
    const selected = chapter.quests[this.selectedQuestIndex] ?? chapter.quests[0];
    const state = selectQuestState(selected, this.state);
    this.paper(35, 32, 890, 476);
    const seam = this.add.graphics().lineStyle(2, 0xc9b890, 0.7).lineBetween(378, 48, 378, 489);
    this.content.add(seam);
    this.text(62, 51, "BILLY'S QUEST JOURNAL", { fontSize: "25px", fontStyle: "bold", color: BLUE_INK });
    this.text(62, 83, "Chapter 1 • Summer 2007", { fontFamily: "Comic Sans MS, cursive", fontSize: "15px", color: MUTED_INK });

    chapter.quests.forEach((quest, index) => this.questTab(quest, index));

    this.text(410, 62, selected.kind === "finale" ? "CHAPTER FINALE" : selected.optional ? "OPTIONAL SIDE QUEST" : "REQUIRED MAIN QUEST", {
      fontSize: "13px", fontStyle: "bold", color: selected.optional ? "#527047" : RED_INK,
    });
    this.text(410, 92, selected.title, { fontSize: "29px", fontStyle: "bold", color: INK, wordWrap: { width: 450 } });
    this.text(410, 143, selected.description, { fontSize: "17px", color: MUTED_INK, wordWrap: { width: 455 }, lineSpacing: 5 });
    const prereq = selected.prerequisiteQuestIds.length
      ? selected.prerequisiteQuestIds.map((id) => chapter.quests.find((quest) => quest.id === id)?.title ?? id).join(", ")
      : "None — this is where the summer begins.";
    this.text(410, 214, `STATUS\n${state.toUpperCase()}\n\nPREREQUISITES\n${prereq}`, {
      fontFamily: "monospace", fontSize: "14px", color: INK, lineSpacing: 5, wordWrap: { width: 445 },
    });

    if (state === "locked") {
      const reason = !selected.implemented
        ? selected.kind === "finale" ? "Finish every required Chapter 1 memory to reveal the finale." : "This memory has not been added to the game yet."
        : `Complete ${prereq} first.`;
      this.text(410, 350, `🔒  ${reason}`, { fontSize: "16px", color: RED_INK, wordWrap: { width: 445 } });
    } else {
      const action = state === "completed" ? "REPLAY" : this.state.questStage === "talk_to_jeremy" ? "START" : "CONTINUE";
      this.button(410, 396, `${action}  →`, () => this.playQuest(selected), { width: 446 });
      if (state === "completed") {
        this.text(410, 451, "Replay uses a temporary scrapbook copy. Your real progress stays safe.", {
          fontSize: "13px", color: MUTED_INK, wordWrap: { width: 440 },
        });
      }
    }
    this.backButton();
  }

  private questTab(quest: QuestDefinition, index: number): void {
    const selected = index === this.selectedQuestIndex;
    const state = selectQuestState(quest, this.state);
    const icon = state === "completed" ? "✓" : state === "locked" ? "?" : "→";
    const tab = this.text(62, 122 + index * 76, `${icon}  ${quest.title}\n    ${state.toUpperCase()}`, {
      fontSize: "16px", fontStyle: selected ? "bold" : "normal", color: selected ? "#f9f1d7" : INK,
      backgroundColor: selected ? "#275c73" : "#e6d9b7", fixedWidth: 288,
      padding: { x: 11, y: 9 }, lineSpacing: 3,
    }).setInteractive({ useHandCursor: true }).on("pointerdown", () => {
      gameEvents.emit(EVENT.audioCue, "menuNavigate");
      this.selectedQuestIndex = index;
      this.render();
    });
    tab
      .setData("action", () => {
        gameEvents.emit(EVENT.audioCue, "menuNavigate");
        this.selectedQuestIndex = index;
        this.render();
      })
      .setData("baseColor", selected ? "#275c73" : "#e6d9b7")
      .setData("baseInk", selected ? "#f9f1d7" : INK)
      .on("pointerover", () => {
        this.focusedIndex = this.focusables.indexOf(tab);
        this.refreshFocus();
      });
    this.focusables.push(tab);
  }

  private playQuest(quest: QuestDefinition): void {
    const state = selectQuestState(quest, this.state);
    if (quest.id !== "missing_controller" || state === "locked") return;
    if (state === "completed") gameStore.startQuestReplay(quest.id);
    else gameStore.setActiveQuest(quest.chapterId, quest.id);
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
      const volume = settings.masterVolume >= 1 ? 0 : Math.round((settings.masterVolume + 0.25) * 100) / 100;
      this.changeSettings({ masterVolume: volume });
    }, { width: 550 });
    this.button(205, 321, `TEXT SIZE: ${settings.textSize.toUpperCase()}`, () => {
      const sizes = ["small", "medium", "large"] as const;
      this.changeSettings({ textSize: sizes[(sizes.indexOf(settings.textSize) + 1) % sizes.length] });
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
    this.focusedIndex = 0;
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
    if (!this.focusables.length) return;
    this.focusedIndex = (this.focusedIndex + delta + this.focusables.length) % this.focusables.length;
    gameEvents.emit(EVENT.audioCue, "menuNavigate");
    this.refreshFocus();
  }

  private refreshFocus(): void {
    this.focusables.forEach((item, index) => {
      const focused = index === this.focusedIndex;
      item.setBackgroundColor(focused ? "#f3c95f" : item.getData("baseColor"));
      item.setColor(focused ? INK : item.getData("baseInk"));
      item.setShadow(0, 0, focused ? "#173026" : "#000000", focused ? 8 : 0, false, true);
    });
  }

  private activateFocused(): void {
    const action = this.focusables[this.focusedIndex]?.getData("action") as (() => void) | undefined;
    if (!action) return;
    gameEvents.emit(EVENT.audioCue, "confirm");
    action();
  }

  private handleInputAction(event: InputActionEvent): void {
    if (!event.pressed || !this.sys.isActive()) return;
    switch (event.action) {
      case "moveUp": this.moveFocus(-1); break;
      case "moveDown": this.moveFocus(1); break;
      case "moveLeft": this.moveFocus(-1); break;
      case "moveRight": this.moveFocus(1); break;
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
