import Phaser from "phaser";
import { EVENT, gameEvents, inputCapture, type ChoiceRequest, type InputActionEvent, type TextEntryRequest } from "../game/events";
import { MushroomHuntController } from "../world/MushroomHuntController";
import { PickupController } from "../world/PickupController";
import { PlayerLocomotionController, REGIONAL_BICYCLE_TUNING, type PlayerTravelMode } from "../world/PlayerLocomotionController";
import type { RegionInteraction } from "../world/contracts";
import { COLLISION_GRID_TILE_SIZE, type MountedCollisionGrid, TiledRuntimeWorld, type TiledRuntimeObject, type WorldPoint } from "../world/tiledRuntime";
import { inspectCollisionPoint, type CollisionInspectionResult } from "../world/collisionInspection";
import { inputState } from "./InputRouterScene";
import type { DialogueLine, Interactable, MapId, GameState } from "../game/types";
import { gameStore } from "../game/GameStore";
import { assetUrl } from "../content/assets";
import { getMapDefinition, normalizeWorldMapPoint, type MapDefinition } from "../content/maps";
import type { MapEditorController } from "../mapEditor/MapEditorController";
import { PlayerAvatar } from "../world/PlayerAvatar";

const REGIONAL_CAMERA_ZOOM = 1.35;
const PLAYER_ORIGIN_X = 0.5;
// Authored map points represent the character's contact point with the world.
// The normalized player atlas uses a bottom-center contact anchor.
const PLAYER_ORIGIN_Y = 0.9;

export abstract class BaseExplorationScene extends Phaser.Scene {
  protected player!: Phaser.Physics.Arcade.Sprite;
  private playerAvatar?: PlayerAvatar;
  protected obstacles!: Phaser.Physics.Arcade.StaticGroup;
  protected interactables: Interactable[] = [];
  private regionInteractables: RegionInteraction[] = [];
  protected inputLocked = false;
  private interactionBlockedUntil = 0;
  private lastHint = "";
  private nearbyInteractable?: Interactable;
  private playerFacing: "up" | "down" | "left" | "right" = "down";
  private mushroomHunt?: MushroomHuntController;
  private pickupController?: PickupController;
  private locomotion = new PlayerLocomotionController();
  private travelMode: PlayerTravelMode = "walking";
  private bicycleVisual?: Phaser.GameObjects.Graphics;
  private scriptedTransportOverride: PlayerTravelMode | null = null;
  private mapId!: MapId;
  private mountedCollisionGrid?: MountedCollisionGrid;
  private tiledRuntime?: TiledRuntimeWorld;
  private geometryDebugOverlay?: Phaser.GameObjects.Container;
  private playerGeometryDebug?: Phaser.GameObjects.Graphics;
  private collisionInspectionText?: Phaser.GameObjects.Text;
  private collisionInspectionEnabled = false;
  private mapEditor?: MapEditorController;
  private mapEditorOpening = false;
  private readonly dynamicObstacles = new Map<string, Phaser.GameObjects.Zone>();
  private lastEmittedPlayerX = Number.NaN;
  private lastEmittedPlayerY = Number.NaN;
  private lastCheckpointAt = Number.NEGATIVE_INFINITY;
  private worldPaused = false;
  private initialSpawnCheckpointed = false;

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
    this.scriptedTransportOverride = null;
    this.bicycleVisual = undefined;
    this.mountedCollisionGrid?.destroy();
    this.mountedCollisionGrid = undefined;
    this.tiledRuntime = undefined;
    this.geometryDebugOverlay?.destroy(true);
    this.geometryDebugOverlay = undefined;
    this.playerGeometryDebug = undefined;
    this.collisionInspectionText?.destroy();
    this.collisionInspectionText = undefined;
    this.collisionInspectionEnabled = false;
    this.playerAvatar?.destroy();
    this.playerAvatar = undefined;
    this.mapEditor = undefined;
    this.mapEditorOpening = false;
    for (const obstacle of this.dynamicObstacles.values()) obstacle.destroy();
    this.dynamicObstacles.clear();
    this.mapId = mapId;
    this.lastEmittedPlayerX = Number.NaN;
    this.lastEmittedPlayerY = Number.NaN;
    this.lastCheckpointAt = Number.NEGATIVE_INFINITY;
    this.worldPaused = false;
    this.initialSpawnCheckpointed = false;
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
    this.pickupController = new PickupController({
      world: this,
      registerInteraction: (interactable) => this.registerInteraction(interactable),
      unregisterInteraction: (id) => this.unregisterInteraction(id),
    });
    gameEvents.emit(EVENT.hint, "");

