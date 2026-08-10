import { describe, expect, it } from "vitest";
import { MAP_DEFINITIONS, projectRegionalMapBounds } from "../content/maps";
import { BACKPACK_MAP_LAYOUT, spreadMapLabels } from "./backpackMapLayout";

describe("Backpack map layout", () => {
  it("reserves separate vertical bands for tabs, legend, and map artwork", () => {
    const tabsBottom = BACKPACK_MAP_LAYOUT.tabs.y + BACKPACK_MAP_LAYOUT.tabs.height;
    const legendBottom = BACKPACK_MAP_LAYOUT.legend.y + BACKPACK_MAP_LAYOUT.legend.height;
    const mapBottom = BACKPACK_MAP_LAYOUT.map.y + BACKPACK_MAP_LAYOUT.map.height;

    expect(tabsBottom).toBeLessThan(BACKPACK_MAP_LAYOUT.legend.y);
    expect(legendBottom).toBeLessThan(BACKPACK_MAP_LAYOUT.map.y);
    expect(mapBottom).toBeLessThanOrEqual(501);
  });

  it("keeps every regional status label inside the map without collisions", () => {
    const anchors = Object.values(MAP_DEFINITIONS).map((definition) => {
      const bounds = projectRegionalMapBounds(definition, BACKPACK_MAP_LAYOUT.map);
      return { id: definition.id, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    });
    const positions = [...spreadMapLabels(anchors, BACKPACK_MAP_LAYOUT.map).values()];
    const { width, height, gap } = BACKPACK_MAP_LAYOUT.label;

    for (const position of positions) {
      expect(position.x - width / 2).toBeGreaterThanOrEqual(BACKPACK_MAP_LAYOUT.map.x);
      expect(position.x + width / 2).toBeLessThanOrEqual(BACKPACK_MAP_LAYOUT.map.x + BACKPACK_MAP_LAYOUT.map.width);
      expect(position.y - height / 2).toBeGreaterThanOrEqual(BACKPACK_MAP_LAYOUT.map.y);
      expect(position.y + height / 2).toBeLessThanOrEqual(BACKPACK_MAP_LAYOUT.map.y + BACKPACK_MAP_LAYOUT.map.height);
    }
    for (let left = 0; left < positions.length; left += 1) {
      for (let right = left + 1; right < positions.length; right += 1) {
        expect(
          Math.abs(positions[left]!.x - positions[right]!.x) >= width + gap
          || Math.abs(positions[left]!.y - positions[right]!.y) >= height + gap,
        ).toBe(true);
      }
    }
  });
});
