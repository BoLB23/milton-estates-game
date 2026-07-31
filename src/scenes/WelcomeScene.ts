import Phaser from "phaser";
import { EVENT, gameEvents, type InputActionEvent } from "../game/events";
import { gameStore } from "../game/GameStore";
import { createPresentationPolicy, type PresentationPolicy } from "../presentation/presentationPolicy";

const PAPER = 0xf7efd2;
const INK = "#2f2923";
const BLUE = "#275c73";
const RED = "#a34237";

/** A short, skippable scrapbook opening shown before a first-time visitor reaches the title. */
export class WelcomeScene extends Phaser.Scene {
  private beat = 0;
  private content!: Phaser.GameObjects.Container;
  private policy!: PresentationPolicy;
  private transitioning = false;

  constructor() { super("welcome"); }

  create(): void {
    this.beat = 0;
    this.transitioning = false;
    this.policy = createPresentationPolicy(gameStore.getState().settings);
    this.cameras.main.setBackgroundColor("#173d32");
    this.content = this.add.container(0, 0);
    gameEvents.on(EVENT.inputAction, this.handleInputAction, this);
    this.input.on("pointerup", this.advance, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.renderBeat();
  }

  private renderBeat(): void {
    this.tweens.killAll();
    this.content.removeAll(true);
    this.drawDesk();
    if (this.beat === 0) this.renderCover();
    else if (this.beat === 1) this.renderSummer();
    else this.renderMystery();
    this.renderControls();

    if (!this.policy.reducedMotion) {
      this.content.setAlpha(0).setScale(0.985).setY(8);
      this.tweens.add({
        targets: this.content,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        y: 0,
        duration: this.policy.duration(280),
        ease: "Sine.easeOut",
        onComplete: () => { this.transitioning = false; },
      });
    } else {
      this.content.setAlpha(1).setScale(1).setY(0);
      this.transitioning = false;
    }
  }

  private drawDesk(): void {
    const desk = this.add.graphics();
    desk.fillStyle(0x315948).fillRect(0, 0, 960, 540);
    for (let y = 10; y < 540; y += 24) desk.lineStyle(1, 0x89a18f, 0.11).lineBetween(0, y, 960, y + 18);
    desk.fillStyle(0x172a23, 0.28).fillRoundedRect(34, 24, 892, 482, 12);
    this.content.add(desk);
  }

  private paper(angle = 0): Phaser.GameObjects.Container {
    const page = this.add.container(480, 260).setAngle(angle);
    const shadow = this.add.rectangle(8, 10, 820, 430, 0x101b17, 0.28).setOrigin(0.5);
    const sheet = this.add.rectangle(0, 0, 820, 430, PAPER).setStrokeStyle(2, 0xcdbf98, 1);
    page.add([shadow, sheet]);
    this.content.add(page);
    return page;
  }

  private renderCover(): void {
    const page = this.paper(-1.2);
    const photoFrame = this.add.rectangle(205, -6, 326, 292, 0xfffbeb).setStrokeStyle(3, 0x50675b, 0.85);
    const photo = this.add.image(205, -32, "chapter-1-cover").setDisplaySize(294, 208);
    const caption = this.add.text(205, 104, "Wheatfield Drive, Summer 2007", {
      fontFamily: "Comic Sans MS, cursive", fontSize: "16px", color: "#675544",
    }).setOrigin(0.5);
    const tapeA = this.add.rectangle(76, -142, 70, 18, 0xe6d78f, 0.76).setAngle(-8);
    const tapeB = this.add.rectangle(334, -142, 70, 18, 0xe6d78f, 0.76).setAngle(9);
    const title = this.add.text(-356, -142, "MILTON\nESTATES", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "46px", fontStyle: "bold", color: BLUE, lineSpacing: -5,
    });
    const subtitle = this.add.text(-350, -28, "A summer scrapbook", {
      fontFamily: "Comic Sans MS, cursive", fontSize: "23px", color: RED,
    }).setAngle(-2);
    const copy = this.add.text(-348, 32, "Long days.\nSecret trails.\nOne missing controller.", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "19px", color: INK, lineSpacing: 8, wordWrap: { width: 238 },
    });
    page.add([photoFrame, photo, caption, tapeA, tapeB, title, subtitle, copy]);

