/** Clamp an offset independently of Phaser so list bounds stay unit-testable. */
export function clampScrollOffset(offset: number, contentHeight: number, viewportHeight: number): number {
  return Math.min(Math.max(offset, 0), Math.max(0, contentHeight - viewportHeight));
}