    this.obstacles = this.physics.add.staticGroup();
    // Authored contact points remain pixel-precise. The collision mask is a
    // rendering/physics detail and must not quantize NPCs, spawns, or routes.
    this.player = this.physics.add.sprite(spawn.x, spawn.y, "player").setName("player");
    this.player
      .setDepth(50)
      // Match the former 400×450 player at scale 0.18 (~81px tall).
      .setScale(0.4)
      .setOrigin(PLAYER_ORIGIN_X, PLAYER_ORIGIN_Y)
      .setCollideWorldBounds(true)
      .setSize(78, 42)
      .setOffset(25, 58);
    this.playerAvatar = PlayerAvatar.attachToGameplaySprite(this, this.player, gameStore.getPlayerProfile());
    this.bicycleVisual = this.add.graphics().setDepth(49).setVisible(false);
    this.drawBicycleVisual();
    this.syncEffectiveTransport();
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
    gameEvents.on(EVENT.stateChanged, this.handleStateChanged, this);
    this.events.on(Phaser.Scenes.Events.PAUSE, this.handleWorldPause, this);
    this.events.on(Phaser.Scenes.Events.RESUME, this.handleWorldResume, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (import.meta.env.DEV) window.removeEventListener("keydown", this.handleDebugKeyDown);
      gameEvents.off(EVENT.interactRequested, this.handleRequestedInteraction, this);
      gameEvents.off(EVENT.inputAction, this.handleInputAction, this);
      gameEvents.off(EVENT.stateChanged, this.handleStateChanged, this);
      this.events.off(Phaser.Scenes.Events.PAUSE, this.handleWorldPause, this);
      this.events.off(Phaser.Scenes.Events.RESUME, this.handleWorldResume, this);
      gameEvents.emit(EVENT.dialogueCancelled);
      gameEvents.emit(EVENT.choiceCancelled);
      gameEvents.emit(EVENT.textEntryCancelled);
      this.nearbyInteractable = undefined;
      this.lastHint = "";
      gameEvents.emit(EVENT.hint, "");
      this.mushroomHunt?.dispose();
      this.mushroomHunt = undefined;
      this.pickupController?.dispose();
      this.pickupController = undefined;
      this.mountedCollisionGrid?.destroy();
      this.mountedCollisionGrid = undefined;
      this.tiledRuntime = undefined;
      this.geometryDebugOverlay?.destroy(true);
      this.geometryDebugOverlay = undefined;
      this.playerGeometryDebug = undefined;
      this.collisionInspectionText?.destroy();
      this.collisionInspectionText = undefined;
      this.collisionInspectionEnabled = false;
      this.playerAvatar?.destroy();
      this.playerAvatar = undefined;
      void this.mapEditor?.close(true);
      this.mapEditor = undefined;
      this.mapEditorOpening = false;
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

  /** Draws calibrated TMJ artwork using MapDefinition only as the asset catalog. */
  protected drawAuthoredArtwork(definition: MapDefinition, runtime: TiledRuntimeWorld): void {
    definition.layers.forEach((layer, index) => {
      const texture = this.textures.get(layer.textureKey).getSourceImage() as { width?: number; height?: number };
      const transform = runtime.artworkTransform(layer.role, index, {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        cropX: 0,
        cropY: 0,
        cropWidth: texture.width ?? layer.width,
        cropHeight: texture.height ?? layer.height,
        depth: layer.depth,
      });
      this.add.image(transform.x, transform.y, layer.textureKey)
        .setOrigin(0, 0)
        .setCrop(transform.cropX, transform.cropY, transform.cropWidth, transform.cropHeight)
        .setDisplaySize(transform.width, transform.height)
        .setDepth(transform.depth ?? layer.depth);
    });
  }

  update(_time = 0, delta = 16.67): void {
    const movement = inputState.movement();
    const next = this.locomotion.update(movement, delta, this.inputLocked || inputCapture.isCaptured());
    this.player.setVelocity(next.velocityX, next.velocityY);
    this.updatePlayerPresentation({ x: next.velocityX, y: next.velocityY }, next.speed > 0);
    this.playerAvatar?.syncFromBody();
    this.syncBicycleVisual();
    this.drawPlayerGeometryDebug();
    this.updateCollisionInspection();
    this.emitPlayerLocation();
    this.checkpointPlayerLocation();

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

  private checkpointPlayerLocation(force = false): void {
    if (!force && this.time.now - this.lastCheckpointAt < 1_000) return;
    const point = normalizeWorldMapPoint(getMapDefinition(this.mapId), this.player);
    gameStore.setLastKnownLocation({ map: this.mapId, ...point });
    this.lastCheckpointAt = this.time.now;
  }

  protected addObstacle(x: number, y: number, width: number, height: number): Phaser.GameObjects.Zone {
    const zone = this.add.zone(x + width / 2, y + height / 2, width, height);
    // StaticGroup creates the static Arcade body when the zone is added.
    // Enabling it first creates and then re-registers the same body.
    this.obstacles.add(zone);
    return zone;
  }

  /** Mounts the authored regional collision grid and exact finite map bounds. */
  protected mountCollisionGrid(runtime: TiledRuntimeWorld): MountedCollisionGrid {
    this.tiledRuntime = runtime;
    this.pickupController?.mount(runtime);
    const tileset = this.textures.exists("map.collision-grid")
      ? runtime.tilemap.addTilesetImage(
        "collision-grid",
        "map.collision-grid",
        COLLISION_GRID_TILE_SIZE,
        COLLISION_GRID_TILE_SIZE,
        0,
        0,
      )
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
    this.resolveInitialSpawn(this.mountedCollisionGrid.grid);
    return this.mountedCollisionGrid;
  }

  /** Registers a Tiled world that has legacy rectangle collision instead of a tile grid. */
  protected setTiledRuntime(runtime: TiledRuntimeWorld): void {
    this.tiledRuntime = runtime;
    this.pickupController?.mount(runtime);
    this.resolveInitialSpawn();
  }

  /**
   * Resume coordinates are normalized and only committed after the scene's
   * bounds/collision are live. Invalid or newly-blocked points move to the
   * nearest safe grid cell instead of trapping the player in scenery.
   */
  private resolveInitialSpawn(grid?: MountedCollisionGrid["grid"]): void {
    if (this.initialSpawnCheckpointed) return;
    const saved = gameStore.getCanonicalState().lastKnownLocation;
    if (gameStore.getSpawnIntent() === "resume" && saved.map === this.mapId) {
      const definition = getMapDefinition(this.mapId);
      let point = { x: saved.x * definition.worldWidth, y: saved.y * definition.worldHeight };
      if (grid) point = this.nearestSafePoint(grid, point);
      else {
        point.x = Phaser.Math.Clamp(point.x, 1, definition.worldWidth - 1);
        point.y = Phaser.Math.Clamp(point.y, 1, definition.worldHeight - 1);
      }
      this.player.setPosition(point.x, point.y).setVelocity(0, 0);
      (this.player.body as Phaser.Physics.Arcade.Body).reset(point.x, point.y);
    }
    gameStore.setSpawnIntent("regional-transition");
    this.emitPlayerLocation();
    this.checkpointPlayerLocation(true);
    this.initialSpawnCheckpointed = true;
  }

  private nearestSafePoint(grid: MountedCollisionGrid["grid"], requested: WorldPoint): WorldPoint {
    if (grid.isPointWalkable(requested)) return requested;
    const initial = grid.pointToCell(requested);
    if (!initial) return grid.cellCenter({ x: 0, y: 0 });
    for (let radius = 1; radius < Math.max(grid.width, grid.height); radius += 1) {
      for (let y = initial.y - radius; y <= initial.y + radius; y += 1) {
        for (let x = initial.x - radius; x <= initial.x + radius; x += 1) {
          if (Math.abs(x - initial.x) !== radius && Math.abs(y - initial.y) !== radius) continue;
          if (grid.isWalkable({ x, y })) return grid.cellCenter({ x, y });
        }
      }
    }
    return grid.cellCenter({ x: 0, y: 0 });
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
      // Authored dialogue uses "You" as a stable content token; show the
      // authenticated player's nickname without storing identity in quest data.
      lines: lines.map((line) => ({
        ...line,
        speaker: line.speaker === "You" ? (gameStore.getPlayerProfile()?.nickname ?? "You") : line.speaker,
      })),
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
    if (mode === "bicycle") {
      // Keep the player's feet at the authored contact point, but tighten the
      // display slightly so his hips sit over the bicycle saddle instead of
      // reading as a standing character floating above it.
      this.player
        .setScale(0.36)
        .setOrigin(PLAYER_ORIGIN_X, 0.92)
        .setSize(78, 42)
        .setOffset(25, 58);
    } else {
      this.player
        .setScale(0.4)
        .setOrigin(PLAYER_ORIGIN_X, PLAYER_ORIGIN_Y)
        .setSize(78, 42)
        .setOffset(25, 58);
    }
    (this.player.body as Phaser.Physics.Arcade.Body).reset(this.player.x, this.player.y);
    this.playerAvatar?.syncFromBody();
    this.syncBicycleVisual();
  }

  protected setScriptedTransportOverride(mode: PlayerTravelMode | null): void {
    this.scriptedTransportOverride = mode;
    if (!this.worldPaused) this.syncEffectiveTransport();
  }

  protected syncEffectiveTransport(): void {
    if (!this.player?.active) return;
    const forcedMapTransport: PlayerTravelMode | null = this.mapId === "creek"
      ? "walking"
      : this.mapId === "fruitville_pike" ? "bicycle" : null;
    const effectiveTransport = this.scriptedTransportOverride
      ?? forcedMapTransport
      ?? (gameStore.getState().equipment.transport ?? "walking");
    this.setPlayerTravelMode(effectiveTransport);
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
    // The authored side-facing frames look left by default, so right movement
    // is the mirrored case. Keeping this here makes player intent and visual
    // direction share a single source of truth.
    this.player.setFlipX(this.playerFacing === "right");
    const prefix = this.travelMode === "bicycle" ? "player-bike" : "player";
    const motion = this.travelMode === "bicycle" ? "ride" : "walk";
    this.player.anims.play(
      moving ? `${prefix}-${motion}-${presentationFacing}` : `${prefix}-idle-${presentationFacing}`,
      true,
    );
  }

  /**
   * Drawn behind the player so the bike reads as a vehicle rather than a detached
   * icon. The frame follows the project's illustrated 2px-detail language,
   * with enough silhouette and hardware detail to remain legible at map zoom.
   */
  private drawBicycleVisual(): void {
    const bike = this.bicycleVisual;
    if (!bike) return;
    const rearWheel = { x: -38, y: 10 };
    const frontWheel = { x: 38, y: 10 };
    const saddle = { x: -14, y: -20 };
    const crank = { x: 0, y: 10 };
    const headset = { x: 27, y: -10 };

    bike.clear();

    // Cool afternoon shadow, offset southeast like the rest of the world art.
    bike.fillStyle(0x173026, 0.22).fillEllipse(0, 31, 112, 13);

    // Tires, rims, hubs, and spokes give the wheels a proper bicycle read.
    bike.lineStyle(7, 0x18252f, 1)
      .strokeCircle(rearWheel.x, rearWheel.y, 18)
      .strokeCircle(frontWheel.x, frontWheel.y, 18);
    bike.lineStyle(2, 0xb8c3bd, 0.8)
      .strokeCircle(rearWheel.x, rearWheel.y, 13)
      .strokeCircle(frontWheel.x, frontWheel.y, 13);
    for (const wheel of [rearWheel, frontWheel]) {
      bike.lineStyle(1, 0x9caeac, 0.62);
      for (const angle of [0, Math.PI / 4, Math.PI / 2, (Math.PI * 3) / 4]) {
        const dx = Math.cos(angle) * 13;
        const dy = Math.sin(angle) * 13;
        bike.lineBetween(wheel.x - dx, wheel.y - dy, wheel.x + dx, wheel.y + dy);
      }
      bike.fillStyle(0x52656b, 1).fillCircle(wheel.x, wheel.y, 3);
      bike.fillStyle(0xe8c15f, 1).fillCircle(wheel.x, wheel.y, 1.5);
    }

    // Mudguards sit just above the tire arcs and keep the silhouette readable.
    bike.lineStyle(2, 0x31434a, 0.95)
      .beginPath().arc(rearWheel.x, rearWheel.y, 21, Math.PI, Math.PI * 2, false, 0).strokePath()
      .beginPath().arc(frontWheel.x, frontWheel.y, 21, Math.PI, Math.PI * 2, false, 0).strokePath();

    // Outline the frame first, then add the warm red/orange painted tubing.
    const frameSegments = [
      [rearWheel.x, rearWheel.y, saddle.x, saddle.y],
      [saddle.x, saddle.y, crank.x, crank.y],
      [crank.x, crank.y, rearWheel.x, rearWheel.y],
      [saddle.x, saddle.y, headset.x, headset.y],
      [headset.x, headset.y, crank.x, crank.y],
      [headset.x, headset.y, frontWheel.x, frontWheel.y],
    ] as const;
    bike.lineStyle(7, 0x572f31, 1);
    for (const [x1, y1, x2, y2] of frameSegments) bike.lineBetween(x1, y1, x2, y2);
    bike.lineStyle(4, 0xc84c3f, 1);
    for (const [x1, y1, x2, y2] of frameSegments) bike.lineBetween(x1, y1, x2, y2);

    // Painted highlights make the frame feel dimensional instead of symbolic.
    bike.lineStyle(1.5, 0xf0785e, 0.9)
      .lineBetween(saddle.x + 2, saddle.y + 2, crank.x - 1, crank.y - 2)
      .lineBetween(saddle.x + 3, saddle.y + 1, headset.x - 3, headset.y + 1)
      .lineBetween(headset.x - 2, headset.y + 2, frontWheel.x - 2, frontWheel.y - 5);

    // Seat post, padded saddle, handlebars, brake lever, and bell.
    bike.lineStyle(3, 0x27343b, 1).lineBetween(saddle.x, saddle.y, saddle.x - 2, saddle.y - 8);
    bike.fillStyle(0x28343a, 1).fillRoundedRect(saddle.x - 10, saddle.y - 11, 18, 5, 2);
    bike.fillStyle(0x5d6d70, 1).fillRoundedRect(saddle.x - 7, saddle.y - 10, 12, 2, 1);
    bike.lineStyle(3, 0x27343b, 1).lineBetween(headset.x, headset.y, headset.x + 5, headset.y - 13);
    bike.lineStyle(3, 0x27343b, 1)
      .lineBetween(headset.x + 5, headset.y - 13, headset.x + 14, headset.y - 13)
      .lineBetween(headset.x + 8, headset.y - 13, headset.x + 11, headset.y - 8);
    bike.lineStyle(2, 0x8a4740, 1).lineBetween(headset.x + 8, headset.y - 12, headset.x + 13, headset.y - 12);
    bike.fillStyle(0xe8c15f, 1).fillCircle(headset.x + 7, headset.y - 16, 2);

    // Chain, crank, pedals, and safety reflectors finish the mechanical read.
    bike.lineStyle(1.5, 0x66716e, 0.92)
      .beginPath().arc(crank.x, crank.y, 6, 0, Math.PI * 2, false, 0).strokePath()
      .lineBetween(rearWheel.x + 2, rearWheel.y + 2, crank.x - 4, crank.y + 2)
      .lineBetween(rearWheel.x + 2, rearWheel.y - 2, crank.x - 4, crank.y - 2);
    bike.lineStyle(2, 0x27343b, 1).lineBetween(crank.x + 3, crank.y + 3, crank.x + 9, crank.y + 8);
    bike.fillStyle(0x27343b, 1).fillRoundedRect(crank.x + 7, crank.y + 7, 8, 3, 1);
    bike.fillStyle(0xf1c65b, 1).fillCircle(rearWheel.x - 16, rearWheel.y - 17, 2).fillCircle(frontWheel.x + 15, frontWheel.y - 17, 2);
  }

  private syncBicycleVisual(): void {
    this.bicycleVisual
      ?.setPosition(this.player.x, this.player.y - 2)
      .setScale(this.player.flipX ? -0.6 : 0.6, 0.6)
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
    if (!runtime) {
      gameEvents.emit(EVENT.toast, "Geometry overlay unavailable on this map.");
      return;
    }

    const graphics = this.add.graphics();
    if (mounted) {
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
      graphics.lineStyle(1, 0x65f5e7, 0.22);
      for (let x = 0; x <= grid.width; x += 1) {
        graphics.lineBetween(x * grid.tileSize, 0, x * grid.tileSize, grid.worldHeight);
      }
      for (let y = 0; y <= grid.height; y += 1) {
        graphics.lineBetween(0, y * grid.tileSize, grid.worldWidth, y * grid.tileSize);
      }
    }
    graphics.lineStyle(3, 0xffffff, 0.95);
    const worldBounds = mounted?.bounds ?? runtime.worldBounds;
    graphics.strokeRect(worldBounds.x, worldBounds.y, worldBounds.width, worldBounds.height);

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

    this.playerGeometryDebug = this.add.graphics();
    children.push(this.playerGeometryDebug);
    this.geometryDebugOverlay = this.add.container(0, 0, children).setDepth(9_000);
    this.drawPlayerGeometryDebug();
    gameEvents.emit(EVENT.toast, mounted
      ? "Geometry overlay shown — F2 toggles it."
      : "Geometry overlay shown — legacy rectangle collision; F2 toggles it.");
  }

  /** Draws the player origin, visible bounds, feet anchor, and Arcade body. */
  private drawPlayerGeometryDebug(): void {
    const graphics = this.playerGeometryDebug;
    if (!graphics || !this.player?.active) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const bounds = this.player.getBounds();
    graphics.clear();

    graphics.lineStyle(2, 0x00ff72, 0.95);
    graphics.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    graphics.lineBetween(this.player.x - 12, this.player.y, this.player.x + 12, this.player.y);
    graphics.lineBetween(this.player.x, this.player.y - 12, this.player.x, this.player.y + 12);
    graphics.fillStyle(0xffe34d, 1);
    graphics.fillCircle(this.player.x, this.player.y, 4);

    graphics.lineStyle(2, 0xff3b5f, 1);
    graphics.strokeRect(body.x, body.y, body.width, body.height);
    graphics.lineStyle(1, 0xff3b5f, 0.8);
    graphics.lineBetween(body.center.x - 8, body.center.y, body.center.x + 8, body.center.y);
    graphics.lineBetween(body.center.x, body.center.y - 8, body.center.x, body.center.y + 8);
  }

  /** F6 exposes camera-correct player and pointer coordinates for collision authoring. */
  private toggleCollisionInspection(): void {
    if (!import.meta.env.DEV) return;

    this.collisionInspectionEnabled = !this.collisionInspectionEnabled;
    if (!this.collisionInspectionEnabled) {
      this.collisionInspectionText?.setVisible(false);
      gameEvents.emit(EVENT.toast, "Collision inspector hidden.");
      return;
    }

    if (!this.collisionInspectionText) {
      this.collisionInspectionText = this.add.text(16, 145, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#d8ffe6",
        backgroundColor: "#071511ee",
        padding: { x: 9, y: 7 },
        align: "left",
        lineSpacing: 2,
      })
        .setOrigin(0, 0)
        .setDepth(10_001);
    }
    this.collisionInspectionText.setVisible(true);
    this.updateCollisionInspection();
    gameEvents.emit(EVENT.toast, "Collision inspector shown — F6 toggles it.");
  }

  private updateCollisionInspection(): void {
    if (!this.collisionInspectionEnabled || !this.collisionInspectionText || !this.player?.active) return;

    const pointer = this.input.activePointer;
    const pointerWorld = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const playerPoint = { x: this.player.x, y: this.player.y };
    const playerStatus = inspectCollisionPoint(this.mountedCollisionGrid?.grid, playerPoint);
    const pointerStatus = inspectCollisionPoint(this.mountedCollisionGrid?.grid, pointerWorld);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const gridLabel = this.mountedCollisionGrid
      ? `${this.mountedCollisionGrid.grid.width}x${this.mountedCollisionGrid.grid.height} @ ${this.mountedCollisionGrid.grid.tileSize}px`
      : "unavailable (legacy collision-rects)";

    this.positionCollisionInspection();

    this.collisionInspectionText.setText([
      "COLLISION INSPECTOR  •  F6",
      `map: ${this.mapId}`,
      `grid: ${gridLabel}`,
      `player world: ${this.formatWorldPoint(playerPoint)}`,
      `player cell: ${this.formatCell(playerStatus)}`,
      `player blocked: ${this.formatStatus(playerStatus)}`,
      `body: ${this.formatBody(body)}`,
      `pointer world: ${this.formatWorldPoint(pointerWorld)}`,
      `pointer cell: ${this.formatCell(pointerStatus)}`,
      `pointer blocked: ${this.formatStatus(pointerStatus)}`,
      "F2: geometry overlay  •  F3: state panel",
    ]);
  }

  /** Keeps the world-scene text at a fixed screen inset despite camera scroll and zoom. */
  private positionCollisionInspection(): void {
    const text = this.collisionInspectionText;
    if (!text) return;

    const camera = this.cameras.main;
    text.setPosition(
      camera.worldView.x + 16 / camera.zoomX,
      camera.worldView.y + 145 / camera.zoomY,
    );
  }

  private formatWorldPoint(point: WorldPoint): string {
    return `(${this.formatNumber(point.x)}, ${this.formatNumber(point.y)})`;
  }

  private formatCell(result: CollisionInspectionResult): string {
    return result.cell ? `(${result.cell.x}, ${result.cell.y})` : "—";
  }

  private formatStatus(result: CollisionInspectionResult): string {
    switch (result.status) {
      case "walkable": return "WALKABLE";
      case "blocked": return "BLOCKED";
      case "out-of-bounds": return "OUT OF BOUNDS";
      case "unavailable": return "N/A";
    }
  }

  private formatBody(body: Phaser.Physics.Arcade.Body): string {
    return `x${this.formatNumber(body.x)}, y${this.formatNumber(body.y)}, w${this.formatNumber(body.width)}, h${this.formatNumber(body.height)}`;
  }

  private formatNumber(value: number): string {
    return Number.isFinite(value) ? value.toFixed(1) : "—";
  }

  private handleDebugKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (event.code === "F2") this.toggleGeometryDebugOverlay();
    if (event.code === "F6") this.toggleCollisionInspection();
    if (event.code === "F4") this.debugTeleportToObjective();
    if (event.code === "F7") void this.toggleMapEditor();
  };

