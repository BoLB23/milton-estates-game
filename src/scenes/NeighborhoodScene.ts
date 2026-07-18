import Phaser from "phaser";
import { getIllustratedMapLayers, NEIGHBORHOOD_MAP } from "../content/maps";
import { EVENT, gameEvents } from "../game/events";
import { gameStore } from "../game/GameStore";
import { BaseExplorationScene } from "./BaseExplorationScene";
import { NeighborhoodQuestController } from "../world/NeighborhoodQuestController";
import { TiledRuntimeWorld } from "../world/tiledRuntime";

/** Sets up Wheatfield Drive's map and delegates quest presentation to controllers. */
export class NeighborhoodScene extends BaseExplorationScene {
  private questController?: NeighborhoodQuestController;
  private tiledWorld!: TiledRuntimeWorld;

  public constructor() {
    super("neighborhood");
  }

  public create(data?: { spawn?: "home" | "woods" }): void {
    gameStore.setCurrentMap("neighborhood");
    this.tiledWorld = new TiledRuntimeWorld(this.make.tilemap({ key: NEIGHBORHOOD_MAP.tiledMapKey }));
    this.physics.world.setBounds(0, 0, this.tiledWorld.tilemap.widthInPixels, this.tiledWorld.tilemap.heightInPixels);
    this.cameras.main.setBounds(0, 0, this.tiledWorld.tilemap.widthInPixels, this.tiledWorld.tilemap.heightInPixels);
    const spawn = this.tiledWorld.point(data?.spawn === "woods" ? "spawn_woods" : "spawn_home");
    this.initializeWorld(spawn);
    if (data?.spawn !== "woods") this.cameras.main.setFollowOffset(0, 170);
    this.drawWorld();
    this.addMushroomHunt("neighborhood");
    this.questController = new NeighborhoodQuestController({
      world: this,
      registerInteraction: (interactable) => this.registerInteraction(interactable),
      unregisterInteraction: (id) => this.unregisterInteraction(id),
      registerRegionInteraction: (interactable) => this.registerRegionInteraction(interactable),
      unregisterRegionInteraction: (id) => this.unregisterRegionInteraction(id),
      showDialogue: (lines, onComplete) => this.showDialogue(lines, onComplete),
      addLabel: (x, y, text, color) => this.addLabel(x, y, text, color),
      objectPoint: (name) => this.tiledWorld.point(name),
      enterWoods: () => this.enterWoods(),
      refreshMushroomHunt: () => this.addMushroomHunt("neighborhood"),
    });
    this.questController.mount();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.questController?.dispose();
      this.questController = undefined;
    });
  }

  public override objectPoint(name: string) { return this.tiledWorld.point(name); }

  private drawWorld(): void {
    for (const layer of getIllustratedMapLayers("neighborhood")) {
      this.add.image(layer.x, layer.y, layer.textureKey)
        .setOrigin(0, 0).setDisplaySize(layer.width, layer.height).setDepth(layer.depth);
    }
    for (const collider of this.tiledWorld.rectangles()) {
      this.addObstacle(collider.x, collider.y, collider.width, collider.height);
    }
  }

  private enterWoods(): void {
    gameEvents.emit(EVENT.hint, "");
    gameStore.setCurrentMap("creek");
    this.scene.start("creek");
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
