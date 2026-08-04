import Phaser from "phaser";

import { inputCapture } from "../game/events";
import { gameStore } from "../game/GameStore";
import type { MapId } from "../game/types";

const MAX_RACE_MS = 60_000;
const FINISH_DISTANCE = 400;
const REQUIRED_PERFECT_SHIFTS = 5;
const PERFECT_RPM = 6_800;
const PERFECT_WINDOW = 230;

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
  private playerDistance = 0;
  private mickeyDistance = 0;
  private perfectShifts = 0;
  private missedShift = false;
  private gasHeld = false;
  private pointerGasHeld = false;
  private playerCar!: Phaser.GameObjects.Graphics;
  private mickeyCar!: Phaser.GameObjects.Graphics;
  private rpmFill!: Phaser.GameObjects.Rectangle;
  private gearText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;
  private gasButton!: Phaser.GameObjects.Container;
  private shiftButton!: Phaser.GameObjects.Container;
  private shiftKey?: Phaser.Input.Keyboard.Key;
  private gasKeys: Phaser.Input.Keyboard.Key[] = [];

  public constructor() { super("mickey_drag_race"); }

  public init(data?: { returnMap?: MapId }): void {
    this.returnMap = data?.returnMap ?? "bent_creek";
    this.phase = "countdown";
    this.countdown = 3;
    this.elapsedMs = 0;
    this.rpm = 1_800;
    this.gear = 1;
    this.playerDistance = 0;
    this.mickeyDistance = 0;
    this.perfectShifts = 0;
    this.missedShift = false;
    this.gasHeld = false;
    this.pointerGasHeld = false;
  }

  public create(): void {
    this.scene.setVisible(false, "ui");
    inputCapture.capture("mickey-drag-race", { blockMenuToggle: true });
    this.cameras.main.setBackgroundColor("#0b1720");
    this.drawRoad();
    this.drawStartLine();
    this.playerCar = this.add.graphics().setDepth(4);
    this.mickeyCar = this.add.graphics().setDepth(4);
    this.drawCar(this.playerCar, 170, 354, 0x316fa5, false);
    this.drawCar(this.mickeyCar, 170, 253, 0xbfc7cd, true);
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
    if (this.shiftKey && Phaser.Input.Keyboard.JustDown(this.shiftKey)) this.shift();
    this.elapsedMs += delta;
    this.updateEngine(delta);
    this.updateCars(delta);
    this.updateHud();
    if (this.elapsedMs >= MAX_RACE_MS) this.finish(false, "Time's up — Mickey takes this one.");
    else if (this.mickeyDistance >= FINISH_DISTANCE && this.playerDistance < FINISH_DISTANCE) this.finish(false, "Mickey crossed first. Try those perfect shifts again.");
    else if (this.playerDistance >= FINISH_DISTANCE) {
      const won = this.perfectShifts === REQUIRED_PERFECT_SHIFTS && !this.missedShift && this.playerDistance > this.mickeyDistance;
      this.finish(won, won ? "YOU BEAT MICKEY!" : "Close, but Mickey only respects a perfect run.");
    }
  }

  private drawRoad(): void {
    const road = this.add.graphics();
    road.fillStyle(0x17232a).fillRect(0, 154, 960, 274);
    road.fillStyle(0x24343a).fillRect(0, 170, 960, 108).fillRect(0, 300, 960, 108);
    road.lineStyle(3, 0xf0d976, 0.8);
    for (let x = 26; x < 960; x += 70) road.lineBetween(x, 289, x + 36, 289);
    road.lineStyle(2, 0xf6f4dc, 0.7).lineBetween(0, 225, 960, 225).lineBetween(0, 354, 960, 354);
    road.fillStyle(0x254637).fillRect(0, 428, 960, 112).fillRect(0, 0, 960, 154);
    road.fillStyle(0xf3cf76, 0.85).fillCircle(825, 85, 29);
    this.add.text(480, 37, "BENT CREEK DRAG STRIP", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "25px", fontStyle: "bold", color: "#fff3c9",
      stroke: "#12252b", strokeThickness: 5,
    }).setOrigin(0.5);
    this.add.text(480, 70, "One minute. Five perfect shifts. No excuses.", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "14px", color: "#d8e6d4",
    }).setOrigin(0.5);
  }

  private drawStartLine(): void {
    const line = this.add.graphics().setDepth(3);
    line.fillStyle(0xf7f5e6, 1);
    for (let y = 174; y < 408; y += 18) line.fillRect(165, y, 7, 10);
    line.lineStyle(4, 0xfff0ae, 1).lineBetween(822, 170, 822, 408);
    this.add.text(822, 149, "FINISH", { fontFamily: "monospace", fontSize: "12px", color: "#fff3c9", fontStyle: "bold" }).setOrigin(0.5);
    this.add.text(95, 205, "MICKEY", { fontFamily: "monospace", fontSize: "13px", color: "#f0d18a", fontStyle: "bold" });
    this.add.text(95, 394, "YOU", { fontFamily: "monospace", fontSize: "13px", color: "#d4e9ff", fontStyle: "bold" });
  }

  private buildHud(): void {
    this.add.rectangle(480, 474, 930, 110, 0x101b1e, 0.95).setStrokeStyle(3, 0xdcc879, 0.85).setDepth(-1);
    this.rpmFill = this.add.rectangle(94, 482, 0, 18, 0x8ab95d, 1).setOrigin(0, 0.5);
    this.add.rectangle(260, 482, 350, 18, 0x24343a, 1).setStrokeStyle(2, 0xf4e39b, 1);
    this.add.rectangle(260 + (PERFECT_RPM / 8_000) * 350, 482, (PERFECT_WINDOW * 2 / 8_000) * 350, 24, 0xe7b648, 0.75).setStrokeStyle(1, 0xfff3b8, 1);
    this.add.text(84, 456, "RPM", { fontFamily: "monospace", fontSize: "13px", color: "#d8e6d4", fontStyle: "bold" });
    this.gearText = this.add.text(480, 462, "GEAR 1", { fontFamily: "monospace", fontSize: "20px", color: "#fff3c9", fontStyle: "bold" }).setOrigin(0.5);
    this.timerText = this.add.text(852, 456, "0:00.00", { fontFamily: "monospace", fontSize: "20px", color: "#fff3c9", fontStyle: "bold" }).setOrigin(0.5);
    this.statusText = this.add.text(480, 116, "3", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "56px", color: "#fff3c9", fontStyle: "bold", stroke: "#12252b", strokeThickness: 9,
    }).setOrigin(0.5);
    this.instructionText = this.add.text(480, 516, "HOLD GAS  •  TAP SHIFT IN THE GOLD ZONE", {
      fontFamily: "monospace", fontSize: "12px", color: "#d8e6d4", fontStyle: "bold",
    }).setOrigin(0.5);
  }

  private buildControls(): void {
    this.gasButton = this.button(710, 470, 176, 54, "GAS", "HOLD  G / W / ↑", 0x37764e);
    this.shiftButton = this.button(514, 470, 176, 54, "SHIFT", "TAP  SHIFT / F", 0xa84335);
    this.gasButton.on("pointerdown", () => { this.pointerGasHeld = true; });
    this.gasButton.on("pointerup", () => { this.pointerGasHeld = false; });
    this.gasButton.on("pointerout", () => { this.pointerGasHeld = false; });
    this.shiftButton.on("pointerdown", () => this.shift());
  }

  private button(x: number, y: number, width: number, height: number, label: string, hint: string, color: number): Phaser.GameObjects.Container {
    const shadow = this.add.rectangle(3, 4, width, height, 0x000000, 0.28);
    const card = this.add.rectangle(0, 0, width, height, color, 1).setStrokeStyle(3, 0xfff3c9, 1);
    const title = this.add.text(0, -10, label, { fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "21px", fontStyle: "bold", color: "#fff8d8" }).setOrigin(0.5);
    const sub = this.add.text(0, 15, hint, { fontFamily: "monospace", fontSize: "10px", color: "#e5f1da" }).setOrigin(0.5);
    return this.add.container(x, y, [shadow, card, title, sub]).setDepth(10).setSize(width, height).setInteractive({ useHandCursor: true });
  }

  private bindKeyboard(): void {
    this.gasKeys = ["G", "W", "UP"].map((key) => this.input.keyboard!.addKey(key));
    this.shiftKey = this.input.keyboard?.addKey("SHIFT");
    this.input.keyboard?.on("keydown-F", this.shift, this);
    this.input.keyboard?.on("keydown-SPACE", this.shift, this);
    this.input.keyboard?.on("keydown-ENTER", this.shift, this);
  }

  private updateEngine(delta: number): void {
    const deltaSeconds = delta / 1_000;
    if (this.gasHeld) this.rpm += (2_600 + this.gear * 100) * deltaSeconds;
    else this.rpm -= 1_100 * deltaSeconds;
    if (this.rpm >= 8_000) {
      this.rpm = 4_300;
      this.missedShift = true;
      this.instructionText.setText("REDLINE!  You need a perfect shift.").setColor("#ffb2a6");
    }
    this.rpm = Phaser.Math.Clamp(this.rpm, 1_200, 8_000);
  }

  private updateCars(delta: number): void {
    const deltaSeconds = delta / 1_000;
    const playerSpeed = this.gasHeld ? (8 + this.gear * 3.6) * (this.rpm / 7_000) : 0;
    const mickeySpeed = 14.1;
    this.playerDistance += Math.max(0, playerSpeed) * deltaSeconds;
    this.mickeyDistance += mickeySpeed * deltaSeconds;
    this.drawCar(this.playerCar, Math.min(805, 170 + this.playerDistance * 1.63), 354, 0x316fa5, false);
    this.drawCar(this.mickeyCar, Math.min(805, 170 + this.mickeyDistance * 1.63), 253, 0xbfc7cd, true);
  }

  private updateHud(): void {
    const fill = Phaser.Math.Clamp(this.rpm / 8_000, 0, 1) * 350;
    this.rpmFill.width = fill;
    this.rpmFill.setFillStyle(this.rpm > 7_250 ? 0xc45045 : this.rpm >= PERFECT_RPM - PERFECT_WINDOW && this.rpm <= PERFECT_RPM + PERFECT_WINDOW ? 0xf0c758 : 0x8ab95d);
    this.gearText.setText(`GEAR ${this.gear}  •  PERFECT ${this.perfectShifts}/${REQUIRED_PERFECT_SHIFTS}`);
    this.timerText.setText(raceTime(this.elapsedMs));
  }

  private shift(): void {
    if (this.phase !== "racing" || this.gear > REQUIRED_PERFECT_SHIFTS) return;
    const perfect = Math.abs(this.rpm - PERFECT_RPM) <= PERFECT_WINDOW;
    if (perfect) {
      this.perfectShifts += 1;
      this.instructionText.setText("PERFECT SHIFT!  Keep it clean.").setColor("#fff0a3");
    } else {
      this.missedShift = true;
      this.instructionText.setText("MISSED SHIFT — Mickey noticed.").setColor("#ffb2a6");
    }
    this.gear += 1;
    this.rpm = perfect ? 4_050 : 3_250;
  }

  private finish(won: boolean, message: string): void {
    if (this.phase === "result") return;
    this.phase = "result";
    this.gasHeld = false;
    this.pointerGasHeld = false;
    gameStore.recordMickeyDragRace(Math.round(this.elapsedMs), won);
    this.statusText.setText(message).setFontSize(30);
    const detail = won
      ? `TIME ${raceTime(this.elapsedMs)}  •  A new chapter of road legend begins.`
      : `TIME ${raceTime(this.elapsedMs)}  •  ${this.perfectShifts}/${REQUIRED_PERFECT_SHIFTS} perfect shifts.`;
    this.instructionText.setText(detail).setColor(won ? "#fff0a3" : "#ffd1c7");
    this.gasButton.setVisible(false);
    this.shiftButton.setVisible(false);
    const retry = this.button(372, 472, 250, 52, "RACE AGAIN", "TAP TO CHASE YOUR BEST", 0x37764e);
    const returnButton = this.button(650, 472, 250, 52, "RETURN", "BACK TO YOUR ADVENTURE", 0x315f4c);
    retry.on("pointerdown", () => this.scene.restart({ returnMap: this.returnMap }));
    returnButton.on("pointerdown", () => this.returnToAdventure());
    this.input.keyboard?.once("keydown-R", () => this.scene.restart({ returnMap: this.returnMap }));
    this.input.keyboard?.once("keydown-ESC", () => this.returnToAdventure());
  }

  private returnToAdventure(): void {
    this.scene.setVisible(true, "ui");
    this.scene.start(this.returnMap);
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
    this.input.keyboard?.off("keydown-F", this.shift, this);
    this.input.keyboard?.off("keydown-SPACE", this.shift, this);
    this.input.keyboard?.off("keydown-ENTER", this.shift, this);
    this.scene.setVisible(true, "ui");
  }
}
