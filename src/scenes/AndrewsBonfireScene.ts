import Phaser from "phaser";

import { gameStore } from "../game/GameStore";
import { createPresentationPolicy, type PresentationPolicy } from "../presentation/presentationPolicy";
import { CharacterFactory } from "../world/CharacterFactory";
import { PlayerAvatar } from "../world/PlayerAvatar";

export const ANDREWS_BONFIRE_SCENE_KEY = "andrews_bonfire";

export interface AndrewsBonfireSceneData {
  /** Called by the integration layer after the hazy next-morning sequence. */
  onNightComplete?: () => void;
  /** Defaults to the established daytime neighborhood scene. */
  returnScene?: string;
  /** Internal handoff from the completed bad-trip trial. */
  completed?: boolean;
}

type BonfireBeat = { speaker: string; text: string };

const CUTSCENE: readonly BonfireBeat[] = [
  { speaker: "Andrew", text: "You made it. Pull up a spot by the fire." },
  { speaker: "Schwartz", text: "The nocturnal ambience is unusually conducive to group cohesion." },
  { speaker: "Billy", text: "Andrew, is it time to initiate somebody into the crew?" },
  { speaker: "Andrew", text: "Billy and I are already in. If everybody is cool with it, we can see what tonight says." },
  { speaker: "Schwartz", text: "The social ramifications are enormous. I vote affirmative." },
  { speaker: "Jeremy", text: "I can do it. I totally can do it." },
  { speaker: "Jeremy", text: "*cough cough* I think my whole chest just turned inside out." },
  { speaker: "Jeremy", text: "Wait. One more try—" },
  { speaker: "Andrew", text: "He's fine. He can try again next time. Your turn." },
  { speaker: "Billy", text: "Take a puff, then get the Dorito from the fire. If you can do that, you're crew." },
  { speaker: "You", text: "You take a puff. The fire stretches upward—and the whole backyard falls away." },
  { speaker: "You", text: "Out of the smoke, a towering shape rises — Don Rossi, and his eyes are locked right on you." },
  { speaker: "Don Rossi", text: "You don't get the Dorito without going through me first, kid. Better start running." },
];

/**
 * Code-drawn night vignette. It deliberately receives its hand-off through
 * scene data so the quest/store implementation can be wired independently.
 */
export class AndrewsBonfireScene extends Phaser.Scene {
  private policy!: PresentationPolicy;
  private flame!: Phaser.GameObjects.Graphics;
  private flamePhase = 0;
  private beat = 0;
  private dialogue!: Phaser.GameObjects.Text;
  private advanceHint!: Phaser.GameObjects.Text;
  private complete = false;
  private onNightComplete?: () => void;
  private returnScene = "neighborhood";
  private alreadyInitiated = false;
  private advanceHandler = () => this.advance();

  public constructor() { super(ANDREWS_BONFIRE_SCENE_KEY); }

  public init(data?: AndrewsBonfireSceneData): void {
    this.beat = 0;
    this.complete = false;
    this.onNightComplete = data?.onNightComplete;
    this.returnScene = data?.returnScene ?? "neighborhood";
    this.alreadyInitiated = data?.completed ?? false;
  }

  public create(): void {
    this.policy = createPresentationPolicy(gameStore.getState().settings);
    this.scene.setVisible(false, "ui");
    this.cameras.main.setBackgroundColor("#07111f");
    this.drawYard();
    this.drawPeople();
    this.flame = this.add.graphics().setDepth(15);
    this.drawFlame();
    this.dialogue = this.add.text(72, 404, "", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: `${this.policy.fontSize(19)}px`, color: "#fff4d6",
      wordWrap: { width: 810 }, lineSpacing: 5, stroke: "#11121a", strokeThickness: 5,
    }).setDepth(30);
    this.advanceHint = this.add.text(890, 510, "CLICK / SPACE", {
      fontFamily: "monospace", fontSize: `${this.policy.fontSize(11)}px`, color: "#f6d987",
    }).setOrigin(1).setDepth(30);
    this.input.on("pointerup", this.advanceHandler);
    this.input.keyboard?.on("keydown-SPACE", this.advanceHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    if (this.alreadyInitiated) this.renderInitiationComplete();
    else this.renderBeat();
  }

  public update(_time: number, delta: number): void {
    if (this.policy.reducedMotion) return;
    this.flamePhase += delta / 180;
    this.drawFlame();
  }

