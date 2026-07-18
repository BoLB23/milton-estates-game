import Phaser from "phaser";

export const SCRAPBOOK = {
  fontFamily: "Trebuchet MS, Arial, sans-serif",
  ink: "#26352f",
  mutedInk: "#687068",
  blueInk: "#275c73",
  paper: 0xf3e7c5,
  card: 0xfff8df,
  cardStroke: 0xcdbf98,
  button: "#275c73",
  buttonInk: "#f9f1d7",
  focus: "#f3c95f",
} as const;

export function scrapbookText(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  value: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  textScale = 1,
): Phaser.GameObjects.Text {
  const configured = { fontFamily: SCRAPBOOK.fontFamily, ...style };
  const text = scene.add.text(x, y, value, configured);
  const requested = Number.parseFloat(String(configured.fontSize ?? 16));
  if (Number.isFinite(requested)) text.setFontSize(Math.max(1, Math.round(requested * textScale)));
  parent.add(text);
  return text;
}

export function scrapbookCard(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number = SCRAPBOOK.card,
  shadow = true,
): Phaser.GameObjects.Graphics {
  const card = scene.add.graphics();
  if (shadow) card.fillStyle(0x17251f, 0.12).fillRoundedRect(x + 4, y + 5, width, height, 5);
  card.fillStyle(color).fillRoundedRect(x, y, width, height, 5);
  card.lineStyle(2, SCRAPBOOK.cardStroke, 0.9).strokeRoundedRect(x, y, width, height, 5);
  parent.add(card);
  return card;
}

export interface ScrapbookButtonOptions {
  readonly width?: number;
  readonly color?: string;
  readonly ink?: string;
  readonly focusColor?: string;
  readonly focusInk?: string;
  readonly textScale?: number;
}

export class TextFocusController {
  private readonly buttons: Phaser.GameObjects.Text[] = [];
  private index = 0;

  reset(): void { this.buttons.length = 0; this.index = 0; }
  add(button: Phaser.GameObjects.Text): void { this.buttons.push(button); }
  get hasButtons(): boolean { return this.buttons.length > 0; }
  move(delta: number): void {
    if (!this.buttons.length) return;
    this.index = (this.index + delta + this.buttons.length) % this.buttons.length;
    this.refresh();
  }
  focus(button: Phaser.GameObjects.Text): void {
    const index = this.buttons.indexOf(button);
    if (index >= 0) this.index = index;
    this.refresh();
  }
  activate(): void { (this.buttons[this.index]?.getData("action") as (() => void) | undefined)?.(); }
  refresh(): void {
    this.buttons.forEach((button, index) => {
      const focused = index === this.index;
      button.setBackgroundColor(focused ? button.getData("focusColor") : button.getData("baseColor"));
      button.setColor(focused ? button.getData("focusInk") : button.getData("baseInk"));
      button.setShadow(0, 0, focused ? "#173026" : "#000000", focused ? 8 : 0, false, true);
    });
  }
}

export function scrapbookButton(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  focus: TextFocusController,
  x: number,
  y: number,
  label: string,
  action: () => void,
  options: ScrapbookButtonOptions = {},
): Phaser.GameObjects.Text {
  const button = scrapbookText(scene, parent, x, y, label, {
    fontSize: "17px", fontStyle: "bold", color: options.ink ?? SCRAPBOOK.buttonInk,
    backgroundColor: options.color ?? SCRAPBOOK.button, fixedWidth: options.width ?? 250,
    align: "center", padding: { x: 12, y: 11 },
  }, options.textScale ?? 1).setInteractive({ useHandCursor: true }).on("pointerdown", action);
  button
    .setData("action", action)
    .setData("baseColor", options.color ?? SCRAPBOOK.button)
    .setData("baseInk", options.ink ?? SCRAPBOOK.buttonInk)
    .setData("focusColor", options.focusColor ?? SCRAPBOOK.focus)
    .setData("focusInk", options.focusInk ?? SCRAPBOOK.ink)
    .on("pointerover", () => focus.focus(button));
  focus.add(button);
  return button;
}