  /** Opens the authoring overlay against the exact running map and camera. */
  private async toggleMapEditor(): Promise<void> {
    if (!import.meta.env.DEV || this.mapEditorOpening) return;
    if (this.mapEditor?.isOpen()) {
      await this.mapEditor.close();
      this.mapEditor = undefined;
      return;
    }
    if (this.inputLocked) {
      gameEvents.emit(EVENT.toast, "Close the current dialogue before opening the map editor.");
      return;
    }
    this.mapEditorOpening = true;
    this.inputLocked = true;
    this.player.setVelocity(0, 0);
    this.cameras.main.stopFollow();
    try {
      const { MapEditorController } = await import("../mapEditor/MapEditorController");
      const definition = getMapDefinition(this.mapId);
      this.mapEditor = await MapEditorController.open({
        scene: this,
        mapId: this.mapId,
        onClose: () => {
          if (!this.player?.active) return;
          this.inputLocked = false;
          this.cameras.main.setZoom(REGIONAL_CAMERA_ZOOM);
          this.cameras.main.startFollow(this.player, true, 0.2, 0.2);
        },
        onRestart: () => {
          this.cache.tilemap.remove(definition.tiledMapKey);
          this.scene.restart(this.sys.getData());
        },
      });
      gameEvents.emit(EVENT.toast, "Map editor open — F7 closes it.");
    } catch (error) {
      this.inputLocked = false;
      this.cameras.main.startFollow(this.player, true, 0.2, 0.2);
      gameEvents.emit(EVENT.toast, error instanceof Error ? error.message : "Unable to open map editor.");
    } finally {
      this.mapEditorOpening = false;
    }
  }

  private handleRequestedInteraction(): void {
    if (!this.sys.isActive() || this.sys.isPaused() || this.inputLocked || this.time.now < this.interactionBlockedUntil) return;
    this.nearbyInteractable?.interact();
  }

  private handleInputAction(event: InputActionEvent): void {
    if (!event.pressed || inputCapture.isCaptured()) return;
    if (event.action !== "interact") return;
    // Let every listener finish handling this key event before opening world
    // dialogue. A microtask is independent of the scene clock, so an input
    // queued just before pause cannot survive and fire later on resume.
    queueMicrotask(() => this.handleRequestedInteraction());
  }

  private handleStateChanged = (_state: GameState): void => {
    this.playerAvatar?.setProfile(gameStore.getPlayerProfile());
    if (this.worldPaused || this.sys.isPaused()) return;
    this.syncEffectiveTransport();
  };

  private handleWorldPause = (): void => {
    this.worldPaused = true;
  };

  private handleWorldResume = (): void => {
    this.worldPaused = false;
    this.syncEffectiveTransport();
  };

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
