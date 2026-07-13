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
    // A deep, cool woodland floor underpins the brighter playable clearings.
    g.fillStyle(0x173d2c).fillRect(0, 0, WIDTH, HEIGHT);
    this.drawGroundMosaic(g);
    this.drawCreek(g);
    this.drawTrails(g);

    // Search pockets are composed around the existing interaction coordinates.
    this.drawClearing(g, 680, 610, 235, 165, 0x75a84d);
    this.drawTallGrass(g, 510, 475, 350, 270, true);
    this.drawClearing(g, 1530, 865, 205, 155, 0x80ad53);
    this.drawTallGrass(g, 1320, 510, 275, 225);
    this.drawTallGrass(g, 420, 790, 285, 225);
    this.drawTallGrass(g, 1260, 890, 215, 155);

    this.drawBridge(g, 1060);
    this.drawBridge(g, 365);
    this.drawFallenLog(g, 375, 235, 355);
    this.drawRockCluster(g, 330, 1030, 1.1);
    this.drawRockCluster(g, 1610, 445, 0.9);
    this.drawRockCluster(g, 1450, 920, 0.65);

    // The perimeter is intentionally dense while the trail loop remains readable.
    const trees: ReadonlyArray<readonly [number, number, number]> = [
      [75, 95, 1.2], [235, 105, 0.95], [425, 85, 1.15], [650, 105, 0.9], [820, 75, 1.25],
      [1240, 80, 1.15], [1440, 110, 0.9], [1640, 75, 1.25], [1870, 120, 1.05], [1990, 260, 1.15],
      [75, 350, 1.1], [95, 610, 1.2], [70, 865, 1.05], [90, 1120, 1.2], [210, 1420, 1.1],
      [420, 1480, 1.1], [650, 1435, 0.9], [790, 1490, 1.2], [1280, 1470, 1.15], [1510, 1440, 0.95],
      [1740, 1480, 1.2], [1965, 1400, 1.1], [1980, 1160, 1.25], [1960, 900, 1.05],
      [1985, 650, 1.15], [1880, 390, 0.95], [360, 180, 0.85], [1760, 190, 0.9],
    ];
    for (const [x, y, scale] of trees) this.drawTree(g, x, y, scale);
    this.drawShrubBorder(g);

    // Small environmental cues replace the old explanatory map labels.
    this.drawTrailMarker(g, 1015, 1328, "W");
    this.drawTrailMarker(g, 1170, 255, "N");
    this.drawWaterGlints();
    this.drawForegroundVegetation();

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

  private drawGroundMosaic(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x4f813f).fillRoundedRect(120, 70, 1808, 1390, 170);
    g.fillStyle(0x5f9345).fillRoundedRect(205, 150, 1630, 1230, 150);
    const patches: ReadonlyArray<readonly [number, number, number, number, number]> = [
      [270, 155, 390, 230, 0x6b9c4b], [1210, 150, 480, 250, 0x4f853e],
      [260, 690, 440, 360, 0x578e42], [1270, 620, 450, 390, 0x679a49],
      [330, 1120, 520, 230, 0x6a9b4c], [1220, 1110, 480, 225, 0x568c41],
    ];
    for (const [x, y, w, h, color] of patches) g.fillStyle(color, 0.72).fillEllipse(x + w / 2, y + h / 2, w, h);
    g.fillStyle(0x9fc36b, 0.35);
    for (let y = 170; y < 1390; y += 72) {
      for (let x = 190 + ((y / 72) % 2) * 35; x < 1880; x += 88) {
        if (x > 880 && x < 1180) continue;
        const n = (x * 7 + y * 13) % 31;
        g.fillRect(x + n, y + (n % 9), 4, 9).fillRect(x + n + 7, y + (n % 7) + 3, 3, 6);
      }
    }
  }

  private drawCreek(g: Phaser.GameObjects.Graphics): void {
    const left = [
      new Phaser.Geom.Point(925, 0), new Phaser.Geom.Point(942, 150), new Phaser.Geom.Point(920, 310),
      new Phaser.Geom.Point(951, 480), new Phaser.Geom.Point(928, 650), new Phaser.Geom.Point(944, 820),
      new Phaser.Geom.Point(920, 980), new Phaser.Geom.Point(950, 1160), new Phaser.Geom.Point(930, 1340), new Phaser.Geom.Point(945, HEIGHT),
    ];
    const right = [
      new Phaser.Geom.Point(1140, HEIGHT), new Phaser.Geom.Point(1122, 1340), new Phaser.Geom.Point(1148, 1180),
      new Phaser.Geom.Point(1118, 1000), new Phaser.Geom.Point(1142, 820), new Phaser.Geom.Point(1120, 650),
      new Phaser.Geom.Point(1149, 470), new Phaser.Geom.Point(1119, 300), new Phaser.Geom.Point(1140, 145), new Phaser.Geom.Point(1125, 0),
    ];
    const creek = [...left, ...right];
    g.fillStyle(0x244f55).fillPoints(creek, true);
    g.lineStyle(18, 0x365f3d, 1).strokePoints(left, false).strokePoints([...right].reverse(), false);
    g.lineStyle(9, 0x91a958, 0.85).strokePoints(left, false).strokePoints([...right].reverse(), false);
    g.fillStyle(0x2e6871).fillRect(964, 0, 135, HEIGHT);
    g.fillStyle(0x397b83, 0.65);
    for (let y = 28; y < HEIGHT; y += 84) {
      const offset = (y / 7) % 29;
      g.fillRoundedRect(978 + offset, y, 72, 5, 2);
      g.fillRoundedRect(1050 - offset / 2, y + 35, 34, 4, 2);
    }
    g.fillStyle(0xb4c889, 0.8);
    for (const [x, y] of [[938, 175], [1125, 245], [934, 740], [1127, 930], [936, 1280]] as const) {
      g.fillEllipse(x, y, 22, 8).fillEllipse(x + 12, y + 9, 18, 7);
    }
  }

  private drawTrails(g: Phaser.GameObjects.Graphics): void {
    const leftLoop = [
      new Phaser.Geom.Point(1020, 1365), new Phaser.Geom.Point(760, 1225), new Phaser.Geom.Point(435, 1230),
      new Phaser.Geom.Point(285, 1090), new Phaser.Geom.Point(275, 760), new Phaser.Geom.Point(290, 430),
      new Phaser.Geom.Point(480, 340), new Phaser.Geom.Point(760, 345), new Phaser.Geom.Point(920, 405),
    ];
    const rightLoop = [
      new Phaser.Geom.Point(1130, 405), new Phaser.Geom.Point(1390, 340), new Phaser.Geom.Point(1700, 355),
      new Phaser.Geom.Point(1770, 560), new Phaser.Geom.Point(1760, 930), new Phaser.Geom.Point(1710, 1195),
      new Phaser.Geom.Point(1420, 1230), new Phaser.Geom.Point(1150, 1230), new Phaser.Geom.Point(1020, 1365),
    ];
    for (const points of [leftLoop, rightLoop]) {
      g.lineStyle(94, 0x6c5738, 0.28).strokePoints(points, false);
      g.lineStyle(76, 0xa77d4c, 1).strokePoints(points, false);
      g.lineStyle(58, 0xbd955d, 1).strokePoints(points, false);
      g.lineStyle(5, 0xd0ad73, 0.38).strokePoints(points, false);
    }
    // Short, worn spurs lead naturally to both discoveries.
    g.lineStyle(48, 0xaf8754, 1)
      .strokePoints([new Phaser.Geom.Point(290, 730), new Phaser.Geom.Point(470, 690), new Phaser.Geom.Point(610, 620)], false)
      .strokePoints([new Phaser.Geom.Point(1755, 850), new Phaser.Geom.Point(1600, 860), new Phaser.Geom.Point(1530, 865)], false);
    g.fillStyle(0x755b38, 0.3);
    for (const [x, y] of [[460, 1228], [620, 344], [285, 955], [1470, 342], [1758, 690], [1450, 1227], [830, 1260]] as const) {
      g.fillEllipse(x, y, 44, 17);
    }
  }

  private drawBridge(g: Phaser.GameObjects.Graphics, y: number): void {
    g.fillStyle(0x3c3025, 0.45).fillRoundedRect(818, y + 10, 444, 88, 8);
    g.fillStyle(0x765235).fillRect(820, y, 440, 80);
    g.fillStyle(0xb98148);
    for (let x = 832; x < 1250; x += 38) {
      g.fillRoundedRect(x, y + 7, 30, 66, 4);
      g.fillStyle(0xd39b5c).fillRect(x + 4, y + 11, 4, 55);
      g.fillStyle(0xb98148);
    }
    g.fillStyle(0x503722).fillRect(820, y + 4, 440, 7).fillRect(820, y + 69, 440, 7);
    g.fillStyle(0xd9b16d).fillRect(838, y + 18, 400, 3);
  }

  private drawClearing(g: Phaser.GameObjects.Graphics, x: number, y: number, rx: number, ry: number, color: number): void {
    g.fillStyle(0x335f35, 0.35).fillEllipse(x + 10, y + 16, rx * 2.05, ry * 2.05);
    g.fillStyle(color).fillEllipse(x, y, rx * 2, ry * 2);
    g.fillStyle(0x9abd63, 0.42).fillEllipse(x - 18, y - 20, rx * 1.55, ry * 1.45);
  }

  private drawTallGrass(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    hidingPocket = false,
  ): void {
    g.fillStyle(0x3e7639, 0.62).fillRoundedRect(x, y, width, height, 55);
    const colors = [0x477f3e, 0x5e9847, 0x83b354, 0x9abe61];
    for (let gy = y + 20; gy < y + height - 8; gy += 25) {
      for (let gx = x + 18 + ((gy / 25) % 2) * 9; gx < x + width - 8; gx += 24) {
        if (hidingPocket && Phaser.Math.Distance.Between(gx, gy, 680, 610) < 52) continue;
        const color = colors[(gx + gy) % colors.length]!;
        g.lineStyle(4, color, 0.95).lineBetween(gx, gy + 11, gx - 4, gy - 9).lineBetween(gx, gy + 11, gx + 7, gy - 5);
      }
    }
    if (hidingPocket) {
      g.fillStyle(0x527f3d, 0.65).fillEllipse(680, 615, 118, 78);
      g.lineStyle(3, 0xa7c56a, 0.7).strokeEllipse(680, 615, 105, 65);
    }
  }

  private drawFallenLog(g: Phaser.GameObjects.Graphics, x: number, y: number, length: number): void {
    g.fillStyle(0x2d3c2d, 0.35).fillRoundedRect(x + 9, y + 16, length, 62, 22);
    g.fillStyle(0x61422c).fillRoundedRect(x, y, length, 58, 20);
    g.fillStyle(0x93623b).fillRoundedRect(x + 12, y + 7, length - 28, 18, 8);
    g.fillStyle(0xc18a50).fillCircle(x + 8, y + 29, 29).fillCircle(x + length - 5, y + 29, 28);
    g.lineStyle(4, 0x70472b).strokeCircle(x + 8, y + 29, 16).strokeCircle(x + length - 5, y + 29, 15);
    g.fillStyle(0x73964b).fillEllipse(x + 110, y + 3, 52, 13).fillEllipse(x + 250, y + 6, 37, 10);
  }

  private drawRockCluster(g: Phaser.GameObjects.Graphics, x: number, y: number, scale: number): void {
    g.fillStyle(0x384d3b, 0.3).fillEllipse(x + 10, y + 18, 135 * scale, 55 * scale);
    for (const [dx, dy, r] of [[0, 0, 35], [48, 8, 25], [-42, 12, 21]] as const) {
      g.fillStyle(0x657469).fillCircle(x + dx * scale, y + dy * scale, r * scale);
      g.fillStyle(0x9aa18b).fillEllipse(x + (dx - 7) * scale, y + (dy - 9) * scale, r * 1.2 * scale, r * 0.62 * scale);
      g.fillStyle(0xb7b892, 0.6).fillCircle(x + (dx - 10) * scale, y + (dy - 11) * scale, 4 * scale);
    }
  }

  private drawTree(g: Phaser.GameObjects.Graphics, x: number, y: number, scale = 1): void {
    g.fillStyle(0x142e25, 0.4).fillEllipse(x + 20 * scale, y + 34 * scale, 145 * scale, 65 * scale);
    g.fillStyle(0x493523).fillRect(x - 13 * scale, y - 5 * scale, 26 * scale, 74 * scale);
    g.fillStyle(0x6f4b2d).fillRect(x - 8 * scale, y, 8 * scale, 62 * scale);
    g.fillStyle(0x173e2d).fillCircle(x, y - 30 * scale, 70 * scale);
    g.fillStyle(0x245b36).fillCircle(x - 30 * scale, y - 45 * scale, 48 * scale);
    g.fillStyle(0x337344).fillCircle(x + 25 * scale, y - 50 * scale, 53 * scale);
    g.fillStyle(0x4b8950).fillCircle(x - 8 * scale, y - 66 * scale, 42 * scale);
    g.fillStyle(0x77a95a, 0.72).fillCircle(x - 21 * scale, y - 76 * scale, 15 * scale);
  }

  private drawShrubBorder(g: Phaser.GameObjects.Graphics): void {
    const shrubs: Array<[number, number]> = [];
    for (let x = 150; x < 1940; x += 92) shrubs.push([x, 155 + ((x * 3) % 54)], [x, 1390 - ((x * 5) % 48)]);
    for (let y = 230; y < 1350; y += 88) shrubs.push([145 + ((y * 3) % 40), y], [1905 - ((y * 5) % 38), y]);
    for (const [x, y] of shrubs) {
      g.fillStyle(0x234e32).fillCircle(x, y, 28);
      g.fillStyle(0x3d7540).fillCircle(x - 9, y - 9, 21);
      g.fillStyle(0x6ca24e).fillCircle(x + 8, y - 12, 13);
    }
  }

  private drawTrailMarker(g: Phaser.GameObjects.Graphics, x: number, y: number, mark: string): void {
    g.fillStyle(0x473222).fillRect(x - 5, y, 10, 48);
    g.fillStyle(0xc29a5d).fillRoundedRect(x - 27, y - 22, 54, 37, 5);
    g.lineStyle(3, 0x6f4b2c).strokeRoundedRect(x - 27, y - 22, 54, 37, 5);
    this.add.text(x, y - 4, mark, {
      color: "#5a3b25", fontFamily: "monospace", fontSize: "16px", fontStyle: "bold",
    }).setOrigin(0.5).setDepth(2);
  }

  private drawWaterGlints(): void {
    const glints = this.add.graphics().setDepth(3);
    glints.fillStyle(0xa6d5ce, 0.42);
    for (let y = 45; y < HEIGHT; y += 96) {
      const x = 982 + ((y * 11) % 72);
      glints.fillRoundedRect(x, y, 45, 4, 2).fillRoundedRect(1060 - ((y * 7) % 42), y + 31, 24, 3, 2);
    }
    this.tweens.add({ targets: glints, alpha: 0.25, y: 7, duration: 1800, yoyo: true, repeat: -1, ease: "Sine.inOut" });
  }

  private drawForegroundVegetation(): void {
    const fg = this.add.graphics().setDepth(55);
    const clumps: ReadonlyArray<readonly [number, number, number]> = [
      [32, 520, 1.2], [38, 1040, 1.35], [260, 1512, 1.15], [560, 1518, 1.25],
      [1510, 1515, 1.25], [1800, 1510, 1.4], [2018, 550, 1.25], [2015, 1080, 1.35],
    ];
    for (const [x, y, scale] of clumps) {
      fg.fillStyle(0x123425).fillCircle(x, y, 62 * scale);
      fg.fillStyle(0x235936).fillCircle(x - 24 * scale, y - 18 * scale, 39 * scale);
      fg.fillStyle(0x397745).fillCircle(x + 25 * scale, y - 28 * scale, 45 * scale);
      fg.fillStyle(0x71a453, 0.75).fillCircle(x + 5 * scale, y - 52 * scale, 18 * scale);
    }
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
