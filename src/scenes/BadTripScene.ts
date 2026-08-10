import Phaser from "phaser";

import { inputCapture } from "../game/events";
import { gameStore } from "../game/GameStore";
import { createPresentationPolicy, type PresentationPolicy } from "../presentation/presentationPolicy";
import { submitBadTripSurvivalTime, survivalLeaderboardLines } from "../platform/leaderboards";
import { BAD_TRIP_PASS_MS, badTripDifficulty, stepBadTripPlayer, type BadTripPlatform, type BadTripState } from "./badTripCore";

export const BAD_TRIP_SCENE_KEY = "bad_trip";

export interface BadTripResult { passed: boolean; elapsedMs: number; }
export interface BadTripSceneData {
  onNightComplete?: () => void;
  returnScene?: string;
  replay?: boolean;
}

type BadTripPhase = "countdown" | "running" | "result";

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 540;
const COUNTDOWN_MS = 3_000;
const INPUT_CAPTURE_OWNER = "bad-trip-minigame";

export class BadTripScene extends Phaser.Scene {
  private policy!: PresentationPolicy;
  private onNightComplete?: () => void;
  private returnScene = "neighborhood";
  private replay = false;
  private player!: Phaser.GameObjects.Container;
  private don!: Phaser.GameObjects.Container;
  private platforms: BadTripPlatform[] = [];
  private platformVisuals: Phaser.GameObjects.Container[] = [];
  private state: BadTripState = { x: 180, y: 404, vx: 0, vy: 0, grounded: true };
  private elapsedMs = 0;
  private countdownMs = COUNTDOWN_MS;
  private passed = false;
  private phase: BadTripPhase = "countdown";
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private touch = { left: false, right: false, jump: false };
  private timerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private progressFill!: Phaser.GameObjects.Rectangle;
  private progressLabel!: Phaser.GameObjects.Text;
  private controls!: Phaser.GameObjects.Container;
  private sky!: Phaser.GameObjects.Graphics;
  private backgroundPhase = 0;
  private leaderboardText?: Phaser.GameObjects.Text;
  private runGeneration = 0;

  public constructor() { super(BAD_TRIP_SCENE_KEY); }

  public init(data?: BadTripSceneData): void {
    this.runGeneration += 1;
    this.onNightComplete = data?.onNightComplete;
    this.returnScene = data?.returnScene ?? "neighborhood";
    this.replay = data?.replay === true;
    this.elapsedMs = 0;
    this.countdownMs = COUNTDOWN_MS;
    this.passed = false;
    this.phase = "countdown";
    this.state = { x: 180, y: 404, vx: 0, vy: 0, grounded: true };
    this.touch = { left: false, right: false, jump: false };
    this.platformVisuals = [];
    this.leaderboardText = undefined;
  }

