import Phaser from "phaser";
import {
  getAndrewDialogue,
  getBlockedRouteDialogue,
  getClueDialogue,
  getJeremyDialogue,
  getQuestCompletionDialogue,
} from "../content/dialogue";
import { nextStage, type QuestEvent } from "../content/quest";
import { EVENT, gameEvents } from "../game/events";
import { CONTROLLER_ITEM, gameStore } from "../game/GameStore";
import { BaseExplorationScene } from "./BaseExplorationScene";

const WORLD_WIDTH = 2300;
const WORLD_HEIGHT = 1500;

export class NeighborhoodScene extends BaseExplorationScene {
  constructor() {
    super("neighborhood");
  }

  create(data?: { spawn?: "home" | "woods" }): void {
    gameStore.setCurrentMap("neighborhood");
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    const spawn = data?.spawn === "woods" ? { x: 1340, y: 350 } : { x: 1270, y: 1040 };
    this.initializeWorld(spawn);
    this.drawWorld();
    this.addCharacters();
    this.addInteractions();
    gameEvents.emit(EVENT.stateChanged, gameStore.getState());
  }

  private drawWorld(): void {
    const g = this.add.graphics();
    g.fillStyle(0x82c96c).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    g.fillStyle(0x6eb95d).fillRect(0, 0, WORLD_WIDTH, 520);
    g.fillStyle(0x454d55).fillRect(0, 760, WORLD_WIDTH, 230);
    g.fillStyle(0xd6d1ba).fillRect(0, 742, WORLD_WIDTH, 18).fillRect(0, 990, WORLD_WIDTH, 18);
    g.lineStyle(8, 0xf4d66d, 0.9).lineBetween(0, 875, WORLD_WIDTH, 875);

    this.drawHouse(g, 250, 470, 360, 245, 0xf5f1e8, 0x526170, "ANDREW'S", 0xef9336);
    this.drawHouse(g, 700, 460, 330, 255, 0xe9d7b9, 0x76533f, "NEIGHBOR", 0x746b62);
    this.drawHouse(g, 1120, 430, 400, 285, 0x3f78a8, 0xf3f2e7, "BILLY'S", 0x72bd64);
    this.drawHouse(g, 1690, 460, 370, 255, 0xaad7ea, 0xa33e3e, "JEREMY'S", 0xdd5757);

    g.fillStyle(0x555b5c);
    g.fillRect(370, 715, 115, 110).fillRect(820, 715, 110, 110);
    g.fillRect(1270, 715, 125, 110).fillRect(1815, 715, 115, 110);

    g.fillStyle(0x3b91a6).fillRect(1435, 0, 115, 410);
    g.lineStyle(10, 0xb9e080).lineBetween(1428, 0, 1428, 410).lineBetween(1557, 0, 1557, 410);
    g.fillStyle(0xb18a57).fillRect(1060, 260, 50, 470).fillRect(1060, 260, 380, 50);

    for (const [x, y, size] of [[90, 300, 68], [660, 260, 64], [2100, 310, 78], [2220, 610, 70], [90, 650, 64], [1600, 240, 56]] as const) {
      g.fillStyle(0x315f3b).fillCircle(x, y, size);
      g.fillStyle(0x477f47).fillCircle(x - 12, y - 15, size * 0.72);
    }

    this.addLabel(1135, 790, "Wheatfield Drive");
    this.addLabel(1495, 70, "Creek woods ↑", "#17475a");
    this.addLabel(120, 875, "← Bent Creek");
    this.addLabel(2180, 875, "Stonehenge →");
    this.addLabel(2050, 1050, "Reidenbaugh ↗");
    this.addLabel(1120, 1390, "Fruitville Pike ↓");

    this.addObstacle(250, 470, 360, 245);
    this.addObstacle(700, 460, 330, 255);
    this.addObstacle(1120, 430, 400, 285);
    this.addObstacle(1690, 460, 370, 255);
    this.addObstacle(1435, 0, 115, 255);
    this.addObstacle(0, 0, WORLD_WIDTH, 20);
    this.addObstacle(0, WORLD_HEIGHT - 20, WORLD_WIDTH, 20);
    this.addObstacle(0, 0, 20, WORLD_HEIGHT);
    this.addObstacle(WORLD_WIDTH - 20, 0, 20, WORLD_HEIGHT);
  }

