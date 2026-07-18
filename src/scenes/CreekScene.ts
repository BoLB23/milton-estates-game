import Phaser from "phaser";
import { CREEK_MAP, getIllustratedMapLayers } from "../content/maps";
import { EVENT, gameEvents } from "../game/events";
import { gameStore } from "../game/GameStore";
import { BaseExplorationScene } from "./BaseExplorationScene";
import { CreekQuestController } from "../world/CreekQuestController";
import { TiledRuntimeWorld } from "../world/tiledRuntime";

/** Sets up Creek Woods' map while the quest controller owns its transient pickups. */
export class CreekScene extends BaseExplorationScene {
  private questController?: CreekQuestController;
  private tiledWorld!: TiledRuntimeWorld;

  public constructor() {
    super("creek");
  }

  public create(): void {
    gameStore.setCurrentMap("creek");
    this.tiledWorld = new TiledRuntimeWorld(this.make.tilemap({ key: CREEK_MAP.tiledMapKey }));
    this.physics.world.setBounds(0, 0, this.tiledWorld.tilemap.widthInPixels, this.tiledWorld.tilemap.heightInPixels);
    this.cameras.main.setBounds(0, 0, this.tiledWorld.tilemap.widthInPixels, this.tiledWorld.tilemap.heightInPixels);
    this.initializeWorld(this.tiledWorld.point("spawn_home"));
    this.drawWorld();
    this.addMushroomHunt("creek");
    this.questController = new CreekQuestController({
      world: this,
      registerInteraction: (interactable) => this.registerInteraction(interactable),
      unregisterInteraction: (id) => this.unregisterInteraction(id),
      registerRegionInteraction: (interactable) => this.registerRegionInteraction(interactable),
      unregisterRegionInteraction: (id) => this.unregisterRegionInteraction(id),
      showDialogue: (lines, onComplete) => this.showDialogue(lines, onComplete),
      addLabel: (x, y, text, color) => this.addLabel(x, y, text, color),
      objectPoint: (name) => this.tiledWorld.point(name),
      returnToNeighborhood: () => this.returnToNeighborhood(),
    });
    this.questController.mount();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.questController?.dispose();
      this.questController = undefined;
    });
  }

  public override objectPoint(name: string) { return this.tiledWorld.point(name); }

  private drawWorld(): void {
    for (const layer of getIllustratedMapLayers("creek")) {
      this.add.image(layer.x, layer.y, layer.textureKey)
        .setOrigin(0, 0).setDisplaySize(layer.width, layer.height).setDepth(layer.depth);
    }
    for (const collider of this.tiledWorld.rectangles()) {
      this.addObstacle(collider.x, collider.y, collider.width, collider.height);
    }
  }

  private returnToNeighborhood(): void {
    gameEvents.emit(EVENT.hint, "");
    gameStore.setCurrentMap("neighborhood");
    this.scene.start("neighborhood", { spawn: "woods" });
  }

  protected override getDebugObjectivePosition(): { x: number; y: number } {
    const state = gameStore.getState();
    if (state.activeQuestId === "andrew_mushroom_hunt" && state.questStage === "search_mushrooms") {
      const collected = new Set(state.questProgress.mushrooms.collectedIds);
      return gameStore.getMushroomSpawns("creek").find((spawn) => !collected.has(spawn.id)) ?? this.tiledWorld.point("return_neighborhood");
    }
    return state.activeQuestId === "missing_controller" && state.questStage === "search_creek"
      ? this.tiledWorld.point("controller")
      : this.tiledWorld.point("return_neighborhood");
  }
}
