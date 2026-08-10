import Phaser from "phaser";
import { clampScrollOffset } from "./scrollMath";

export interface ScrollablePanelOptions {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A compact masked viewport for long scrapbook lists. It deliberately owns
 * only clipping, scroll position, and the scrollbar; callers own row layout.
 */
export class ScrollablePanel {
  readonly content: Phaser.GameObjects.Container;
  private readonly maskGraphics: Phaser.GameObjects.Graphics;
  private readonly mask: Phaser.Display.Masks.GeometryMask;
  private readonly usesGeometryMask: boolean;
  private readonly scrollbar: Phaser.GameObjects.Graphics;
  private offset = 0;
  private contentHeight: number;

  constructor(
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    readonly options: ScrollablePanelOptions,
  ) {
    this.content = scene.add.container(0, 0);
    parent.add(this.content);
    // The geometry is never added to the scene: it is an invisible clipping
    // source in Canvas and a DynamicTexture source for WebGL's mask filter.
    this.maskGraphics = scene.make.graphics({ x: 0, y: 0 });
    this.maskGraphics.fillStyle(0xffffff, 1).fillRect(options.x, options.y, options.width, options.height);
    this.mask = this.maskGraphics.createGeometryMask();
    this.usesGeometryMask = scene.game.renderer.type === Phaser.CANVAS;
    if (this.usesGeometryMask) this.content.setMask(this.mask);
    else {
      this.content.enableFilters();
      this.content.filters!.internal.addMask(this.maskGraphics);
    }
    this.scrollbar = scene.add.graphics();
    parent.add(this.scrollbar);
    this.contentHeight = options.height;
    this.drawScrollbar();
  }

  get maxOffset(): number { return Math.max(0, this.contentHeight - this.options.height); }
  get scrollOffset(): number { return this.offset; }

  contains(x: number, y: number): boolean {
    const { options } = this;
    return x >= options.x && x <= options.x + options.width && y >= options.y && y <= options.y + options.height;
  }

  setContentHeight(height: number): void {
    this.contentHeight = Math.max(this.options.height, height);
    this.setOffset(this.offset);
  }

  scrollBy(delta: number): void { this.setOffset(this.offset + delta); }

  scrollIntoView(top: number, height: number): void {
    const bottom = top + height;
    if (top < this.offset + this.options.y) this.setOffset(top - this.options.y);
    else if (bottom > this.offset + this.options.y + this.options.height) this.setOffset(bottom - this.options.y - this.options.height);
  }

  destroy(): void {
    if (this.usesGeometryMask) this.content.clearMask(false);
    this.maskGraphics.destroy();
  }

  private setOffset(nextOffset: number): void {
    this.offset = clampScrollOffset(nextOffset, this.contentHeight, this.options.height);
    this.content.y = -this.offset;
    this.drawScrollbar();
  }

  private drawScrollbar(): void {
    const { x, y, width, height } = this.options;
    this.scrollbar.clear();
    if (this.maxOffset <= 0) return;
    const trackX = x + width - 8;
    const thumbHeight = Math.max(26, height * (height / this.contentHeight));
    const thumbY = y + (height - thumbHeight) * (this.offset / this.maxOffset);
    this.scrollbar.fillStyle(0xbca97c, 0.7).fillRoundedRect(trackX, y + 3, 5, height - 6, 3);
    this.scrollbar.fillStyle(0x315f4c, 0.9).fillRoundedRect(trackX - 1, thumbY, 7, thumbHeight, 3);
  }
}
