import Phaser from "phaser";
import { getObjective } from "../content/quest";
import { getItemDefinition, ITEMS } from "../content/items";
import { CHAPTER_REGISTRY, selectChapterProgress, selectOptionalProgress } from "../content/chapters";
import { getMapDefinition, MAP_DEFINITIONS, projectRegionalMapBounds, projectRegionalMapPoint, selectActiveObjectiveMarker, type RegionalMapDisplayBounds } from "../content/maps";
import { EVENT, gameEvents, inputCapture, type InputActionEvent, type MenuPage, type PlayerMapLocation } from "../game/events";
import { gameStore } from "../game/GameStore";
import { canLaunchMinigameReplay, isMinigameUnlocked, MINIGAMES, type MinigameId } from "../game/minigames";
import type { GameState, PlayerSettings } from "../game/types";
import { createPresentationPolicy, cycleTextSize, nextVolume } from "../presentation/presentationPolicy";
import { SCRAPBOOK, scrapbookButton, scrapbookCard, scrapbookText, TextFocusController } from "../presentation/scrapbook";
import { ScrollablePanel } from "../presentation/ScrollablePanel";
import { BACKPACK_MAP_LAYOUT, spreadMapLabels } from "../presentation/backpackMapLayout";
import { gamePlatform } from "../platform/integration";
import { fetchLeaderboard, LEADERBOARD_PAGES, leaderboardSummaryLines } from "../platform/leaderboards";

const PAGES: readonly MenuPage[] = ["resume", "games", "items", "map", "settings"];
const PAGE_LABELS: Readonly<Record<MenuPage, string>> = {
  resume: "STATUS",
  chapters: "CHAPTERS",
  quests: "CURRENT QUEST",
  games: "GAMES",
  items: "BACKPACK",
  map: "MAP",
  save: "SAVE",
  settings: "SETTINGS",
  help: "HELP",
  leaderboards: "LEADERBOARDS",
};

/**
 * Restores the canonical world after a disposable quest replay. Both the
 * Backpack and Billy's journal use this so scene ordering and the return
 * confirmation cannot drift apart.
 */
export function returnToCurrentAdventure(scene: Phaser.Scene): boolean {
  if (!gameStore.isReplaying()) return false;
  const replayMap = gameStore.getState().currentMap;
  if (!gameStore.endQuestReplay()) return false;
  const canonicalMap = gameStore.getState().currentMap;
  scene.scene.stop(replayMap);
  scene.scene.launch(canonicalMap);
  scene.scene.bringToTop("ui");
  scene.scene.bringToTop();
  gameEvents.emit(EVENT.toast, "Returned to your saved adventure.");
  return true;
}

export class MenuScene extends Phaser.Scene {
  private overlay!: Phaser.GameObjects.Container;
  private pageContent!: Phaser.GameObjects.Container;
  private renderTarget!: Phaser.GameObjects.Container;
  private tabs: Phaser.GameObjects.Text[] = [];
  private activePage: MenuPage = "resume";
  private isOpen = false;
  private restartArmed = false;
  private state: GameState = gameStore.getState();
  private readonly focus = new TextFocusController();
  private playerLocation?: PlayerMapLocation;
  private storageMode = false;
  private scrollPanel?: ScrollablePanel;
  private scrollPointerY?: number;
  private leaderboardRequestId = 0;

  constructor() { super("menu"); }

