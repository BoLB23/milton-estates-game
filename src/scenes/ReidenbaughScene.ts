import Phaser from "phaser";

import { REIDENBAUGH_MAP } from "../content/maps";
import { REIDENBAUGH_CHASE_ROUTES } from "../content/ryanRideRoutes";
import { RYAN_CAUGHT, RYAN_POST_RIDE } from "../content/ryanRideDialogue";
import { EVENT, gameEvents } from "../game/events";
import { gameStore } from "../game/GameStore";
import { selectRyanLoop } from "../world/ryanRide/decisionCore";
import { RyanRouteFollower } from "../world/ryanRide/RouteFollower";
import { PaperAirplaneRelayController } from "../world/paperAirplaneRelay/PaperAirplaneRelayController";
import { TiledRuntimeWorld } from "../world/tiledRuntime";
import { BaseExplorationScene } from "./BaseExplorationScene";
import { finishLeaderboardTimer, leaderboardSummaryLines, startLeaderboardTimer } from "../platform/leaderboards";
import { CharacterFactory } from "../world/CharacterFactory";

/** Reidenbaugh Elementary campus, including the seeded destination chase. */
export class ReidenbaughScene extends BaseExplorationScene {
  private tiledWorld!: TiledRuntimeWorld;
  private follower?: RyanRouteFollower;
  private ryan?: Phaser.Physics.Arcade.Sprite;
  private catchOverlap?: Phaser.Physics.Arcade.Collider;
  private caught = false;
  private campusMounted = false;
  private paperAirplaneRelay?: PaperAirplaneRelayController;

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
    this.paperAirplaneRelay = new PaperAirplaneRelayController({
      world: this,
      registerInteraction: (interactable) => this.registerInteraction(interactable),
      unregisterInteraction: (id) => this.unregisterInteraction(id),
      registerRegionInteraction: (interactable) => this.registerRegionInteraction(interactable),
      unregisterRegionInteraction: (id) => this.unregisterRegionInteraction(id),
      showDialogue: (lines, onComplete) => this.showDialogue(lines, onComplete),
      showChoice: (request) => this.showChoice(request),
      addLabel: (x, y, text, color) => this.addLabel(x, y, text, color),
      objectPoint: (name) => this.tiledWorld.point(name),
    });
    this.paperAirplaneRelay.mount();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.follower?.stop();
      this.follower = undefined;
      this.catchOverlap?.destroy();
      this.catchOverlap = undefined;
      this.ryan?.destroy();
      this.ryan = undefined;
      this.paperAirplaneRelay?.dispose();
      this.paperAirplaneRelay = undefined;
    });
  }

  public override objectPoint(name: string) { return this.tiledWorld.point(name); }

  public override update(time: number, delta: number): void {
    super.update(time, delta);
    this.follower?.update();
  }

  private drawWorld(): void {
    this.drawAuthoredArtwork(REIDENBAUGH_MAP, this.tiledWorld);
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
        isAvailable: () => gameStore.isBicycleUnlocked()
          && !gameStore.isRyanRideStage("chase_reidenbaugh")
          && !this.isPaperRelayAnchorReserved(objectId),
        interact: () => this.showDialogue([{ speaker: "You", text }]),
      });
    }
  }

  private startChase(): void {
    this.setScriptedTransportOverride("bicycle");
    startLeaderboardTimer("chaseRyan");
    const seed = gameStore.getState().questProgress.ryanRide.routeSeed ?? 0;
    const selected = selectRyanLoop(REIDENBAUGH_CHASE_ROUTES.map((route) => route.id), seed, 0);
    const route = REIDENBAUGH_CHASE_ROUTES.find((candidate) => candidate.id === selected.loopId)!;
    const start = this.tiledWorld.point(route.waypoints[0]!.objectId);
    this.ryan = CharacterFactory.styleNpc(this.physics.add.sprite(start.x, start.y, "ryan"), { id: "ryan", depth: 49 })
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

  /** Quest pickups and gust prompts share a few campus anchors with flavor notes. */
  private isPaperRelayAnchorReserved(anchor: string): boolean {
    const state = gameStore.getState();
    if (state.activeQuestId !== "paper_airplane_relay") return false;
    const relay = state.questProgress.paperAirplaneRelay;
    if (relay.stage === "find_materials") {
      return (anchor === "school_front" && !relay.materialIds.includes("clean_sheet"))
        || (anchor === "service_side" && !relay.materialIds.includes("card_wing"))
        || (anchor === "athletic_field" && !relay.materialIds.includes("message_strip"));
    }
    if (relay.stage === "fold_plane") return anchor === "playground";
    if (relay.stage === "chase_plane") {
      return (relay.windHits === 0 && (anchor === "playground" || anchor === "bus_loop"))
        || (relay.windHits === 1 && anchor === "athletic_field")
        || (relay.windHits === 2 && anchor === "basketball_court");
    }
    return relay.stage === "decode_message" && anchor === "basketball_court";
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
      gameEvents.emit(EVENT.toast, "Catch Ryan complete — new objective: Explore Bent Creek.");
      this.mountPostQuest();
      void finishLeaderboardTimer("chaseRyan").then((entries) => {
        const lines = leaderboardSummaryLines("fastest", entries, gameStore.getPlayerProfile()?.id);
        this.showDialogue([{
          speaker: "Leaderboard",
          text: `Catch Ryan scores:\n${lines.join("\n")}`,
        }]);
      });
    });
  }

  private mountPostQuest(): void {
    if (!gameStore.isBicycleUnlocked()) return;
    this.setScriptedTransportOverride(null);
    const post = this.tiledWorld.point("ryan_post");
    if (!this.ryan) {
      this.ryan = CharacterFactory.styleNpc(this.physics.add.sprite(post.x, post.y, "ryan"), { id: "ryan", depth: 49 });
    } else {
      this.ryan.setPosition(post.x, post.y).setVelocity(0, 0);
    }
    if (gameStore.getState().activeQuestId !== "paper_airplane_relay") {
      this.registerInteraction({
        id: "ryan_post",
        x: post.x,
        y: post.y,
        label: "Talk to Ryan",
        interact: () => this.showDialogue([...RYAN_POST_RIDE]),
      });
    }
    const back = this.tiledWorld.rectangle("exit_stonehenge");
    this.registerRegionInteraction({
      id: "exit_stonehenge",
      x: back.x + back.width / 2,
      y: back.y + back.height / 2,
      width: back.width,
      height: back.height,
      label: gameStore.hasSecret("paper_airplane_shortcut")
        ? "Use Ryan's wind-map shortcut to Stonehenge"
        : "Return to Stonehenge",
      isAvailable: () => gameStore.isMapUnlocked("stonehenge"),
      interact: () => {
        gameStore.setCurrentMap("stonehenge");
        this.scene.start("stonehenge", { spawn: "reidenbaugh" });
      },
    });
  }

  protected override getDebugObjectivePosition(): { x: number; y: number } {
    if (gameStore.isRyanRideStage("chase_reidenbaugh") && this.ryan) {
      // Place the player beside Ryan rather than directly overlapping him.
      // F4 is a navigation shortcut; teleporting into the chase actor's body
      // would turn the inspection shortcut into an automatic quest completion.
      return { x: this.ryan.x - 96, y: this.ryan.y };
    }
    return this.tiledWorld.point(
      gameStore.isRyanRideStage("chase_reidenbaugh") ? "ryan_finish" : "exit_stonehenge",
    );
  }
}
