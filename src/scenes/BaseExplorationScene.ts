import Phaser from "phaser";
import { EVENT, gameEvents, inputCapture, type ChoiceRequest, type InputActionEvent } from "../game/events";
import { MushroomHuntController } from "../world/MushroomHuntController";
import { PlayerLocomotionController, type PlayerTravelMode } from "../world/PlayerLocomotionController";
import type { RegionInteraction } from "../world/contracts";
import type { WorldPoint } from "../world/tiledRuntime";
import { inputState } from "./InputRouterScene";
import type { DialogueLine, Interactable, MapId } from "../game/types";
import { getMapDefinition, normalizeWorldMapPoint } from "../content/maps";

export abstract class BaseExplorationScene extends Phaser.Scene {
  protected player!: Phaser.Physics.Arcade.Sprite;
  protected obstacles!: Phaser.Physics.Arcade.StaticGroup;
  protected interactables: Interactable[] = [];
  private regionInteractables: RegionInteraction[] = [];
  protected inputLocked = false;
  private interactionBlockedUntil = 0;
  private lastHint = "";
  private nearbyInteractable?: Interactable;
  private playerFacing: "up" | "down" | "left" | "right" = "down";
  private mushroomHunt?: MushroomHuntController;
  private locomotion = new PlayerLocomotionController();
  private travelMode: PlayerTravelMode = "walking";
  private bicycleAvailable = false;
  private bicycleVisual?: Phaser.GameObjects.Graphics;
  private mapId!: MapId;