  public create(): void {
    this.policy = createPresentationPolicy(gameStore.getState().settings);
    this.scene.setVisible(false, "ui");
    inputCapture.capture(INPUT_CAPTURE_OWNER, { blockMenuToggle: true });
    this.cameras.main.setBackgroundColor("#160d2c");
    this.sky = this.add.graphics();
    this.drawSky();
    this.platforms = this.makePlatforms();
    this.drawPlatforms();
    this.player = this.drawKid(180, 404);
    this.don = this.drawDon(48, 404);
    this.buildHud();
    this.controls = this.makeTouchControls();
    this.bindInputs();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  public update(_time: number, delta: number): void {
    this.backgroundPhase += delta / 520;
    if (!this.policy.reducedMotion) this.drawSky();

    if (this.phase === "result") {
      return;
    }

    if (this.phase === "countdown") {
      this.updateCountdown(delta);
      return;
    }

    this.elapsedMs += delta;
    const left = Boolean(this.cursors?.left?.isDown || this.keys?.A?.isDown || this.touch.left);
    const right = Boolean(this.cursors?.right?.isDown || this.keys?.D?.isDown || this.touch.right);
    const jump = this.justPressed(this.cursors?.space)
      || this.justPressed(this.cursors?.up)
      || this.justPressed(this.keys?.W)
      || this.consumeTouchJump();
    this.state = stepBadTripPlayer(this.state, { left, right, jump }, this.platforms, delta);
    this.player.setPosition(this.state.x, this.state.y);
    const difficulty = badTripDifficulty(this.elapsedMs);
    this.don.x += Math.sign(this.state.x - this.don.x) * difficulty.donSpeed * delta / 1_000;
    this.don.y += Math.sign(this.state.y - 16 - this.don.y) * difficulty.donSpeed * 0.32 * delta / 1_000;
    this.updatePlatforms(difficulty.drift, delta);
    this.updateHud();
    if (!this.passed && this.elapsedMs >= BAD_TRIP_PASS_MS) this.secureDorito();
    if (this.state.y > 570 || Phaser.Math.Distance.Between(this.state.x, this.state.y, this.don.x, this.don.y) < 42) {
      this.finish();
    }
  }

  private buildHud(): void {
    this.add.rectangle(0, 0, VIEW_WIDTH, 122, 0x110b26, 0.94)
      .setOrigin(0).setStrokeStyle(0).setDepth(40);
    this.add.rectangle(0, 120, VIEW_WIDTH, 2, 0xf4c85b, 0.7).setOrigin(0).setDepth(41);
    this.timerText = this.add.text(22, 17, "SURVIVED  0:00.00", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: `${this.policy.fontSize(20)}px`, color: "#fff0a8",
      fontStyle: "bold", stroke: "#2a123e", strokeThickness: 4,
    }).setDepth(50);
    this.statusText = this.add.text(938, 20, "GET READY — DON ROSSI IS COMING", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: `${this.policy.fontSize(14)}px`, color: "#ffb5cf",
      fontStyle: "bold", align: "right",
    }).setOrigin(1, 0).setDepth(50);
    this.add.text(480, 52, "MOVE  A / D  or  ← / →     •     JUMP  W / SPACE / ↑", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: `${this.policy.fontSize(14)}px`, color: "#f4ecff", fontStyle: "bold",
    }).setOrigin(0.5).setDepth(50);
    this.add.text(480, 76, "Stay alive 45 seconds to secure the Dorito. Then keep running to set the longest survival time.", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: `${this.policy.fontSize(12)}px`, color: "#d8ccec",
    }).setOrigin(0.5).setDepth(50);
    this.add.rectangle(300, 101, 360, 12, 0x080713, 0.95).setOrigin(0, 0.5).setStrokeStyle(2, 0x70577f, 1).setDepth(50);
    this.progressFill = this.add.rectangle(302, 101, 0, 8, 0xf4c85b, 1).setOrigin(0, 0.5).setDepth(51);
    this.progressLabel = this.add.text(674, 101, "DORITO IN 0:45", {
      fontFamily: "monospace", fontSize: `${this.policy.fontSize(11)}px`, color: "#fff0a8", fontStyle: "bold",
    }).setOrigin(0, 0.5).setDepth(51);
    this.drawDoritoIcon(278, 101, 12, 52);
    this.countdownText = this.add.text(480, 277, "3", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: `${this.policy.fontSize(92)}px`, color: "#fff0a8",
      fontStyle: "bold", stroke: "#2a123e", strokeThickness: 10,
    }).setOrigin(0.5).setDepth(70);
  }

  private updateCountdown(delta: number): void {
    this.countdownMs = Math.max(0, this.countdownMs - delta);
    this.countdownText.setText(String(Math.max(1, Math.ceil(this.countdownMs / 1_000))));
    if (this.countdownMs > 0) return;
    this.phase = "running";
    this.countdownText.setVisible(false);
    this.statusText.setText("DON IS CLOSING IN — KEEP MOVING");
    this.cameras.main.flash(this.policy.duration(180), 244, 200, 91);
  }

  private updateHud(): void {
    this.timerText.setText(`SURVIVED  ${formatMs(this.elapsedMs)}`);
    const progress = Phaser.Math.Clamp(this.elapsedMs / BAD_TRIP_PASS_MS, 0, 1);
    this.progressFill.width = 356 * progress;
    const remaining = Math.max(0, Math.ceil((BAD_TRIP_PASS_MS - this.elapsedMs) / 1_000));
    this.progressLabel.setText(this.passed ? "DORITO SECURED" : `DORITO IN 0:${String(remaining).padStart(2, "0")}`);
  }

  private secureDorito(): void {
    this.passed = true;
    this.progressFill.width = 356;
    this.progressFill.setFillStyle(0x72e0bd, 1);
    this.progressLabel.setText("DORITO SECURED").setColor("#9ff4d6");
    this.statusText.setText("DORITO SECURED — KEEP RUNNING FOR THE LEADERBOARD").setColor("#9ff4d6");
    this.cameras.main.flash(this.policy.duration(280), 255, 222, 108);
  }

  private makePlatforms(): BadTripPlatform[] {
    return [
      { x: 58, y: 426, width: 250 },
      { x: 356, y: 366, width: 180 },
      { x: 646, y: 306, width: 190 },
      { x: 438, y: 248, width: 165 },
      { x: 142, y: 198, width: 185 },
      { x: 690, y: 148, width: 180 },
    ];
  }

  private drawPlatforms(): void {
    this.platformVisuals = this.platforms.map((platform, index) => {
      const shadow = this.add.rectangle(platform.width / 2 + 5, 10, platform.width, 18, 0x080713, 0.55).setOrigin(0.5, 0);
      const body = this.add.rectangle(platform.width / 2, 0, platform.width, 18, 0x3d4773, 1)
        .setOrigin(0.5, 0).setStrokeStyle(2, 0x181633, 1);
      const top = this.add.rectangle(platform.width / 2, 0, platform.width - 4, 5, index % 2 ? 0xf2b6da : 0x7fe2d7, 1).setOrigin(0.5, 0);
      const marks = this.add.graphics();
      marks.lineStyle(2, 0xb4b6df, 0.45);
      for (let x = 16; x < platform.width; x += 32) marks.lineBetween(x, 7, x - 7, 16);
      return this.add.container(platform.x, platform.y, [shadow, body, top, marks]).setDepth(8);
    });
  }

  private updatePlatforms(drift: number, delta: number): void {
    this.platforms.forEach((platform, index) => {
      if (index === 0 || drift === 0) return;
      platform.x += Math.sin(this.elapsedMs / 800 + index) * drift * delta / 7_000;
      platform.x = Phaser.Math.Clamp(platform.x, 24, 936 - platform.width);
      this.platformVisuals[index]!.x = platform.x;
    });
  }

  private drawSky(): void {
    this.sky.clear();
    this.sky.fillStyle(0x160d2c, 1).fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    this.sky.fillStyle(0x251245, 1).fillCircle(770, 276, 330);
    this.sky.fillStyle(0x34205c, 0.72).fillCircle(155, 320, 250);
    this.sky.fillStyle(0x0c1733, 0.72).fillRect(0, 386, VIEW_WIDTH, 154);
    for (let i = 0; i < 18; i += 1) {
      const x = (i * 113 + Math.sin(this.backgroundPhase + i * 0.7) * 36 + VIEW_WIDTH) % VIEW_WIDTH;
      const y = 135 + (i * 71) % 255;
      const color = i % 3 === 0 ? 0xf4c85b : i % 2 ? 0xe65caa : 0x69d9d0;
      this.sky.fillStyle(color, 0.34).fillCircle(x, y, 4 + (i % 4) * 2);
      this.sky.lineStyle(2, color, 0.16).strokeCircle(x, y, 13 + (i % 3) * 7);
    }
    this.sky.fillStyle(0x090713, 0.72);
    for (let x = 0; x < VIEW_WIDTH; x += 74) {
      const height = 24 + ((x * 17) % 62);
      this.sky.fillRect(x, 386 - height, 58, height);
    }
  }

  private drawKid(x: number, y: number): Phaser.GameObjects.Container {
    const shadow = this.add.ellipse(0, 23, 42, 12, 0x080713, 0.42);
    const art = this.add.graphics();
    art.fillStyle(0x17263f).fillRoundedRect(-13, 10, 10, 15, 3).fillRoundedRect(3, 10, 10, 15, 3);
    art.fillStyle(0xf2f0e5).fillRoundedRect(-15, 20, 13, 6, 3).fillRoundedRect(2, 20, 13, 6, 3);
    art.fillStyle(0x76d8d3).fillRoundedRect(-17, -12, 34, 27, 7);
    art.fillStyle(0xe0ad84).fillCircle(0, -28, 15).fillRoundedRect(-23, -8, 8, 22, 4).fillRoundedRect(15, -8, 8, 22, 4);
    art.fillStyle(0x4a332a).fillRoundedRect(-15, -41, 30, 12, 5).fillRect(-16, -35, 6, 10);
    art.fillStyle(0x26333d).fillCircle(-5, -28, 1.5).fillCircle(5, -28, 1.5);
    art.lineStyle(2, 0x9d654f).lineBetween(-4, -20, 4, -20);
    const namePlate = this.add.rectangle(0, 39, 50, 18, 0x101022, 0.88).setStrokeStyle(1, 0x77d9d3, 0.7);
    const name = this.add.text(0, 39, "YOU", { fontFamily: "monospace", fontSize: "10px", color: "#eafffb", fontStyle: "bold" }).setOrigin(0.5);
    return this.add.container(x, y, [shadow, art, namePlate, name]).setDepth(20);
  }

  private drawDon(x: number, y: number): Phaser.GameObjects.Container {
    const shadow = this.add.ellipse(8, 25, 58, 14, 0x080713, 0.5);
    const art = this.add.graphics();
    art.fillStyle(0x25202a).fillRoundedRect(-17, 11, 13, 18, 3).fillRoundedRect(5, 11, 13, 18, 3);
    art.fillStyle(0x18161c).fillRoundedRect(-20, 25, 18, 7, 3).fillRoundedRect(3, 25, 18, 7, 3);
    art.fillStyle(0xc94d75).fillRoundedRect(-24, -13, 48, 31, 9);
    art.fillStyle(0xf2d27a).fillTriangle(-9, -11, 0, 7, 9, -11);
    art.fillStyle(0xd99c78).fillCircle(0, -31, 18).fillRoundedRect(-31, -8, 9, 25, 4).fillRoundedRect(22, -8, 9, 25, 4);
    art.fillStyle(0x494047).fillRoundedRect(-19, -47, 38, 10, 5).fillRect(-18, -42, 7, 8);
    art.fillStyle(0x302229).fillRect(-11, -35, 8, 3).fillRect(3, -35, 8, 3);
    art.fillStyle(0x2b2021).fillCircle(-7, -30, 2).fillCircle(7, -30, 2);
    art.lineStyle(3, 0x8f5945).lineBetween(-8, -20, 8, -19);
    art.lineStyle(5, 0x9a7047).lineBetween(27, -3, 45, 30);
    art.lineStyle(7, 0xb8bcc1).lineBetween(43, 29, 57, 29);
    const namePlate = this.add.rectangle(5, 45, 88, 18, 0x101022, 0.9).setStrokeStyle(1, 0xff8eba, 0.8);
    const name = this.add.text(5, 45, "DON ROSSI", { fontFamily: "monospace", fontSize: "10px", color: "#ffd9e7", fontStyle: "bold" }).setOrigin(0.5);
    return this.add.container(x, y, [shadow, art, namePlate, name]).setDepth(21);
  }

  private drawDoritoIcon(x: number, y: number, size: number, depth: number): void {
    const icon = this.add.graphics().setDepth(depth);
    icon.fillStyle(0xf7d369, 0.22).fillCircle(x, y, size + 8);
    icon.fillStyle(0xe6792e, 1).fillTriangle(x, y - size, x - size, y + size * 0.8, x + size, y + size * 0.8);
    icon.lineStyle(2, 0xffca55, 1).strokeTriangle(x, y - size, x - size, y + size * 0.8, x + size, y + size * 0.8);
    icon.fillStyle(0x9d3e24, 0.9).fillCircle(x - 3, y + 3, 2).fillCircle(x + 4, y, 1.5).fillCircle(x, y + 8, 1.5);
  }

  private bindInputs(): void {
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys("A,D,W") as Record<string, Phaser.Input.Keyboard.Key> | undefined;
    this.input.keyboard?.addCapture("SPACE,UP,LEFT,RIGHT,ENTER");
  }

  private makeTouchControls(): Phaser.GameObjects.Container {
    const children: Phaser.GameObjects.GameObject[] = [];
    const make = (x: number, width: number, label: string, key: keyof typeof this.touch) => {
      const button = this.add.rectangle(x, 498, width, 52, 0x2d2356, 0.96)
        .setStrokeStyle(3, 0xf4c85b, 0.9).setInteractive({ useHandCursor: true });
      const text = this.add.text(x, 498, label, {
        fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "17px", color: "#fff4d6", fontStyle: "bold",
      }).setOrigin(0.5);
      button.on("pointerdown", () => { this.touch[key] = true; button.setFillStyle(0x5a3a78, 1); });
      const release = () => { this.touch[key] = false; button.setFillStyle(0x2d2356, 0.96); };
      button.on("pointerup", release).on("pointerout", release).on("pointerupoutside", release);
      children.push(button, text);
    };
    make(68, 86, "◀ LEFT", "left");
    make(170, 86, "RIGHT ▶", "right");
    make(874, 126, "JUMP", "jump");
    return this.add.container(0, 0, children).setDepth(60).setScrollFactor(0);
  }

  private consumeTouchJump(): boolean {
    const pressed = this.touch.jump;
    this.touch.jump = false;
    return pressed;
  }

  private justPressed(key: Phaser.Input.Keyboard.Key | undefined): boolean {
    return key ? Phaser.Input.Keyboard.JustDown(key) : false;
  }

  private finish(): void {
    if (this.phase === "result") return;
    this.phase = "result";
    const result = { passed: this.passed, elapsedMs: Math.round(this.elapsedMs) };
    this.controls.setVisible(false);
    this.statusText.setText(result.passed ? "DORITO SECURED — RUN COMPLETE" : "DON ROSSI CAUGHT YOU");
    this.cameras.main.shake(this.policy.duration(240), this.policy.reducedMotion ? 0 : 0.012);
    this.showResult(result);
    const generation = this.runGeneration;
    void submitBadTripSurvivalTime(result.elapsedMs).then((entries) => {
      if (generation !== this.runGeneration || this.phase !== "result" || !this.leaderboardText?.active) return;
      const lines = survivalLeaderboardLines(entries);
      this.leaderboardText.setText(lines.length
        ? lines.join("\n")
        : "No shared survival times are available yet.\nYour run was still recorded.");
    }).catch(() => {
      if (generation === this.runGeneration && this.leaderboardText?.active) {
        this.leaderboardText.setText("Leaderboard unavailable right now.\nYour retry is ready.");
      }
    });
  }

  private showResult(result: BadTripResult): void {
    const shade = this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0x080713, 0.82).setOrigin(0).setInteractive();
    const card = this.add.rectangle(480, 285, 720, 420, 0x21183d, 0.98).setStrokeStyle(4, result.passed ? 0x72e0bd : 0xf4c85b, 1);
    const title = this.add.text(480, 108, result.passed ? "DORITO SECURED!" : "DON ROSSI CAUGHT YOU", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: `${this.policy.fontSize(34)}px`,
      color: result.passed ? "#9ff4d6" : "#fff0a8", fontStyle: "bold", stroke: "#100b22", strokeThickness: 6,
    }).setOrigin(0.5);
    const summary = this.add.text(480, 157,
      result.passed
        ? `YOU SURVIVED ${formatMs(result.elapsedMs)}  •  THE FIRE-ROASTED DORITO IS YOURS`
        : `YOUR RUN: ${formatMs(result.elapsedMs)}  •  SURVIVE 0:45.00 TO SECURE THE DORITO`, {
        fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: `${this.policy.fontSize(15)}px`, color: "#eee6fa", fontStyle: "bold",
      }).setOrigin(0.5);
    const leaderboardHeading = this.add.text(480, 207, "LONGEST DON ROSSI SURVIVORS", {
      fontFamily: "monospace", fontSize: `${this.policy.fontSize(16)}px`, color: "#ffb5cf", fontStyle: "bold",
    }).setOrigin(0.5);
    this.leaderboardText = this.add.text(480, 238, "UPDATING LEADERBOARD…", {
      fontFamily: "monospace", fontSize: `${this.policy.fontSize(14)}px`, color: "#f4ecff", align: "center", lineSpacing: 7,
    }).setOrigin(0.5, 0);
    const primary = this.resultButton(
      360,
      423,
      250,
      this.replay ? "RUN AGAIN" : result.passed ? "CONTINUE TO BONFIRE" : "RUN AGAIN",
      this.replay || !result.passed ? 0x8f4e37 : 0x31745e,
      this.replay || !result.passed ? () => this.restartRun() : () => this.continueToBonfire(),
    );
    const secondary = this.resultButton(
      640,
      423,
      250,
      this.replay ? "RETURN TO ADVENTURE" : result.passed ? "RUN AGAIN FOR A RECORD" : "BACK TO THE FIRE",
      0x4e426a,
      this.replay ? () => this.returnToAdventure() : result.passed ? () => this.restartRun() : () => this.backToFire(),
    );
    if (this.replay || !result.passed) {
      this.input.keyboard?.once("keydown-ENTER", this.restartRun, this);
      this.input.keyboard?.once("keydown-SPACE", this.restartRun, this);
    } else if (result.passed) {
      this.input.keyboard?.once("keydown-ENTER", this.continueToBonfire, this);
      this.input.keyboard?.once("keydown-SPACE", this.continueToBonfire, this);
    }
    this.input.keyboard?.once("keydown-R", this.restartRun, this);
    if (this.replay) this.input.keyboard?.once("keydown-ESC", this.returnToAdventure, this);
    const hint = this.add.text(480, 476, this.replay
      ? "ENTER / SPACE / R — RUN AGAIN     •     ESC — RETURN"
      : result.passed ? "ENTER / SPACE — CONTINUE     •     R — RUN AGAIN" : "ENTER / SPACE / R — RUN AGAIN", {
      fontFamily: "monospace", fontSize: `${this.policy.fontSize(12)}px`, color: "#cbbdde",
    }).setOrigin(0.5);
    this.add.container(0, 0, [shade, card, title, summary, leaderboardHeading, this.leaderboardText, primary, secondary, hint]).setDepth(100);
  }

  private resultButton(
    x: number,
    y: number,
    width: number,
    label: string,
    color: number,
    action: () => void,
  ): Phaser.GameObjects.Container {
    const button = this.add.rectangle(0, 0, width, 58, color, 1).setStrokeStyle(3, 0xffefbd, 0.9).setInteractive({ useHandCursor: true });
    const text = this.add.text(0, 0, label, {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: `${this.policy.fontSize(15)}px`, color: "#fff8e6", fontStyle: "bold", align: "center",
    }).setOrigin(0.5);
    button.on("pointerdown", action).on("pointerover", () => button.setScale(1.03)).on("pointerout", () => button.setScale(1));
    return this.add.container(x, y, [button, text]);
  }

  private restartRun(): void {
    if (this.phase !== "result") return;
    this.scene.restart({ onNightComplete: this.onNightComplete, returnScene: this.returnScene, replay: this.replay });
  }

  private returnToAdventure(): void {
    if (this.phase !== "result" || !this.replay) return;
    this.scene.setVisible(true, "ui");
    this.scene.start(this.returnScene);
  }

  private backToFire(): void {
    if (this.phase !== "result") return;
    this.scene.start("andrews_bonfire", { onNightComplete: this.onNightComplete, returnScene: this.returnScene });
  }

  private continueToBonfire(): void {
    if (this.phase !== "result" || !this.passed) return;
    gameStore.completeBonfireInitiation();
    this.scene.start("andrews_bonfire", {
      onNightComplete: this.onNightComplete,
      returnScene: this.returnScene,
      completed: true,
    });
  }

  private cleanup(): void {
    this.runGeneration += 1;
    inputCapture.release(INPUT_CAPTURE_OWNER);
    this.input?.keyboard?.off("keydown-R", this.restartRun, this);
    this.input?.keyboard?.off("keydown-ENTER", this.restartRun, this);
    this.input?.keyboard?.off("keydown-SPACE", this.restartRun, this);
    this.input?.keyboard?.off("keydown-ENTER", this.continueToBonfire, this);
    this.input?.keyboard?.off("keydown-SPACE", this.continueToBonfire, this);
    this.input?.keyboard?.off("keydown-ESC", this.returnToAdventure, this);
    this.input?.keyboard?.removeCapture("SPACE,UP,LEFT,RIGHT,ENTER");
    this.cameras?.main?.resetFX();
  }
}

function formatMs(milliseconds: number): string {
  const seconds = Math.max(0, milliseconds) / 1_000;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}
