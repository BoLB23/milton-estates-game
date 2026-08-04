import { FRUITVILLE_PIKE_MAP, getIllustratedMapLayers } from "../content/maps";
import { gameStore } from "../game/GameStore";
import { TiledRuntimeWorld } from "../world/tiledRuntime";
import { BaseExplorationScene } from "./BaseExplorationScene";

/** The bicycle-only arterial leg linking Milton Estates and Bent Creek. */
export class FruitvillePikeScene extends BaseExplorationScene {
  private tiledWorld!: TiledRuntimeWorld;

  public constructor() { super("fruitville_pike"); }

  public preload(): void {
    this.preloadMapAssets(FRUITVILLE_PIKE_MAP);
  }

  public create(data?: { spawn?: "milton" | "bent_creek" }): void {
    gameStore.setCurrentMap("fruitville_pike");
    this.tiledWorld = new TiledRuntimeWorld(this.make.tilemap({ key: FRUITVILLE_PIKE_MAP.tiledMapKey }));
    const spawn = data?.spawn === "bent_creek" ? "spawn_bent_creek" : "spawn_milton";
    this.initializeWorld("fruitville_pike", this.tiledWorld.point(spawn));
    this.mountCollisionGrid(this.tiledWorld);
    this.drawWorld();
    this.mountTravel();
  }

  public override objectPoint(name: string) { return this.tiledWorld.point(name); }

  private drawWorld(): void {
    for (const layer of getIllustratedMapLayers("fruitville_pike")) {
      this.add.image(layer.x, layer.y, layer.textureKey)
        .setOrigin(0, 0)
        .setDepth(layer.depth);
    }
  }

  private mountTravel(): void {
    if (!gameStore.isBicycleUnlocked()) return;
    this.mountTransition("exit_milton", "Return to Milton Estates", "neighborhood", { spawn: "fruitville" });
    // Bent Creek's reciprocal spawn is outside the staffed barrier. The
    // attendant must be the only way into the private side of the map.
    this.mountTransition("exit_bent_creek", "Ride to Bent Creek", "bent_creek", { spawn: "gate_exterior" });
    for (const [objectId, label, text] of [
      ["crosswalk_north", "Check the north crosswalk", "The signal is timed for the school-day traffic."],
      ["crosswalk_south", "Check the south crosswalk", "Fresh paint makes the crossing easy to spot."],
      ["bike_shoulder", "Look along the bike shoulder", "The shoulder gives cyclists a little breathing room."],
      ["fruitville_midpoint", "Pause at Fruitville Pike", "The arterial opens toward Bent Creek's guarded entrance."],
    ] as const) {
      const point = this.tiledWorld.point(objectId);
      this.registerInteraction({
        id: objectId,
        x: point.x,
        y: point.y,
        label,
        interact: () => this.showDialogue([{ speaker: "Billy", text }]),
      });
    }
  }

  private mountTransition(
    objectId: "exit_milton" | "exit_bent_creek",
    label: string,
    destination: "neighborhood" | "bent_creek",
    data: { spawn: "fruitville" | "milton" | "gate_exterior" },
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

  protected override getDebugObjectivePosition(): { x: number; y: number } {
    if (gameStore.isQuestActive("explore_bent_creek")) {
      const exit = this.tiledWorld.rectangle("exit_bent_creek");
      return { x: exit.x + exit.width / 2, y: exit.y + exit.height / 2 };
    }
    return this.tiledWorld.point("fruitville_midpoint");
  }
}