  private drawYard(): void {
    const yard = this.add.graphics();
    yard.fillStyle(0x07111f).fillRect(0, 0, 960, 540);
    yard.fillStyle(0x112d2e).fillCircle(480, 278, 330);
    yard.fillStyle(0x183f37).fillCircle(480, 288, 286);
    yard.fillStyle(0x214c3d).fillCircle(480, 305, 230);
    yard.fillStyle(0x12221f).fillRect(0, 410, 960, 130);
    for (let x = 18; x < 960; x += 76) yard.fillStyle(0x274e43, 0.45).fillCircle(x, 132 + (x % 130), 40);
    this.add.text(480, 44, "ANDREWS' BACKYARD  •  LATE NIGHT", {
      fontFamily: "monospace", fontSize: `${this.policy.fontSize(14)}px`, color: "#dbe6d4", letterSpacing: 2,
    }).setOrigin(0.5).setDepth(20);
  }

  private drawPeople(): void {
    const people: Array<[number, number, "jeremy" | "andrew" | "billy" | "schwartz", string]> = [
      [238, 274, "jeremy", "JEREMY"], [352, 198, "andrew", "ANDREW"], [606, 198, "billy", "BILLY"],
      [722, 274, "schwartz", "SCHWARTZ"],
    ];
    for (const [x, y, id, name] of people) {
      CharacterFactory.createNpc(this, { id, x, y: y + 56, depth: 10, scale: id === "billy" ? 0.26 : 0.2 });
      this.add.text(x, y + 76, name, { fontFamily: "monospace", fontSize: `${this.policy.fontSize(10)}px`, color: "#edf3de", fontStyle: "bold" }).setOrigin(0.5).setDepth(12);
    }
    const player = PlayerAvatar.createPreview(this, { x: 480, y: 393, scale: 0.32, depth: 10, profile: gameStore.getPlayerProfile() });
    this.add.text(480, 413, "YOU", { fontFamily: "monospace", fontSize: `${this.policy.fontSize(10)}px`, color: "#edf3de", fontStyle: "bold" }).setOrigin(0.5).setDepth(12);
    void player;
  }

  private drawFlame(): void {
    this.flame.clear();
    const wobble = Math.sin(this.flamePhase) * 7;
    this.flame.fillStyle(0x44281a).fillCircle(480, 286, 54);
    this.flame.lineStyle(7, 0x6b3d22).lineBetween(437, 301, 521, 270).lineBetween(440, 269, 518, 303);
    this.flame.fillStyle(0xf18c32, 0.96).fillTriangle(452, 290, 480 + wobble, 200, 510, 290);
    this.flame.fillStyle(0xffd65d, 1).fillTriangle(465, 289, 481 - wobble * 0.5, 231, 497, 289);
    this.flame.fillStyle(0xfff1b3, 0.95).fillTriangle(474, 288, 481, 250, 489, 288);
    this.flame.fillStyle(0xf1a23f, 0.7).fillCircle(480, 268, 86 + Math.sin(this.flamePhase * 2) * 5);
  }

  private renderBeat(): void {
    const line = CUTSCENE[this.beat];
    if (!line) { this.launchBadTrip(); return; }
    this.dialogue.setText(`${line.speaker}: ${line.text}`);
    if (this.beat === 7) this.time.delayedCall(this.policy.duration(350), () => {
      if (!this.complete) this.dialogue.setText("Jeremy: *thud*...");
    });
  }

  private advance(): void {
    if (this.complete) return;
    if (this.alreadyInitiated) { this.finishNight(); return; }
    this.beat += 1;
    this.renderBeat();
  }

  private launchBadTrip(): void {
    this.complete = true;
    this.input.off("pointerup", this.advanceHandler);
    this.input.keyboard?.off("keydown-SPACE", this.advanceHandler);
    this.cameras.main.fadeOut(this.policy.duration(550), 236, 176, 255);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("bad_trip", {
        onNightComplete: this.onNightComplete,
        returnScene: this.returnScene,
      });
    });
  }

  private renderInitiationComplete(): void {
    this.dialogue.setText("You eat the fire-warmed Dorito.\nBilly: Welcome to the crew.\nAndrew: The rest of the night becomes a hazy blur.");
    this.advanceHint.setText("CLICK / SPACE TO WAKE UP");
  }

  private finishNight(): void {
    this.complete = true;
    const wakeUp = (): void => {
      this.onNightComplete?.();
      gameStore.setCurrentMap("neighborhood");
      this.scene.setVisible(true, "ui");
      this.scene.start(this.returnScene, { spawn: "home", bonfireComplete: true });
    };
    if (this.policy.reducedMotion) { wakeUp(); return; }
    this.cameras.main.fadeOut(1_100, 247, 225, 178);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, wakeUp);
  }

  private cleanup(): void {
    this.input?.off("pointerup", this.advanceHandler);
    this.input?.keyboard?.off("keydown-SPACE", this.advanceHandler);
    this.cameras?.main?.resetFX();
  }
}
