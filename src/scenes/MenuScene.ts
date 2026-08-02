import Phaser from "phaser";
import { getObjective } from "../content/quest";
import { CHAPTER_REGISTRY, hasAvailableQuest, selectChapterProgress, selectOptionalProgress, selectQuestState, type QuestDefinition } from "../content/chapters";
import { getMapDefinition, MAP_DEFINITIONS, projectRegionalMapPoint, selectActiveObjectiveMarker, type MapDefinition } from "../content/maps";
import { EVENT, gameEvents, inputCapture, type InputActionEvent, type MenuPage, type PlayerMapLocation } from "../game/events";
import { CONTROLLER_ITEM, gameStore } from "../game/GameStore";
import type { GameState, PlayerSettings } from "../game/types";
import { createPresentationPolicy, cycleTextSize, nextVolume } from "../presentation/presentationPolicy";
import { SCRAPBOOK, scrapbookButton, scrapbookCard, scrapbookText, TextFocusController } from "../presentation/scrapbook";

const PAGES: readonly MenuPage[] = ["resume", "chapters", "quests", "map", "save", "settings", "help"];
const PAGE_LABELS: Readonly<Record<MenuPage, string>> = {
  resume: "RESUME",
  chapters: "CHAPTERS",
  quests: "QUESTS",
  map: "MAP",
  save: "SAVE",
  settings: "SETTINGS",
  help: "HELP",
};

export class MenuScene extends Phaser.Scene {
  private overlay!: Phaser.GameObjects.Container;
  private pageContent!: Phaser.GameObjects.Container;
  private tabs: Phaser.GameObjects.Text[] = [];
  private activePage: MenuPage = "resume";
  private isOpen = false;
  private restartArmed = false;
  private state: GameState = gameStore.getState();
  private readonly focus = new TextFocusController();
  private selectedQuestIndex = 0;
  private playerLocation?: PlayerMapLocation;
  private questTabBadge?: Phaser.GameObjects.Container;

  constructor() { super("menu"); }

