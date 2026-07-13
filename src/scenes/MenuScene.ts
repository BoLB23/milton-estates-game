import Phaser from "phaser";
import { getObjective } from "../content/quest";
import { selectMissingControllerQuestDisplay } from "../content/questHistory";
import { getMapDefinition, selectVisibleMapMarkers } from "../content/maps";
import { EVENT, gameEvents, type InputActionEvent, type MenuPage } from "../game/events";
import { CONTROLLER_ITEM, gameStore } from "../game/GameStore";
import type { PlayerSettings, SaveData } from "../game/types";

const PAGES: readonly MenuPage[] = ["resume", "quests", "map", "save", "settings"];
const PAGE_LABELS: Readonly<Record<MenuPage, string>> = {
  resume: "RESUME",
  quests: "QUESTS",
  map: "MAP",
  save: "SAVE",
  settings: "SETTINGS",
};

export class MenuScene extends Phaser.Scene {
  private overlay!: Phaser.GameObjects.Container;
  private pageContent!: Phaser.GameObjects.Container;
  private tabs: Phaser.GameObjects.Text[] = [];
  private activePage: MenuPage = "resume";
  private isOpen = false;
  private restartArmed = false;
  private state: SaveData = gameStore.getState();
  private previousStage = this.state.questStage;
  private focusableButtons: Phaser.GameObjects.Text[] = [];
  private focusedButtonIndex = 0;

  constructor() { super("menu"); }

