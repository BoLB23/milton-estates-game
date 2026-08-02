import Phaser from "phaser";
import { getIllustratedMapLayers, NEIGHBORHOOD_MAP } from "../content/maps";
import { EVENT, gameEvents } from "../game/events";
import { gameStore } from "../game/GameStore";
import { BaseExplorationScene } from "./BaseExplorationScene";
import { NeighborhoodQuestController } from "../world/NeighborhoodQuestController";
import { TiledRuntimeWorld } from "../world/tiledRuntime";
import { NEIGHBORHOOD_DEPARTURE_ROUTE } from "../content/ryanRideRoutes";
import { RyanRouteFollower } from "../world/ryanRide/RouteFollower";

/** Sets up Wheatfield Drive's map and delegates quest presentation to controllers. */
export class NeighborhoodScene extends BaseExplorationScene {
  private questController?: NeighborhoodQuestController;
  private tiledWorld!: TiledRuntimeWorld;
  private rideFollower?: RyanRouteFollower;
  private rideRyan?: Phaser.Physics.Arcade.Sprite;

  public constructor() {
    super("neighborhood");
  }

  public preload(): void {
    this.preloadMapAssets(NEIGHBORHOOD_MAP);
  }

  public create(data?: { spawn?: "home" | "woods" | "stonehenge" | "fruitville" }): void {
    gameStore.setCurrentMap("neighborhood");
    this.tiledWorld = new TiledRuntimeWorld(this.make.tilemap({ key: NEIGHBORHOOD_MAP.tiledMapKey }));
    const spawnId = {
      home: "spawn_home",
      woods: "spawn_woods",
      stonehenge: "spawn_stonehenge",
      fruitville: "spawn_fruitville",
    }[data?.spawn ?? "home"];
    const spawn = this.tiledWorld.point(spawnId);
    this.initializeWorld("neighborhood", spawn);
    this.mountCollisionGrid(this.tiledWorld);
    // Cameras survive a Phaser Scene stop/start. Reset the offset explicitly
    // on regional returns so the initial home composition cannot leak into a
    // later edge spawn and make the player appear displaced from the exit.
    this.cameras.main.setFollowOffset(0, (data?.spawn ?? "home") === "home" ? 125 : 0);
    this.drawWorld();
    this.addMushroomHunt("neighborhood");
    this.questController = new NeighborhoodQuestController({
      world: this,
      registerInteraction: (interactable) => this.registerInteraction(interactable),
      unregisterInteraction: (id) => this.unregisterInteraction(id),
      registerRegionInteraction: (interactable) => this.registerRegionInteraction(interactable),
      unregisterRegionInteraction: (id) => this.unregisterRegionInteraction(id),
      showDialogue: (lines, onComplete) => this.showDialogue(lines, onComplete),
      showChoice: (request) => this.showChoice(request),
      addLabel: (x, y, text, color) => this.addLabel(x, y, text, color),
      objectPoint: (name) => this.tiledWorld.point(name),
      objectRectangle: (name) => this.tiledWorld.rectangle(name),
      enterWoods: () => this.enterWoods(),
      refreshMushroomHunt: () => this.addMushroomHunt("neighborhood"),
      refreshQuestBindings: () => this.questController?.mount(),
      onRideSelected: () => this.startRide(),
      enterStonehenge: () => this.enterStonehenge(),
      enterFruitville: () => this.enterFruitville(),
    });
    this.questController.mount();
    // The destination choice persists `depart_neighborhood` before its
    // departure line is dismissed. Listen for that state transition so the
    // route actor is mounted even when the next input arrives before the
    // dialogue completion callback runs.
    gameEvents.on(EVENT.stateChanged, this.handleRyanRideStateChanged, this);
    if (gameStore.isBicycleUnlocked()) this.enableBicycleToggle();
    if (gameStore.isRyanRideStage("depart_neighborhood")) this.startRide();
    this.events.on("ryan-map-reveal", this.showMapReveal, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off("ryan-map-reveal", this.showMapReveal, this);
      gameEvents.off(EVENT.stateChanged, this.handleRyanRideStateChanged, this);
      this.rideFollower?.stop();
      this.rideFollower = undefined;
      this.rideRyan?.destroy();
      this.rideRyan = undefined;
      this.questController?.dispose();
      this.questController = undefined;
    });
  }

  public override objectPoint(name: string) { return this.tiledWorld.point(name); }

  public override update(time: number, delta: number): void {
    super.update(time, delta);
    this.rideFollower?.update();
  }

  private drawWorld(): void {
    for (const layer of getIllustratedMapLayers("neighborhood")) {
      this.add.image(layer.x, layer.y, layer.textureKey)
        .setOrigin(0, 0).setDepth(layer.depth);
    }
  }

  private enterWoods(): void {
    gameEvents.emit(EVENT.hint, "");
    gameStore.setCurrentMap("creek");
    this.scene.start("creek");
  }

  private startRide(): void {
    if (!gameStore.isRyanRideStage("depart_neighborhood") || this.rideFollower) return;
    // Ryan's invitation actor remains mounted until the departure dialogue
    // closes. Rebuild the controller for the new quest stage before creating
    // the route actor, so the invitation Ryan is removed instead of leaving a
    // stationary duplicate at the bike rack.
    this.questController?.mount();
    const mount = this.tiledWorld.point("bike_mount_milton");
    this.getPlayerSprite().setPosition(mount.x, mount.y).setVelocity(0, 0);
    (this.getPlayerSprite().body as Phaser.Physics.Arcade.Body).reset(mount.x, mount.y);
    this.setPlayerTravelMode("bicycle");
    const start = this.tiledWorld.point("ryan_depart_00");
    this.rideRyan = this.physics.add.sprite(start.x, start.y, "ryan").setScale(1.2).setDepth(49).setName("ryan-ride");
    this.rideFollower = new RyanRouteFollower({
      time: this.time,
      objectPoint: (id) => this.tiledWorld.point(id),
      playerPosition: () => this.getPlayerPosition(),
      addCallout: (text) => gameEvents.emit(EVENT.toast, `Ryan: ${text}`),
    }, this.rideRyan, NEIGHBORHOOD_DEPARTURE_ROUTE, () => this.completeNeighborhoodRide());
    gameEvents.emit(EVENT.toast, "Bike controls: build speed, then steer gently through turns.");
  }

  private completeNeighborhoodRide(): void {
    if (!gameStore.isRyanRideStage("depart_neighborhood")) return;
    this.rideFollower?.stop();
    gameStore.departNeighborhoodRide();
    this.scene.start("stonehenge", { spawn: "milton" });
  }

  private enterStonehenge(): void {
    gameStore.setCurrentMap("stonehenge");
    this.scene.start("stonehenge", { spawn: "milton" });
  }

  private enterFruitville(): void {
    // Checkpoint the cold-loaded destination before stopping this scene. The
    // Backpack can then pause the correct map even if it opens during preload.
    gameStore.setCurrentMap("fruitville_pike");
    this.scene.start("fruitville_pike", { spawn: "milton" });
  }

  private showMapReveal(): void {
    gameEvents.emit(EVENT.toast, "Scrapbook map reveal: Stonehenge, the school, Fruitville Pike, and Bent Creek are open!");
  }

  private handleRyanRideStateChanged(): void {
    if (gameStore.isRyanRideStage("depart_neighborhood")) this.startRide();
  }

  protected override afterDebugTeleportToObjective(): void {
    if (!import.meta.env.DEV || !gameStore.isRyanRideStage("depart_neighborhood")) return;
    if (!this.rideFollower) this.startRide();
    this.rideFollower?.completeForDebug();
  }

  protected override getDebugObjectivePosition(): { x: number; y: number } {
    const state = gameStore.getState();
    if (state.activeQuestId === "andrew_mushroom_hunt") {
      switch (state.questStage) {
        case "talk_to_andrew_for_mushrooms":
        case "give_mushrooms_to_andrew": return this.tiledWorld.point("andrew");
        case "feed_mushroom_to_jeremy": return this.tiledWorld.point("jeremy");
        case "place_mushroom_at_billy": return this.tiledWorld.point("billy");
        case "search_mushrooms": {
          const collected = new Set(state.questProgress.mushrooms.collectedIds);
          return gameStore.getMushroomSpawns("neighborhood").find((spawn) => !collected.has(spawn.id)) ?? this.tiledWorld.point("woods_gate");
        }
        default: return this.tiledWorld.point("andrew");
      }
    }
    if (state.activeQuestId === "three_player_sports") {
      switch (state.questStage) {
        case "meet_jeremy_to_skateboard": return this.tiledWorld.point("jeremy");
        case "meet_billy_to_play_baseball": return this.tiledWorld.point("billy");
        case "meet_andrew_to_play_basketball": return this.tiledWorld.point("andrew");
        default: return this.tiledWorld.point("andrew");
      }
    }
    if (state.activeQuestId === "catch_ryan") {
      if (state.questStage === "invite" || state.questStage === "choose_destination") return this.tiledWorld.point("ryan_invite");
      if (state.questStage === "depart_neighborhood") {
        return this.rideFollower?.getCurrentTarget() ?? this.tiledWorld.point("exit_stonehenge");
      }
    }
    if (state.activeQuestId === "explore_bent_creek") {
      const exit = this.tiledWorld.rectangle("exit_fruitville");
      return { x: exit.x + exit.width / 2, y: exit.y + exit.height / 2 };
    }
    switch (state.questStage) {
      case "talk_to_jeremy":
      case "return_to_jeremy":
      case "complete": return this.tiledWorld.point("jeremy");
      case "talk_to_andrew": return this.tiledWorld.point("andrew");
      case "search_creek": return this.tiledWorld.point("woods_gate");
      default: return this.tiledWorld.point("jeremy");
    }
  }
}