  create(): void {
    // Phaser may restart this scene instance. These values describe one
    // rendered backpack, not durable player state (which lives in GameStore).
    this.tabs = [];
    this.focus.reset();
    this.activePage = "resume";
    this.isOpen = false;
    this.restartArmed = false;
    this.selectedQuestIndex = 0;
    this.questTabBadge = undefined;
    this.state = gameStore.getState();
    this.sound.mute = this.state.settings.muted;
    this.sound.volume = this.state.settings.masterVolume;
    const shade = this.add.rectangle(0, 0, 960, 540, 0x09130f, 0.9).setOrigin(0);
    const pack = this.add.rectangle(27, 20, 906, 502, 0x244d3d, 1)
      .setOrigin(0).setStrokeStyle(5, 0x122d26, 1);
    const binding = this.add.rectangle(42, 34, 876, 474, 0xb86f3d, 1)
      .setOrigin(0).setStrokeStyle(2, 0x5a3226, 1);
    const paper = this.add.rectangle(49, 39, 862, 462, 0xf1dfb7, 1)
      .setOrigin(0).setStrokeStyle(2, 0x8b6745, 1);
    const headerStrip = this.add.rectangle(49, 39, 862, 48, 0x315f4c, 1).setOrigin(0);
    const title = this.add.text(68, 49, "BILLY'S BACKPACK", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "24px", color: "#fff3c9", fontStyle: "bold",
    }).setFontSize(createPresentationPolicy(this.state.settings).fontSize(24));
    const stitched = this.add.text(72, 75, "FIELD NOTES  •  SUMMER 2007", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "10px", color: "#d7e0bc", fontStyle: "bold",
    }).setFontSize(createPresentationPolicy(this.state.settings).fontSize(10));
    const closeHint = this.add.text(892, 54, "ESC  CLOSE ×", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "13px", color: "#fff3c9", fontStyle: "bold",
    }).setFontSize(createPresentationPolicy(this.state.settings).fontSize(13)).setOrigin(1, 0);

    this.pageContent = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0, [shade, pack, binding, paper, headerStrip, title, stitched, closeHint, this.pageContent])
      .setDepth(2_000).setVisible(false);
    this.buildTabs();

    gameEvents.on(EVENT.inputAction, this.handleInputAction, this);
    gameEvents.on(EVENT.menuRequested, this.handleMenuRequest, this);
    gameEvents.on(EVENT.stateChanged, this.handleStateChanged, this);
    gameEvents.on(EVENT.playerLocationChanged, this.handlePlayerLocationChanged, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  private buildTabs(): void {
    PAGES.forEach((page, index) => {
      const tab = scrapbookText(this, this.overlay, 60 + index * 112, 96, PAGE_LABELS[page], {
        fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "15px", color: "#efe1ba", fontStyle: "bold",
        backgroundColor: "#8b4f36", padding: { x: 12, y: 9 },
      }, createPresentationPolicy(this.state.settings).textScale).setInteractive({ useHandCursor: true }).on("pointerdown", () => {
        gameEvents.emit(EVENT.audioCue, "menuNavigate");
        this.selectPage(page);
      });
      this.tabs.push(tab);
      if (page === "quests") {
        // Keep the badge at the tab's upper-right corner instead of over the
        // QUESTS label, including when the player's text size is enlarged.
        const badgeX = tab.x + tab.width - 4;
        const badgeY = tab.y - 2;
        const dot = this.add.circle(badgeX, badgeY, 9, 0xf3c95f, 1).setStrokeStyle(2, 0x315f4c, 1);
        const label = this.add.text(badgeX, badgeY, "!", {
          fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "13px", color: "#315f4c", fontStyle: "bold",
        }).setOrigin(0.5);
        this.questTabBadge = this.add.container(0, 0, [dot, label]);
        this.overlay.add(this.questTabBadge);
      }
    });
    this.updateQuestTabBadge();
  }

  private toggleMenu(event?: KeyboardEvent): void {
    event?.preventDefault();
    gameEvents.emit(EVENT.audioCue, this.isOpen ? "back" : "confirm");
    if (this.isOpen) this.closeMenu(); else this.openMenu(this.activePage);
  }

  private handleMenuRequest(request?: { page?: MenuPage }): void {
    this.openMenu(request?.page ?? "resume");
  }

  private openMenu(page: MenuPage): void {
    if (!this.isOpen) {
      this.isOpen = true;
      inputCapture.capture("menu");
      this.scene.bringToTop();
      this.scene.pause(gameStore.getState().currentMap);
      this.scene.pause("ui");
      this.overlay.setVisible(true);
    }
    this.selectPage(page);
  }

  private closeMenu(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    inputCapture.release("menu");
    this.restartArmed = false;
    this.overlay.setVisible(false);
    this.scene.resume("ui");
    this.scene.resume(gameStore.getState().currentMap);
  }

  private previousPage(): void {
    if (!this.isOpen) return;
    gameEvents.emit(EVENT.audioCue, "menuNavigate");
    const index = PAGES.indexOf(this.activePage);
    this.selectPage(PAGES[(index + PAGES.length - 1) % PAGES.length]!);
  }

  private nextPage(): void {
    if (!this.isOpen) return;
    gameEvents.emit(EVENT.audioCue, "menuNavigate");
    const index = PAGES.indexOf(this.activePage);
    this.selectPage(PAGES[(index + 1) % PAGES.length]!);
  }

  private selectPage(page: MenuPage): void {
    this.activePage = page;
    this.restartArmed = false;
    this.tabs.forEach((tab, index) => {
      const selected = PAGES[index] === page;
      tab.setColor(selected ? "#33271f" : "#efe1ba");
      tab.setBackgroundColor(selected ? "#f3c95f" : "#8b4f36");
    });
    this.renderPage();
  }

  private renderPage(): void {
    this.pageContent.removeAll(true);
    this.focus.reset();
    switch (this.activePage) {
      case "resume": this.renderResume(); break;
      case "chapters": this.renderChapters(); break;
      case "quests": this.renderQuests(); break;
      case "map": this.renderMap(); break;
      case "save": this.renderSave(); break;
      case "settings": this.renderSettings(); break;
      case "help": this.renderHelp(); break;
    }
    this.focus.refresh();
  }

  private heading(text: string, subtitle?: string): void {
    const title = scrapbookText(this, this.pageContent, 68, 154, text, {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "26px", color: "#3c3026", fontStyle: "bold",
    }, createPresentationPolicy(this.state.settings).textScale);
    this.fitText(title, 800, 30, 17);
    if (subtitle) {
      const subtitleText = scrapbookText(this, this.pageContent, 68, 190, subtitle, {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "16px", color: "#675544", wordWrap: { width: 800 },
      }, createPresentationPolicy(this.state.settings).textScale);
      this.fitText(subtitleText, 800, 26, 12);
    }
  }

  private button(x: number, y: number, label: string, action: () => void, width = 260): Phaser.GameObjects.Text {
    return scrapbookButton(this, this.pageContent, this.focus, x, y, label, () => {
      gameEvents.emit(EVENT.audioCue, "confirm");
      action();
    }, { width, color: "#f3c95f", ink: "#2e2820", focusColor: "#fff2a1", focusInk: "#172735", textScale: createPresentationPolicy(this.state.settings).textScale });
  }

  private moveButtonFocus(delta: number): void {
    if (!this.isOpen || !this.focus.hasButtons) return;
    gameEvents.emit(EVENT.audioCue, "menuNavigate");
    this.focus.move(delta);
  }

  private activateFocusedButton(): void {
    if (!this.focus.hasButtons) return;
    this.focus.activate();
  }

  private handleInputAction(event: InputActionEvent): void {
    if (!event.pressed || inputCapture.isConsumed(event)) return;
    if (!this.isOpen) {
      if (event.action === "menu" || event.action === "back") {
        this.toggleMenu();
      }
      return;
    }
    switch (event.action) {
      case "menu":
      case "back": this.toggleMenu(); break;
      case "tabPrevious": this.previousPage(); break;
      case "tabNext": this.nextPage(); break;
      case "moveLeft": this.activePage === "quests" ? this.selectPreviousQuest() : this.previousPage(); break;
      case "moveRight": this.activePage === "quests" ? this.selectNextQuest() : this.nextPage(); break;
      case "moveUp": this.moveButtonFocus(-1); break;
      case "moveDown": this.moveButtonFocus(1); break;
      case "interact": this.activateFocusedButton(); break;
    }
  }

  private card(x: number, y: number, width: number, height: number, color: number = SCRAPBOOK.card): Phaser.GameObjects.Graphics {
    return scrapbookCard(this, this.pageContent, x, y, width, height, color, false);
  }

  private note(x: number, y: number, text: string, options: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.GameObjects.Text {
    const note = scrapbookText(this, this.pageContent, x, y, text, {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "16px", color: "#43372d", ...options,
    }, createPresentationPolicy(this.state.settings).textScale);
    return note;
  }

  /** Shrinks before clipping so player-facing copy never escapes a paper card. */
  private fitText(text: Phaser.GameObjects.Text, maxWidth: number, maxHeight: number, minimumSize: number): void {
    text.setWordWrapWidth(maxWidth, true);
    const preferredSize = Number.parseInt(String(text.style.fontSize ?? 16), 10);
    for (let size = preferredSize; text.height > maxHeight && size > minimumSize; size -= 1) {
      text.setFontSize(size - 1);
    }
  }

  private drawController(x: number, y: number, owned: boolean): void {
    const ink = owned ? 0x315f4c : 0x9c8c73;
    const graphics = this.add.graphics();
    graphics.fillStyle(owned ? 0x4b7d68 : 0xd4c8ad, 1);
    graphics.fillRoundedRect(x, y, 92, 52, 18);
    graphics.lineStyle(3, ink, 1).strokeRoundedRect(x, y, 92, 52, 18);
    graphics.fillStyle(ink, 1).fillCircle(x + 65, y + 19, 4).fillCircle(x + 76, y + 27, 4);
    graphics.fillRect(x + 21, y + 17, 22, 6).fillRect(x + 29, y + 9, 6, 22);
    graphics.fillStyle(0xf3c95f, 1).fillCircle(x + 46, y + 29, 5);
    this.pageContent.add(graphics);
  }

  private renderResume(): void {
    const hasController = this.state.inventory.includes(CONTROLLER_ITEM);
    this.heading("Summer afternoon — paused", `Pinned: ${getObjective(this.state.questStage, this.state.activeQuestId)}`);
    this.card(68, 231, 500, 132);
    this.note(88, 248, "TODAY'S FIELD NOTE", { fontSize: "13px", color: "#9a573a", fontStyle: "bold" });
    this.note(88, 274, getMapDefinition(this.state.currentMap).label, { fontSize: "21px", fontStyle: "bold" });
    this.note(88, 310, "Follow the clues, check every shortcut, and be home by dinner.", {
      fontSize: "15px", color: "#675544", wordWrap: { width: 440 },
    });
    this.card(592, 231, 270, 132, 0xe9d29e);
    this.drawController(612, 267, hasController);
    this.note(718, 248, "PACK POCKET", { fontSize: "13px", color: "#9a573a", fontStyle: "bold" });
    this.note(718, 274, hasController ? "Xbox controller" : "Still empty", {
      fontSize: "18px", fontStyle: "bold", color: hasController ? "#315f4c" : "#7f705f",
    });
    this.note(718, 305, `${this.state.secrets.length} secret${this.state.secrets.length === 1 ? "" : "s"} found`, { fontSize: "14px" });
    this.button(68, 400, "RESUME GAME", () => this.closeMenu());
    this.note(348, 412, "ESC closes the backpack, too.", { fontSize: "14px", color: "#76624f", fontStyle: "italic" });
  }

  private renderQuests(): void {
    const chapter = CHAPTER_REGISTRY.find((candidate) => candidate.id === this.state.activeChapterId) ?? CHAPTER_REGISTRY[0]!;
    const selected = chapter.quests[this.selectedQuestIndex] ?? chapter.quests[0]!;
    const status = selectQuestState(selected, this.state);
    this.heading(
      "Quest journal",
      hasAvailableQuest(this.state)
        ? "New quest available! Choose an unlocked memory to begin."
        : "Browse every Chapter 1 memory — active, optional, locked, or complete.",
    );
    this.card(68, 222, 260, 264, 0xe9d29e);
    chapter.quests.forEach((quest, index) => {
      const questStatus = selectQuestState(quest, this.state);
      const y = 228 + index * 36;
      const selectedRow = index === this.selectedQuestIndex;
      const row = this.add.rectangle(80, y, 236, 32, selectedRow ? 0xfff2a1 : 0xf8dfb5, 1)
        .setOrigin(0).setStrokeStyle(selectedRow ? 3 : 1, selectedRow ? 0x315f4c : 0xa7865f, 0.9)
        .setInteractive({ useHandCursor: true }).on("pointerdown", () => {
          this.selectedQuestIndex = index;
          this.renderPage();
      });
      this.pageContent.add(row);
      const title = this.note(94, y + 2, `${index + 1}. ${quest.title}`, { fontSize: "12px", fontStyle: "bold" });
      this.fitText(title, 210, 14, 9);
      this.note(94, y + 17, this.questStatusLabel(questStatus), { fontSize: "10px", color: this.questStatusColor(questStatus), fontStyle: "bold" });
    });
    this.card(348, 222, 514, 264);
    this.note(372, 240, `${selected.kind.toUpperCase()} MEMORY`, { fontSize: "12px", color: "#9a573a", fontStyle: "bold" });
    const selectedTitle = this.note(372, 265, selected.title, { fontSize: "23px", fontStyle: "bold", wordWrap: { width: 450 } });
    this.fitText(selectedTitle, 450, 50, 15);
    const description = this.note(372, 322, selected.description, { fontSize: "15px", color: "#675544", wordWrap: { width: 450 } });
    this.fitText(description, 450, 42, 11);
    const detail = this.note(372, 371, this.questDetail(selected, status), { fontSize: "14px", color: status === "locked" ? "#a34237" : "#315f4c", wordWrap: { width: 450 }, lineSpacing: 6 });
    this.fitText(detail, 450, 52, 10);
    if (status !== "locked") {
      const action = status === "completed" ? "REPLAY QUEST" : status === "active" ? "CONTINUE QUEST" : "START QUEST";
      this.button(590, 432, action, () => this.playQuest(selected), 248);
    } else {
      this.note(590, 438, "LOCKED — inspect the prerequisite above", { fontSize: "13px", fontStyle: "bold", color: "#a34237" });
    }
    this.note(372, 463, "← / → changes the selected quest", { fontSize: "12px", color: "#76624f", fontStyle: "italic" });
  }

  private renderChapters(): void {
    this.heading("Chapter scrapbook", "Browse the story structure before you choose a quest.");
    CHAPTER_REGISTRY.forEach((chapter, index) => {
      const progress = selectChapterProgress(chapter, this.state.completedQuestIds);
      const optional = selectOptionalProgress(chapter, this.state.completedQuestIds);
      const cardY = 230 + index * 116;
      this.card(68, cardY, 796, 96, index === 0 ? 0xfff8df : 0xe9d29e);
      this.note(90, cardY + 14, `CHAPTER ${chapter.number}  •  ${chapter.dateLabel}`, { fontSize: "12px", color: "#9a573a", fontStyle: "bold" });
      this.note(90, cardY + 36, chapter.title, { fontSize: "21px", fontStyle: "bold" });
      const description = this.note(90, cardY + 66, chapter.description, { fontSize: "14px", color: "#675544", wordWrap: { width: 490 } });
      this.fitText(description, 490, 18, 10);
      this.note(645, cardY + 23, `${progress.completed}/${progress.total} memories`, { fontSize: "16px", fontStyle: "bold", color: "#315f4c" });
      this.note(645, cardY + 49, `${optional.completed}/${optional.total} optional`, { fontSize: "13px", color: "#675544" });
    });
    this.button(68, 442, "OPEN QUEST JOURNAL", () => this.selectPage("quests"), 300);
    this.note(388, 454, "Live registry view — new quest definitions appear here automatically.", { fontSize: "13px", color: "#76624f", fontStyle: "italic", wordWrap: { width: 430 } });
  }

  private questStatusLabel(status: ReturnType<typeof selectQuestState>): string {
    return status === "completed" ? "✓ COMPLETED" : status === "active" ? "● ACTIVE" : status === "available" ? "○ AVAILABLE" : "🔒 LOCKED";
  }

  private questStatusColor(status: ReturnType<typeof selectQuestState>): string {
    return status === "completed" || status === "active" ? "#315f4c" : status === "available" ? "#275c73" : "#a34237";
  }

  private questDetail(quest: QuestDefinition, status: ReturnType<typeof selectQuestState>): string {
    if (status === "completed") return "✓ Complete. Replay is isolated from your canonical save.";
    if (status === "active") return `● Current objective: ${getObjective(this.state.questStage, this.state.activeQuestId)}`;
    if (status === "available") return "○ Ready to begin whenever you are.";
    if (!quest.implemented) return quest.kind === "finale" ? "🔒 Finish the required memories to reveal the finale." : "🔒 This memory is planned but not implemented yet.";
    const prereqs = quest.prerequisiteQuestIds.map((id) => CHAPTER_REGISTRY.flatMap((candidate) => candidate.quests).find((candidate) => candidate.id === id)?.title ?? id);
    return `🔒 Complete first: ${prereqs.join(", ") || "the previous memory"}.`;
  }

  private selectPreviousQuest(): void {
    const chapter = CHAPTER_REGISTRY.find((candidate) => candidate.id === this.state.activeChapterId) ?? CHAPTER_REGISTRY[0]!;
    this.selectedQuestIndex = (this.selectedQuestIndex + chapter.quests.length - 1) % chapter.quests.length;
    gameEvents.emit(EVENT.audioCue, "menuNavigate");
    this.renderPage();
  }

  private selectNextQuest(): void {
    const chapter = CHAPTER_REGISTRY.find((candidate) => candidate.id === this.state.activeChapterId) ?? CHAPTER_REGISTRY[0]!;
    this.selectedQuestIndex = (this.selectedQuestIndex + 1) % chapter.quests.length;
    gameEvents.emit(EVENT.audioCue, "menuNavigate");
    this.renderPage();
  }

  private playQuest(quest: QuestDefinition): void {
    const status = selectQuestState(quest, this.state);
    if (status === "locked" || !quest.implemented) return;
    const oldMap = gameStore.getState().currentMap;
    if (status === "completed") gameStore.startQuestReplay(quest.id);
    else gameStore.setActiveQuest(quest.chapterId, quest.id);
    gameStore.setCurrentMap("neighborhood");
    this.closeMenu();
    this.launchNeighborhood(oldMap);
  }

  private renderMap(): void {
    const map = this.add.image(480, 301, "regional-foldout-map").setDisplaySize(620, 349);
    this.pageContent.add(map);
    const definition = getMapDefinition(this.state.currentMap);
    // The position comes from the active exploration scene, not a landmark.
    const playerLocation = this.playerLocation?.map === this.state.currentMap
      ? this.playerLocation
      : { map: this.state.currentMap, x: 0.5, y: 0.5 };
    const playerPosition = projectRegionalMapPoint(definition, playerLocation);
    const objective = selectActiveObjectiveMarker({
      currentMap: this.state.currentMap,
      questId: this.state.activeQuestId,
      stage: this.state.questStage,
      discoveredIds: [],
    });
    const objectivePosition = objective ? projectRegionalMapPoint(definition, objective) : undefined;
    const unexplored = Object.values(MAP_DEFINITIONS).filter((candidate) =>
      !this.state.discoveredMaps.includes(candidate.id) && !this.state.unlockedMaps.includes(candidate.id),
    );
    unexplored.forEach((candidate) => {
      const bounds = candidate.regionalMapBounds;
      const cover = this.add.rectangle(bounds.x, bounds.y, bounds.width, bounds.height, 0x475057, 0.46)
        .setOrigin(0).setStrokeStyle(2, 0x283033, 0.42);
      this.pageContent.add(cover);
    });
    unexplored.forEach((candidate) => {
      const labelPosition = this.regionalMapLabelPosition(candidate);
      scrapbookText(this, this.pageContent, labelPosition.x, labelPosition.y, "UNEXPLORED", {
        fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "11px", color: "#e1e5dc", fontStyle: "bold",
        backgroundColor: "#283033aa", padding: { x: 5, y: 3 },
      }, createPresentationPolicy(this.state.settings).textScale).setOrigin(0.5);
    });
    for (const candidate of Object.values(MAP_DEFINITIONS)) {
      if (this.state.discoveredMaps.includes(candidate.id) || !this.state.unlockedMaps.includes(candidate.id)) continue;
      const labelPosition = this.regionalMapLabelPosition(candidate);
      scrapbookText(this, this.pageContent, labelPosition.x, labelPosition.y, "UNLOCKED", {
        fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "10px", color: "#fff4cd", fontStyle: "bold",
        backgroundColor: "#315f4ccc", padding: { x: 4, y: 2 },
      }, createPresentationPolicy(this.state.settings).textScale).setOrigin(0.5);
    }
    const topologyPaths: Array<["neighborhood" | "creek" | "stonehenge" | "reidenbaugh" | "fruitville_pike" | "bent_creek", "neighborhood" | "creek" | "stonehenge" | "reidenbaugh" | "fruitville_pike" | "bent_creek"]> = [
      ["neighborhood", "creek"],
      ["neighborhood", "stonehenge"],
      ["stonehenge", "reidenbaugh"],
      ["neighborhood", "fruitville_pike"],
      ["fruitville_pike", "bent_creek"],
    ];
    const topology = this.add.graphics().setDepth(-1);
    topology.lineStyle(3, 0x8f6b4b, 0.65);
    for (const [fromId, toId] of topologyPaths) {
      const from = MAP_DEFINITIONS[fromId].regionalMapBounds;
      const to = MAP_DEFINITIONS[toId].regionalMapBounds;
      topology.lineBetween(from.x + from.width / 2, from.y + from.height / 2, to.x + to.width / 2, to.y + to.height / 2);
    }
    this.pageContent.add(topology);
    this.pageContent.add(this.add.circle(playerPosition.x, playerPosition.y, 12, 0xc94b3f, 1).setStrokeStyle(3, 0xfff4cd, 1));
    scrapbookText(this, this.pageContent, playerPosition.x, playerPosition.y, "YOU", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "12px", color: "#ffffff", fontStyle: "bold",
    }, createPresentationPolicy(this.state.settings).textScale).setOrigin(0.5);
    if (objectivePosition) {
      scrapbookText(this, this.pageContent, objectivePosition.x, objectivePosition.y, "★", {
        fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "25px", color: "#c94b3f", stroke: "#fff4cd", strokeThickness: 3,
      }, createPresentationPolicy(this.state.settings).textScale).setOrigin(0.5);
    }
    scrapbookText(this, this.pageContent, 73, 126, "REGIONAL FOLD-OUT  •  YOU = EXACT LOCATION  ★ = CURRENT CLUE", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "12px", color: "#fff4cd", fontStyle: "bold",
      backgroundColor: "#315f4c", padding: { x: 8, y: 5 },
    }, createPresentationPolicy(this.state.settings).textScale);
  }

  private regionalMapLabelPosition(candidate: MapDefinition): { x: number; y: number } {
    const bounds = candidate.regionalMapBounds;
    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };
  }

  private renderSave(): void {
    const saved = this.state.lastSavedAt ? new Date(this.state.lastSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "not yet this session";
    this.heading("Save pocket", "Autosave quietly keeps your canonical adventure safe.");
    this.card(68, 225, 796, 70);
    this.note(90, 243, "AUTOSAVE  ✓ ON", { fontSize: "14px", color: "#315f4c", fontStyle: "bold" });
    this.note(90, 267, `Last tucked away: ${saved}`, { fontSize: "15px" });
    this.note(540, 244, "A replay never replaces your real progress.", {
      fontSize: "14px", color: "#675544", fontStyle: "italic", wordWrap: { width: 290 },
    });
    this.button(68, 250, "SAVE NOW", () => {
      gameStore.saveNow();
      gameEvents.emit(EVENT.audioCue, "saveConfirmation");
      gameEvents.emit(EVENT.toast, "Adventure tucked safely in your backpack.");
      this.renderPage();
    }).setPosition(550, 310);
    this.button(68, 330, this.restartArmed ? "CONFIRM RESTART" : "RESTART MISSION", () => this.restartMission(), 300)
      .setBackgroundColor(this.restartArmed ? "#c65246" : "#f3c95f");
    if (gameStore.isReplaying()) {
      this.button(540, 330, "RETURN TO ADVENTURE", () => this.endReplay(), 300)
        .setBackgroundColor("#b8d6a4");
    }
    const warning = this.note(390, 378,
      this.restartArmed
        ? "Last warning: confirm restart to begin at Billy's house."
        : "Restart needs a second click; viewing this page changes nothing.",
      { fontSize: "14px", color: this.restartArmed ? "#a43732" : "#675544", wordWrap: { width: 430 }, lineSpacing: 3 },
    );
    this.fitText(warning, 430, 42, 11);
    this.note(72, 428, "REPLAY NOTE", { fontSize: "12px", color: "#9a573a", fontStyle: "bold" });
    const replayNote = this.note(72, 447, "Mission restart is destructive for the current run. The button stays locked until you confirm.", {
      fontSize: "13px", color: "#675544", wordWrap: { width: 760 },
    });
    this.fitText(replayNote, 760, 42, 11);
  }

  private restartMission(): void {
    if (!this.restartArmed) { this.restartArmed = true; this.renderPage(); return; }
    const oldMap = gameStore.getState().currentMap;
    gameStore.reset();
    this.closeMenu();
    this.launchNeighborhood(oldMap);
    gameEvents.emit(EVENT.toast, "Mission restarted.");
  }

  private endReplay(): void {
    if (!gameStore.isReplaying()) return;
    const replayMap = gameStore.getState().currentMap;
    this.closeMenu();
    if (!gameStore.endQuestReplay()) return;
    const canonicalMap = gameStore.getState().currentMap;
    this.scene.stop(replayMap);
    this.scene.launch(canonicalMap);
    this.scene.bringToTop("ui");
    this.scene.bringToTop();
    gameEvents.emit(EVENT.toast, "Returned to your saved adventure.");
  }

  private launchNeighborhood(oldMap: GameState["currentMap"]): void {
    // ScenePlugin.start would shut down the calling MenuScene and permanently
    // remove its Escape/B listeners. Stop/start only the world scene instead.
    this.scene.stop(oldMap);
    this.scene.launch("neighborhood", { spawn: "home" });
    this.scene.bringToTop("ui");
    this.scene.bringToTop();
  }

  private renderSettings(): void {
    const settings = this.state.settings;
    this.heading("Settings & controls", "Everything here saves automatically.");
    this.card(68, 226, 796, 78);
    this.note(88, 242, "KEYBOARD", { fontSize: "12px", color: "#9a573a", fontStyle: "bold" });
    this.note(88, 263, "Move  WASD / arrows     Talk  E / Space     Backpack  Esc     Bike  F", { fontSize: "15px", fontStyle: "bold" });
    this.note(88, 282, "Bike: gamepad X / Square or touch BIKE", { fontSize: "12px", color: "#675544", fontStyle: "bold" });
    this.button(68, 315, settings.muted ? "SOUND: MUTED" : "SOUND: ON", () => this.changeSettings({ muted: !settings.muted }));
    this.button(360, 315, `VOLUME: ${Math.round(settings.masterVolume * 100)}%`, () => {
      this.changeSettings({ masterVolume: nextVolume(settings.masterVolume) });
    });
    this.button(68, 382, `TEXT: ${settings.textSize.toUpperCase()}`, () => {
      this.changeSettings({ textSize: cycleTextSize(settings.textSize) });
    });
    this.button(360, 382, settings.reducedMotion ? "REDUCED MOTION: ON" : "REDUCED MOTION: OFF", () => this.changeSettings({ reducedMotion: !settings.reducedMotion }), 300);
    this.note(690, 320, "← click to cycle", { fontSize: "13px", color: "#76624f", fontStyle: "italic" });
    this.note(690, 389, "Comfort option", { fontSize: "13px", color: "#76624f", fontStyle: "italic" });
    this.note(68, 456, "Tip: Q / R or the shoulder buttons change backpack tabs.", { fontSize: "14px", color: "#675544" });
  }

  private renderHelp(): void {
    this.heading("Field guide", "A quick reference stays here whenever you need it.");
    this.card(68, 226, 796, 194);
    this.note(94, 247, "MOVE", { fontSize: "13px", color: "#9a573a", fontStyle: "bold" });
    this.note(244, 244, "WASD or arrow keys", { fontSize: "19px", fontStyle: "bold" });
    this.note(94, 289, "INTERACT", { fontSize: "13px", color: "#9a573a", fontStyle: "bold" });
    this.note(244, 286, "E or Space — talk, inspect, and advance dialogue", { fontSize: "17px", fontStyle: "bold" });
    this.note(94, 331, "BACKPACK", { fontSize: "13px", color: "#9a573a", fontStyle: "bold" });
    this.note(244, 328, "B or Esc — open or close this backpack", { fontSize: "17px", fontStyle: "bold" });
    this.note(94, 373, "TABS", { fontSize: "13px", color: "#9a573a", fontStyle: "bold" });
    this.note(244, 370, "Q / R, [ / ], or shoulder buttons", { fontSize: "17px", fontStyle: "bold" });
    this.note(68, 454, "Tip: an on-screen prompt appears whenever something nearby can be inspected.", {
      fontSize: "14px", color: "#675544", fontStyle: "italic",
    });
  }

  private changeSettings(changes: Partial<PlayerSettings>): void {
    gameStore.updateSettings(changes);
    const settings = gameStore.getState().settings;
    this.sound.mute = settings.muted;
    this.sound.volume = settings.masterVolume;
    this.renderPage();
  }

  private handleStateChanged(state: GameState): void {
    this.state = state;
    this.updateQuestTabBadge();
    // A completion should leave the world responsive. The HUD already shows
    // the completion toast, and the player can open the journal deliberately.
    if (this.isOpen) this.renderPage();
  }

  private handlePlayerLocationChanged(location: PlayerMapLocation): void {
    this.playerLocation = location;
  }

  private updateQuestTabBadge(): void {
    this.questTabBadge?.setVisible(hasAvailableQuest(this.state));
  }

  private cleanup(): void {
    inputCapture.release("menu");
    gameEvents.off(EVENT.inputAction, this.handleInputAction, this);
    gameEvents.off(EVENT.menuRequested, this.handleMenuRequest, this);
    gameEvents.off(EVENT.stateChanged, this.handleStateChanged, this);
    gameEvents.off(EVENT.playerLocationChanged, this.handlePlayerLocationChanged, this);
  }
}
