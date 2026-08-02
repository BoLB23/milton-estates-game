import Phaser from "phaser";

import { STONEHENGE_ROUTE } from "../content/ryanRideRoutes";
import { getIllustratedMapLayers, STONEHENGE_MAP } from "../content/maps";
import { EVENT, gameEvents } from "../game/events";
import { gameStore } from "../game/GameStore";
import { RyanRouteFollower } from "../world/ryanRide/RouteFollower";
import { TiledRuntimeWorld } from "../world/tiledRuntime";
import { BaseExplorationScene } from "./BaseExplorationScene";

/** The former road leg is now the authored Stonehenge regional map. */
export class StonehengeScene extends BaseExplorationScene {
  private tiledWorld!: TiledRuntimeWorld;
  private follower?: RyanRouteFollower;
  private ryan?: Phaser.Physics.Arcade.Sprite;

  public constructor() { super("stonehenge"); }

  public preload(): void {
    this.preloadMapAssets(STONEHENGE_MAP);
  }

  public create(data?: { spawn?: "milton" | "reidenbaugh" }): void {
    gameStore.setCurrentMap("stonehenge");
    this.tiledWorld = new TiledRuntimeWorld(this.make.tilemap({ key: STONEHENGE_MAP.tiledMapKey }));
    const activeRide = gameStore.isRyanRideStage("ride_stonehenge");
    const spawnName = activeRide || data?.spawn !== "reidenbaugh" ? "spawn_milton" : "spawn_reidenbaugh";
    this.initializeWorld("stonehenge", this.tiledWorld.point(spawnName));
    this.mountCollisionGrid(this.tiledWorld);
    this.drawWorld();
    if (activeRide) this.startRide();
    else this.mountFreeTravel();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.follower?.stop();
      this.follower = undefined;
      this.ryan?.destroy();
      this.ryan = undefined;
    });
  }

  public override objectPoint(name: string) { return this.tiledWorld.point(name); }

  public override update(time: number, delta: number): void {
    super.update(time, delta);
    this.follower?.update();
  }

  private drawWorld(): void {
    for (const layer of getIllustratedMapLayers("stonehenge")) {
      this.add.image(layer.x, layer.y, layer.textureKey)
        .setOrigin(0, 0)
        .setDepth(layer.depth);
    }
  }

  private startRide(): void {
    this.setPlayerTravelMode("bicycle");
    const start = this.tiledWorld.point("stonehenge_route_00");
    this.ryan = this.physics.add.sprite(start.x, start.y, "ryan")
      .setScale(1.2)
      .setDepth(49)
      .setName("ryan-stonehenge");
    this.follower = new RyanRouteFollower({
      time: this.time,
      objectPoint: (id) => this.tiledWorld.point(id),
      playerPosition: () => this.getPlayerPosition(),
      addCallout: (text) => gameEvents.emit(EVENT.toast, `Ryan: ${text}`),
    }, this.ryan, STONEHENGE_ROUTE, () => this.completeRide());
    gameEvents.emit(EVENT.toast, "Keep Ryan in sight through the Stonehenge roundabout.");
  }

  private completeRide(): void {
    if (!gameStore.isRyanRideStage("ride_stonehenge")) return;
    this.follower?.stop();
    gameStore.reachReidenbaugh();
    this.scene.start("reidenbaugh", { spawn: "stonehenge" });
  }

  private mountFreeTravel(): void {
    if (!gameStore.isBicycleUnlocked()) return;
    this.enableBicycleToggle();
    this.setPlayerTravelMode("bicycle");
    this.mountTransition("exit_milton", "Return to Milton Estates", "neighborhood", { spawn: "stonehenge" });
    this.mountTransition("exit_reidenbaugh", "Enter Reidenbaugh Elementary", "reidenbaugh", { spawn: "stonehenge" });
    for (const [objectId, label, text] of [
      ["stonehenge_gate", "Look toward Stonehenge", "The old stone circle rises beyond the neighborhood road."],
      ["roundabout", "Inspect the roundabout", "Every branch of the roundabout points toward another part of Milton."],
      ["stonehenge_lookout", "Pause at the lookout", "From here, Billy can trace the road back home and up toward the school."],
    ] as const) {
      const point = this.tiledWorld.point(objectId);
      this.registerInteraction({
        id: objectId,
        ...point,
        label,
        interact: () => this.showDialogue([{ speaker: "Billy", text }]),
      });
    }
  }

  private mountTransition(
    objectId: "exit_milton" | "exit_reidenbaugh",
    label: string,
    destination: "neighborhood" | "reidenbaugh",
    data: { spawn: "home" | "stonehenge" },
  ): void {
    const rectangle = this.tiledWorld.rectangle(objectId);
    this.registerRegionInteraction({
      id: objectId,
      x: rectangle.x + rectangle.width / 2,
      y: rectangle.y + rectangle.height / 2,
      width: rectangle.width,
      height: rectangle.height,
      label,
      isAvailable: () => gameStore.isMapUnlocked(destination),
      interact: () => {
        gameStore.setCurrentMap(destination);
        this.scene.start(destination, data);
      },
    });
  }

  protected override afterDebugTeleportToObjective(): void {
    if (!import.meta.env.DEV || !gameStore.isRyanRideStage("ride_stonehenge")) return;
    this.follower?.completeForDebug();
  }

  protected override getDebugObjectivePosition(): { x: number; y: number } {
    if (gameStore.isRyanRideStage("ride_stonehenge")) {
      return this.follower?.getCurrentTarget() ?? this.tiledWorld.point("stonehenge_route_12");
    }
    return this.tiledWorld.point("exit_reidenbaugh");
  }
}
