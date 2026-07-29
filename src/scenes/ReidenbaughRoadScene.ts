import Phaser from "phaser";
import { REIDENBAUGH_ROAD_ROUTE } from "../content/ryanRideRoutes";
import { REIDENBAUGH_ROAD_MAP, getIllustratedMapLayers } from "../content/maps";
import { EVENT, gameEvents } from "../game/events";
import { gameStore } from "../game/GameStore";
import { RyanRouteFollower } from "../world/ryanRide/RouteFollower";
import { TiledRuntimeWorld } from "../world/tiledRuntime";
import { BaseExplorationScene } from "./BaseExplorationScene";

/** A compact, reload-safe road leg between Milton Estates and Reidenbaugh. */
export class ReidenbaughRoadScene extends BaseExplorationScene {
  private tiledWorld!: TiledRuntimeWorld;
  private follower?: RyanRouteFollower;
  private ryan?: Phaser.Physics.Arcade.Sprite;

  public constructor() { super("reidenbaugh_road"); }

  public create(data?: { spawn?: "milton" | "reidenbaugh" }): void {
    gameStore.setCurrentMap("reidenbaugh_road");
    this.tiledWorld = new TiledRuntimeWorld(this.make.tilemap({ key: REIDENBAUGH_ROAD_MAP.tiledMapKey }));
    const { widthInPixels, heightInPixels } = this.tiledWorld.tilemap;
    this.physics.world.setBounds(0, 0, widthInPixels, heightInPixels);
    this.cameras.main.setBounds(0, 0, widthInPixels, heightInPixels);
    const activeRide = gameStore.isRyanRideStage("ride_reidenbaugh_road");
    this.initializeWorld("reidenbaugh_road", this.tiledWorld.point(activeRide || data?.spawn !== "reidenbaugh" ? "spawn_milton" : "spawn_reidenbaugh"));
    this.drawWorld();
    if (activeRide) this.startRide();
    else this.mountFreeTravel();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.follower?.stop(); this.follower = undefined;
      this.ryan?.destroy(); this.ryan = undefined;
    });
  }

  public override objectPoint(name: string) { return this.tiledWorld.point(name); }
  public override update(time: number, delta: number): void { super.update(time, delta); this.follower?.update(); }

  private drawWorld(): void {
    for (const layer of getIllustratedMapLayers("reidenbaugh_road")) this.add.image(layer.x, layer.y, layer.textureKey).setOrigin(0, 0).setDisplaySize(layer.width, layer.height).setDepth(layer.depth);
    for (const collider of this.tiledWorld.rectangles()) this.addObstacle(collider.x, collider.y, collider.width, collider.height);
  }

  private startRide(): void {
    this.setPlayerTravelMode("bicycle");
    const start = this.tiledWorld.point("road_route_00");
    this.ryan = this.physics.add.sprite(start.x, start.y, "ryan").setScale(1.2).setDepth(49).setName("ryan-road");
    this.follower = new RyanRouteFollower({
      time: this.time, objectPoint: (id) => this.tiledWorld.point(id), playerPosition: () => this.getPlayerPosition(),
      addCallout: (text) => gameEvents.emit(EVENT.toast, `Ryan: ${text}`),
    }, this.ryan, REIDENBAUGH_ROAD_ROUTE, () => this.completeRoadRide());
  }

  private completeRoadRide(): void {
    if (!gameStore.isRyanRideStage("ride_reidenbaugh_road")) return;
    this.follower?.stop();
    gameStore.reachReidenbaugh();
    this.scene.start("reidenbaugh");
  }

  private mountFreeTravel(): void {
    if (!gameStore.isBicycleUnlocked()) return;
    this.enableBicycleToggle();
    this.setPlayerTravelMode("bicycle");
    const back = this.tiledWorld.rectangle("return_milton");
    const onward = this.tiledWorld.rectangle("enter_reidenbaugh");
    this.registerRegionInteraction({ id: "return_milton", x: back.x + back.width / 2, y: back.y + back.height / 2, width: back.width, height: back.height, label: "Return to Milton Estates", interact: () => this.scene.start("neighborhood") });
    this.registerRegionInteraction({ id: "enter_reidenbaugh", x: onward.x + onward.width / 2, y: onward.y + onward.height / 2, width: onward.width, height: onward.height, label: "Enter Reidenbaugh", interact: () => this.scene.start("reidenbaugh") });
  }

  protected override getDebugObjectivePosition(): { x: number; y: number } { return this.tiledWorld.point(gameStore.isRyanRideStage("ride_reidenbaugh_road") ? "road_route_03" : "enter_reidenbaugh"); }
}
