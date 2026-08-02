import Phaser from "phaser";

import { getIllustratedMapLayers, REIDENBAUGH_MAP } from "../content/maps";
import { REIDENBAUGH_CHASE_ROUTES } from "../content/ryanRideRoutes";
import { RYAN_CAUGHT, RYAN_POST_RIDE } from "../content/ryanRideDialogue";
import { EVENT, gameEvents } from "../game/events";
import { gameStore } from "../game/GameStore";
import { selectRyanLoop } from "../world/ryanRide/decisionCore";
import { RyanRouteFollower } from "../world/ryanRide/RouteFollower";
import { TiledRuntimeWorld } from "../world/tiledRuntime";
import { BaseExplorationScene } from "./BaseExplorationScene";

/** Reidenbaugh Elementary campus, including the seeded destination chase. */
export class ReidenbaughScene extends BaseExplorationScene {
  private tiledWorld!: TiledRuntimeWorld;
  private follower?: RyanRouteFollower;
  private ryan?: Phaser.Physics.Arcade.Sprite;
  private catchOverlap?: Phaser.Physics.Arcade.Collider;
  private caught = false;
  private campusMounted = false;

  public constructor() { super("reidenbaugh"); }

  public preload(): void {
    this.preloadMapAssets(REIDENBAUGH_MAP);
  }

  public create(_data?: { spawn?: "stonehenge" }): void {
    // Phaser reuses Scene instances. Per-run guards must be reset before
    // interactions and catch state are mounted again on revisit or replay.
    this.caught = false;
    this.campusMounted = false;
    gameStore.setCurrentMap("reidenbaugh");
    this.tiledWorld = new TiledRuntimeWorld(this.make.tilemap({ key: REIDENBAUGH_MAP.tiledMapKey }));
    this.initializeWorld("reidenbaugh", this.tiledWorld.point("spawn_stonehenge"));
    this.mountCollisionGrid(this.tiledWorld);
    this.drawWorld();
    this.mountCampusInteractions();
    if (gameStore.isRyanRideStage("chase_reidenbaugh")) this.startChase();
    else this.mountPostQuest();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.follower?.stop();
      this.follower = undefined;
      this.catchOverlap?.destroy();
      this.catchOverlap = undefined;
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
    for (const layer of getIllustratedMapLayers("reidenbaugh")) {
      this.add.image(layer.x, layer.y, layer.textureKey)
        .setOrigin(0, 0)
        .setDepth(layer.depth);
    }
  }

  private mountCampusInteractions(): void {
    if (this.campusMounted) return;
    this.campusMounted = true;
    const campusNotes: Array<[string, string, string]> = [
      ["school_front", "Look at the school", "Reidenbaugh Elementary fills the center of the campus."],
      ["bus_loop", "Inspect the bus loop", "The afternoon buses are parked in a neat red-brick ring."],
      ["visitor_parking", "Check visitor parking", "A painted visitor lane points toward the front office."],
      ["playground", "Visit the playground", "The swings are empty, but the blacktop still holds chalk marks."],
      ["basketball_court", "Walk to the basketball court", "The hoops are ready for the next game."],
      ["athletic_field", "Look across the athletic field", "The field opens toward the wooded edge of the school grounds."],
      ["service_side", "Check the service side", "A quiet service lane runs behind the school."],
      ["bike_rack_reidenbaugh", "Check the bike rack", "There is room for one more bike beside the school entrance."],
    ];
    for (const [objectId, label, text] of campusNotes) {
      const point = this.tiledWorld.point(objectId);
      this.registerInteraction({
        id: objectId,
        x: point.x,
        y: point.y,
        label,
        isAvailable: () => gameStore.isBicycleUnlocked() && !gameStore.isRyanRideStage("chase_reidenbaugh"),
        interact: () => this.showDialogue([{ speaker: "Billy", text }]),
      });
    }
  }

  private startChase(): void {
    this.setPlayerTravelMode("bicycle");
    const seed = gameStore.getState().questProgress.ryanRide.routeSeed ?? 0;
    const selected = selectRyanLoop(REIDENBAUGH_CHASE_ROUTES.map((route) => route.id), seed, 0);
    const route = REIDENBAUGH_CHASE_ROUTES.find((candidate) => candidate.id === selected.loopId)!;
    const start = this.tiledWorld.point(route.waypoints[0]!.objectId);
    this.ryan = this.physics.add.sprite(start.x, start.y, "ryan")
      .setScale(1.2)
      .setDepth(49)
      .setName("ryan-school-chase");
    this.follower = new RyanRouteFollower({
      time: this.time,
      objectPoint: (id) => this.tiledWorld.point(id),
      playerPosition: () => this.getPlayerPosition(),
      addCallout: (text) => gameEvents.emit(EVENT.toast, `Ryan: ${text || "Catch up!"}`),
    }, this.ryan, route, () => this.ryan?.setVelocity(0, 0));
    this.catchOverlap = this.physics.add.overlap(this.getPlayerSprite(), this.ryan, () => this.catchRyan());
    gameEvents.emit(EVENT.toast, "Ryan cut across the school campus — catch him!");
  }

  private catchRyan(): void {
    if (this.caught || !gameStore.isRyanRideStage("chase_reidenbaugh")) return;
    this.caught = true;
    this.catchOverlap?.destroy();
    this.catchOverlap = undefined;
    this.follower?.stop();
    this.ryan?.setVelocity(0, 0);
    gameStore.catchRyan();
    this.showDialogue([...RYAN_CAUGHT], () => {
      gameEvents.emit(EVENT.toast, "Quest complete — Catch Ryan! The regional map is yours to explore.");
      this.mountPostQuest();
    });
  }

  private mountPostQuest(): void {
    if (!gameStore.isBicycleUnlocked()) return;
    this.enableBicycleToggle();
    this.setPlayerTravelMode("bicycle");
    const post = this.tiledWorld.point("ryan_post");
    if (!this.ryan) {
      this.ryan = this.physics.add.sprite(post.x, post.y, "ryan")
        .setScale(1.2)
        .setDepth(49);
    } else {
      this.ryan.setPosition(post.x, post.y).setVelocity(0, 0);
    }
    this.registerInteraction({
      id: "ryan_post",
      x: post.x,
      y: post.y,
      label: "Talk to Ryan",
      interact: () => this.showDialogue([...RYAN_POST_RIDE]),
    });
    const back = this.tiledWorld.rectangle("exit_stonehenge");
    this.registerRegionInteraction({
      id: "exit_stonehenge",
      x: back.x + back.width / 2,
      y: back.y + back.height / 2,
      width: back.width,
      height: back.height,
      label: "Return to Stonehenge",
      isAvailable: () => gameStore.isMapUnlocked("stonehenge"),
      interact: () => {
        gameStore.setCurrentMap("stonehenge");
        this.scene.start("stonehenge", { spawn: "reidenbaugh" });
      },
    });
  }

  protected override getDebugObjectivePosition(): { x: number; y: number } {
    if (gameStore.isRyanRideStage("chase_reidenbaugh") && this.ryan) {
      return { x: this.ryan.x, y: this.ryan.y };
    }
    return this.tiledWorld.point(
      gameStore.isRyanRideStage("chase_reidenbaugh") ? "ryan_finish" : "exit_stonehenge",
    );
  }
}
