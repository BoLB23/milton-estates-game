import Phaser from "phaser";
import { getObjective } from "../content/quest";
import { stageFromProgress } from "../game/persistence/questState";
import { EVENT, gameEvents, type InputActionEvent } from "../game/events";
import { gameStore, type MiltonCloudSave } from "../game/GameStore";
import type { PlayerSettings } from "../game/types";
import { createPresentationPolicy, cycleTextSize, nextVolume } from "../presentation/presentationPolicy";
import { SCRAPBOOK, scrapbookButton, scrapbookCard, scrapbookText, TextFocusController } from "../presentation/scrapbook";
import { miltonCloudSaves, gamePlatform } from "../platform/integration";
import type { GameSaveMetadata, GamePlatformIdentityState } from "../platform/GamePlatformAdapter";
import { toPlayerProfile } from "../platform/playerProfile";
import { PlayerAvatar } from "../world/PlayerAvatar";

type FrontPage = "saves" | "settings";
type SlotPreview = { metadata: GameSaveMetadata; save?: MiltonCloudSave };

const PAPER = SCRAPBOOK.paper;
const INK = SCRAPBOOK.ink;
const MUTED_INK = SCRAPBOOK.mutedInk;
const BLUE_INK = SCRAPBOOK.blueInk;
const RED_INK = "#a34237";

