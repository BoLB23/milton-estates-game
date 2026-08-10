import { describe, expect, it } from "vitest";
import { clampScrollOffset } from "./scrollMath";

describe("clampScrollOffset", () => {
  it("keeps an empty or short list stationary", () => {
    expect(clampScrollOffset(25, 100, 200)).toBe(0);
  });

  it("clamps long-list scrolling at both ends", () => {
    expect(clampScrollOffset(-4, 600, 200)).toBe(0);
    expect(clampScrollOffset(900, 600, 200)).toBe(400);
  });
});
