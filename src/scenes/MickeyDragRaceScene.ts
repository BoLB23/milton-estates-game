import Phaser from "phaser";

import { inputCapture } from "../game/events";
import { gameStore } from "../game/GameStore";
import type { MapId } from "../game/types";
import { gamePlatform } from "../platform/integration";
import { leaderboardLines, submitLeaderboardTime } from "../platform/leaderboards";

const MAX_RACE_MS = 60_000;
const FINISH_DISTANCE = 720;
const REQUIRED_PERFECT_SHIFTS = 5;
const PERFECT_RPM = 6_800;
const PERFECT_WINDOW = 230;
const IDLE_RPM = 1_200;
const RED_ZONE_RPM = 7_250;
const REDLINE_RPM = 8_000;
const SIXTH_GEAR_CRUISE_RPM = 7_050;
const ENGINE_HEAT_LIMIT_MS = 5_000;
const MAX_GEAR = REQUIRED_PERFECT_SHIFTS + 1;
const START_X = 170;
const TRACK_SCALE = 2.3;
const FINISH_X = START_X + FINISH_DISTANCE * TRACK_SCALE;
const WORLD_WIDTH = FINISH_X + 620;
const PLAYER_GEAR_COLORS = [0x4d85b6, 0x397ba7, 0x3e9b87, 0x9b9a45, 0xc17b3f, 0xc25145];
// RPM builds more slowly in each higher gear, giving the player a longer
// window to feel and time every successive shift.
const GEAR_RPM_RATES = [3_000, 2_500, 2_200, 1_950, 1_750, 1_600];
const GEAR_SPEED_CAPS = [7.8, 11.5, 15.5, 19.5, 23.5, 31.5];
// Higher gears trade wheel torque for road speed. These are deliberately
// descending so a rushed shift cannot produce more acceleration than 1st.
const GEAR_ACCELERATIONS = [7.2, 5.8, 4.7, 3.8, 3.0, 2.3];
// RPM and road speed synchronize more quickly in the lower gears, while 6th
// still takes time to settle into its overdrive ratio.
const GEAR_SPEED_ALIGNMENT_RATES = [3.2, 3.0, 2.8, 2.5, 2.2, 1.9];
const SPEED_DISPLAY_MULTIPLIER = 4.2;
const COASTING_DECELERATION = 0.85;
const COASTING_AIR_RESISTANCE = 0.012;
const MICKEY_FINISH_SECONDS = 33;
const MICKEY_SPEED = FINISH_DISTANCE / MICKEY_FINISH_SECONDS;

type RacePhase = "countdown" | "racing" | "result";

