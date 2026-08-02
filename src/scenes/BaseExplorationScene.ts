import Phaser from "phaser";
import { EVENT, gameEvents, inputCapture, type ChoiceRequest, type InputActionEvent, type TextEntryRequest } from "../game/events";
import { MushroomHuntController } from "../world/MushroomHuntController";
import { PlayerLocomotionController, REGIONAL_BICYCLE_TUNING, type PlayerTravelMode } from "../world/PlayerLocomotionController";
import type { RegionInteraction } from "../world/contracts";
import { COLLISION_GRID_TILE_SIZE, type MountedCollisionGrid, TiledRuntimeWorld, type TiledRuntimeObject, type WorldPoint } from "../world/tiledRuntime";
import { inputState } from "./InputRouterScene";
import type { DialogueLine, Interactable, MapId } from "../game/types";
import { assetUrl } from "../content/assets";
import { getMapDefinition, normalizeWorldMapPoint, type MapDefinition } from "../content/maps";

const REGIONAL_CAMERA_ZOOM = 1.35;

function snapExpansionPointToCellCenter(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.floor(point.x / COLLISION_GRID_TILE_SIZE) * COLLISION_GRID_TILE_SIZE + COLLISION_GRID_TILE_SIZE / 2,
    y: Math.floor(point.y / COLLISION_GRID_TILE_SIZE) * COLLISION_GRID_TILE_SIZE + COLLISION_GRID_TILE_SIZE / 2,
  };
}

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
  private mountedCollisionGrid?: MountedCollisionGrid;
  private tiledRuntime?: TiledRuntimeWorld;
  private geometryDebugOverlay?: Phaser.GameObjects.Container;
  private readonly dynamicObstacles = new Map<string, Phaser.GameObjects.Zone>();
  private lastEmittedPlayerX = Number.NaN;
  private lastEmittedPlayerY = Number.NaN;

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
    this.locomotion = new PlayerLocomotionController(mapId === "creek" ? undefined : REGIONAL_BICYCLE_TUNING);
    this.bicycleAvailable = false;
    this.bicycleVisual = undefined;
    this.mountedCollisionGrid?.destroy();
    this.mountedCollisionGrid = undefined;
    this.tiledRuntime = undefined;
    this.geometryDebugOverlay?.destroy(true);
    this.geometryDebugOverlay = undefined;
    for (const obstacle of this.dynamicObstacles.values()) obstacle.destroy();
    this.dynamicObstacles.clear();
    this.mapId = mapId;
    this.lastEmittedPlayerX = Number.NaN;
    this.lastEmittedPlayerY = Number.NaN;
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
    // Expansion maps use a 32px orthogonal grid. Keep player starts on cell
    // centers so a revisit never begins half a tile into a road or collision
    // corner. Creek keeps its legacy pixel-authored spawn coordinates.
    const alignedSpawn = mapId === "creek" ? spawn : snapExpansionPointToCellCenter(spawn);
    this.player = this.physics.add.sprite(alignedSpawn.x, alignedSpawn.y, "billy").setName("player");
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
    this.cameras.main.setZoom(REGIONAL_CAMERA_ZOOM);
    gameEvents.on(EVENT.interactRequested, this.handleRequestedInteraction, this);
    gameEvents.on(EVENT.inputAction, this.handleInputAction, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (import.meta.env.DEV) window.removeEventListener("keydown", this.handleDebugKeyDown);
      gameEvents.off(EVENT.interactRequested, this.handleRequestedInteraction, this);
      gameEvents.off(EVENT.inputAction, this.handleInputAction, this);
      gameEvents.emit(EVENT.dialogueCancelled);
      gameEvents.emit(EVENT.choiceCancelled);
      gameEvents.emit(EVENT.textEntryCancelled);
      this.nearbyInteractable = undefined;
      this.lastHint = "";
      gameEvents.emit(EVENT.hint, "");
      this.mushroomHunt?.dispose();
      this.mushroomHunt = undefined;
      this.mountedCollisionGrid?.destroy();
      this.mountedCollisionGrid = undefined;
      this.tiledRuntime = undefined;
      this.geometryDebugOverlay?.destroy(true);
      this.geometryDebugOverlay = undefined;
      for (const obstacle of this.dynamicObstacles.values()) obstacle.destroy();
      this.dynamicObstacles.clear();
    });
  }

  /** Loads only the map entering the scene; Boot keeps legacy Creek warm. */
  protected preloadMapAssets(definition: MapDefinition): void {
    const needsTilemap = !this.cache.tilemap.exists(definition.tiledMapKey);
    const needsTexture = definition.layers.some((layer) => !this.textures.exists(layer.textureKey));
    if (!needsTilemap && !needsTexture) return;

    const backdrop = this.add.rectangle(480, 270, 960, 540, 0x173d32, 1).setScrollFactor(0);
    const panel = this.add.rectangle(480, 270, 520, 138, 0xfff5d6, 0.98)
      .setStrokeStyle(3, 0x172735, 1)
      .setScrollFactor(0);
    const label = this.add.text(480, 238, `LOADING  •  ${definition.label.toUpperCase()}`, {
      fontFamily: "Courier New, monospace",
      fontSize: "16px",
      color: "#914833",
      fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0);
    const track = this.add.rectangle(480, 282, 390, 18, 0xd9cba9, 1).setScrollFactor(0);
    const fill = this.add.rectangle(286, 282, 0, 18, 0x315f4c, 1).setOrigin(0, 0.5).setScrollFactor(0);
    const overlay = this.add.container(0, 0, [backdrop, panel, label, track, fill]).setDepth(10_000);
    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      this.load.off("progress", update, this);
      overlay.destroy(true);
    };
    const update = (value: number): void => {
      fill.width = 390 * value;
    };
    this.load.on("progress", update, this);
    this.load.once("complete", cleanup, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup, this);

    if (needsTilemap) {
      this.load.tilemapTiledJSON(definition.tiledMapKey, assetUrl(definition.tiledMapPath));
    }
    for (const layer of definition.layers) {
      if (!this.textures.exists(layer.textureKey)) this.load.image(layer.textureKey, layer.imagePath);
    }
  }

  update(_time = 0, delta = 16.67): void {
    const movement = inputState.movement();
    const next = this.locomotion.update(movement, delta, this.inputLocked || inputCapture.isCaptured());
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
    if (Math.abs(this.player.x - this.lastEmittedPlayerX) < 1
      && Math.abs(this.player.y - this.lastEmittedPlayerY) < 1) return;
    this.lastEmittedPlayerX = this.player.x;
    this.lastEmittedPlayerY = this.player.y;
    const point = normalizeWorldMapPoint(getMapDefinition(this.mapId), this.player);
    gameEvents.emit(EVENT.playerLocationChanged, { map: this.mapId, ...point });
  }

  protected addObstacle(x: number, y: number, width: number, height: number): Phaser.GameObjects.Zone {
    const zone = this.add.zone(x + width / 2, y + height / 2, width, height);
    // StaticGroup creates the static Arcade body when the zone is added.
    // Enabling it first creates and then re-registers the same body.
    this.obstacles.add(zone);
    return zone;
  }

  /** Mounts the authored 32px collision grid and exact finite map bounds. */
  protected mountCollisionGrid(runtime: TiledRuntimeWorld): MountedCollisionGrid {
    this.tiledRuntime = runtime;
    const tileset = this.textures.exists("map.collision-grid")
      ? runtime.tilemap.addTilesetImage("collision-grid", "map.collision-grid", 32, 32, 0, 0)
      : null;
    this.mountedCollisionGrid = runtime.mountCollisionGrid({
      physicsWorld: this.physics.world,
      camera: this.cameras.main,
      colliderTarget: this.player,
      tilesets: tileset ? [tileset] : [],
      addCollider: (target, layer) => this.physics.add.collider(
        target as Phaser.Types.Physics.Arcade.ArcadeColliderType,
        layer,
      ),
    });
    for (const object of runtime.solidFootprints()) {
      if (!this.isDynamicSolid(object)) continue;
      const rectangle = this.runtimeObjectRectangle(object);
      this.dynamicObstacles.set(object.name, this.addObstacle(rectangle.x, rectangle.y, rectangle.width, rectangle.height));
    }
    return this.mountedCollisionGrid;
  }

  protected removeDynamicObstacle(name: string): void {
    const obstacle = this.dynamicObstacles.get(name);
    if (!obstacle) return;
    obstacle.destroy();
    this.dynamicObstacles.delete(name);
  }

  protected runtimeObjectRectangle(object: TiledRuntimeObject): { x: number; y: number; width: number; height: number } {
    if (typeof object.width !== "number" || typeof object.height !== "number" || object.width <= 0 || object.height <= 0) {
      throw new Error(`Invalid authored rectangle: ${object.name}`);
    }
    return { x: object.x, y: object.y, width: object.width, height: object.height };
  }

  private isDynamicSolid(object: TiledRuntimeObject): boolean {
    const properties = object.properties;
    if (!properties) return false;
    if (Array.isArray(properties)) {
      return properties.some((property) =>
        (property.name === "dynamic" || property.name === "stateful")
        && (property.value === true || property.value === "true"),
      );
    }
    const record = properties as Readonly<Record<string, unknown>>;
    return (record.dynamic === true || record.dynamic === "true"
      || record.stateful === true || record.stateful === "true");
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

  /** Opens a map-owned short-answer prompt while retaining the world lock. */
  public showTextEntry(request: TextEntryRequest): void {
    this.inputLocked = true;
    this.player.setVelocity(0, 0);
    const finish = (): void => {
      this.inputLocked = false;
      this.interactionBlockedUntil = this.time.now + 180;
    };
    gameEvents.emit(EVENT.textEntry, {
      ...request,
      onSubmit: (value) => {
        finish();
        request.onSubmit(value);
      },
      onCancel: () => {
        finish();
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
    this.afterDebugTeleportToObjective();
  }

  /** Optional development-only hook for scene-owned route shortcuts. */
  protected afterDebugTeleportToObjective(): void {}

  /**
   * F2 exposes the authored gameplay geometry over the illustrated map. It is
   * deliberately development-only: QA can compare the data layer with roofs,
   * roads, gates, and entrances without shipping debug draw calls to players.
   */
  private toggleGeometryDebugOverlay(): void {
    if (!import.meta.env.DEV) return;
    if (this.geometryDebugOverlay) {
      const visible = !this.geometryDebugOverlay.visible;
      this.geometryDebugOverlay.setVisible(visible);
      gameEvents.emit(EVENT.toast, `Geometry overlay ${visible ? "shown" : "hidden"}.`);
      return;
    }

    const runtime = this.tiledRuntime;
    const mounted = this.mountedCollisionGrid;
    if (!runtime || !mounted) {
      gameEvents.emit(EVENT.toast, "Geometry overlay unavailable on this map.");
      return;
    }

    const graphics = this.add.graphics();
    const grid = mounted.grid;
    graphics.fillStyle(0xff315f, 0.16);
    graphics.lineStyle(1, 0xff315f, 0.42);
    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        if (!grid.isBlocked({ x, y })) continue;
        const bounds = grid.cellBounds({ x, y });
        graphics.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        graphics.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      }
    }
    graphics.lineStyle(3, 0xffffff, 0.95);
    graphics.strokeRect(mounted.bounds.x, mounted.bounds.y, mounted.bounds.width, mounted.bounds.height);

    const children: Phaser.GameObjects.GameObject[] = [graphics];
    const colorFor = (type: string): number => {
      if (type.includes("spawn")) return 0x38f28a;
      if (type.includes("transition")) return 0x34c6ff;
      if (type.includes("waypoint") || type.includes("route")) return 0xffd43b;
      if (type.includes("interaction") || type.includes("npc") || type.includes("landmark")) return 0xd988ff;
      if (type.includes("solid")) return 0xff744f;
      if (type.includes("qa")) return 0xffffff;
      return 0x65f5e7;
    };
    const cssColor = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

    for (const object of runtime.debugObjects()) {
      const type = `${object.type || object.class || "object"}`.toLowerCase();
      const color = colorFor(type);
      const width = object.width ?? 0;
      const height = object.height ?? 0;
      graphics.lineStyle(3, color, 0.96);
      if (width > 0 && height > 0) {
        graphics.fillStyle(color, 0.12);
        graphics.fillRect(object.x, object.y, width, height);
        graphics.strokeRect(object.x, object.y, width, height);
      } else {
        graphics.fillStyle(color, 1);
        graphics.fillCircle(object.x, object.y, 6);
        graphics.strokeCircle(object.x, object.y, 11);
      }
      if (type.includes("solid") || type.includes("qa")) continue;
      const label = this.add.text(object.x + 7, object.y - 7, object.name, {
        fontFamily: "Courier New, monospace",
        fontSize: "10px",
        fontStyle: "bold",
        color: cssColor(color),
        backgroundColor: "#07111dcc",
        padding: { x: 3, y: 1 },
      }).setOrigin(0, 1);
      children.push(label);
    }

    this.geometryDebugOverlay = this.add.container(0, 0, children).setDepth(9_000);
    gameEvents.emit(EVENT.toast, "Geometry overlay shown — F2 toggles it.");
  }

  private handleDebugKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (event.code === "F2") this.toggleGeometryDebugOverlay();
    if (event.code === "F4") this.debugTeleportToObjective();
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
      gameEvents.emit(EVENT.toast, next === "bicycle"
        ? "Bicycle enabled — F, gamepad X / Square, or BIKE to walk."
        : "Walking — F, gamepad X / Square, or BIKE to ride.");
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
