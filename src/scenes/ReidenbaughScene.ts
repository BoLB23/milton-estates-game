import Phaser from "phaser";
import { REIDENBAUGH_CHASE_ROUTES } from "../content/ryanRideRoutes";
import { REIDENBAUGH_MAP, getIllustratedMapLayers } from "../content/maps";
import { RYAN_CAUGHT, RYAN_POST_RIDE } from "../content/ryanRideDialogue";
import { EVENT, gameEvents } from "../game/events";
import { gameStore } from "../game/GameStore";
import { RyanRouteFollower } from "../world/ryanRide/RouteFollower";
import { selectRyanLoop } from "../world/ryanRide/decisionCore";
import { TiledRuntimeWorld } from "../world/tiledRuntime";
import { BaseExplorationScene } from "./BaseExplorationScene";

/** The seeded destination chase and its permanent post-quest free exploration. */
export class ReidenbaughScene extends BaseExplorationScene {
  private tiledWorld!: TiledRuntimeWorld;
  private follower?: RyanRouteFollower;
  private ryan?: Phaser.Physics.Arcade.Sprite;
  private catchOverlap?: Phaser.Physics.Arcade.Collider;
  private caught = false;

  public constructor() { super("reidenbaugh"); }

  public create(): void {
    gameStore.setCurrentMap("reidenbaugh");
    this.tiledWorld = new TiledRuntimeWorld(this.make.tilemap({ key: REIDENBAUGH_MAP.tiledMapKey }));
    const { widthInPixels, heightInPixels } = this.tiledWorld.tilemap;
    this.physics.world.setBounds(0, 0, widthInPixels, heightInPixels);
    this.cameras.main.setBounds(0, 0, widthInPixels, heightInPixels);
    this.initializeWorld("reidenbaugh", this.tiledWorld.point("spawn_road"));
    this.drawWorld();
    if (gameStore.isRyanRideStage("chase_reidenbaugh")) this.startChase();
    else this.mountPostQuest();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.follower?.stop(); this.follower = undefined;
      this.catchOverlap?.destroy(); this.catchOverlap = undefined;
      this.ryan?.destroy(); this.ryan = undefined;
    });
  }

  public override objectPoint(name: string) { return this.tiledWorld.point(name); }
  public override update(time: number, delta: number): void { super.update(time, delta); this.follower?.update(); }

  private drawWorld(): void {
    for (const layer of getIllustratedMapLayers("reidenbaugh")) this.add.image(layer.x, layer.y, layer.textureKey).setOrigin(0, 0).setDisplaySize(layer.width, layer.height).setDepth(layer.depth);
    for (const collider of this.tiledWorld.rectangles()) this.addObstacle(collider.x, collider.y, collider.width, collider.height);
  }

  private startChase(): void {
    this.setPlayerTravelMode("bicycle");
    const seed = gameStore.getState().questProgress.ryanRide.routeSeed ?? 0;
    const selected = selectRyanLoop(REIDENBAUGH_CHASE_ROUTES.map((route) => route.id), seed, 0);
    const route = REIDENBAUGH_CHASE_ROUTES.find((candidate) => candidate.id === selected.loopId)!;
    const start = this.tiledWorld.point(route.waypoints[0]!.objectId);
    this.ryan = this.physics.add.sprite(start.x, start.y, "ryan").setScale(1.2).setDepth(49).setName("ryan-chase");
    this.follower = new RyanRouteFollower({
      time: this.time, objectPoint: (id) => this.tiledWorld.point(id), playerPosition: () => this.getPlayerPosition(),
      addCallout: (text) => gameEvents.emit(EVENT.toast, `Ryan: ${text || "Catch up!"}`),
    }, this.ryan, route, () => this.ryan?.setVelocity(0, 0));
    this.catchOverlap = this.physics.add.overlap(this.getPlayerSprite(), this.ryan, () => this.catchRyan());
  }

  private catchRyan(): void {
    if (this.caught || !gameStore.isRyanRideStage("chase_reidenbaugh")) return;
    this.caught = true;
    this.catchOverlap?.destroy(); this.catchOverlap = undefined;
    this.follower?.stop(); this.ryan?.setVelocity(0, 0);
    gameStore.catchRyan();
    this.showDialogue([...RYAN_CAUGHT], () => {
      gameEvents.emit(EVENT.toast, "Quest complete — Catch Ryan! Reidenbaugh is open to explore.");
      this.mountPostQuest();
    });
  }

  private mountPostQuest(): void {
    if (!gameStore.isBicycleUnlocked()) return;
    this.enableBicycleToggle();
    this.setPlayerTravelMode("bicycle");
    const post = this.tiledWorld.point("ryan_post");
    if (!this.ryan) this.ryan = this.add.sprite(post.x, post.y, "ryan").setScale(1.2).setDepth(49) as Phaser.Physics.Arcade.Sprite;
    this.registerInteraction({ id: "ryan_post", x: post.x, y: post.y, label: "Talk to Ryan", interact: () => this.showDialogue([...RYAN_POST_RIDE]) });
    const back = this.tiledWorld.rectangle("return_road");
    this.registerRegionInteraction({ id: "return_road", x: back.x + back.width / 2, y: back.y + back.height / 2, width: back.width, height: back.height, label: "Return to Reidenbaugh Road", interact: () => this.scene.start("reidenbaugh_road", { spawn: "reidenbaugh" }) });
  }

  protected override getDebugObjectivePosition(): { x: number; y: number } { return this.tiledWorld.point(gameStore.isRyanRideStage("chase_reidenbaugh") ? "ryan_finish" : "return_road"); }
}