function slotLabel(slotKey: string): string {
  return slotKey.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export class FrontEndScene extends Phaser.Scene {
  private page: FrontPage = "saves";
  private content!: Phaser.GameObjects.Container;
  private readonly focus = new TextFocusController();
  private platformIdentity: GamePlatformIdentityState = gamePlatform.getIdentityState();
  private unsubscribePlatformIdentity?: () => void;
  private slots: SlotPreview[] = [];
  private savesLoading = false;
  private saveError?: string;
  private confirmation?: { kind: "reset" | "delete"; slotKey: string };
  private profilePreview?: PlayerAvatar;

  constructor() { super("front-end"); }

  create(): void {
    this.cameras.main.setBackgroundColor("#315948");
    this.content = this.add.container(0, 0);
    this.platformIdentity = gamePlatform.getIdentityState();
    this.unsubscribePlatformIdentity = gamePlatform.subscribeIdentity((identity) => {
      this.platformIdentity = identity;
      if (identity.status === "authenticated") {
        gameStore.setPlayerProfile(toPlayerProfile(identity.player));
        void this.refreshSlots();
      }
      if (this.sys.isActive()) this.render();
    });
    gameEvents.on(EVENT.inputAction, this.handleInputAction, this);
    this.render();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  private render(): void {
    this.profilePreview?.destroy();
    this.profilePreview = undefined;
    this.content.removeAll(true);
    this.focus.reset();
    this.drawDesk();
    if (this.page === "settings") this.renderSettings();
    else this.renderSaves();
    this.focus.refresh();
  }

  private drawDesk(): void {
    const g = this.add.graphics();
    g.fillStyle(0x315948).fillRect(0, 0, 960, 540);
    for (let y = 12; y < 540; y += 24) g.lineStyle(1, 0x78917f, 0.12).lineBetween(0, y, 960, y + 18);
    g.fillStyle(0x1c332a, 0.26).fillRoundedRect(24, 20, 912, 500, 12);
    this.content.add(g);
  }

  private paper(x: number, y: number, width: number, height: number): void {
    const g = this.add.graphics();
    g.fillStyle(0x17251f, 0.25).fillRoundedRect(x + 7, y + 8, width, height, 5);
    g.fillStyle(PAPER).fillRoundedRect(x, y, width, height, 5);
    g.lineStyle(2, 0xcdbf98, 0.8).strokeRoundedRect(x, y, width, height, 5);
    this.content.add(g);
  }

  private text(x: number, y: number, value: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    return scrapbookText(this, this.content, x, y, value, style, createPresentationPolicy(gameStore.getState().settings).textScale);
  }

  private button(x: number, y: number, label: string, action: () => void, options?: { width?: number; color?: string }): Phaser.GameObjects.Text {
    return scrapbookButton(this, this.content, this.focus, x, y, label, () => {
      gameEvents.emit(EVENT.audioCue, "confirm");
      action();
    }, { ...options, textScale: createPresentationPolicy(gameStore.getState().settings).textScale });
  }

  private renderSaves(): void {
    this.paper(45, 42, 870, 456);
    this.text(82, 75, "MILTON ESTATES", { fontSize: "37px", fontStyle: "bold", color: BLUE_INK });
    const identity = this.platformIdentity;
    if (identity.status === "idle" || identity.status === "loading") {
      this.text(82, 145, "Checking your Game Lab identity…", { fontSize: "21px", color: INK });
      this.text(82, 188, "Your cloud saves will appear here once you are signed in.", { fontSize: "15px", color: MUTED_INK });
      return;
    }
    if (identity.status === "unauthorized" || identity.status === "unavailable") {
      const unavailable = identity.status === "unavailable";
      this.text(82, 145, unavailable ? "Game Lab is unavailable." : "Sign in to Game Lab to play Milton Estates.", { fontSize: "21px", color: RED_INK, wordWrap: { width: 700 } });
      this.text(82, 202, unavailable ? "Check the connection, then try again. Cloud saves are required." : identity.message, { fontSize: "15px", color: MUTED_INK, wordWrap: { width: 690 } });
      this.button(82, 274, "RETRY", () => void gamePlatform.initializeIdentity(), { width: 245, color: "#275c73" });
      return;
    }

    const profile = gameStore.getPlayerProfile();
    this.text(82, 126, `Welcome, ${profile?.nickname ?? "Neighbor"}.`, { fontSize: "20px", fontStyle: "bold", color: INK });
    this.drawProfilePreview(810, 130);
    if (gameStore.hasLegacyBrowserSave()) {
      this.text(82, 158, "A previous browser save was found. It cannot be imported and has not been deleted; start a fresh cloud save to continue.", {
        fontSize: "12px", color: RED_INK, wordWrap: { width: 670 }, lineSpacing: 3,
      });
    }
    if (this.savesLoading) {
      this.text(82, 214, "Loading cloud saves…", { fontSize: "18px", color: MUTED_INK });
      return;
    }
    if (this.saveError) this.text(82, 205, this.saveError, { fontSize: "14px", color: RED_INK, wordWrap: { width: 670 } });
    if (this.slots.length === 0) {
      this.text(82, 225, "No cloud saves yet. Start your moving day.", { fontSize: "19px", color: INK });
      this.button(82, 290, "NEW GAME", () => void this.createSave(), { width: 300, color: "#275c73" });
    } else {
      this.renderSlotCards();
      this.button(82, 440, "NEW SAVE", () => void this.createSave(), { width: 220, color: "#275c73" });
    }
    this.button(720, 455, "SETTINGS", () => { this.page = "settings"; this.render(); }, { width: 170, color: "#50675b" });
  }

  private renderSlotCards(): void {
    const visible = this.slots.slice(0, 3);
    visible.forEach((slot, index) => {
      const y = 205 + index * 72;
      scrapbookCard(this, this.content, 82, y, 770, 62, 0xfff8df);
      const state = slot.save;
      const stage = state ? stageFromProgress(state.questProgress, state.activeQuestId) : undefined;
      const objective = state && stage ? getObjective(stage, state.activeQuestId) : "Loading save details…";
      const location = state ? state.currentMap.replace(/_/g, " ") : "";
      this.text(99, y + 9, slotLabel(slot.metadata.slotKey), { fontSize: "16px", color: BLUE_INK, fontStyle: "bold" });
      this.text(99, y + 33, `${location}${location ? "  •  " : ""}${objective}`, { fontSize: "11px", color: MUTED_INK, wordWrap: { width: 360 } });
      this.text(470, y + 10, `Saved ${new Date(slot.metadata.updatedAt).toLocaleDateString()}`, { fontSize: "11px", color: MUTED_INK });
      this.button(610, y + 10, "CONTINUE", () => void this.continueSlot(slot.metadata.slotKey), { width: 110, color: "#275c73" });
      this.button(728, y + 10, "⋯", () => { this.confirmation = { kind: "reset", slotKey: slot.metadata.slotKey }; this.render(); }, { width: 60, color: "#50675b" });
    });
    if (this.confirmation) this.renderConfirmation();
  }

  private renderConfirmation(): void {
    const { kind, slotKey } = this.confirmation!;
    scrapbookCard(this, this.content, 240, 150, 480, 250, 0xe9d29e);
    this.text(275, 182, kind === "reset" ? `Start over in ${slotLabel(slotKey)}?` : `Delete ${slotLabel(slotKey)}?`, { fontSize: "22px", color: INK, fontStyle: "bold", wordWrap: { width: 400 } });
    this.text(275, 244, kind === "reset" ? "This replaces the cloud save with a new moving day." : "This removes this cloud save. This cannot be undone.", { fontSize: "15px", color: MUTED_INK, wordWrap: { width: 390 }, lineSpacing: 4 });
    this.button(275, 330, kind === "reset" ? "START OVER" : "DELETE", () => void this.confirmSlotAction(), { width: 190, color: RED_INK });
    this.button(480, 330, "CANCEL", () => { this.confirmation = undefined; this.render(); }, { width: 170, color: "#50675b" });
  }

  private async refreshSlots(): Promise<void> {
    if (this.platformIdentity.status !== "authenticated" || this.savesLoading) return;
    this.savesLoading = true;
    this.saveError = undefined;
    this.render();
    try {
      gameStore.connectCloudSave(miltonCloudSaves);
      const metadata = await miltonCloudSaves.listSlots();
      const slots = await Promise.all(metadata.map(async (item) => {
        try { return { metadata: item, save: (await miltonCloudSaves.peek(item.slotKey)).data }; }
        catch { return { metadata: item }; }
      }));
      this.slots = slots;
    } catch {
      this.saveError = "Could not load your cloud saves. Please retry.";
    } finally {
      this.savesLoading = false;
      if (this.sys.isActive()) this.render();
    }
  }

  private nextSlotKey(): string {
    const occupied = new Set(this.slots.map((slot) => slot.metadata.slotKey));
    for (let index = 1; ; index += 1) {
      const key = index === 1 ? "primary" : `save-${index}`;
      if (!occupied.has(key)) return key;
    }
  }

  private async createSave(slotKey = this.nextSlotKey()): Promise<void> {
    try {
      const snapshot = gameStore.createFreshCloudSave();
      await miltonCloudSaves.create(slotKey, snapshot);
      this.launchGameplay();
    } catch {
      this.saveError = "Could not create that cloud save. Please retry.";
      this.render();
    }
  }

  private async continueSlot(slotKey: string): Promise<void> {
    try {
      const save = await miltonCloudSaves.load(slotKey);
      if (!gameStore.hydrateCloudSave(save.data)) throw new Error("Invalid save");
      this.launchGameplay();
    } catch {
      this.saveError = "Could not load that cloud save. Please retry.";
      this.render();
    }
  }

  private async confirmSlotAction(): Promise<void> {
    const action = this.confirmation;
    this.confirmation = undefined;
    if (!action) return;
    try {
      if (action.kind === "reset") {
        await miltonCloudSaves.delete(action.slotKey);
        await this.createSave(action.slotKey);
        return;
      }
      await miltonCloudSaves.delete(action.slotKey);
      await this.refreshSlots();
    } catch {
      this.saveError = "Could not update that cloud save. Please retry.";
      this.render();
    }
  }

  private drawProfilePreview(x: number, y: number): void {
    this.profilePreview = PlayerAvatar.createPreview(this, {
      x,
      y: y + 32,
      scale: 0.58,
      profile: gameStore.getPlayerProfile(),
    });
    this.content.add([...this.profilePreview.getRenderSprites()]);
  }

  private renderSettings(): void {
    this.paper(160, 65, 640, 410);
    const settings = gameStore.getState().settings;
    this.text(205, 102, "SETTINGS", { fontSize: "31px", fontStyle: "bold", color: BLUE_INK });
    this.button(205, 184, settings.muted ? "SOUND: MUTED" : "SOUND: ON", () => this.changeSettings({ muted: !settings.muted }), { width: 550 });
    this.button(205, 242, `VOLUME: ${Math.round(settings.masterVolume * 100)}%`, () => this.changeSettings({ masterVolume: nextVolume(settings.masterVolume) }), { width: 550 });
    this.button(205, 300, `TEXT SIZE: ${settings.textSize.toUpperCase()}`, () => this.changeSettings({ textSize: cycleTextSize(settings.textSize) }), { width: 550 });
    this.button(205, 358, settings.reducedMotion ? "REDUCED MOTION: ON" : "REDUCED MOTION: OFF", () => this.changeSettings({ reducedMotion: !settings.reducedMotion }), { width: 550, color: "#50675b" });
    this.button(610, 430, "← SAVES", () => { this.page = "saves"; this.render(); }, { width: 145, color: "#50675b" });
  }

  private changeSettings(changes: Partial<PlayerSettings>): void {
    gameStore.updateSettings(changes);
    const settings = gameStore.getState().settings;
    this.sound.mute = settings.muted;
    this.sound.volume = settings.masterVolume;
    this.render();
  }

  private handleInputAction(event: InputActionEvent): void {
    if (!event.pressed || !this.sys.isActive()) return;
    if (event.action === "moveUp" || event.action === "moveLeft") this.focus.move(-1);
    else if (event.action === "moveDown" || event.action === "moveRight") this.focus.move(1);
    else if (event.action === "interact") this.focus.activate();
    else if ((event.action === "back" || event.action === "menu") && this.confirmation) { this.confirmation = undefined; this.render(); }
  }

  private launchGameplay(): void {
    this.scene.launch("ui");
    this.scene.launch("menu");
    this.scene.launch("billy-quest-journal");
    this.scene.start(gameStore.getState().currentMap);
    void gamePlatform.beginPlaySession();
  }

  private cleanup(): void {
    gameEvents.off(EVENT.inputAction, this.handleInputAction, this);
    this.profilePreview?.destroy();
    this.profilePreview = undefined;
    this.unsubscribePlatformIdentity?.();
    this.unsubscribePlatformIdentity = undefined;
  }
}
