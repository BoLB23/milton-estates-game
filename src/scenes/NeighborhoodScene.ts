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
    // Keep Billy low in the opening frame so his house, driveway, and the
    // route toward Wheatfield Drive are visible without changing spawn data.
    if (data?.spawn !== "woods") this.cameras.main.setFollowOffset(0, 170);
    this.drawWorld();
    this.addCharacters();
    this.addInteractions();
    gameEvents.emit(EVENT.stateChanged, gameStore.getState());
  }

  private drawWorld(): void {
    const g = this.add.graphics();
    this.drawGround(g);
    this.drawDistantEdges(g);
    this.drawRoad(g);

    this.drawAndrewHouse(g, 250, 470, 360, 245);
    this.drawNeighborHouse(g, 700, 460, 330, 255);
    this.drawBillyHouse(g, 1120, 430, 400, 285);
    this.drawJeremyHouse(g, 1690, 460, 370, 255);

    this.drawDriveway(g, 370, 700, 115, 138, 0x6f7472);
    this.drawDriveway(g, 820, 700, 110, 136, 0x8a8377);
    this.drawDriveway(g, 1248, 675, 175, 175, 0x737a79);
    this.drawDriveway(g, 1815, 700, 115, 140, 0x7d7b76);

    this.drawCreekApproach(g);
    this.drawYardDetails(g);
    this.drawRouteSigns();

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

  private drawGround(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x78b95d).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    g.fillStyle(0x91c86a).fillRect(0, 330, WORLD_WIDTH, 430);
    g.fillStyle(0x86c265).fillRect(0, 1010, WORLD_WIDTH, 490);

    // Mown lawn stripes and tiny clover marks keep the broad yards from reading as tiles.
    g.fillStyle(0xa0d278, 0.22);
    for (let x = 36; x < WORLD_WIDTH; x += 96) g.fillRect(x, 338, 46, 400);
    for (let y = 1050; y < WORLD_HEIGHT; y += 72) g.fillRect(0, y, WORLD_WIDTH, 28);
    g.fillStyle(0x4f9149, 0.55);
    for (let x = 48; x < WORLD_WIDTH; x += 137) {
      const y = 374 + ((x * 7) % 310);
      g.fillRect(x, y, 5, 11).fillRect(x + 7, y + 4, 4, 7);
    }
  }

  private drawDistantEdges(g: Phaser.GameObjects.Graphics): void {
    // North: corn and hedgerows beyond the last back yards.
    g.fillStyle(0xd0b85b).fillRect(0, 0, 1040, 188);
    g.fillStyle(0xb09b49);
    for (let x = 18; x < 1040; x += 28) {
      g.fillRect(x, 8, 7, 170);
      g.fillStyle(0xe0cb68).fillRect(x + 7, 24 + (x % 38), 10, 5);
      g.fillStyle(0xb09b49);
    }
    g.fillStyle(0x486e3b).fillRect(0, 184, 1040, 24);
    for (let x = 20; x < 1040; x += 52) this.drawShrub(g, x, 192, 22, 0x3f763c);

    // The country-club edge is visible but its cart path is deliberately fenced off.
    g.fillStyle(0x69a958).fillRect(0, 1070, 430, 430);
    g.fillStyle(0x99cf75).fillEllipse(40, 1210, 340, 150);
    g.fillStyle(0xc7d58c).fillEllipse(68, 1218, 72, 38);
    g.fillStyle(0x507e4d).fillEllipse(320, 1420, 270, 110);
    g.lineStyle(14, 0xd5cba4).beginPath().moveTo(0, 1110).lineTo(185, 1160).lineTo(350, 1300).strokePath();
    this.drawFence(g, 30, 1055, 360);

    // East: school fields and Stonehenge open acreage beyond the neighborhood.
    g.fillStyle(0xa8c96f).fillRect(2070, 1035, 230, 465);
    g.lineStyle(4, 0xe9ead0, 0.6).strokeRect(2110, 1120, 190, 245);
    g.lineStyle(5, 0xe9ead0, 0.55).lineBetween(2205, 1120, 2205, 1365);
    g.fillStyle(0xe6d3a2).fillRect(2240, 1062, 60, 16);
    g.fillStyle(0x775b42).fillRect(2248, 1024, 52, 38);

    // South fields point toward Fruitville Pike without pretending the route is playable.
    g.fillStyle(0xb5a858).fillRect(650, 1330, 930, 170);
    g.lineStyle(5, 0x978b48, 0.7);
    for (let y = 1340; y < 1500; y += 22) g.lineBetween(650, y, 1580, y);
    g.fillStyle(0x395f38).fillRect(650, 1310, 930, 25);
  }

  private drawRoad(g: Phaser.GameObjects.Graphics): void {
    const outer = [
      new Phaser.Geom.Point(0, 720), new Phaser.Geom.Point(420, 726),
      new Phaser.Geom.Point(780, 748), new Phaser.Geom.Point(1120, 740),
      new Phaser.Geom.Point(1480, 756), new Phaser.Geom.Point(1840, 724),
      new Phaser.Geom.Point(2300, 746), new Phaser.Geom.Point(2300, 1025),
      new Phaser.Geom.Point(1900, 1008), new Phaser.Geom.Point(1500, 1035),
      new Phaser.Geom.Point(1120, 1018), new Phaser.Geom.Point(760, 1030),
      new Phaser.Geom.Point(390, 1002), new Phaser.Geom.Point(0, 1008),
    ];
    const asphalt = [
      new Phaser.Geom.Point(0, 746), new Phaser.Geom.Point(420, 752),
      new Phaser.Geom.Point(780, 774), new Phaser.Geom.Point(1120, 766),
      new Phaser.Geom.Point(1480, 782), new Phaser.Geom.Point(1840, 750),
      new Phaser.Geom.Point(2300, 772), new Phaser.Geom.Point(2300, 999),
      new Phaser.Geom.Point(1900, 982), new Phaser.Geom.Point(1500, 1009),
      new Phaser.Geom.Point(1120, 992), new Phaser.Geom.Point(760, 1004),
      new Phaser.Geom.Point(390, 976), new Phaser.Geom.Point(0, 982),
    ];
    g.fillStyle(0xd1c7a9).fillPoints(outer, true);
    g.fillStyle(0x4b5458).fillPoints(asphalt, true);
    g.lineStyle(5, 0x7c8788, 0.8).strokePoints(asphalt, true);
    g.lineStyle(4, 0x687277, 0.55);
    g.beginPath().moveTo(0, 865).lineTo(410, 871).lineTo(780, 889).lineTo(1120, 880)
      .lineTo(1480, 896).lineTo(1840, 866).lineTo(2300, 886).strokePath();
    g.fillStyle(0xd0a94b, 0.9);
    for (let x = 30; x < 2280; x += 92) g.fillRect(x, 875 + Math.round(Math.sin(x / 170) * 10), 48, 5);

    // Curb cuts, drain grates, and utility seams.
    g.fillStyle(0x252d31);
    for (const x of [150, 630, 1030, 1620, 2110]) {
      g.fillRect(x, x % 2 ? 970 : 758, 54, 12);
      g.fillStyle(0x768084);
      for (let gx = x + 5; gx < x + 50; gx += 10) g.fillRect(gx, x % 2 ? 972 : 760, 3, 8);
      g.fillStyle(0x252d31);
    }
  }

  private drawAndrewHouse(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number): void {
    this.drawHouseShadow(g, x, y, width, height);
    g.fillStyle(0xeeeadd).fillRect(x, y, width, height);
    this.drawSiding(g, x, y + 12, width, height - 12, 0xd6d4cb);
    g.fillStyle(0x343c43).fillTriangle(x - 18, y + 5, x + 162, y - 112, x + 292, y + 5);
    g.fillStyle(0x49535a).fillTriangle(x + 180, y + 6, x + 285, y - 68, x + width + 18, y + 6);
    g.fillStyle(0xf9f6ed).fillRect(x + 22, y + 34, 92, 170);
    this.drawWindow(g, x + 42, y + 72, 48, 72, 0x4e6f78, 0xffffff);
    this.drawWindow(g, x + 244, y + 62, 55, 72, 0x54727d, 0xffffff);
    g.fillStyle(0x9b542f).fillRect(x + 144, y + 146, 54, 99);
    g.fillStyle(0xf4f0e2).fillRect(x + 137, y + 138, 68, 9);
    g.fillStyle(0x342e28).fillRect(x + 184, y + 192, 5, 5);
    g.fillStyle(0xa49b8a).fillRect(x + 126, y + 235, 92, 10);
  }

  private drawNeighborHouse(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number): void {
    this.drawHouseShadow(g, x, y, width, height);
    g.fillStyle(0xb97455).fillRect(x, y + 35, width, height - 35);
    g.fillStyle(0xeadfc9).fillRect(x + 198, y + 35, 132, height - 35);
    g.fillStyle(0x4a413d).fillTriangle(x - 18, y + 38, x + 125, y - 72, x + 245, y + 38);
    g.fillStyle(0x514944).fillTriangle(x + 142, y + 38, x + 252, y - 42, x + width + 15, y + 38);
    for (let by = y + 58; by < y + height; by += 18) {
      g.fillStyle(0x8f523e).fillRect(x + 8, by, 182, 4);
      for (let bx = x + 22 + ((by / 18) % 2) * 12; bx < x + 190; bx += 28) g.fillRect(bx, by - 14, 3, 14);
    }
    this.drawWindow(g, x + 52, y + 76, 54, 64, 0x567783, 0xf1e7d2);
    this.drawWindow(g, x + 225, y + 70, 55, 68, 0x567783, 0xffffff);
    g.fillStyle(0x5a4135).fillRect(x + 233, y + 165, 55, 90);
  }

  private drawBillyHouse(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number): void {
    this.drawHouseShadow(g, x, y, width, height);
    g.fillStyle(0x477da3).fillRect(x, y + 22, width, height - 22);
    this.drawSiding(g, x, y + 32, width, height - 32, 0x346b92);
    g.fillStyle(0x37444d).fillTriangle(x - 20, y + 28, x + 145, y - 92, x + 292, y + 28);
    g.fillStyle(0x445159).fillTriangle(x + 220, y + 29, x + 315, y - 44, x + width + 20, y + 29);
    g.fillStyle(0xf3f0df).fillRect(x + 12, y + 44, 12, height - 44).fillRect(x + 383, y + 44, 12, height - 44);
    this.drawWindow(g, x + 55, y + 72, 58, 68, 0x4b7180, 0xf8f4e4);
    this.drawWindow(g, x + 148, y + 66, 58, 72, 0x4b7180, 0xf8f4e4);
    g.fillStyle(0xf5f0dd).fillRect(x + 236, y + 119, 150, 150);
    g.fillStyle(0x9ca9aa).fillRect(x + 249, y + 137, 124, 119);
    g.lineStyle(5, 0xe5e7df);
    for (let gy = y + 163; gy < y + 250; gy += 29) g.lineBetween(x + 249, gy, x + 373, gy);
    g.fillStyle(0xbf6c3e).fillRect(x + 158, y + 181, 55, 104);
    g.fillStyle(0xe9e5d8).fillRect(x + 151, y + 171, 69, 10);
  }

  private drawJeremyHouse(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number): void {
    this.drawHouseShadow(g, x, y, width, height);
    g.fillStyle(0xa8d7e6).fillRect(x, y + 18, width, height - 18);
    this.drawSiding(g, x, y + 28, width, height - 28, 0x82bdcf);
    g.fillStyle(0x48505a).fillTriangle(x - 18, y + 24, x + 180, y - 96, x + width + 18, y + 24);
    g.fillStyle(0xe9f0e9).fillRect(x + 16, y + 40, 11, height - 40).fillRect(x + width - 26, y + 40, 11, height - 40);
    this.drawWindow(g, x + 52, y + 70, 56, 70, 0x4b7683, 0xf4f5e9);
    this.drawShutters(g, x + 38, y + 66, 84, 79);
    this.drawWindow(g, x + 244, y + 69, 56, 70, 0x4b7683, 0xf4f5e9);
    this.drawShutters(g, x + 230, y + 65, 84, 79);
    g.fillStyle(0xa33e43).fillRect(x + 153, y + 157, 62, 98);
    g.fillStyle(0xf1eee2).fillRect(x + 145, y + 149, 78, 9);
    g.fillStyle(0x744a37).fillRect(x + 136, y + 241, 96, 14);
  }

  private drawHouseShadow(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number): void {
    g.fillStyle(0x27442f, 0.28).fillRect(x + 17, y + 18, width, height);
  }

  private drawSiding(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number, color: number): void {
    g.fillStyle(color, 0.55);
    for (let sy = y; sy < y + height; sy += 15) g.fillRect(x, sy, width, 4);
  }

  private drawWindow(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number, glass: number, trim: number): void {
    g.fillStyle(trim).fillRect(x - 7, y - 7, width + 14, height + 14);
    g.fillStyle(glass).fillRect(x, y, width, height);
    g.fillStyle(0x9dc0be, 0.65).fillTriangle(x + 4, y + 4, x + width - 5, y + 4, x + 4, y + height - 7);
    g.fillStyle(trim).fillRect(x + width / 2 - 2, y, 4, height).fillRect(x, y + height / 2 - 2, width, 4);
  }

  private drawShutters(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number): void {
    g.fillStyle(0xa33e43).fillRect(x, y, 11, height).fillRect(x + width - 11, y, 11, height);
    g.fillStyle(0x782f36);
    for (let sy = y + 8; sy < y + height - 4; sy += 13) {
      g.fillRect(x + 2, sy, 7, 3).fillRect(x + width - 9, sy, 7, 3);
    }
  }

  private drawDriveway(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number, color: number): void {
    g.fillStyle(0x405a42, 0.22).fillRect(x + 9, y + 8, width, height);
    g.fillStyle(color).fillRect(x, y, width, height);
    g.fillStyle(0xaeb3ab, 0.2);
    for (let sy = y + 18; sy < y + height; sy += 31) g.fillRect(x + 8, sy, width - 16, 3);
  }

  private drawCreekApproach(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x2f7687).fillRect(1435, 0, 115, 410);
    g.fillStyle(0x66b8c1, 0.65);
    for (let y = 18; y < 410; y += 48) g.fillRect(1450, y, 72, 6);
    g.fillStyle(0x426f3f).fillRect(1418, 0, 17, 410).fillRect(1550, 0, 18, 410);
    g.fillStyle(0xb08b59).fillRect(1060, 260, 50, 470).fillRect(1060, 260, 380, 50);
    g.fillStyle(0xd0ae72).fillRect(1069, 269, 32, 452).fillRect(1069, 269, 362, 32);
    for (let y = 286; y < 716; y += 64) g.fillStyle(0x8e6b45).fillRect(1070, y, 31, 7);
    for (let x = 1120; x < 1420; x += 62) g.fillStyle(0x8e6b45).fillRect(x, 270, 7, 31);
    // A short fence marks the property line without closing the playable creek gate.
    this.drawFence(g, 1120, 322, 150);
    this.drawEvergreen(g, 1600, 250, 64);
    this.drawDeciduousTree(g, 1345, 230, 58, 0x397944);
  }

  private drawYardDetails(g: Phaser.GameObjects.Graphics): void {
    // Uneven foundation planting and flower beds.
    for (const [x, y, w, color] of [
      [268, 690, 82, 0x356d3d], [500, 690, 94, 0x417a42], [713, 690, 96, 0x3f713d],
      [945, 690, 70, 0x4d7f44], [1138, 690, 88, 0x315f39], [1435, 690, 70, 0x3b7040],
      [1705, 690, 90, 0x3c7541], [1945, 690, 96, 0x376c3a],
    ] as const) {
      g.fillStyle(0x634b35).fillEllipse(x + w / 2, y + 8, w, 28);
      for (let sx = x + 12; sx < x + w; sx += 24) this.drawShrub(g, sx, y, 16, color);
    }
    for (const [x, y, color] of [[304, 690, 0xf0c84c], [744, 692, 0xf28572], [1187, 689, 0xf5d45c], [1758, 690, 0xed6e82], [1980, 690, 0xf5d266]] as const) {
      g.fillStyle(color).fillRect(x, y - 7, 7, 7).fillRect(x + 7, y - 2, 6, 6);
    }

    this.drawDeciduousTree(g, 115, 430, 82, 0x3c7741);
    this.drawEvergreen(g, 650, 320, 84);
    this.drawDeciduousTree(g, 1025, 430, 76, 0x417e43);
    this.drawDeciduousTree(g, 1548, 500, 84, 0x3a7440);
    this.drawEvergreen(g, 1642, 365, 74);
    this.drawDeciduousTree(g, 2130, 450, 92, 0x35723e);
    this.drawDeciduousTree(g, 2220, 660, 70, 0x427f43);
    this.drawEvergreen(g, 72, 665, 70);

    this.drawMailbox(g, 324, 724, 0xeeeeea);
    this.drawMailbox(g, 760, 742, 0x6b4d3d);
    this.drawMailbox(g, 1178, 735, 0x315f83);
    this.drawMailbox(g, 2010, 724, 0xa9d5df);
    this.drawCar(g, 1267, 718, 136, 62, 0xbec7c5);
    this.drawCar(g, 1830, 735, 94, 52, 0xa94d3f);
    this.drawBasketballHoop(g, 1437, 625);

    // Yard-life details: hose, bird bath, picnic toys, and a bright plastic wagon.
    g.lineStyle(5, 0x2b7453).strokeCircle(548, 655, 24);
    g.fillStyle(0x9c9e91).fillRect(922, 630, 8, 48).fillEllipse(926, 626, 34, 12);
    g.fillStyle(0x4b81b4).fillRect(1992, 635, 42, 25);
    g.fillStyle(0xe4b946).fillCircle(2000, 666, 9).fillCircle(2028, 666, 9);
    g.fillStyle(0xf3eee0).fillRect(1616, 636, 58, 9);
    g.fillStyle(0x76543d).fillRect(1622, 645, 6, 27).fillRect(1662, 645, 6, 27);
  }

  private drawShrub(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, color: number): void {
    g.fillStyle(0x254d31, 0.35).fillEllipse(x + 5, y + 6, size * 1.5, size);
    g.fillStyle(color).fillCircle(x, y, size * 0.55).fillCircle(x + size * 0.45, y + 2, size * 0.48);
    g.fillStyle(0x79a653, 0.7).fillRect(x - size * 0.2, y - size * 0.25, size * 0.45, 4);
  }

  private drawDeciduousTree(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, color: number): void {
    g.fillStyle(0x29412f, 0.24).fillEllipse(x + 20, y + size * 0.55, size * 1.75, size * 0.72);
    g.fillStyle(0x684b32).fillRect(x - 10, y - 5, 20, size * 0.82);
    g.fillStyle(0x8c6743).fillRect(x - 5, y, 7, size * 0.65);
    g.fillStyle(0x2d6038).fillCircle(x - size * 0.34, y - size * 0.28, size * 0.55)
      .fillCircle(x + size * 0.32, y - size * 0.25, size * 0.57).fillCircle(x, y - size * 0.55, size * 0.65);
    g.fillStyle(color).fillCircle(x - size * 0.2, y - size * 0.55, size * 0.45)
      .fillCircle(x + size * 0.24, y - size * 0.55, size * 0.44).fillCircle(x, y - size * 0.82, size * 0.36);
    g.fillStyle(0x78a954, 0.8).fillRect(x - size * 0.42, y - size * 0.74, size * 0.36, 8);
  }

  private drawEvergreen(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
    g.fillStyle(0x61472f).fillRect(x - 8, y, 16, size * 0.75);
    g.fillStyle(0x28543b).fillTriangle(x, y - size * 1.2, x - size * 0.66, y + size * 0.45, x + size * 0.66, y + size * 0.45);
    g.fillStyle(0x39704a).fillTriangle(x - 8, y - size, x - size * 0.48, y + size * 0.15, x + size * 0.44, y + size * 0.15);
    g.fillStyle(0x5d8d57, 0.8).fillTriangle(x - 12, y - size * 0.8, x - size * 0.34, y - size * 0.05, x + size * 0.2, y - size * 0.05);
  }

  private drawMailbox(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number): void {
    g.fillStyle(0x614731).fillRect(x - 4, y, 8, 54);
    g.fillStyle(color).fillRect(x - 20, y - 14, 42, 28).fillCircle(x + 19, y, 14);
    g.fillStyle(0xc44b3f).fillRect(x - 25, y - 27, 5, 24).fillRect(x - 25, y - 27, 16, 5);
  }

  private drawCar(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number, color: number): void {
    g.fillStyle(0x283237, 0.25).fillEllipse(x + width / 2 + 8, y + height - 1, width, 22);
    g.fillStyle(color).fillRect(x, y + 20, width, height - 30).fillRoundedRect(x + 18, y, width - 38, 45, 12);
    g.fillStyle(0x536f78).fillRect(x + 28, y + 7, width * 0.28, 20).fillRect(x + width * 0.6, y + 7, width * 0.22, 20);
    g.fillStyle(0x292d2f).fillCircle(x + 25, y + height - 9, 13).fillCircle(x + width - 25, y + height - 9, 13);
    g.fillStyle(0xaab3b2).fillCircle(x + 25, y + height - 9, 6).fillCircle(x + width - 25, y + height - 9, 6);
  }

  private drawBasketballHoop(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x4d565a).fillRect(x, y, 8, 76);
    g.fillStyle(0xe9e5d6).fillRect(x - 31, y - 25, 68, 42);
    g.lineStyle(4, 0xc64f32).strokeRect(x - 30, y - 24, 66, 40).strokeCircle(x + 2, y + 21, 18);
    g.lineStyle(2, 0xd7d2b6).lineBetween(x - 12, y + 25, x - 5, y + 51).lineBetween(x + 16, y + 25, x + 9, y + 51);
  }

  private drawFence(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number): void {
    g.fillStyle(0xe0d8bd).fillRect(x, y, width, 8).fillRect(x, y + 28, width, 8);
    for (let fx = x; fx <= x + width; fx += 34) g.fillRect(fx, y - 10, 8, 58);
  }

  private drawRouteSigns(): void {
    this.addStreetSign(1130, 812, "WHEATFIELD DR", "#f7f0ce", "#276145");
    this.addStreetSign(1494, 78, "CREEK TRAIL", "#e8e0bc", "#315c3f");
    this.addStreetSign(95, 900, "BENT CREEK  ←", "#f2e7bd", "#355a3c");
    this.addStreetSign(2200, 900, "STONEHENGE  →", "#f2e7bd", "#355a3c");
    this.addStreetSign(2155, 1062, "SCHOOL  ↗", "#f2e7bd", "#355a3c");
    this.addStreetSign(1120, 1390, "FRUITVILLE PK", "#f2e7bd", "#355a3c");
  }

  private addStreetSign(x: number, y: number, text: string, color: string, backgroundColor: string): void {
    this.add.rectangle(x, y + 24, 6, 48, 0x5e5544).setDepth(8);
    this.add.text(x, y, text, {
      fontFamily: "monospace",
      fontSize: "10px",
      fontStyle: "bold",
      color,
      backgroundColor,
      padding: { x: 5, y: 3 },
    }).setOrigin(0.5).setDepth(9);
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