  create(): void {
    // Phaser may restart this scene instance. These values describe one
    // rendered backpack, not durable player state (which lives in GameStore).
    this.tabs = [];
    this.focus.reset();
    this.activePage = "resume";
    this.isOpen = false;
    this.restartArmed = false;
    this.storageMode = false;
    document.body.classList.remove("backpack-open");
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
    const title = this.add.text(68, 49, `${gameStore.getPlayerProfile()?.nickname ?? "PLAYER"}'S BACKPACK`, {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "24px", color: "#fff3c9", fontStyle: "bold",
    }).setFontSize(createPresentationPolicy(this.state.settings).fontSize(24));
    const stitched = this.add.text(72, 75, "FIELD NOTES  •  SUMMER 2007", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "10px", color: "#d7e0bc", fontStyle: "bold",
    }).setFontSize(createPresentationPolicy(this.state.settings).fontSize(10));
    const closeHint = this.add.text(892, 54, "ESC  CLOSE ×", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "13px", color: "#fff3c9", fontStyle: "bold",
    }).setFontSize(createPresentationPolicy(this.state.settings).fontSize(13)).setOrigin(1, 0);

    this.pageContent = this.add.container(0, 0);
    this.renderTarget = this.pageContent;
    this.overlay = this.add.container(0, 0, [shade, pack, binding, paper, headerStrip, title, stitched, closeHint, this.pageContent])
      .setDepth(2_000).setVisible(false);
    this.buildTabs();

    gameEvents.on(EVENT.inputAction, this.handleInputAction, this);
    gameEvents.on(EVENT.menuRequested, this.handleMenuRequest, this);
    gameEvents.on(EVENT.stateChanged, this.handleStateChanged, this);
    gameEvents.on(EVENT.playerLocationChanged, this.handlePlayerLocationChanged, this);
    this.input.on("wheel", this.handleScrollWheel, this);
    this.input.on("pointerdown", this.handleScrollPointerDown, this);
    this.input.on("pointermove", this.handleScrollPointerMove, this);
    this.input.on("pointerup", this.handleScrollPointerUp, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  private buildTabs(): void {
    PAGES.forEach((page, index) => {
      const tab = scrapbookText(this, this.overlay, 58 + index * 170, 96, PAGE_LABELS[page], {
        fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "15px", color: "#efe1ba", fontStyle: "bold",
        backgroundColor: "#8b4f36", padding: { x: 8, y: 9 }, align: "center",
      }, createPresentationPolicy(this.state.settings).textScale).setFixedSize(160, 38).setInteractive({ useHandCursor: true }).on("pointerdown", () => {
        gameEvents.emit(EVENT.audioCue, "menuNavigate");
        this.selectPage(page);
      });
      this.tabs.push(tab);
    });
  }

  private toggleMenu(event?: KeyboardEvent): void {
    event?.preventDefault();
    gameEvents.emit(EVENT.audioCue, this.isOpen ? "back" : "confirm");
    if (this.isOpen) this.closeMenu(); else this.openMenu(this.activePage);
  }

  private handleMenuRequest(request?: { page?: MenuPage; storage?: boolean }): void {
    this.storageMode = request?.storage === true;
    const requestedPage = request?.page;
    this.openMenu(requestedPage === "leaderboards" || (requestedPage && PAGES.includes(requestedPage)) ? requestedPage : "resume");
  }

  private openMenu(page: MenuPage): void {
    if (!this.isOpen) {
      this.isOpen = true;
      document.body.classList.add("backpack-open");
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
    document.body.classList.remove("backpack-open");
    inputCapture.release("menu");
    this.restartArmed = false;
    this.storageMode = false;
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
    this.scrollPanel?.destroy();
    this.scrollPanel = undefined;
    this.pageContent.removeAll(true);
    this.renderTarget = this.pageContent;
    this.focus.reset();
    switch (this.activePage) {
      case "resume": this.renderResume(); break;
      case "chapters": this.renderChapters(); break;
      case "quests": this.renderQuests(); break;
      case "games": this.renderGames(); break;
      case "items": this.renderItems(); break;
      case "map": this.renderMap(); break;
      case "save": this.renderSave(); break;
      case "settings": this.renderSettings(); break;
      case "help": this.renderHelp(); break;
      case "leaderboards": this.renderLeaderboards(); break;
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
    const button = scrapbookButton(this, this.renderTarget, this.focus, x, y, label, () => {
      gameEvents.emit(EVENT.audioCue, "confirm");
      action();
    }, { width, color: "#f3c95f", ink: "#2e2820", focusColor: "#fff2a1", focusInk: "#172735", textScale: createPresentationPolicy(this.state.settings).textScale });
    button.on("pointerover", () => this.scrollPanel?.scrollIntoView(button.y, button.height));
    return button;
  }

  private moveButtonFocus(delta: number): void {
    if (!this.isOpen || !this.focus.hasButtons) return;
    gameEvents.emit(EVENT.audioCue, "menuNavigate");
    this.focus.move(delta);
    const focused = this.focus.focusedButton;
    if (focused) this.scrollPanel?.scrollIntoView(focused.y, focused.height);
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
      case "moveLeft": this.previousPage(); break;
      case "moveRight": this.nextPage(); break;
      case "moveUp": this.moveButtonFocus(-1); break;
      case "moveDown": this.moveButtonFocus(1); break;
      case "interact": this.activateFocusedButton(); break;
    }
  }

  private card(x: number, y: number, width: number, height: number, color: number = SCRAPBOOK.card): Phaser.GameObjects.Graphics {
    return scrapbookCard(this, this.renderTarget, x, y, width, height, color, false);
  }

  private note(x: number, y: number, text: string, options: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.GameObjects.Text {
    const note = scrapbookText(this, this.renderTarget, x, y, text, {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "16px", color: "#43372d", ...options,
    }, createPresentationPolicy(this.state.settings).textScale);
    return note;
  }

  private withRenderTarget(target: Phaser.GameObjects.Container, render: () => void): void {
    const prior = this.renderTarget;
    this.renderTarget = target;
    try { render(); } finally { this.renderTarget = prior; }
  }

  private createScrollablePanel(x: number, y: number, width: number, height: number): ScrollablePanel {
    const panel = new ScrollablePanel(this, this.pageContent, { x, y, width, height });
    this.scrollPanel = panel;
    return panel;
  }

  private handleScrollWheel(pointer: Phaser.Input.Pointer, _over: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number): void {
    if (this.isOpen && this.scrollPanel?.contains(pointer.x, pointer.y)) this.scrollPanel.scrollBy(deltaY);
  }

  private handleScrollPointerDown(pointer: Phaser.Input.Pointer): void {
    this.scrollPointerY = this.isOpen && this.scrollPanel?.contains(pointer.x, pointer.y) ? pointer.y : undefined;
  }

  private handleScrollPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.scrollPointerY === undefined || !pointer.isDown || !this.scrollPanel) return;
    this.scrollPanel.scrollBy(this.scrollPointerY - pointer.y);
    this.scrollPointerY = pointer.y;
  }

  private handleScrollPointerUp(): void { this.scrollPointerY = undefined; }

  /** Shrinks before clipping so player-facing copy never escapes a paper card. */
  private fitText(text: Phaser.GameObjects.Text, maxWidth: number, maxHeight: number, minimumSize: number): void {
    text.setWordWrapWidth(maxWidth, true);
    const preferredSize = Number.parseInt(String(text.style.fontSize ?? 16), 10);
    for (let size = preferredSize; text.height > maxHeight && size > minimumSize; size -= 1) {
      text.setFontSize(size - 1);
    }
  }

  private renderResume(): void {
    const chapter = CHAPTER_REGISTRY.find((candidate) => candidate.id === this.state.activeChapterId) ?? CHAPTER_REGISTRY[0]!;
    const quest = chapter.quests.find((candidate) => candidate.id === this.state.activeQuestId);
    this.heading("Summer afternoon — paused", "Your current clue and location, all in one place.");
    this.card(68, 231, 796, 142);
    this.note(88, 248, "TODAY'S FIELD NOTE", { fontSize: "13px", color: "#9a573a", fontStyle: "bold" });
    this.note(88, 272, quest?.title ?? "Exploring Milton Estates", { fontSize: "21px", fontStyle: "bold", color: "#315f4c" });
    const objective = this.note(88, 305, getObjective(this.state.questStage, this.state.activeQuestId), {
      fontSize: "17px", color: "#43372d", fontStyle: "bold", wordWrap: { width: 735 },
    });
    this.fitText(objective, 735, 42, 12);
    this.note(88, 348, `${getMapDefinition(this.state.currentMap).label}  •  ${this.state.inventory.length} carried stack${this.state.inventory.length === 1 ? "" : "s"}  •  ${this.state.secrets.length} secret${this.state.secrets.length === 1 ? "" : "s"}`, { fontSize: "13px", color: "#675544" });
    const cloud = gameStore.getCloudSaveState();
    if (cloud.status === "conflict") {
      this.button(68, 400, "LOAD REMOTE SAVE", () => {
        void gameStore.useRemoteCloudConflict().then(() => this.renderPage()).catch(() => this.renderPage());
      }, 250);
      this.button(338, 400, "KEEP MY LOCAL SAVE", () => {
        void gameStore.keepLocalCloudConflict().then(() => this.renderPage()).catch(() => this.renderPage());
      }, 280);
    } else {
      this.button(68, 400, "RESUME GAME", () => this.closeMenu());
    }
    const status = cloud.status === "saved" ? "Cloud save ✓" : cloud.status === "saving" ? "Saving to Game Lab…" : cloud.status === "dirty" || cloud.status === "offline" ? "Pending locally — waiting to reconnect" : cloud.status === "unauthorized" ? "Session expired — sign in again" : cloud.status === "conflict" ? "Cloud conflict — return to saves" : cloud.status === "failed" ? "Cloud save failed — retry later" : "Cloud save ready";
    this.note(cloud.status === "conflict" ? 640 : 348, 412, cloud.status === "conflict" ? "Choose which progress to keep." : status, { fontSize: "14px", color: cloud.status === "failed" || cloud.status === "conflict" ? "#a43732" : "#76624f", fontStyle: "italic" });
  }

  private renderItems(): void {
    this.heading(this.storageMode ? "Home storage" : "Backpack", this.storageMode ? "Move safe items between your carried pack and home storage." : "Everything you collect lives here. Use an item from its row when it has an action.");
    const panel = this.createScrollablePanel(68, 226, 796, 260);
    const stacks = this.state.inventory;
    this.withRenderTarget(panel.content, () => {
      if (stacks.length === 0) {
        this.card(68, 231, 796, 98);
        this.note(92, 257, this.storageMode ? "Nothing is currently carried." : "Your backpack is empty.", { fontSize: "21px", fontStyle: "bold" });
        this.note(92, 291, this.storageMode ? "Stored items are listed below." : "Explore Milton and check the illustrated map for new field finds.", { fontSize: "14px", color: "#675544" });
        if (this.storageMode) this.renderStoredItems(1);
        return;
      }

      stacks.forEach((stack, index) => {
        const definition = getItemDefinition(stack.itemId);
        const y = 226 + index * 86;
        this.card(68, y, 796, 72, index % 2 === 0 ? 0xfff8df : 0xe9d29e);
        this.drawItemIcon(90, y + 18, stack.itemId);
        this.note(148, y + 13, definition.label.toUpperCase(), { fontSize: "16px", fontStyle: "bold" });
        this.note(148, y + 39, `${definition.description}  •  ${stack.quantity}`, { fontSize: "12px", color: "#675544", wordWrap: { width: 420 } });
        if (this.storageMode) {
          const restricted = stack.itemId === "xbox_controller" || stack.itemId === "field_token";
          const deposit = this.button(638, y + 16, restricted ? "KEEP CARRIED" : "DEPOSIT", () => {
            if (!restricted && gameStore.depositToHouseStorage(stack.itemId, stack.quantity)) this.renderPage();
          }, 194);
          if (restricted) deposit.disableInteractive().setBackgroundColor("#c8bda8");
          this.note(638, y + 54, restricted ? "Quest item stays carried." : "Move this stack home.", { fontSize: "10px", color: "#675544", wordWrap: { width: 194 } });
        } else if (stack.itemId === "bicycle") {
          const action = this.bicycleAction();
          const actionButton = this.button(638, y + 16, action.label, () => {
            if (!action.disabled) {
              const equipped = gameStore.getState().equipment.transport === "bicycle";
              gameStore.setEquippedTransport(equipped ? null : "bicycle");
              gameEvents.emit(EVENT.toast, equipped ? "Walking preference saved." : "Bicycle preference saved.");
            }
          }, 194).setBackgroundColor(action.disabled ? "#c8bda8" : action.equipped ? "#f3c95f" : "#b8d6a4");
          if (action.disabled) actionButton.disableInteractive();
          this.note(638, y + 54, action.reason, { fontSize: "10px", color: action.disabled ? "#9a573a" : "#675544", wordWrap: { width: 194 } });
        } else {
          this.note(638, y + 28, definition.useKind === "none" ? "NO ACTION" : "VIEW", { fontSize: "12px", color: "#76624f", fontStyle: "bold" });
        }
      });
      if (this.storageMode) this.renderStoredItems(stacks.length);
    });
    const storedCount = this.storageMode ? gameStore.getHouseStorage().length : 0;
    panel.setContentHeight(Math.max(260, stacks.length * 86 + (this.storageMode ? 48 + storedCount * 62 : 0)));
  }

  private renderStoredItems(carriedCount: number): void {
    const stored = gameStore.getHouseStorage();
    const startY = 226 + carriedCount * 86;
    this.note(68, startY, "STORED AT HOME", { fontSize: "13px", color: "#9a573a", fontStyle: "bold" });
    stored.forEach((stack, index) => {
      const y = startY + 24 + index * 62;
      const definition = getItemDefinition(stack.itemId);
      this.card(68, y, 796, 52, 0xe9d29e);
      this.note(92, y + 10, `${definition.label}  •  ${stack.quantity}`, { fontSize: "15px", fontStyle: "bold" });
      this.button(638, y + 8, "WITHDRAW", () => {
        if (gameStore.withdrawFromHouseStorage(stack.itemId, stack.quantity)) this.renderPage();
      }, 194);
    });
  }

  private drawItemIcon(x: number, y: number, itemId: keyof typeof ITEMS): void {
    if (itemId === "xbox_controller") {
      this.renderTarget.add(this.add.image(x + 16, y + 16, "controller").setScale(0.9).setTint(0x315f4c));
      return;
    }
    const icon = this.add.graphics();
    if (itemId === "bicycle") {
      icon.lineStyle(3, 0x315f4c, 1).strokeCircle(x + 10, y + 18, 9).strokeCircle(x + 42, y + 18, 9)
        .lineBetween(x + 10, y + 18, x + 25, y + 4).lineBetween(x + 25, y + 4, x + 42, y + 18)
        .lineBetween(x + 10, y + 18, x + 32, y + 18).lineBetween(x + 32, y + 18, x + 25, y + 4);
    } else {
      icon.fillStyle(0xe0ad4d, 1).fillCircle(x + 26, y + 16, 13).lineStyle(2, 0x8d5f2b, 1).strokeCircle(x + 26, y + 16, 13);
    }
    this.renderTarget.add(icon);
  }

  private bicycleAction(): { label: string; reason: string; disabled: boolean; equipped: boolean } {
    const equipped = this.state.equipment.transport === "bicycle";
    if (this.state.currentMap === "creek") {
      return { label: equipped ? "PUT BIKE AWAY" : "RIDE BIKE", reason: "Creek Woods forces walking.", disabled: true, equipped };
    }
    if (this.state.currentMap === "fruitville_pike") {
      return { label: equipped ? "PUT BIKE AWAY" : "RIDE BIKE", reason: "Fruitville Pike requires bicycle.", disabled: true, equipped };
    }
    return {
      label: equipped ? "PUT BIKE AWAY" : "RIDE BIKE",
      reason: equipped ? "Saved preference: walking." : "Saved preference: bicycle.",
      disabled: false,
      equipped,
    };
  }

  private renderCurrentQuest(): void {
    const chapter = CHAPTER_REGISTRY.find((candidate) => candidate.id === this.state.activeChapterId) ?? CHAPTER_REGISTRY[0]!;
    const quest = chapter.quests.find((candidate) => candidate.id === this.state.activeQuestId);
    this.heading("Current quest", "Your active objective stays focused here. Talk to Billy to browse past adventures.");
    this.card(68, 226, 796, 190, 0xfff8df);
    this.note(94, 250, quest?.title ?? "Exploring Milton Estates", { fontSize: "25px", fontStyle: "bold", color: "#315f4c" });
    this.note(94, 298, getObjective(this.state.questStage, this.state.activeQuestId), { fontSize: "19px", fontStyle: "bold", wordWrap: { width: 720 } });
    this.note(94, 358, quest?.description ?? "Take a look around and make yourself at home.", { fontSize: "15px", color: "#675544", wordWrap: { width: 700 }, lineSpacing: 4 });
    this.note(94, 438, "Completed and available quest history lives with Billy.", { fontSize: "13px", color: "#76624f", fontStyle: "italic" });
  }

  private renderQuests(): void { this.renderCurrentQuest(); }

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

  private renderGames(): void {
    const race = gameStore.getMickeyDragRaceRecord();
    const canReplay = canLaunchMinigameReplay(this.state);
    const requestId = ++this.leaderboardRequestId;
    const currentUserId = gameStore.getPlayerProfile()?.id;
    this.heading("Mini games", canReplay
      ? "Beat a challenge once, then replay it here or by talking to Jeremy."
      : "Return to your saved adventure before replaying a mini-game.");
    MINIGAMES.forEach((game, index) => {
      const unlocked = isMinigameUnlocked(game.id, this.state);
      const y = 214 + index * 112;
      this.card(68, y, 796, 100, unlocked ? 0xfff8df : 0xe9d29e);
      this.note(92, y + 13, game.title.toUpperCase(), { fontSize: "18px", fontStyle: "bold" });
      this.note(92, y + 42, unlocked ? game.description : `LOCKED  •  ${game.unlockHint}`, {
        fontSize: "14px", color: unlocked ? "#675544" : "#a34237", wordWrap: { width: 510 },
      });
      if (unlocked) {
        const score = this.note(92, y + 66, "Loading your best and shared scores…", {
          fontSize: "11px", color: "#315f4c", fontStyle: "bold", lineSpacing: 2,
        });
        const board = game.id === "mickey_drag_race" ? "mickeyDragRace" : "badTripSurvival";
        const kind = game.id === "mickey_drag_race" ? "fastest" : "longest";
        const fallbackBest = game.id === "mickey_drag_race" ? race.bestTimeMs : undefined;
        void fetchLeaderboard(board, 25).then((entries) => {
          if (requestId !== this.leaderboardRequestId || !score.active) return;
          score.setText(leaderboardSummaryLines(kind, entries, currentUserId, 1, fallbackBest).join("\n"));
        });
      }
      if (unlocked && canReplay) {
        this.button(641, y + 30, "PLAY AGAIN", () => this.launchMinigame(game.id), 194);
      } else if (unlocked) {
        this.note(622, y + 29, "REPLAY PAUSED", {
          fontSize: "13px", color: "#a34237", fontStyle: "bold", wordWrap: { width: 210 },
        });
        this.note(622, y + 49, "Return to your saved adventure first.", {
          fontSize: "11px", color: "#76624f", wordWrap: { width: 210 },
        });
      }
    });
  }

  /**
   * Billy's "Browse leaderboards" option. Every timed challenge in Milton
   * Estates lives here so players don't have to re-finish a game just to
   * check standings; times always read in plain seconds for consistency.
   */
  private renderLeaderboards(): void {
    this.heading("Milton Estates leaderboards", "Every timed challenge, ranked. Times are always shown in seconds.");
    const panel = this.createScrollablePanel(68, 226, 796, 260);
    const requestId = ++this.leaderboardRequestId;
    const currentUserId = gameStore.getPlayerProfile()?.id;
    const rowHeight = 128;
    this.withRenderTarget(panel.content, () => {
      LEADERBOARD_PAGES.forEach((page, index) => {
        const y = 226 + index * rowHeight;
        this.card(68, y, 796, rowHeight - 12, index % 2 === 0 ? 0xfff8df : 0xe9d29e);
        this.note(92, y + 13, page.title.toUpperCase(), { fontSize: "16px", fontStyle: "bold" });
        const status = this.note(92, y + 42, "Loading leaderboard…", {
          fontSize: "13px", color: "#675544", wordWrap: { width: 740 }, lineSpacing: 4,
        });
        void fetchLeaderboard(page.board, 25).then((entries) => {
          if (requestId !== this.leaderboardRequestId || !status.active) return;
          status.setText(leaderboardSummaryLines(page.kind, entries, currentUserId).join("\n"));
        }).catch(() => {
          if (requestId !== this.leaderboardRequestId || !status.active) return;
          status.setText("Leaderboard unavailable right now.");
        });
      });
    });
    panel.setContentHeight(LEADERBOARD_PAGES.length * rowHeight);
  }

  private launchMinigame(id: MinigameId): void {
    // The button can be stale after a state change, so enforce the nested
    // replay policy at the action boundary as well as in the target scenes.
    if (!canLaunchMinigameReplay(gameStore.getState())) {
      gameEvents.emit(EVENT.toast, "Return to your saved adventure before replaying a mini-game.");
      return;
    }
    const returnMap = gameStore.getState().currentMap;
    this.closeMenu();
    this.scene.stop(returnMap);
    // Keep this scene alive: it owns the Backpack's global input listeners.
    if (id === "mickey_drag_race") this.scene.launch("mickey_drag_race", { returnMap });
    else this.scene.launch("bad_trip", { returnScene: returnMap, replay: true });
  }

  private renderMap(): void {
    const mapLayout = BACKPACK_MAP_LAYOUT.map;
    const map = this.add.image(mapLayout.x + mapLayout.width / 2, mapLayout.y + mapLayout.height / 2, "regional-foldout-map")
      .setDisplaySize(mapLayout.width, mapLayout.height);
    this.pageContent.add(map);
    const imageBounds = map.getBounds();
    const displayBounds: RegionalMapDisplayBounds = {
      x: imageBounds.x,
      y: imageBounds.y,
      width: imageBounds.width,
      height: imageBounds.height,
    };
    const definition = getMapDefinition(this.state.currentMap);
    // The live event is preferred; a throttled checkpoint keeps the marker
    // sensible when the world is paused or the browser has just reloaded.
    const playerLocation = this.playerLocation ?? this.state.lastKnownLocation;
    const playerDefinition = getMapDefinition(playerLocation.map);
    const playerPosition = projectRegionalMapPoint(playerDefinition, playerLocation, displayBounds);
    const objective = selectActiveObjectiveMarker({
      currentMap: this.state.currentMap,
      questId: this.state.activeQuestId,
      stage: this.state.questStage,
      discoveredIds: [],
    });
    const objectivePosition = objective ? projectRegionalMapPoint(definition, objective, displayBounds) : undefined;
    const unexplored = Object.values(MAP_DEFINITIONS).filter((candidate) =>
      !this.state.discoveredMaps.includes(candidate.id) && !this.state.unlockedMaps.includes(candidate.id),
    );
    const labeledMaps = Object.values(MAP_DEFINITIONS).filter((candidate) => !this.state.discoveredMaps.includes(candidate.id));
    const labelAnchors = labeledMaps.map((candidate) => {
      const bounds = projectRegionalMapBounds(candidate, displayBounds);
      return { id: candidate.id, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    });
    const labelPositions = spreadMapLabels(labelAnchors, displayBounds);
    unexplored.forEach((candidate) => {
      const bounds = projectRegionalMapBounds(candidate, displayBounds);
      const cover = this.add.rectangle(bounds.x, bounds.y, bounds.width, bounds.height, 0x475057, 0.46)
        .setOrigin(0).setStrokeStyle(2, 0x283033, 0.42);
      this.pageContent.add(cover);
    });
    unexplored.forEach((candidate) => {
      const labelPosition = labelPositions.get(candidate.id)!;
      scrapbookText(this, this.pageContent, labelPosition.x, labelPosition.y, "UNEXPLORED", {
        fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "11px", color: "#e1e5dc", fontStyle: "bold",
        backgroundColor: "#283033aa", padding: { x: 5, y: 3 },
      }, createPresentationPolicy(this.state.settings).textScale).setOrigin(0.5);
    });
    for (const candidate of Object.values(MAP_DEFINITIONS)) {
      if (this.state.discoveredMaps.includes(candidate.id) || !this.state.unlockedMaps.includes(candidate.id)) continue;
      const labelPosition = labelPositions.get(candidate.id)!;
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
      const from = projectRegionalMapPoint(MAP_DEFINITIONS[fromId], { x: 0.5, y: 0.5 }, displayBounds);
      const to = projectRegionalMapPoint(MAP_DEFINITIONS[toId], { x: 0.5, y: 0.5 }, displayBounds);
      topology.lineBetween(from.x, from.y, to.x, to.y);
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
    scrapbookText(this, this.pageContent, BACKPACK_MAP_LAYOUT.legend.x, BACKPACK_MAP_LAYOUT.legend.y, "REGIONAL FOLD-OUT  •  YOU = EXACT LOCATION  ★ = CURRENT CLUE", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "12px", color: "#fff4cd", fontStyle: "bold",
      backgroundColor: "#315f4c", padding: { x: 8, y: 5 },
    }, createPresentationPolicy(this.state.settings).textScale);
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
      void gameStore.saveNow().then((state) => {
        if (state.status === "saved") {
          gameEvents.emit(EVENT.audioCue, "saveConfirmation");
          gameEvents.emit(EVENT.toast, "Adventure saved to Game Lab.");
        } else if (state.status === "offline" || state.status === "dirty" || state.status === "saving") {
          gameEvents.emit(EVENT.toast, "Save is pending until Game Lab reconnects.");
        } else if (state.status === "unauthorized") {
          gameEvents.emit(EVENT.toast, "Session expired — sign in again to save.");
        } else if (state.status === "conflict") {
          gameEvents.emit(EVENT.toast, "Cloud conflict — choose which progress to keep.");
        } else gameEvents.emit(EVENT.toast, "Cloud save failed. Retry after reconnecting.");
        this.renderPage();
      });
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
    // A confirmed restart is a new run, not a continuation of telemetry.
    void gamePlatform.endPlaySession();
    gameStore.reset();
    this.closeMenu();
    this.launchNeighborhood(oldMap, true);
    void gamePlatform.beginPlaySession();
    gameEvents.emit(EVENT.toast, "Mission restarted.");
  }

  private endReplay(): void {
    this.closeMenu();
    returnToCurrentAdventure(this);
  }

  private launchNeighborhood(oldMap: GameState["currentMap"], playIntro = false): void {
    // ScenePlugin.start would shut down the calling MenuScene and permanently
    // remove its Escape/B listeners. Stop/start only the world scene instead.
    this.scene.stop(oldMap);
    this.scene.launch("neighborhood", { spawn: "home", playIntro });
    this.scene.bringToTop("ui");
    this.scene.bringToTop();
  }

  private renderSettings(): void {
    const settings = this.state.settings;
    this.heading("Settings & controls", "Everything here saves automatically.");
    this.card(68, 226, 796, 78);
    this.note(88, 242, "KEYBOARD", { fontSize: "12px", color: "#9a573a", fontStyle: "bold" });
    this.note(88, 263, "Move  WASD / arrows     Talk  E / Space     Backpack  Esc / B", { fontSize: "15px", fontStyle: "bold" });
    this.note(88, 282, "Items: open the Items page to ride or put away the bicycle.", { fontSize: "12px", color: "#675544", fontStyle: "bold" });
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
    // A completion should leave the world responsive. The HUD already shows
    // the completion toast, and the player can open the journal deliberately.
    if (this.isOpen) this.renderPage();
  }

  private handlePlayerLocationChanged(location: PlayerMapLocation): void {
    this.playerLocation = location;
  }

  private cleanup(): void {
    document.body.classList.remove("backpack-open");
    inputCapture.release("menu");
    this.scrollPanel?.destroy();
    this.scrollPanel = undefined;
    this.input.off("wheel", this.handleScrollWheel, this);
    this.input.off("pointerdown", this.handleScrollPointerDown, this);
    this.input.off("pointermove", this.handleScrollPointerMove, this);
    this.input.off("pointerup", this.handleScrollPointerUp, this);
    gameEvents.off(EVENT.inputAction, this.handleInputAction, this);
    gameEvents.off(EVENT.menuRequested, this.handleMenuRequest, this);
    gameEvents.off(EVENT.stateChanged, this.handleStateChanged, this);
    gameEvents.off(EVENT.playerLocationChanged, this.handlePlayerLocationChanged, this);
  }
}