    if (!this.policy.reducedMotion) {
      photoFrame.setAlpha(0); photo.setAlpha(0).setY(-18); caption.setAlpha(0);
      this.tweens.add({ targets: photoFrame, alpha: 1, duration: 420, delay: 180, ease: "Sine.easeOut" });
      this.tweens.add({ targets: photo, alpha: 1, y: -32, duration: 520, delay: 180, ease: "Cubic.easeOut" });
      this.tweens.add({ targets: [caption, tapeA, tapeB], alpha: { from: 0, to: 1 }, duration: 300, delay: 520 });
    }
  }

  private renderSummer(): void {
    const page = this.paper(0.8);
    const heading = this.add.text(-352, -174, "WELCOME TO THE NEIGHBORHOOD", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "29px", fontStyle: "bold", color: BLUE,
    });
    const note = this.add.text(-348, -129, "Every yard has a story. Every shortcut has a secret.", {
      fontFamily: "Comic Sans MS, cursive", fontSize: "17px", color: RED,
    });
    const yard = this.add.graphics();
    yard.fillStyle(0xb9d992).fillRoundedRect(-350, -84, 700, 220, 8);
    yard.fillStyle(0x80b96f).fillRoundedRect(-350, 58, 700, 78, 8);
    yard.fillStyle(0xf1dfb7).fillRect(-294, -34, 126, 94);
    yard.fillStyle(0x9c563e).fillTriangle(-314, -31, -231, -88, -148, -31);
    yard.fillStyle(0x315948).fillCircle(222, -32, 48).fillCircle(278, 3, 57);
    yard.fillStyle(0xf3c95f, 0.75).fillCircle(85, -39, 19);
    const billy = this.add.sprite(-276, 67, "billy", 0).setScale(0.28);
    const label = this.add.text(-345, 155, "This is Billy. School is out—and adventure is already calling.", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "17px", color: INK,
    });
    page.add([yard, billy, heading, note, label]);

    if (this.policy.reducedMotion) {
      billy.setX(70).anims.play("billy-idle-side");
    } else {
      billy.anims.play("billy-walk-side");
      this.tweens.add({ targets: billy, x: 124, duration: 2_600, ease: "Sine.easeInOut", yoyo: true, repeat: -1 });
      heading.setAlpha(0).setX(-375);
      this.tweens.add({ targets: heading, x: -352, alpha: 1, duration: 420, ease: "Cubic.easeOut" });
    }
  }

  private renderMystery(): void {
    const page = this.paper(-0.6);
    const heading = this.add.text(-352, -172, "YOUR FIRST MYSTERY", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "30px", fontStyle: "bold", color: BLUE,
    });
    const prompt = this.add.text(-348, -126, "Jeremy's controller is missing. The trail starts outside.", {
      fontFamily: "Comic Sans MS, cursive", fontSize: "18px", color: RED,
    });
    const controllerCard = this.add.rectangle(-205, 35, 260, 218, 0xfff8df).setStrokeStyle(2, 0xb99569, 0.9).setAngle(-2);
    const controller = this.add.image(-205, 18, "controller").setScale(3.1).setAngle(-5);
    const clue = this.add.text(-205, 104, "MISSING!", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "22px", fontStyle: "bold", color: RED,
    }).setOrigin(0.5).setAngle(-3);
    const guideCard = this.add.rectangle(126, 35, 340, 218, 0xe9d29e).setStrokeStyle(2, 0xb99569, 0.9).setAngle(1);
    const guide = this.add.text(-14, -56, "HOW TO EXPLORE\n\nMOVE     WASD / ARROWS\nINSPECT  E / SPACE\nPACK     B / ESC", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "16px", fontStyle: "bold", color: INK, lineSpacing: 8,
    });
    const ready = this.add.text(0, 170, "The rest of the story is yours.", {
      fontFamily: "Comic Sans MS, cursive", fontSize: "18px", color: "#675544",
    }).setOrigin(0.5);
    page.add([controllerCard, controller, clue, guideCard, guide, heading, prompt, ready]);

    if (!this.policy.reducedMotion) {
      this.tweens.add({ targets: controller, angle: 5, scaleX: 3.25, scaleY: 3.25, duration: 650, ease: "Sine.easeInOut", yoyo: true, repeat: -1 });
      guideCard.setAlpha(0).setX(156); guide.setAlpha(0).setX(16);
      this.tweens.add({ targets: [guideCard, guide], x: "-=30", alpha: 1, duration: 430, delay: 180, ease: "Cubic.easeOut" });
    }
  }

  private renderControls(): void {
    const dots = [0, 1, 2].map((index) => this.add.circle(442 + index * 38, 492, 6, index === this.beat ? 0xf3c95f : 0x91a89a, 1));
    const continueText = this.add.text(480, 468, this.beat === 2 ? "SPACE / TAP TO OPEN THE SCRAPBOOK" : "SPACE / TAP TO CONTINUE", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "13px", fontStyle: "bold", color: BLUE,
    }).setOrigin(0.5);
    const skip = this.add.text(906, 493, "ESC / B  SKIP", {
      fontFamily: "Trebuchet MS, Arial, sans-serif", fontSize: "12px", fontStyle: "bold", color: "#d9cfae",
    }).setOrigin(1, 0.5);
    this.content.add([...dots, continueText, skip]);
    if (!this.policy.reducedMotion) this.tweens.add({ targets: continueText, alpha: 0.58, duration: 750, yoyo: true, repeat: -1 });
  }

  private advance = (): void => {
    if (this.transitioning) return;
    gameEvents.emit(EVENT.audioCue, "confirm");
    if (this.beat >= 2) { this.finish(); return; }
    this.transitioning = true;
    if (this.policy.reducedMotion) {
      this.beat += 1;
      this.renderBeat();
      return;
    }
    this.tweens.killAll();
    this.tweens.add({
      targets: this.content, alpha: 0, y: -8, duration: this.policy.duration(180), ease: "Sine.easeIn",
      onComplete: () => { this.beat += 1; this.renderBeat(); },
    });
  };

  private finish(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.tweens.killAll();
    if (this.policy.reducedMotion) { this.scene.start("front-end"); return; }
    this.tweens.add({
      targets: this.content, alpha: 0, duration: this.policy.duration(220), ease: "Sine.easeIn",
      onComplete: () => this.scene.start("front-end"),
    });
  }

  private handleInputAction(event: InputActionEvent): void {
    if (!event.pressed || !this.sys.isActive()) return;
    if (event.action === "interact" || event.action === "moveRight") this.advance();
    else if (event.action === "back" || event.action === "menu") {
      gameEvents.emit(EVENT.audioCue, "back");
      this.finish();
    }
  }

  private cleanup(): void {
    gameEvents.off(EVENT.inputAction, this.handleInputAction, this);
    this.input.off("pointerup", this.advance, this);
  }
}