  private drawHouse(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    siding: number,
    trim: number,
    name: string,
    accent: number,
  ): void {
    g.fillStyle(0x26352f, 0.2).fillRect(x + 14, y + 16, width, height);
    g.fillStyle(siding).fillRect(x, y, width, height);
    g.fillStyle(0x3a3d42).fillTriangle(x - 20, y, x + width / 2, y - 105, x + width + 20, y);
    g.fillStyle(trim);
    for (let windowX = x + 45; windowX < x + width - 40; windowX += 90) g.fillRect(windowX, y + 55, 42, 62);
    g.fillStyle(accent).fillRect(x + width / 2 - 32, y + height - 85, 64, 85);
    this.addLabel(x + width / 2, y - 55, name);
  }

  private addCharacters(): void {
    this.add.sprite(440, 690, "andrew").setDepth(45);
    this.add.sprite(1860, 690, "jeremy").setDepth(45);
    this.addLabel(440, 635, "Andrew", "#7d461b");
    this.addLabel(1860, 635, "Jeremy", "#7a2630");
  }

  private addInteractions(): void {
    this.registerInteraction({
      id: "jeremy",
      x: 1860,
      y: 690,
      label: "Talk to Jeremy",
      interact: () => this.talkToJeremy(),
    });
    this.registerInteraction({
      id: "andrew",
      x: 440,
      y: 690,
      label: "Talk to Andrew",
      interact: () => this.talkToAndrew(),
    });
    this.registerInteraction({
      id: "side_yard_gap",
      x: 1085,
      y: 500,
      label: "Inspect bent grass",
      interact: () => this.inspectGap(),
    });
    this.registerRegionInteraction({
      id: "woods_gate",
      x: 1340,
      y: 290,
      width: 180,
      height: 100,
      label: "Enter the creek woods",
      interact: () => this.enterWoods(),
    });
    this.registerBlockedRoute("bent_creek", 70, 875);
    this.registerBlockedRoute("stonehenge", 2230, 875);
    this.registerBlockedRoute("reidenbaugh", 2130, 1050);
    this.registerBlockedRoute("fruitville", 1120, 1390);
  }

  private talkToJeremy(): void {
    const stage = gameStore.getState().questStage;
    if (stage === "return_to_jeremy" && gameStore.hasInventoryItem(CONTROLLER_ITEM)) {
      this.showDialogue(getQuestCompletionDialogue(), () => this.advance({ type: "returned_controller" }));
      return;
    }
    this.showDialogue(getJeremyDialogue(stage), () => {
      if (stage === "talk_to_jeremy") this.advance({ type: "talked_to_jeremy" });
    });
  }

  private talkToAndrew(): void {
    const stage = gameStore.getState().questStage;
    this.showDialogue(getAndrewDialogue(stage), () => {
      if (stage === "talk_to_andrew") this.advance({ type: "talked_to_andrew" });
    });
  }

  private inspectGap(): void {
    const stage = gameStore.getState().questStage;
    this.showDialogue(getClueDialogue("side_yard_gap", stage), () => {
      if (stage === "search_yards") this.advance({ type: "inspected_creek_clue" });
    });
  }

  private enterWoods(): void {
    gameEvents.emit(EVENT.hint, "");
    gameStore.setCurrentMap("creek");
    this.scene.start("creek");
  }

  private registerBlockedRoute(route: "bent_creek" | "stonehenge" | "reidenbaugh" | "fruitville", x: number, y: number): void {
    this.registerInteraction({
      id: `blocked_${route}`,
      x,
      y,
      label: "Check the way ahead",
      interact: () => this.showDialogue(getBlockedRouteDialogue(route, gameStore.getState().questStage)),
    });
  }

  private advance(event: QuestEvent): void {
    const current = gameStore.getState().questStage;
    gameStore.setQuestStage(nextStage(current, event));
  }

  protected override getDebugObjectivePosition(): { x: number; y: number } {
    switch (gameStore.getState().questStage) {
      case "talk_to_jeremy":
      case "return_to_jeremy":
      case "complete":
        return { x: 1860, y: 720 };
      case "talk_to_andrew":
        return { x: 440, y: 720 };
      case "search_yards":
        return { x: 1085, y: 530 };
      case "search_creek":
        return { x: 1340, y: 330 };
    }
  }
}