  protected initializeWorld(mapId: MapId, spawn: { x: number; y: number }): void {
    // Phaser reuses Scene instances after stop/start. All references below
    // belong to one world run and must not survive a map revisit; stale pickup
    // closures can otherwise target destroyed sprites instead of current ones.
    this.interactables = [];
    this.regionInteractables = [];
    this.nearbyInteractable = undefined;
    this.inputLocked = false;
    this.interactionBlockedUntil = 0;
    this.lastHint = "";
    this.playerFacing = "down";
    this.travelMode = "walking";
    this.locomotion = new PlayerLocomotionController();
    this.bicycleAvailable = false;
    this.bicycleVisual = undefined;
    this.mapId = mapId;
    this.mushroomHunt = new MushroomHuntController({
      world: this,
      registerInteraction: (interactable) => this.registerInteraction(interactable),
      unregisterInteraction: (id) => this.unregisterInteraction(id),
      registerRegionInteraction: (interactable) => this.registerRegionInteraction(interactable),
      unregisterRegionInteraction: (id) => this.unregisterRegionInteraction(id),
      showDialogue: (lines, onComplete) => this.showDialogue(lines, onComplete),
      showChoice: (request) => this.showChoice(request),
      addLabel: (x, y, text, color) => this.addLabel(x, y, text, color),
      objectPoint: (name) => this.objectPoint(name),
    });
    gameEvents.emit(EVENT.hint, "");

    this.obstacles = this.physics.add.staticGroup();
    this.player = this.physics.add.sprite(spawn.x, spawn.y, "billy").setName("player");
    this.player
      .setDepth(50)
      .setScale(0.18)
      .setCollideWorldBounds(true)
      .setSize(110, 95)
      .setOffset(145, 275);
    this.bicycleVisual = this.add.graphics().setDepth(49).setVisible(false);
    this.drawBicycleVisual();
    this.emitPlayerLocation();
    this.physics.add.collider(this.player, this.obstacles);
    // F4 is a development-only playtest hook. Playwright uses Vite's dev
    // server, so this is unavailable from production builds by design.
    if (import.meta.env.DEV) window.addEventListener("keydown", this.handleDebugKeyDown);
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setZoom(1.25);
    gameEvents.on(EVENT.interactRequested, this.handleRequestedInteraction, this);
    gameEvents.on(EVENT.inputAction, this.handleInputAction, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (import.meta.env.DEV) window.removeEventListener("keydown", this.handleDebugKeyDown);
      gameEvents.off(EVENT.interactRequested, this.handleRequestedInteraction, this);
      gameEvents.off(EVENT.inputAction, this.handleInputAction, this);
      gameEvents.emit(EVENT.dialogueCancelled);
      gameEvents.emit(EVENT.choiceCancelled);
      this.nearbyInteractable = undefined;
      this.lastHint = "";
      gameEvents.emit(EVENT.hint, "");
      this.mushroomHunt?.dispose();
      this.mushroomHunt = undefined;
    });
  }

  update(_time = 0, delta = 16.67): void {
    const movement = inputState.movement();
    const next = this.locomotion.update(movement, delta, this.inputLocked);
    this.player.setVelocity(next.velocityX, next.velocityY);
    this.updatePlayerPresentation({ x: next.velocityX, y: next.velocityY }, next.speed > 0);
    this.syncBicycleVisual();
    this.emitPlayerLocation();

    const nearby = this.closestInteractable(62);
    this.nearbyInteractable = nearby;
    const hint = nearby ? `E / Space — ${nearby.label}` : "";
    if (hint !== this.lastHint) {
      gameEvents.emit(EVENT.hint, hint);
      this.lastHint = hint;
    }

  }

  private emitPlayerLocation(): void {
    const point = normalizeWorldMapPoint(getMapDefinition(this.mapId), this.player);
    gameEvents.emit(EVENT.playerLocationChanged, { map: this.mapId, ...point });
  }

  protected addObstacle(x: number, y: number, width: number, height: number): void {
    const zone = this.add.zone(x + width / 2, y + height / 2, width, height);
    // StaticGroup creates the static Arcade body when the zone is added.
    // Enabling it first creates and then re-registers the same body.
    this.obstacles.add(zone);
  }

  public registerInteraction(interactable: Interactable): void {
    this.interactables.push(interactable);
  }

  public unregisterInteraction(id: string): void {
    this.interactables = this.interactables.filter((interactable) => interactable.id !== id);
  }

  /** Adds the currently authored mushrooms for this map and keeps pickups save-safe. */
  protected addMushroomHunt(map: Extract<MapId, "neighborhood" | "creek">): void {
    this.mushroomHunt?.mount(map);
  }

  public registerRegionInteraction(interactable: RegionInteraction): void {
    this.regionInteractables.push(interactable);
  }

  public unregisterRegionInteraction(id: string): void {
    this.regionInteractables = this.regionInteractables.filter((interactable) => interactable.id !== id);
  }

  public showDialogue(lines: DialogueLine[], onComplete?: () => void): void {
    gameEvents.emit(EVENT.audioCue, "interaction");
    this.inputLocked = true;
    this.player.setVelocity(0, 0);
    gameEvents.emit(EVENT.dialogue, {
      lines,
      onComplete: () => {
        this.inputLocked = false;
        // The UI closes dialogue on keydown. Block world interaction briefly so
        // that same physical press cannot reopen a nearby one-line dialogue.
        this.interactionBlockedUntil = this.time.now + 180;
        onComplete?.();
      },
    });
  }

  /** Opens a UI-owned choice while retaining the world movement lock. */
  public showChoice(request: ChoiceRequest): void {
    this.inputLocked = true;
    this.player.setVelocity(0, 0);
    gameEvents.emit(EVENT.choice, {
      ...request,
      onSelect: (optionId) => {
        this.inputLocked = false;
        this.interactionBlockedUntil = this.time.now + 180;
        request.onSelect(optionId);
      },
      onCancel: () => {
        this.inputLocked = false;
        this.interactionBlockedUntil = this.time.now + 180;
        request.onCancel?.();
      },
    });
  }

  /** Selects the shared movement core and updates collision immediately. */
  protected setPlayerTravelMode(mode: PlayerTravelMode): void {
    if (this.travelMode === mode) return;
    this.travelMode = mode;
    this.locomotion.setMode(mode);
    this.player.setVelocity(0, 0);
    if (mode === "bicycle") this.player.setSize(150, 105).setOffset(125, 260);
    else this.player.setSize(110, 95).setOffset(145, 275);
    (this.player.body as Phaser.Physics.Arcade.Body).reset(this.player.x, this.player.y);
    this.syncBicycleVisual();
  }

  /** Enables the post-quest F-key bicycle switch without changing the current mode. */
  protected enableBicycleToggle(): void {
    this.bicycleAvailable = true;
  }

  protected getPlayerPosition(): { x: number; y: number } {
    return { x: this.player.x, y: this.player.y };
  }

  protected getPlayerSprite(): Phaser.Physics.Arcade.Sprite { return this.player; }

  public addLabel(x: number, y: number, text: string, color = "#173d32"): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "15px",
      fontStyle: "bold",
      color,
      backgroundColor: "#fff9d8cc",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(20);
  }

  /** Subclasses with a TMJ runtime override this for their world controllers. */
  public objectPoint(name: string): WorldPoint {
    throw new Error(`No authored object source is active for ${name}`);
  }

  protected getDebugObjectivePosition(): { x: number; y: number } | undefined {
    return undefined;
  }

  private updatePlayerPresentation(movement: { x: number; y: number }, moving: boolean): void {
    if (moving) {
      if (Math.abs(movement.x) > Math.abs(movement.y)) {
        this.playerFacing = movement.x < 0 ? "left" : "right";
      } else {
        this.playerFacing = movement.y < 0 ? "up" : "down";
      }
    }

    const presentationFacing = this.playerFacing === "left" || this.playerFacing === "right"
      ? "side"
      : this.playerFacing;
    // The authored side-facing frames look right by default, so left movement
    // is the mirrored case. Keeping this here makes player intent and visual
    // direction share a single source of truth.
    this.player.setFlipX(this.playerFacing === "left");
    const prefix = this.travelMode === "bicycle" ? "billy-bike" : "billy";
    const motion = this.travelMode === "bicycle" ? "ride" : "walk";
    this.player.anims.play(
      moving ? `${prefix}-${motion}-${presentationFacing}` : `${prefix}-idle-${presentationFacing}`,
      true,
    );
  }

  /** Drawn behind Billy so bicycle mode is visually distinct from walking. */
  private drawBicycleVisual(): void {
    const bike = this.bicycleVisual;
    if (!bike) return;
    bike.clear();
    bike.lineStyle(4, 0x202d38, 1).strokeCircle(-25, 10, 12).strokeCircle(25, 10, 12);
    bike.lineStyle(4, 0xc84c3f, 1)
      .lineBetween(-25, 10, -3, -11)
      .lineBetween(-3, -11, 8, 10)
      .lineBetween(8, 10, -25, 10)
      .lineBetween(-3, -11, 19, -11)
      .lineBetween(19, -11, 25, 10)
      .lineBetween(19, -11, 26, -21)
      .lineBetween(23, -21, 31, -21);
    bike.fillStyle(0xf2c35c, 1).fillCircle(-3, -11, 3);
  }

  private syncBicycleVisual(): void {
    this.bicycleVisual
      ?.setPosition(this.player.x, this.player.y + 28)
      .setVisible(this.travelMode === "bicycle");
  }

  private debugTeleportToObjective(): void {
    if (!import.meta.env.DEV) return;
    const target = this.getDebugObjectivePosition();
    if (!target) return;
    this.player.setPosition(target.x, target.y).setVelocity(0, 0);
    // Sprite-sheet scaling changes the Arcade body's source dimensions. Reset
    // it explicitly after a debug relocation so the next collision/interact
    // frame cannot use the previous map position.
    (this.player.body as Phaser.Physics.Arcade.Body).reset(target.x, target.y);
    // The normal update loop refreshes this on the next frame. Do it now as
    // well so a debug teleport can be inspected/interacted with immediately.
    this.nearbyInteractable = this.closestInteractable(62);
    gameEvents.emit(EVENT.hint, this.nearbyInteractable ? `E / Space — ${this.nearbyInteractable.label}` : "");
    gameEvents.emit(EVENT.toast, "Playtest: moved to the current objective.");
  }

  private handleDebugKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "F4" && !event.repeat) this.debugTeleportToObjective();
  };

  private handleRequestedInteraction(): void {
    if (!this.sys.isActive() || this.sys.isPaused() || this.inputLocked || this.time.now < this.interactionBlockedUntil) return;
    this.nearbyInteractable?.interact();
  }

  private handleInputAction(event: InputActionEvent): void {
    if (!event.pressed || inputCapture.isCaptured()) return;
    if (event.action === "toggleBicycle") {
      if (!this.bicycleAvailable || this.inputLocked) return;
      const next = this.travelMode === "bicycle" ? "walking" : "bicycle";
      this.setPlayerTravelMode(next);
      gameEvents.emit(EVENT.toast, next === "bicycle" ? "Bicycle enabled — press F to walk." : "Walking — press F to ride your bike.");
      return;
    }
    if (event.action !== "interact") return;
    // Let every listener finish handling this key event before opening world
    // dialogue. A microtask is independent of the scene clock, so an input
    // queued just before pause cannot survive and fire later on resume.
    queueMicrotask(() => this.handleRequestedInteraction());
  }

  private closestInteractable(maxDistance: number): Interactable | undefined {
    let closest: Interactable | undefined;
    let distance = maxDistance;
    for (const candidate of this.interactables) {
      if (candidate.isAvailable && !candidate.isAvailable()) continue;
      const next = Phaser.Math.Distance.Between(this.player.x, this.player.y, candidate.x, candidate.y);
      if (next < distance) {
        closest = candidate;
        distance = next;
      }
    }
    for (const candidate of this.regionInteractables) {
      if (candidate.isAvailable && !candidate.isAvailable()) continue;
      const nearestX = Phaser.Math.Clamp(
        this.player.x,
        candidate.x - candidate.width / 2,
        candidate.x + candidate.width / 2,
      );
      const nearestY = Phaser.Math.Clamp(
        this.player.y,
        candidate.y - candidate.height / 2,
        candidate.y + candidate.height / 2,
      );
      const next = Phaser.Math.Distance.Between(this.player.x, this.player.y, nearestX, nearestY);
      if (next < distance) {
        closest = candidate;
        distance = next;
      }
    }
    return closest;
  }
}