  create(): void {
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
    });
    const stitched = this.add.text(72, 75, "FIELD NOTES  •  SUMMER '06", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "10px", color: "#d7e0bc", fontStyle: "bold",
    });
    const closeHint = this.add.text(892, 54, "ESC  CLOSE ×", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "13px", color: "#fff3c9", fontStyle: "bold",
    }).setOrigin(1, 0);

    this.pageContent = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0, [shade, pack, binding, paper, headerStrip, title, stitched, closeHint, this.pageContent])
      .setDepth(2_000).setVisible(false);
    this.buildTabs();

    gameEvents.on(EVENT.inputAction, this.handleInputAction, this);
    gameEvents.on(EVENT.menuRequested, this.handleMenuRequest, this);
    gameEvents.on(EVENT.stateChanged, this.handleStateChanged, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  private buildTabs(): void {
    PAGES.forEach((page, index) => {
      const tab = this.add.text(65 + index * 171, 96, PAGE_LABELS[page], {
        fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "15px", color: "#efe1ba", fontStyle: "bold",
        backgroundColor: "#8b4f36", padding: { x: 12, y: 9 },
      }).setInteractive({ useHandCursor: true }).on("pointerdown", () => {
        gameEvents.emit(EVENT.audioCue, "menuNavigate");
        this.selectPage(page);
      });
      this.tabs.push(tab);
      this.overlay.add(tab);
    });
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
    this.restartArmed = false;
    this.overlay.setVisible(false);
    this.scene.resume("ui");
    this.scene.resume(gameStore.getState().currentMap);
    gameEvents.emit(EVENT.menuClosed);
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
    this.focusableButtons = [];
    this.focusedButtonIndex = 0;
    switch (this.activePage) {
      case "resume": this.renderResume(); break;
      case "quests": this.renderQuests(); break;
      case "map": this.renderMap(); break;
      case "save": this.renderSave(); break;
      case "settings": this.renderSettings(); break;
    }
    this.refreshButtonFocus();
  }

  private heading(text: string, subtitle?: string): void {
    this.pageContent.add(this.add.text(68, 154, text, {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "26px", color: "#3c3026", fontStyle: "bold",
    }));
    if (subtitle) this.pageContent.add(this.add.text(68, 190, subtitle, {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "16px", color: "#675544", wordWrap: { width: 800 },
    }));
  }

  private button(x: number, y: number, label: string, action: () => void, width = 260): Phaser.GameObjects.Text {
    const button = this.add.text(x, y, label, {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "17px", color: "#2e2820", fontStyle: "bold",
      backgroundColor: "#f3c95f", fixedWidth: width, align: "center", padding: { x: 12, y: 11 },
    }).setInteractive({ useHandCursor: true }).on("pointerdown", () => {
      gameEvents.emit(EVENT.audioCue, "confirm");
      action();
    });
    button.setData("action", action).setData("baseColor", "#f3c95f");
    button.on("pointerover", () => {
      this.focusedButtonIndex = this.focusableButtons.indexOf(button);
      this.refreshButtonFocus();
    });
    this.focusableButtons.push(button);
    this.pageContent.add(button);
    return button;
  }

  private moveButtonFocus(delta: number): void {
    if (!this.isOpen || !this.focusableButtons.length) return;
    this.focusedButtonIndex = (this.focusedButtonIndex + delta + this.focusableButtons.length) % this.focusableButtons.length;
    gameEvents.emit(EVENT.audioCue, "menuNavigate");
    this.refreshButtonFocus();
  }

  private refreshButtonFocus(): void {
    this.focusableButtons.forEach((button, index) => {
      const focused = index === this.focusedButtonIndex;
      const baseColor = button.getData("baseColor") as string | undefined;
      button.setBackgroundColor(focused ? "#fff2a1" : (baseColor ?? "#f3c95f"));
      button.setColor(focused ? "#172735" : "#2e2820");
      button.setShadow(focused ? 0 : 0, focused ? 0 : 0, focused ? "#315f4c" : "#000000", focused ? 8 : 0, false, true);
    });
  }

  private activateFocusedButton(): void {
    const button = this.focusableButtons[this.focusedButtonIndex];
    const action = button?.getData("action") as (() => void) | undefined;
    if (!action) return;
    gameEvents.emit(EVENT.audioCue, "confirm");
    action();
  }

  private handleInputAction(event: InputActionEvent): void {
    if (!event.pressed) return;
    if (!this.isOpen) {
      if (event.action === "menu" || event.action === "back") this.toggleMenu();
      return;
    }
    switch (event.action) {
      case "menu":
      case "back": this.toggleMenu(); break;
      case "tabPrevious":
      case "moveLeft": this.previousPage(); break;
      case "tabNext":
      case "moveRight": this.nextPage(); break;
      case "moveUp": this.moveButtonFocus(-1); break;
      case "moveDown": this.moveButtonFocus(1); break;
      case "interact": this.activateFocusedButton(); break;
    }
  }

  private card(x: number, y: number, width: number, height: number, color = 0xfff8df): Phaser.GameObjects.Rectangle {
    const card = this.add.rectangle(x, y, width, height, color, 1)
      .setOrigin(0).setStrokeStyle(2, 0xa7865f, 0.8);
    this.pageContent.add(card);
    return card;
  }

  private note(x: number, y: number, text: string, options: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.GameObjects.Text {
    const note = this.add.text(x, y, text, {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "16px", color: "#43372d", ...options,
    });
    this.pageContent.add(note);
    return note;
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
    this.heading("Summer afternoon — paused", `Pinned: ${getObjective(this.state.questStage)}`);
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
    const quest = selectMissingControllerQuestDisplay(this.state.questStage, this.state.questHistory, this.state.secrets);
    this.heading("Quest journal", quest.status === "completed" ? "Case closed — but Milton Estates is still yours to explore." : "One mystery, tracked clue by clue.");
    this.card(68, 224, 796, 228);
    this.note(88, 240, "MAIN QUEST  •  REQUIRED", { fontSize: "12px", color: "#9a573a", fontStyle: "bold" });
    this.note(88, 260, quest.title, { fontSize: "22px", fontStyle: "bold" });
    this.note(690, 244, quest.status === "completed" ? "✓ COMPLETE" : "● ACTIVE", {
      fontSize: "14px", color: quest.status === "completed" ? "#315f4c" : "#a45337", fontStyle: "bold",
    });
    const lines = quest.checklist.map((item) => {
      const icon = item.status === "completed" ? "✓" : item.status === "current" ? "➜" : "○";
      return `${icon}  ${item.checklistCopy}`;
    });
    this.note(94, 299, lines.join("\n"), { fontSize: "15px", lineSpacing: 7, color: "#4b4035" });
    if (quest.discoveries.length) {
      this.note(525, 302, `★ SECRET NOTE\n${quest.discoveries[0]!.text}`, {
        fontSize: "14px", lineSpacing: 7, color: "#315f4c", wordWrap: { width: 305 },
      });
    }
    if (quest.status === "completed") {
      this.button(560, 402, "CONTINUE EXPLORING", () => this.closeMenu(), 280);
      this.button(560, 455, "RESTART OPTIONS…", () => this.selectPage("save"), 280);
    }
  }

  private renderMap(): void {
    const definition = getMapDefinition(this.state.currentMap);
    this.heading(definition.label, "Billy's fold-out map  •  pencil, crayon, and best guesses  •  NOT TO SCALE");
    const left = 92, top = 228, width = 776, height = 240;
    const graphics = this.add.graphics();
    graphics.fillStyle(0xfff4cd, 1).fillRect(left, top, width, height);
    graphics.lineStyle(2, 0x9a7b52, 1).strokeRect(left, top, width, height);
    graphics.lineStyle(1, 0xb99b6d, 0.55);
    graphics.lineBetween(left + width / 3, top, left + width / 3, top + height);
    graphics.lineBetween(left + width * 2 / 3, top, left + width * 2 / 3, top + height);
    graphics.lineStyle(2, 0x87a564, 0.8);
    for (let i = 0; i < 14; i += 1) {
      const tx = left + 18 + (i * 61) % (width - 30);
      const ty = top + 18 + (i * 47) % (height - 35);
      graphics.strokeCircle(tx, ty, 7 + (i % 3) * 2);
    }
    graphics.lineStyle(22, 0xbab4a3, 1);
    if (this.state.currentMap === "neighborhood") {
      graphics.beginPath();
      graphics.moveTo(left - 5, top + 170);
      graphics.lineTo(left + 150, top + 151);
      graphics.lineTo(left + 315, top + 166);
      graphics.lineTo(left + 470, top + 136);
      graphics.lineTo(left + 625, top + 151);
      graphics.lineTo(left + width + 5, top + 125);
      graphics.strokePath();
      graphics.lineStyle(3, 0xf5eada, 1).strokePath();
      graphics.lineStyle(6, 0x4e91a2, 0.8);
      graphics.beginPath(); graphics.moveTo(left + 438, top - 2); graphics.lineTo(left + 458, top + 44); graphics.lineTo(left + 500, top + 80); graphics.strokePath();
    } else {
      graphics.lineStyle(28, 0x4d9db5, 0.95);
      graphics.beginPath(); graphics.moveTo(left + 470, top - 5); graphics.lineTo(left + 425, top + 53); graphics.lineTo(left + 458, top + 111); graphics.lineTo(left + 412, top + 170); graphics.lineTo(left + 435, top + height + 5); graphics.strokePath();
      graphics.lineStyle(4, 0xccebf0, 0.8).strokePath();
      graphics.lineStyle(8, 0x9a724e, 1);
      graphics.beginPath(); graphics.moveTo(left + 38, top + 205); graphics.lineTo(left + 170, top + 165); graphics.lineTo(left + 278, top + 113); graphics.lineTo(left + 380, top + 85); graphics.strokePath();
    }
    this.pageContent.add(graphics);

    if (this.state.currentMap === "neighborhood") {
      this.drawMapHouse(left + 116, top + 80, 0xf4f0df, 0x657781);
      this.drawMapHouse(left + 410, top + 76, 0x5f93b4, 0x485963);
      this.drawMapHouse(left + 602, top + 71, 0x9fc9dc, 0xa3493c);
      this.addMapLabel(left + 111, top + 38, "ANDREW'S", -0.04);
      this.addMapLabel(left + 405, top + 34, "BILLY'S", 0.03);
      this.addMapLabel(left + 594, top + 29, "JEREMY'S", -0.03);
      this.addMapLabel(left + 638, top + 198, "Fruitville Pike →\n(adults only)", -0.04, "#8c533c");
      this.addMapLabel(left + 15, top + 200, "← farms + big sky", 0.02, "#537342");
      this.addMapLabel(left + 458, top + 8, "creek trail!", -0.08, "#397589");
    } else {
      this.addMapLabel(left + 35, top + 25, "FALLEN LOG\nsecret hangout", -0.04);
      this.addMapLabel(left + 500, top + 104, "cold water!", 0.06, "#397589");
      this.addMapLabel(left + 565, top + 200, "Wheatfield Dr. ↓", -0.03, "#8c533c");
      this.addMapLabel(left + 235, top + 176, "stay on trail", 0.04, "#537342");
    }

    const derivedLandmarks = ["billy_home"];
    if (this.state.questHistory.includes("missing_controller.started")) derivedLandmarks.push("jeremy_home");
    if (this.state.questHistory.includes("missing_controller.andrew_consulted")) derivedLandmarks.push("andrew_home");
    if (this.state.discoveredMaps.includes("creek")) derivedLandmarks.push("creek_crossing", "fallen_log");
    const markers = selectVisibleMapMarkers({ currentMap: this.state.currentMap, stage: this.state.questStage, discoveredIds: derivedLandmarks });
    for (const marker of markers) {
      const color = marker.kind === "objective" ? "#fff2a1" : marker.kind === "exit" ? "#fff8df" : "#e5f0d2";
      const prefix = marker.kind === "objective" ? "★" : marker.kind === "exit" ? "➜" : "●";
      this.pageContent.add(this.add.text(left + marker.x * width, top + marker.y * height, `${prefix} ${marker.label}`, {
        fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: marker.kind === "objective" ? "13px" : "11px", color,
        backgroundColor: "#315f4cdd", padding: { x: 4, y: 2 },
      }).setOrigin(0.5));
    }

    const world = this.scene.get(this.state.currentMap);
    const player = world.children.getByName("player") as Phaser.GameObjects.Sprite | null;
    if (player) {
      const px = left + Phaser.Math.Clamp(player.x / definition.worldWidth, 0, 1) * width;
      const py = top + Phaser.Math.Clamp(player.y / definition.worldHeight, 0, 1) * height;
      this.pageContent.add(this.add.text(px, py, "BILLY", {
        fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "12px", color: "#ffffff", fontStyle: "bold",
        backgroundColor: "#d9533f", padding: { x: 6, y: 4 },
      }).setOrigin(0.5));
    }
  }

  private drawMapHouse(x: number, y: number, wall: number, trim: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(wall, 1).fillRect(x, y, 56, 34);
    graphics.fillStyle(trim, 1);
    graphics.beginPath(); graphics.moveTo(x - 6, y); graphics.lineTo(x + 28, y - 23); graphics.lineTo(x + 62, y); graphics.closePath(); graphics.fillPath();
    graphics.fillStyle(0x5c3d2e, 1).fillRect(x + 24, y + 15, 10, 19);
    graphics.fillStyle(0xe9f5ef, 1).fillRect(x + 6, y + 10, 11, 10).fillRect(x + 40, y + 10, 11, 10);
    graphics.lineStyle(2, 0x564638, 1).strokeRect(x, y, 56, 34);
    this.pageContent.add(graphics);
  }

  private addMapLabel(x: number, y: number, label: string, rotation = 0, color = "#684a35"): void {
    this.note(x, y, label, { fontSize: "11px", color, fontStyle: "bold", lineSpacing: 2 }).setRotation(rotation);
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
    this.note(390, 337,
      this.restartArmed
        ? "Last warning: this resets the current mission. Click CONFIRM RESTART to begin at Billy's house."
        : "Want a fresh run? Restart requires a second click. Completed records and normal saves are not changed by simply viewing this page.",
      { fontSize: "15px", color: this.restartArmed ? "#a43732" : "#675544", wordWrap: { width: 430 }, lineSpacing: 4 },
    );
    this.note(72, 392, "REPLAY NOTE", { fontSize: "12px", color: "#9a573a", fontStyle: "bold" });
    this.note(72, 412, "Mission restart is destructive for the current run. The button stays locked until you confirm.", {
      fontSize: "14px", color: "#675544", wordWrap: { width: 760 },
    });
  }

  private restartMission(): void {
    if (!this.restartArmed) { this.restartArmed = true; this.renderPage(); return; }
    const oldMap = gameStore.getState().currentMap;
    gameStore.reset();
    this.closeMenu();
    if (oldMap !== "neighborhood") this.scene.stop(oldMap);
    this.scene.start("neighborhood", { spawn: "home" });
    gameEvents.emit(EVENT.toast, "Mission restarted.");
  }

  private renderSettings(): void {
    const settings = this.state.settings;
    this.heading("Settings & controls", "Everything here saves automatically.");
    this.card(68, 226, 796, 68);
    this.note(88, 242, "KEYBOARD", { fontSize: "12px", color: "#9a573a", fontStyle: "bold" });
    this.note(88, 263, "Move  WASD / arrows     Talk & inspect  E / Space     Backpack  Esc", { fontSize: "15px", fontStyle: "bold" });
    this.button(68, 315, settings.muted ? "SOUND: MUTED" : "SOUND: ON", () => this.changeSettings({ muted: !settings.muted }));
    this.button(360, 315, `VOLUME: ${Math.round(settings.masterVolume * 100)}%`, () => {
      const next = settings.masterVolume >= 1 ? 0 : Math.round((settings.masterVolume + 0.25) * 100) / 100;
      this.changeSettings({ masterVolume: next });
    });
    this.button(68, 382, `TEXT: ${settings.textSize.toUpperCase()}`, () => {
      const sizes = ["small", "medium", "large"] as const;
      this.changeSettings({ textSize: sizes[(sizes.indexOf(settings.textSize) + 1) % sizes.length] });
    });
    this.button(360, 382, settings.reducedMotion ? "REDUCED MOTION: ON" : "REDUCED MOTION: OFF", () => this.changeSettings({ reducedMotion: !settings.reducedMotion }), 300);
    this.note(690, 320, "← click to cycle", { fontSize: "13px", color: "#76624f", fontStyle: "italic" });
    this.note(690, 389, "Comfort option", { fontSize: "13px", color: "#76624f", fontStyle: "italic" });
    this.note(68, 456, "Tip: Left / Right changes backpack tabs.", { fontSize: "14px", color: "#675544" });
  }

  private changeSettings(changes: Partial<PlayerSettings>): void {
    gameStore.updateSettings(changes);
    const settings = gameStore.getState().settings;
    this.sound.mute = settings.muted;
    this.sound.volume = settings.masterVolume;
    this.renderPage();
  }

  private handleStateChanged(state: SaveData): void {
    const justCompleted = this.previousStage !== "complete" && state.questStage === "complete";
    this.previousStage = state.questStage;
    this.state = state;
    if (justCompleted) this.openMenu("quests");
    else if (this.isOpen) this.renderPage();
  }

  private cleanup(): void {
    gameEvents.off(EVENT.inputAction, this.handleInputAction, this);
    gameEvents.off(EVENT.menuRequested, this.handleMenuRequest, this);
    gameEvents.off(EVENT.stateChanged, this.handleStateChanged, this);
  }
}
