import Phaser from "phaser";
import { getObjective } from "../content/quest";
import { selectMissingControllerQuestDisplay } from "../content/questHistory";
import { getMapDefinition, selectVisibleMapMarkers } from "../content/maps";
import { EVENT, gameEvents, type MenuPage } from "../game/events";
import { gameStore } from "../game/GameStore";
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

  constructor() { super("menu"); }

  create(): void {
    this.sound.mute = this.state.settings.muted;
    this.sound.volume = this.state.settings.masterVolume;
    const shade = this.add.rectangle(0, 0, 960, 540, 0x071511, 0.92).setOrigin(0);
    const panel = this.add.rectangle(35, 28, 890, 484, 0x102e28, 1)
      .setOrigin(0).setStrokeStyle(3, 0xf4d37b, 1);
    const title = this.add.text(60, 48, "BILLY'S BACKPACK", {
      fontFamily: "Arial, sans-serif", fontSize: "25px", color: "#f4d37b", fontStyle: "bold",
    });
    const closeHint = this.add.text(900, 53, "ESC — CLOSE", {
      fontFamily: "Arial, sans-serif", fontSize: "14px", color: "#d5e3db",
    }).setOrigin(1, 0);

    this.pageContent = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0, [shade, panel, title, closeHint, this.pageContent])
      .setDepth(2_000).setVisible(false);
    this.buildTabs();

    this.input.keyboard?.on("keydown-ESC", this.toggleMenu, this);
    this.input.keyboard?.on("keydown-LEFT", this.previousPage, this);
    this.input.keyboard?.on("keydown-RIGHT", this.nextPage, this);
    gameEvents.on(EVENT.menuRequested, this.handleMenuRequest, this);
    gameEvents.on(EVENT.stateChanged, this.handleStateChanged, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  private buildTabs(): void {
    PAGES.forEach((page, index) => {
      const tab = this.add.text(65 + index * 171, 96, PAGE_LABELS[page], {
        fontFamily: "Arial, sans-serif", fontSize: "16px", color: "#b8c9c0", fontStyle: "bold",
        backgroundColor: "#183d32", padding: { x: 12, y: 9 },
      }).setInteractive({ useHandCursor: true }).on("pointerdown", () => this.selectPage(page));
      this.tabs.push(tab);
      this.overlay.add(tab);
    });
  }

  private toggleMenu(event?: KeyboardEvent): void {
    event?.preventDefault();
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
    const index = PAGES.indexOf(this.activePage);
    this.selectPage(PAGES[(index + PAGES.length - 1) % PAGES.length]!);
  }

  private nextPage(): void {
    if (!this.isOpen) return;
    const index = PAGES.indexOf(this.activePage);
    this.selectPage(PAGES[(index + 1) % PAGES.length]!);
  }

  private selectPage(page: MenuPage): void {
    this.activePage = page;
    this.restartArmed = false;
    this.tabs.forEach((tab, index) => {
      const selected = PAGES[index] === page;
      tab.setColor(selected ? "#102e28" : "#b8c9c0");
      tab.setBackgroundColor(selected ? "#f4d37b" : "#183d32");
    });
    this.renderPage();
  }

  private renderPage(): void {
    this.pageContent.removeAll(true);
    switch (this.activePage) {
      case "resume": this.renderResume(); break;
      case "quests": this.renderQuests(); break;
      case "map": this.renderMap(); break;
      case "save": this.renderSave(); break;
      case "settings": this.renderSettings(); break;
    }
  }

  private heading(text: string, subtitle?: string): void {
    this.pageContent.add(this.add.text(68, 154, text, {
      fontFamily: "Arial, sans-serif", fontSize: "26px", color: "#ffffff", fontStyle: "bold",
    }));
    if (subtitle) this.pageContent.add(this.add.text(68, 190, subtitle, {
      fontFamily: "Arial, sans-serif", fontSize: "17px", color: "#c7d7cf", wordWrap: { width: 800 },
    }));
  }

  private button(x: number, y: number, label: string, action: () => void, width = 260): Phaser.GameObjects.Text {
    const button = this.add.text(x, y, label, {
      fontFamily: "Arial, sans-serif", fontSize: "18px", color: "#102e28", fontStyle: "bold",
      backgroundColor: "#f4d37b", fixedWidth: width, align: "center", padding: { x: 12, y: 11 },
    }).setInteractive({ useHandCursor: true }).on("pointerdown", action);
    this.pageContent.add(button);
    return button;
  }

  private renderResume(): void {
    this.heading("Summer afternoon paused", `Current objective: ${getObjective(this.state.questStage)}`);
    this.pageContent.add(this.add.text(68, 250,
      `Area: ${getMapDefinition(this.state.currentMap).label}\nInventory: ${this.state.inventory.length ? "Xbox controller" : "Empty"}\nSecrets found: ${this.state.secrets.length}`,
      { fontFamily: "Arial, sans-serif", fontSize: "19px", color: "#ffffff", lineSpacing: 12 },
    ));
    this.button(68, 388, "RESUME GAME", () => this.closeMenu());
  }

  private renderQuests(): void {
    const quest = selectMissingControllerQuestDisplay(this.state.questStage, this.state.questHistory, this.state.secrets);
    this.heading(quest.title, quest.status === "completed" ? "Completed — mystery solved." : "Active quest");
    const lines = quest.checklist.map((item) => {
      const icon = item.status === "completed" ? "✓" : item.status === "current" ? "▶" : "○";
      return `${icon}  ${item.checklistCopy}`;
    });
    if (quest.discoveries.length) lines.push("", `★  ${quest.discoveries[0]!.text}`);
    this.pageContent.add(this.add.text(76, 230, lines, {
      fontFamily: "Arial, sans-serif", fontSize: "18px", color: "#ffffff", lineSpacing: 12,
    }));
    if (quest.status === "completed") {
      this.button(560, 390, "CONTINUE EXPLORING", () => this.closeMenu(), 280);
      this.button(560, 445, "RESTART MISSION", () => this.selectPage("save"), 280);
    }
  }

  private renderMap(): void {
    const definition = getMapDefinition(this.state.currentMap);
    this.heading(definition.label, "A kid's-eye map — useful, not to scale.");
    const left = 170, top = 235, width = 620, height = 220;
    const graphics = this.add.graphics();
    graphics.fillStyle(this.state.currentMap === "creek" ? 0x477f47 : 0x79b85f).fillRoundedRect(left, top, width, height, 18);
    graphics.lineStyle(5, 0xd6d1ba, 0.9);
    if (this.state.currentMap === "neighborhood") graphics.lineBetween(left, top + 150, left + width, top + 150);
    else graphics.lineStyle(18, 0x327f93, 0.9).lineBetween(left + width / 2, top, left + width / 2, top + height);
    this.pageContent.add(graphics);

    const derivedLandmarks = ["billy_home"];
    if (this.state.questHistory.includes("missing_controller.started")) derivedLandmarks.push("jeremy_home");
    if (this.state.questHistory.includes("missing_controller.andrew_consulted")) derivedLandmarks.push("andrew_home");
    if (this.state.discoveredMaps.includes("creek")) derivedLandmarks.push("creek_crossing", "fallen_log");
    const markers = selectVisibleMapMarkers({ currentMap: this.state.currentMap, stage: this.state.questStage, discoveredIds: derivedLandmarks });
    for (const marker of markers) {
      const color = marker.kind === "objective" ? "#ffd447" : marker.kind === "exit" ? "#ffffff" : "#d8ffe6";
      const prefix = marker.kind === "objective" ? "★" : marker.kind === "exit" ? "↗" : "●";
      this.pageContent.add(this.add.text(left + marker.x * width, top + marker.y * height, `${prefix} ${marker.label}`, {
        fontFamily: "Arial, sans-serif", fontSize: marker.kind === "objective" ? "14px" : "12px", color,
        backgroundColor: "#102e28cc", padding: { x: 4, y: 2 },
      }).setOrigin(0.5));
    }

    const world = this.scene.get(this.state.currentMap);
    const player = world.children.getByName("player") as Phaser.GameObjects.Sprite | null;
    if (player) {
      const px = left + Phaser.Math.Clamp(player.x / definition.worldWidth, 0, 1) * width;
      const py = top + Phaser.Math.Clamp(player.y / definition.worldHeight, 0, 1) * height;
      this.pageContent.add(this.add.text(px, py, "BILLY", {
        fontFamily: "Arial, sans-serif", fontSize: "12px", color: "#ffffff", fontStyle: "bold",
        backgroundColor: "#3e8ed0", padding: { x: 5, y: 3 },
      }).setOrigin(0.5));
    }
  }

  private renderSave(): void {
    const saved = this.state.lastSavedAt ? new Date(this.state.lastSavedAt).toLocaleString() : "Not saved yet";
    this.heading("Save & recovery", `Autosave is on. Last saved: ${saved}`);
    this.button(68, 250, "SAVE NOW", () => {
      gameStore.saveNow();
      gameEvents.emit(EVENT.toast, "Game saved.");
      this.renderPage();
    });
    this.button(68, 330, this.restartArmed ? "CONFIRM RESTART" : "RESTART MISSION", () => this.restartMission(), 300)
      .setBackgroundColor(this.restartArmed ? "#dd5757" : "#f4d37b");
    this.pageContent.add(this.add.text(390, 337,
      this.restartArmed ? "This erases the current mission progress. Click again to confirm." : "Requires confirmation. Saving never restarts the mission.",
      { fontFamily: "Arial, sans-serif", fontSize: "16px", color: this.restartArmed ? "#ffb8b8" : "#c7d7cf", wordWrap: { width: 430 } },
    ));
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
    this.heading("Settings & controls", "Move: WASD / arrows   Interact: E / Space   Menu: Escape");
    this.button(68, 245, settings.muted ? "SOUND: MUTED" : "SOUND: ON", () => this.changeSettings({ muted: !settings.muted }));
    this.button(360, 245, `VOLUME: ${Math.round(settings.masterVolume * 100)}%`, () => {
      const next = settings.masterVolume >= 1 ? 0 : Math.round((settings.masterVolume + 0.25) * 100) / 100;
      this.changeSettings({ masterVolume: next });
    });
    this.button(68, 320, `TEXT: ${settings.textSize.toUpperCase()}`, () => {
      const sizes = ["small", "medium", "large"] as const;
      this.changeSettings({ textSize: sizes[(sizes.indexOf(settings.textSize) + 1) % sizes.length] });
    });
    this.button(360, 320, settings.reducedMotion ? "REDUCED MOTION: ON" : "REDUCED MOTION: OFF", () => this.changeSettings({ reducedMotion: !settings.reducedMotion }), 300);
    this.pageContent.add(this.add.text(68, 405, "Settings save automatically. Key rebinding is planned for the demo-ready pass.", {
      fontFamily: "Arial, sans-serif", fontSize: "16px", color: "#c7d7cf",
    }));
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
    this.input.keyboard?.off("keydown-ESC", this.toggleMenu, this);
    this.input.keyboard?.off("keydown-LEFT", this.previousPage, this);
    this.input.keyboard?.off("keydown-RIGHT", this.nextPage, this);
    gameEvents.off(EVENT.menuRequested, this.handleMenuRequest, this);
    gameEvents.off(EVENT.stateChanged, this.handleStateChanged, this);
  }
}