function raceTime(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

/** Full-screen, touch-friendly drag race unlocked at the Bent Creek gate. */
export class MickeyDragRaceScene extends Phaser.Scene {
  private returnMap: MapId = "bent_creek";
  private phase: RacePhase = "countdown";
  private countdown = 3;
  private elapsedMs = 0;
  private rpm = 1_800;
  private gear = 1;
  private speed = 0;
  private speedMph = 0;
  private playerDistance = 0;
  private mickeyDistance = 0;
  private mickeyFinished = false;
  private playerFinishedFirst = false;
  private perfectShifts = 0;
  private engineHeatMs = 0;
  private engineBlown = false;
  private revLimiterActive = false;
  private gasHeld = false;
  private pointerGasHeld = false;
  private playerCar!: Phaser.GameObjects.Graphics;
  private mickeyCar!: Phaser.GameObjects.Graphics;
  private rpmGauge!: Phaser.GameObjects.Graphics;
  private rpmNeedle!: Phaser.GameObjects.Graphics;
  private rpmValueText!: Phaser.GameObjects.Text;
  private rpmZoneText!: Phaser.GameObjects.Text;
  private gearText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;
  private gasIndicator!: Phaser.GameObjects.Text;
  private engineHeatFill!: Phaser.GameObjects.Rectangle;
  private engineHeatText!: Phaser.GameObjects.Text;
  private gasButton!: Phaser.GameObjects.Container;
  private shiftUpButton!: Phaser.GameObjects.Container;
  private shiftDownButton!: Phaser.GameObjects.Container;
  private shiftUpKey?: Phaser.Input.Keyboard.Key;
  private shiftDownKey?: Phaser.Input.Keyboard.Key;
  private gasKeys: Phaser.Input.Keyboard.Key[] = [];

  public constructor() { super("mickey_drag_race"); }

  public init(data?: { returnMap?: MapId }): void {
    this.returnMap = data?.returnMap ?? "bent_creek";
    this.phase = "countdown";
    this.countdown = 3;
    this.elapsedMs = 0;
    this.rpm = 1_800;
    this.gear = 1;
    this.speed = 0;
    this.speedMph = 0;
    this.playerDistance = 0;
    this.mickeyDistance = 0;
    this.mickeyFinished = false;
    this.playerFinishedFirst = false;
    this.perfectShifts = 0;
    this.engineHeatMs = 0;
    this.engineBlown = false;
    this.revLimiterActive = false;
    this.gasHeld = false;
    this.pointerGasHeld = false;
  }

  public create(): void {
    // A direct mini-game launch is still real play; this remains idempotent
    // when the surrounding exploration session is already active.
    void gamePlatform.beginPlaySession();
    this.scene.setVisible(false, "ui");
    inputCapture.capture("mickey-drag-race", { blockMenuToggle: true });
    this.cameras.main.setBackgroundColor("#0b1720");
    this.drawRoad();
    this.drawStartLine();
    this.playerCar = this.add.graphics().setDepth(4);
    this.mickeyCar = this.add.graphics().setDepth(4);
    this.drawCar(this.playerCar, 0, 0, this.playerGearColor(), false);
    this.drawCar(this.mickeyCar, 0, 0, 0xbfc7cd, true);
    this.playerCar.setPosition(START_X, 354);
    this.mickeyCar.setPosition(START_X, 253);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, 540);
    this.cameras.main.startFollow(this.playerCar, true, 0.12, 1);
    this.buildHud();
    this.buildControls();
    this.bindKeyboard();
    this.time.addEvent({
      delay: 1_000,
      repeat: 2,
      callback: () => {
        this.countdown -= 1;
        this.statusText.setText(this.countdown ? String(this.countdown) : "GO!");
        if (this.countdown === 0) this.phase = "racing";
      },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  public update(_time: number, delta: number): void {
    if (this.phase !== "racing") return;
    this.gasHeld = this.pointerGasHeld || this.gasKeys.some((key) => key.isDown);
    if (this.shiftUpKey && Phaser.Input.Keyboard.JustDown(this.shiftUpKey)) this.shift(1);
    if (this.shiftDownKey && Phaser.Input.Keyboard.JustDown(this.shiftDownKey)) this.shift(-1);
    this.elapsedMs += delta;
    this.updateEngine(delta);
    if (this.phase !== "racing") return;
    this.updateCars(delta);
    this.updateHud();
    if (this.playerDistance >= FINISH_DISTANCE) {
      const won = this.playerFinishedFirst || (!this.mickeyFinished && this.playerDistance > this.mickeyDistance);
      this.finish(won, won ? "YOU BEAT MICKEY!" : "MICKEY WINS!");
    } else if (this.elapsedMs >= MAX_RACE_MS) {
      this.finish(false, "TIME'S UP — MICKEY WINS!");
    }
  }

  private drawRoad(): void {
    const road = this.add.graphics();
    road.fillStyle(0x254637).fillRect(0, 0, WORLD_WIDTH, 154).fillRect(0, 428, WORLD_WIDTH, 112);
    for (let x = 30; x < WORLD_WIDTH; x += 180) {
      road.fillStyle(0x2f5f46, 1).fillCircle(x, 112, 27).fillCircle(x + 24, 101, 22);
      road.fillStyle(0x2b563f, 1).fillRect(x - 4, 112, 10, 48);
      road.fillStyle(0x376b4a, 1).fillCircle(x + 55, 456, 22).fillCircle(x + 80, 466, 28);
    }
    road.fillStyle(0x17232a).fillRect(0, 154, WORLD_WIDTH, 274);
    road.fillStyle(0x24343a).fillRect(0, 170, WORLD_WIDTH, 108).fillRect(0, 300, WORLD_WIDTH, 108);
    road.lineStyle(3, 0xf0d976, 0.8);
    for (let x = 26; x < WORLD_WIDTH; x += 70) road.lineBetween(x, 289, x + 36, 289);
    road.lineStyle(2, 0xf6f4dc, 0.7).lineBetween(0, 225, WORLD_WIDTH, 225).lineBetween(0, 354, WORLD_WIDTH, 354);
    this.add.text(480, 37, "BENT CREEK DRAG STRIP", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "25px", fontStyle: "bold", color: "#fff3c9",
      stroke: "#12252b", strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
    this.add.text(480, 70, "One minute. Five perfect shifts. No excuses.", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "14px", color: "#d8e6d4",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
  }

  private drawStartLine(): void {
    const line = this.add.graphics().setDepth(3);
    line.fillStyle(0xf7f5e6, 1);
    for (let y = 174; y < 408; y += 18) line.fillRect(START_X - 5, y, 7, 10);
    line.lineStyle(4, 0xfff0ae, 1).lineBetween(FINISH_X, 170, FINISH_X, 408);
    this.add.text(FINISH_X, 149, "FINISH", { fontFamily: "monospace", fontSize: "12px", color: "#fff3c9", fontStyle: "bold" }).setOrigin(0.5);
    this.add.text(START_X - 75, 205, "MICKEY", { fontFamily: "monospace", fontSize: "13px", color: "#f0d18a", fontStyle: "bold" });
    this.add.text(START_X - 75, 394, "YOU", { fontFamily: "monospace", fontSize: "13px", color: "#d4e9ff", fontStyle: "bold" });
  }

  private buildHud(): void {
    this.add.rectangle(480, 472, 930, 136, 0x101b1e, 0.97).setStrokeStyle(3, 0xdcc879, 0.85).setDepth(12).setScrollFactor(0);
    this.rpmGauge = this.add.graphics().setDepth(15).setScrollFactor(0);
    this.rpmNeedle = this.add.graphics().setDepth(17).setScrollFactor(0);
    this.add.text(100, 420, "RPM", { fontFamily: "monospace", fontSize: "11px", color: "#d8e6d4", fontStyle: "bold" }).setOrigin(0.5).setScrollFactor(0).setDepth(16);
    for (let index = 0; index <= 4; index += 1) {
      const angle = Math.PI + (index / 4) * Math.PI;
      this.add.text(100 + Math.cos(angle) * 64, 516 + Math.sin(angle) * 64, String(index * 2), {
        fontFamily: "monospace", fontSize: "8px", color: "#c7d5cb", fontStyle: "bold",
      }).setOrigin(0.5).setScrollFactor(0).setDepth(16);
    }
    this.rpmValueText = this.add.text(100, 500, "1800 RPM", { fontFamily: "monospace", fontSize: "12px", color: "#fff3c9", fontStyle: "bold" }).setOrigin(0.5).setScrollFactor(0).setDepth(18);
    this.rpmZoneText = this.add.text(100, 529, "BUILD RPM", { fontFamily: "monospace", fontSize: "8px", color: "#c8dfcb", fontStyle: "bold" }).setOrigin(0.5).setScrollFactor(0).setDepth(18);
    this.gearText = this.add.text(265, 420, "GEAR 1  •  PERFECT 0/5", { fontFamily: "monospace", fontSize: "14px", color: "#fff3c9", fontStyle: "bold" }).setOrigin(0.5).setScrollFactor(0).setDepth(16);
    this.speedText = this.add.text(265, 443, "SPEED 0 MPH", { fontFamily: "monospace", fontSize: "13px", color: "#d4e9ff", fontStyle: "bold" }).setOrigin(0.5).setScrollFactor(0).setDepth(16);
    this.add.text(265, 462, "ENGINE HEALTH", { fontFamily: "monospace", fontSize: "9px", color: "#c8dfcb", fontStyle: "bold" }).setOrigin(0.5).setScrollFactor(0).setDepth(16);
    this.add.rectangle(265, 477, 190, 10, 0x2a3637, 1).setOrigin(0, 0.5).setStrokeStyle(1, 0x9a9f7a, 1).setScrollFactor(0).setDepth(16);
    this.engineHeatFill = this.add.rectangle(267, 477, 0, 6, 0x5d9b68, 1).setOrigin(0, 0.5).setScrollFactor(0).setDepth(17);
    this.engineHeatText = this.add.text(465, 477, "HEAT 0%", { fontFamily: "monospace", fontSize: "9px", color: "#c8dfcb", fontStyle: "bold" }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(17);
    this.instructionText = this.add.text(505, 418, "HOLD GAS • SHIFT IN THE GOLD ZONE", {
      fontFamily: "monospace", fontSize: "10px", color: "#d8e6d4", fontStyle: "bold", fixedWidth: 270, align: "center",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(18);
    this.timerText = this.add.text(505, 442, "0:00.00", { fontFamily: "monospace", fontSize: "14px", color: "#fff3c9", fontStyle: "bold" }).setOrigin(0.5).setScrollFactor(0).setDepth(16);
    this.gasIndicator = this.add.text(825, 461, "THROTTLE CLOSED", {
      fontFamily: "monospace", fontSize: "9px", color: "#9bb7a3", fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(18);
    this.statusText = this.add.text(480, 116, "3", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "56px", color: "#fff3c9", fontStyle: "bold", stroke: "#12252b", strokeThickness: 9,
    }).setOrigin(0.5).setFixedSize(820, 64).setAlign("center").setScrollFactor(0).setDepth(20);
    this.drawRpmGauge();
  }

  private buildControls(): void {
    this.shiftUpButton = this.button(555, 510, 104, 42, "UPSHIFT", "SHIFT / F", 0x6b5b2f);
    this.shiftDownButton = this.button(675, 510, 104, 42, "DOWNSHIFT", "CTRL / D", 0x4d5c77);
    this.gasButton = this.button(835, 510, 190, 42, "GAS", "HOLD  G / W / ↑", 0x37764e);
    this.gasButton.on("pointerdown", () => { this.pointerGasHeld = true; this.updateGasFeedback(); });
    this.gasButton.on("pointerup", () => { this.pointerGasHeld = false; this.updateGasFeedback(); });
    this.gasButton.on("pointerout", () => { this.pointerGasHeld = false; this.updateGasFeedback(); });
    this.gasButton.on("pointerupoutside", () => { this.pointerGasHeld = false; this.updateGasFeedback(); });
    this.shiftUpButton.on("pointerdown", () => this.shift(1));
    this.shiftDownButton.on("pointerdown", () => this.shift(-1));
  }

  private button(x: number, y: number, width: number, height: number, label: string, hint: string, color: number): Phaser.GameObjects.Container {
    const shadow = this.add.rectangle(3, 4, width, height, 0x000000, 0.28);
    const card = this.add.rectangle(0, 0, width, height, color, 1).setStrokeStyle(3, 0xfff3c9, 1);
    const title = this.add.text(0, -8, label, { fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "15px", fontStyle: "bold", color: "#fff8d8" }).setOrigin(0.5);
    const sub = this.add.text(0, 10, hint, { fontFamily: "monospace", fontSize: "8px", color: "#e5f1da" }).setOrigin(0.5);
    return this.add.container(x, y, [shadow, card, title, sub]).setDepth(19).setScrollFactor(0).setSize(width, height).setInteractive({ useHandCursor: true });
  }

  private bindKeyboard(): void {
    this.gasKeys = ["G", "W", "UP"].map((key) => this.input.keyboard!.addKey(key));
    this.shiftUpKey = this.input.keyboard?.addKey("SHIFT");
    this.shiftDownKey = this.input.keyboard?.addKey("CTRL");
    this.input.keyboard?.on("keydown-F", this.handleShiftUp, this);
    this.input.keyboard?.on("keydown-SPACE", this.handleShiftUp, this);
    this.input.keyboard?.on("keydown-ENTER", this.handleShiftUp, this);
    this.input.keyboard?.on("keydown-D", this.handleShiftDown, this);
  }

  private updateEngine(delta: number): void {
    const deltaSeconds = delta / 1_000;
    if (this.gasHeld) {
      this.rpm += this.currentGearRpmRate() * deltaSeconds;
    } else {
      this.rpm -= 1_700 * deltaSeconds;
    }
    if (this.rpm >= REDLINE_RPM) {
      // The rev limiter holds the engine at redline until the player shifts
      // or lifts, rather than snapping RPM back and making the gauge bounce.
      this.rpm = REDLINE_RPM;
      this.revLimiterActive = true;
      this.instructionText.setText("REV LIMITER — SHIFT OR LIFT").setColor("#ffb2a6");
    } else {
      this.revLimiterActive = false;
    }
    if (this.rpm >= RED_ZONE_RPM) {
      this.engineHeatMs = Math.min(ENGINE_HEAT_LIMIT_MS, this.engineHeatMs + delta);
    } else {
      this.engineHeatMs = Math.max(0, this.engineHeatMs - 700 * deltaSeconds);
    }
    this.rpm = Phaser.Math.Clamp(this.rpm, IDLE_RPM, REDLINE_RPM);
    if (this.engineHeatMs >= ENGINE_HEAT_LIMIT_MS) {
      this.engineBlown = true;
      this.updateHud();
      this.finish(false, "KABOOM!  MICKEY LAUGHS!");
    }
  }

  private updateCars(delta: number): void {
    const deltaSeconds = delta / 1_000;
    const rpmFraction = Phaser.Math.Clamp(this.rpm / REDLINE_RPM, 0, 1);
    // Gear speed caps are defined at redline, so road speed follows the same
    // ratio as engine RPM. At 7,000 RPM in 6th this targets about 116 MPH.
    const rpmLimitedSpeed = this.currentGearSpeedCap() * rpmFraction;
    if (this.gasHeld) {
      const torqueRpmFraction = Phaser.Math.Clamp((this.rpm - IDLE_RPM) / (REDLINE_RPM - IDLE_RPM), 0, 1);
      const acceleration = this.currentGearAcceleration() * (0.45 + torqueRpmFraction * 0.7);
      const speedGap = rpmLimitedSpeed - this.speed;
      if (speedGap > 0) {
        // Approach the RPM-derived speed over time. Never snap to it: that
        // snap made a car in 6th gear instantly inherit 6th's road speed.
        const rpmAlignment = speedGap * this.currentGearSpeedAlignmentRate();
        this.speed = Math.min(rpmLimitedSpeed, this.speed + Math.max(acceleration, rpmAlignment) * deltaSeconds);
      } else {
        // A shift can leave the car temporarily above the new gear's useful
        // speed. Let it settle naturally instead of applying an abrupt brake.
        this.speed = Math.max(rpmLimitedSpeed, this.speed - (COASTING_DECELERATION + (-speedGap) * 0.18) * deltaSeconds);
      }
    } else {
      // Lifting removes engine power, but momentum and rolling resistance keep
      // the car moving while it coasts down instead of stopping immediately.
      this.speed = Math.max(0, this.speed - (COASTING_DECELERATION + this.speed * COASTING_AIR_RESISTANCE) * deltaSeconds);
    }
    this.speedMph = Math.round(this.speed * SPEED_DISPLAY_MULTIPLIER);
    const playerDistanceBefore = this.playerDistance;
    this.playerDistance += this.speed * deltaSeconds;
    if (playerDistanceBefore < FINISH_DISTANCE && this.playerDistance >= FINISH_DISTANCE) {
      this.playerFinishedFirst = !this.mickeyFinished;
    }
    const nextMickeyDistance = this.mickeyDistance + MICKEY_SPEED * deltaSeconds;
    this.mickeyDistance = Math.min(FINISH_DISTANCE, nextMickeyDistance);
    if (!this.mickeyFinished && this.mickeyDistance >= FINISH_DISTANCE) {
      this.mickeyFinished = true;
      this.statusText.setText("MICKEY FINISHED!").setFontSize(26);
      this.instructionText.setText("MICKEY FINISHED — KEEP GOING.").setColor("#ffb2a6");
    }
    this.playerCar.setPosition(START_X + this.playerDistance * TRACK_SCALE, 354);
    this.mickeyCar.setPosition(START_X + this.mickeyDistance * TRACK_SCALE, 253);
    this.drawCar(this.playerCar, 0, 0, this.speed > 0.1 ? this.playerGearColor() : 0x587182, false);
  }

  private updateHud(): void {
    this.drawRpmGauge();
    this.updateGasFeedback();
    this.gearText.setText(`GEAR ${this.gear}  •  PERFECT ${this.perfectShifts}/${REQUIRED_PERFECT_SHIFTS}`);
    this.speedText.setText(`SPEED ${this.speedMph} MPH`);
    this.timerText.setText(raceTime(this.elapsedMs));
    const heatRatio = Phaser.Math.Clamp(this.engineHeatMs / ENGINE_HEAT_LIMIT_MS, 0, 1);
    this.engineHeatFill.width = 186 * heatRatio;
    this.engineHeatFill.setFillStyle(heatRatio >= 0.8 ? 0xc45045 : heatRatio >= 0.45 ? 0xe0b84d : 0x5d9b68);
    this.engineHeatText.setText(`HEAT ${Math.round(heatRatio * 100)}%`)
      .setColor(heatRatio >= 0.8 ? "#ffb2a6" : heatRatio >= 0.45 ? "#fff0a3" : "#c8dfcb");
  }

  private shift(direction: 1 | -1): void {
    if (this.phase !== "racing") return;
    if (direction > 0 && this.gear >= MAX_GEAR) return;
    if (direction < 0 && this.gear <= 1) return;
    const perfect = direction > 0 && Math.abs(this.rpm - PERFECT_RPM) <= PERFECT_WINDOW;
    if (direction > 0 && perfect) {
      this.perfectShifts += 1;
      this.instructionText.setText("PERFECT SHIFT!  Keep it clean.").setColor("#fff0a3");
    } else if (direction > 0) {
      this.instructionText.setText("MISSED SHIFT — Mickey noticed.").setColor("#ffb2a6");
    }
    this.gear += direction;
    this.rpm = direction > 0 ? (perfect ? 4_050 : 3_250) : 5_250;
    this.revLimiterActive = false;
    this.updateHud();
  }

  private finish(won: boolean, message: string): void {
    if (this.phase === "result") return;
    this.phase = "result";
    // The result screen is the mini-game's natural terminal state. This does
    // not affect the local best-time/save update immediately below.
    void gamePlatform.endPlaySession();
    this.gasHeld = false;
    this.pointerGasHeld = false;
    gameStore.recordMickeyDragRace(Math.round(this.elapsedMs), won);
    this.statusText.setText(message).setFontSize(30);
    const finalTime = raceTime(this.elapsedMs);
    const detail = this.engineBlown
      ? `ENGINE BLOWN • FINAL ${finalTime}`
      : won
      ? `FINAL ${finalTime} • YOU WIN • ${this.perfectShifts}/${REQUIRED_PERFECT_SHIFTS} PERFECT`
      : `FINAL ${finalTime} • ${this.mickeyFinished ? "MICKEY WON" : "TIME UP"} • ${this.perfectShifts}/${REQUIRED_PERFECT_SHIFTS} PERFECT`;
    this.instructionText.setText(detail).setColor(won ? "#fff0a3" : "#ffd1c7");
    if (won) {
      void submitLeaderboardTime("mickeyDragRace", this.elapsedMs).then((entries) => {
        const lines = leaderboardLines(entries);
        if (lines.length) this.instructionText.setText(`${detail}\nTOP TIMES\n${lines.join("\n")}`).setColor("#fff0a3");
        else this.instructionText.setText(`${detail}\nTIME SAVED — NO OTHER LEADERBOARD TIMES YET`).setColor("#fff0a3");
      });
    }
    this.gasButton.setVisible(false);
    this.shiftUpButton.setVisible(false);
    this.shiftDownButton.setVisible(false);
    const retry = this.button(630, 510, 200, 42, "RACE AGAIN", "TAP TO CHASE YOUR BEST", 0x37764e);
    const returnButton = this.button(850, 510, 200, 42, "RETURN", "BACK TO YOUR ADVENTURE", 0x315f4c);
    retry.on("pointerdown", () => this.scene.restart({ returnMap: this.returnMap }));
    returnButton.on("pointerdown", () => this.returnToAdventure());
    this.input.keyboard?.once("keydown-R", () => this.scene.restart({ returnMap: this.returnMap }));
    this.input.keyboard?.once("keydown-ESC", () => this.returnToAdventure());
  }

  private returnToAdventure(): void {
    this.scene.setVisible(true, "ui");
    this.scene.start(this.returnMap);
    void gamePlatform.beginPlaySession();
  }

  private handleShiftUp(): void { this.shift(1); }

  private handleShiftDown(): void { this.shift(-1); }

  private playerGearColor(): number {
    return PLAYER_GEAR_COLORS[this.gear - 1] ?? 0xc25145;
  }

  private currentGearRpmRate(): number {
    return GEAR_RPM_RATES[this.gear - 1] ?? GEAR_RPM_RATES[GEAR_RPM_RATES.length - 1] ?? 2_150;
  }

  private currentGearSpeedCap(): number {
    return GEAR_SPEED_CAPS[this.gear - 1] ?? GEAR_SPEED_CAPS[GEAR_SPEED_CAPS.length - 1] ?? 31.5;
  }

  private currentGearAcceleration(): number {
    return GEAR_ACCELERATIONS[this.gear - 1] ?? GEAR_ACCELERATIONS[GEAR_ACCELERATIONS.length - 1] ?? 2.3;
  }

  private currentGearSpeedAlignmentRate(): number {
    return GEAR_SPEED_ALIGNMENT_RATES[this.gear - 1] ?? GEAR_SPEED_ALIGNMENT_RATES[GEAR_SPEED_ALIGNMENT_RATES.length - 1] ?? 1.9;
  }

  private updateGasFeedback(): void {
    if (!this.gasIndicator || !this.gasButton) return;
    const active = this.phase === "racing" && (this.pointerGasHeld || this.gasKeys.some((key) => key.isDown));
    this.gasIndicator.setText(active ? "THROTTLE OPEN  •  GAS PRESSED" : "THROTTLE CLOSED")
      .setColor(active ? "#b8f0bf" : "#9bb7a3");
    this.gasButton.setAlpha(active ? 1 : 0.78);
  }

  private drawRpmGauge(): void {
    if (!this.rpmGauge || !this.rpmNeedle) return;
    const cx = 100;
    const cy = 516;
    const radius = 51;
    const progress = Phaser.Math.Clamp(this.rpm / REDLINE_RPM, 0, 1);
    const needleAngle = Math.PI + progress * Math.PI;
    const inPerfectZone = Math.abs(this.rpm - PERFECT_RPM) <= PERFECT_WINDOW;
    const inRedZone = this.rpm >= RED_ZONE_RPM;
    const inSixthOverdrive = this.gear === MAX_GEAR && this.rpm >= SIXTH_GEAR_CRUISE_RPM - 80;
    const activeColor = inRedZone ? 0xc45045 : inPerfectZone ? 0xf0c758 : 0x8ab95d;
    this.rpmGauge.clear();
    this.rpmGauge.fillStyle(0x091217, 1).fillCircle(cx, cy, radius + 15);
    const segments: Array<[number, number, number]> = [
      [0, 0.72, 0x5d9b68],
      [0.72, 0.91, 0xe0b84d],
      [0.91, 1, 0xc45045],
    ];
    for (const [start, end, color] of segments) {
      this.rpmGauge.lineStyle(13, color, 0.34);
      this.rpmGauge.beginPath();
      this.rpmGauge.arc(cx, cy, radius, Math.PI + start * Math.PI, Math.PI + end * Math.PI, false);
      this.rpmGauge.strokePath();
    }
    this.rpmGauge.lineStyle(13, activeColor, 1);
    this.rpmGauge.beginPath();
    this.rpmGauge.arc(cx, cy, radius, Math.PI, needleAngle, false);
    this.rpmGauge.strokePath();
    this.rpmNeedle.clear();
    this.rpmNeedle.lineStyle(4, 0xfff3c9, 1).lineBetween(cx, cy, cx + Math.cos(needleAngle) * (radius - 12), cy + Math.sin(needleAngle) * (radius - 12));
    this.rpmNeedle.fillStyle(0xfff3c9, 1).fillCircle(cx, cy, 7);
    this.rpmValueText.setText(`${Math.round(this.rpm)} RPM`).setColor(inRedZone ? "#ffb2a6" : "#fff3c9");
    this.rpmZoneText.setText(this.revLimiterActive ? "REV LIMITER" : inRedZone ? "REDLINE — LIFT NOW" : inSixthOverdrive ? "6TH OVERDRIVE" : inPerfectZone ? "PERFECT SHIFT ZONE" : "BUILD RPM")
      .setColor(inPerfectZone && !this.revLimiterActive ? "#fff0a3" : inRedZone ? "#ffb2a6" : inSixthOverdrive ? "#b8f0bf" : "#c8dfcb");
  }

  private drawCar(graphics: Phaser.GameObjects.Graphics, x: number, y: number, color: number, jetta: boolean): void {
    graphics.clear();
    graphics.fillStyle(0x071015, 0.38).fillEllipse(x, y + 22, 95, 16);
    graphics.fillStyle(color, 1).fillRoundedRect(x - 46, y - 16, 92, 29, 7);
    graphics.fillStyle(jetta ? 0xdce5ea : 0xa4d1e6, 1).fillRoundedRect(x - 18, y - 35, 51, 23, 5);
    graphics.fillStyle(0x40525b, 1).fillRect(x - 13, y - 31, 18, 14).fillRect(x + 9, y - 31, 18, 14);
    if (jetta) graphics.lineStyle(2, 0x71818a, 1).lineBetween(x + 4, y - 33, x + 4, y + 10).lineBetween(x + 22, y - 33, x + 22, y + 10);
    graphics.fillStyle(0x172025, 1).fillCircle(x - 27, y + 14, 10).fillCircle(x + 27, y + 14, 10);
    graphics.fillStyle(0xc4d1d5, 1).fillCircle(x - 27, y + 14, 4).fillCircle(x + 27, y + 14, 4);
    graphics.fillStyle(0xf4dc85, 1).fillRect(x + 42, y - 4, 4, 8);
  }

  private cleanup(): void {
    inputCapture.release("mickey-drag-race");
    this.input.keyboard?.off("keydown-F", this.handleShiftUp, this);
    this.input.keyboard?.off("keydown-SPACE", this.handleShiftUp, this);
    this.input.keyboard?.off("keydown-ENTER", this.handleShiftUp, this);
    this.input.keyboard?.off("keydown-D", this.handleShiftDown, this);
    this.scene.setVisible(true, "ui");
  }
}
