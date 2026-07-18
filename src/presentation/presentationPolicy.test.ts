import { describe, expect, it } from "vitest";
import { createPresentationPolicy, cycleTextSize, nextVolume } from "./presentationPolicy";

describe("presentation policy", () => {
  it("uses one text scale for every presentation surface", () => {
    expect(createPresentationPolicy({ textSize: "small", reducedMotion: false }).fontSize(20)).toBe(18);
    expect(createPresentationPolicy({ textSize: "medium", reducedMotion: false }).fontSize(20)).toBe(20);
    expect(createPresentationPolicy({ textSize: "large", reducedMotion: false }).fontSize(16)).toBe(18);
  });

  it("turns motion durations into immediate static states", () => {
    const full = createPresentationPolicy({ textSize: "medium", reducedMotion: false });
    const reduced = createPresentationPolicy({ textSize: "medium", reducedMotion: true });
    expect(full.duration(180)).toBe(180);
    expect(reduced.duration(180)).toBe(0);
    expect(reduced.reducedMotion).toBe(true);
  });

  it("cycles persisted control values predictably", () => {
    expect(cycleTextSize("small")).toBe("medium");
    expect(cycleTextSize("medium")).toBe("large");
    expect(cycleTextSize("large")).toBe("small");
    expect(nextVolume(0.75)).toBe(1);
    expect(nextVolume(1)).toBe(0);
  });
});
