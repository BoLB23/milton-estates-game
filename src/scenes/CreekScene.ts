import Phaser from "phaser";
import { getClueDialogue, getControllerDialogue } from "../content/dialogue";
import { nextStage } from "../content/quest";
import { EVENT, gameEvents } from "../game/events";
import { CONTROLLER_ITEM, gameStore } from "../game/GameStore";
import { BaseExplorationScene } from "./BaseExplorationScene";

const WIDTH = 2048;
const HEIGHT = 1536;

export class CreekScene extends BaseExplorationScene {
  private controllerSprite?: Phaser.GameObjects.Sprite;
  private secretSprite?: Phaser.GameObjects.Sprite;

  constructor() {
    super("creek");
  }

  create(): void {
    gameStore.setCurrentMap("creek");
    this.physics.world.setBounds(0, 0, WIDTH, HEIGHT);
    this.cameras.main.setBounds(0, 0, WIDTH, HEIGHT);
    this.initializeWorld({ x: 1024, y: 1400 });
    this.drawWorld();
    this.addInteractions();
    gameEvents.emit(EVENT.stateChanged, gameStore.getState());
  }

  private drawWorld(): void {
    const g = this.add.graphics();
    g.fillStyle(0x3f7046).fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle(0x79b85f).fillRoundedRect(180, 100, 1688, 1336, 180);

    g.fillStyle(0x327f93).fillRect(940, 0, 190, HEIGHT);
    g.fillStyle(0x8fcfdd, 0.5);
    for (let y = 30; y < HEIGHT; y += 70) g.fillRect(965, y, 125, 9);

    g.fillStyle(0x9c774a);
    g.fillRect(830, 1060, 420, 80);
    g.fillRect(830, 365, 420, 80);
    g.fillStyle(0xd0ad6a);
    for (let x = 850; x < 1240; x += 42) {
      g.fillRect(x, 1068, 28, 64);
      g.fillRect(x, 373, 28, 64);
    }

    g.fillStyle(0xb08b5a);
    g.fillRoundedRect(270, 1180, 680, 90, 35);
    g.fillRoundedRect(250, 300, 650, 90, 35);
    g.fillRoundedRect(1130, 300, 650, 90, 35);
    g.fillRoundedRect(1130, 1180, 650, 90, 35);
    g.fillRoundedRect(230, 340, 90, 900, 35);
    g.fillRoundedRect(1720, 340, 90, 900, 35);

    this.drawTallGrass(g, 520, 480, 330, 250);
    this.drawTallGrass(g, 1320, 520, 260, 230);
    this.drawTallGrass(g, 430, 800, 260, 200);

    g.fillStyle(0x7b5334).fillRoundedRect(370, 235, 360, 55, 24);
    g.fillStyle(0xb98450).fillCircle(400, 262, 31).fillCircle(700, 262, 31);

    for (let x = 80; x < WIDTH; x += 180) {
      this.drawTree(g, x, 80 + (x % 260));
      this.drawTree(g, x, HEIGHT - 80 - (x % 180));
    }
    for (let y = 260; y < HEIGHT - 180; y += 210) {
      this.drawTree(g, 100, y);
      this.drawTree(g, WIDTH - 100, y + 60);
    }

    this.addLabel(1024, 1415, "↓ EXIT: Back to Wheatfield Drive");
    this.addLabel(560, 205, "Fallen log clearing");
    this.addLabel(1024, 70, "Creek continues north", "#17475a");

    this.addObstacle(0, 0, WIDTH, 35);
    this.addObstacle(0, HEIGHT - 35, 850, 35);
    this.addObstacle(1200, HEIGHT - 35, WIDTH - 1200, 35);
    this.addObstacle(0, 0, 35, HEIGHT);
    this.addObstacle(WIDTH - 35, 0, 35, HEIGHT);
    this.addObstacle(940, 0, 190, 365);
    this.addObstacle(940, 445, 190, 615);
    this.addObstacle(940, 1140, 190, 396);

    if (!gameStore.hasInventoryItem(CONTROLLER_ITEM)) {
      this.controllerSprite = this.add.sprite(680, 610, "controller").setDepth(30);
    }
    if (!gameStore.hasSecret("creek_token")) {
      this.secretSprite = this.add.sprite(1530, 865, "secret").setDepth(30);
    }
  }

  private drawTallGrass(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number): void {
    g.fillStyle(0x4f963f, 0.85).fillRoundedRect(x, y, width, height, 35);
    g.lineStyle(4, 0x93c957, 0.8);
    for (let gx = x + 20; gx < x + width; gx += 28) {
      for (let gy = y + 25; gy < y + height; gy += 34) g.lineBetween(gx, gy + 12, gx + 8, gy - 10);
    }
  }

  private drawTree(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x624a31).fillRect(x - 12, y, 24, 55);
    g.fillStyle(0x285538).fillCircle(x, y - 12, 62);
    g.fillStyle(0x3f7b45).fillCircle(x - 18, y - 28, 42);
  }

  private addInteractions(): void {
    this.registerRegionInteraction({
      id: "return_neighborhood",
      x: 1025,
      y: 1460,
      width: 350,
      height: 90,
      label: "Return to Wheatfield Drive",
      interact: () => this.returnToNeighborhood(),
    });
    this.registerInteraction({
      id: "creek_tracks",
      x: 620,
      y: 900,
      label: "Inspect tracks",
      interact: () => this.showDialogue(getClueDialogue("creek_tracks", gameStore.getState().questStage)),
    });
    this.registerInteraction({
      id: "controller",
      x: 680,
      y: 610,
      label: "Search the tall grass",
      interact: () => this.findController(),
    });
    this.registerInteraction({
      id: "secret",
      x: 1530,
      y: 865,
      label: gameStore.hasSecret("creek_token") ? "Inspect the clearing" : "Pick up the shiny token",
      interact: () => this.findSecret(),
    });
  }

  private findController(): void {
    const stage = gameStore.getState().questStage;
    this.showDialogue(getControllerDialogue(stage), () => {
      if (stage !== "search_creek") return;
      gameStore.addInventoryItem(CONTROLLER_ITEM);
      gameStore.setQuestStage(nextStage(stage, { type: "picked_up_controller" }));
      this.controllerSprite?.destroy();
      this.controllerSprite = undefined;
      gameEvents.emit(EVENT.toast, "Xbox controller added to your backpack.");
    });
  }

  private findSecret(): void {
    if (gameStore.hasSecret("creek_token")) {
      this.showDialogue([{ speaker: "Billy", text: "The little clearing feels like a good hideout spot." }]);
      return;
    }
    this.showDialogue([
      { speaker: "Billy", text: "A Milton Estates arcade token? This must be ancient." },
      { speaker: "Billy", text: "Or from last summer. Still counts." },
    ], () => {
      gameStore.addSecret("creek_token");
      this.secretSprite?.destroy();
      this.secretSprite = undefined;
      gameEvents.emit(EVENT.toast, "Secret found: Creek Token");
    });
  }

  private returnToNeighborhood(): void {
    gameEvents.emit(EVENT.hint, "");
    gameStore.setCurrentMap("neighborhood");
    this.scene.start("neighborhood", { spawn: "woods" });
  }

  protected override getDebugObjectivePosition(): { x: number; y: number } {
    return gameStore.getState().questStage === "search_creek"
      ? { x: 680, y: 650 }
      : { x: 1024, y: 1400 };
  }
}
