export interface Point { x: number; y: number }
export interface Bounds { x: number; y: number; width: number; height: number }

export const BACKPACK_MAP_LAYOUT = Object.freeze({
  tabs: { x: 58, y: 96, width: 802, height: 38 },
  legend: { x: 200, y: 146, width: 560, height: 28 },
  map: { x: 200, y: 177.5, width: 560, height: 315 },
  label: { width: 104, height: 30, gap: 4 },
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function overlaps(a: Point, b: Point, width: number, height: number, gap: number): boolean {
  return Math.abs(a.x - b.x) < width + gap && Math.abs(a.y - b.y) < height + gap;
}

/**
 * Places map-status labels near their authored region centers without allowing
 * neighboring labels to cover each other or escape the fold-out artwork.
 */
export function spreadMapLabels<T extends { id: string; x: number; y: number }>(
  anchors: readonly T[],
  bounds: Bounds,
  labelWidth = BACKPACK_MAP_LAYOUT.label.width,
  labelHeight = BACKPACK_MAP_LAYOUT.label.height,
  gap = BACKPACK_MAP_LAYOUT.label.gap,
): ReadonlyMap<string, Point> {
  const halfWidth = labelWidth / 2;
  const halfHeight = labelHeight / 2;
  const minX = bounds.x + halfWidth;
  const maxX = bounds.x + bounds.width - halfWidth;
  const minY = bounds.y + halfHeight;
  const maxY = bounds.y + bounds.height - halfHeight;
  const placed: Point[] = [];
  const result = new Map<string, Point>();

  for (const anchor of [...anchors].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))) {
    const preferred = { x: clamp(anchor.x, minX, maxX), y: clamp(anchor.y, minY, maxY) };
    const columns = Math.max(1, Math.floor((bounds.width + gap) / (labelWidth + gap)));
    const rows = Math.max(1, Math.floor((bounds.height + gap) / (labelHeight + gap)));
    const candidates: Point[] = [preferred];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        candidates.push({
          x: clamp(minX + column * (labelWidth + gap), minX, maxX),
          y: clamp(minY + row * (labelHeight + gap), minY, maxY),
        });
      }
    }
    candidates.sort((a, b) =>
      ((a.x - preferred.x) ** 2 + (a.y - preferred.y) ** 2)
      - ((b.x - preferred.x) ** 2 + (b.y - preferred.y) ** 2),
    );
    const position = candidates.find((candidate) =>
      placed.every((other) => !overlaps(candidate, other, labelWidth, labelHeight, gap)),
    ) ?? preferred;
    placed.push(position);
    result.set(anchor.id, position);
  }
  return result;
}
