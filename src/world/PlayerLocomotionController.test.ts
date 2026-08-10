import { describe, expect, it } from "vitest";
import { DEFAULT_BICYCLE_TUNING, PlayerLocomotionController, WALKING_SPEED } from "./PlayerLocomotionController";

function runFor(controller: PlayerLocomotionController, input: { x: number; y: number }, fps: number, seconds: number) {
  let state = controller.update(input, 0);
  const frames = Math.round(fps * seconds);
  const delta = 1000 / fps;
  for (let frame = 0; frame < frames; frame += 1) state = controller.update(input, delta);
  return state;
}

describe("PlayerLocomotionController", () => {
  it("accelerates walking to normalized 190 px/s and decelerates smoothly", () => {
    const controller = new PlayerLocomotionController();
    const starting = controller.update({ x: 1, y: 1 }, 16.67);
    expect(starting.speed).toBeGreaterThan(0);
    expect(starting.speed).toBeLessThan(WALKING_SPEED);
    const state = runFor(controller, { x: 1, y: 1 }, 60, 1);
    expect(state.speed).toBeCloseTo(WALKING_SPEED);
    expect(state.velocityX).toBeCloseTo(WALKING_SPEED / Math.SQRT2);
    expect(state.velocityY).toBeCloseTo(WALKING_SPEED / Math.SQRT2);
    expect(controller.update({ x: 0, y: 0 }, 1000 / 60).speed).toBeLessThan(WALKING_SPEED);
  });

  it("accelerates a bicycle to, but never above, its top speed", () => {
    const controller = new PlayerLocomotionController();
    controller.setMode("bicycle");
    const state = runFor(controller, { x: 1, y: 0 }, 60, 4);
    expect(state.speed).toBe(DEFAULT_BICYCLE_TUNING.maxSpeed);
    expect(Math.hypot(state.velocityX, state.velocityY)).toBeLessThanOrEqual(DEFAULT_BICYCLE_TUNING.maxSpeed);
  });

  it("coasts down smoothly when bicycle input is released", () => {
    const controller = new PlayerLocomotionController();
    controller.setMode("bicycle");
    const moving = runFor(controller, { x: 1, y: 0 }, 60, 1);
    const released = controller.update({ x: 0, y: 0 }, 1000 / 60);
    expect(released.speed).toBeLessThan(moving.speed);
    expect(released.speed).toBeGreaterThan(0);
    expect(released.speed).toBeCloseTo(moving.speed - DEFAULT_BICYCLE_TUNING.coastingDrag / 60);
  });

  it("turns through a high-speed reversal instead of immediately flipping velocity", () => {
    const controller = new PlayerLocomotionController();
    controller.setMode("bicycle");
    const before = runFor(controller, { x: 1, y: 0 }, 60, 1);
    const reversed = controller.update({ x: -1, y: 0 }, 1000 / 60);
    expect(before.velocityX).toBeGreaterThan(0);
    expect(reversed.velocityX).toBeGreaterThan(0);
    expect(Math.abs(reversed.velocityY)).toBeGreaterThan(0);
    expect(reversed.speed).toBeCloseTo(before.speed - DEFAULT_BICYCLE_TUNING.braking / 60);
  });

  it("stops safely while input is locked and starts cleanly after release", () => {
    const controller = new PlayerLocomotionController();
    controller.setMode("bicycle");
    runFor(controller, { x: 1, y: 0 }, 60, 1);
    const locked = controller.update({ x: 1, y: 0 }, 16.67, true);
    expect(locked).toMatchObject({ speed: 0, velocityX: 0, velocityY: 0 });
    expect(controller.update({ x: 1, y: 0 }, 16.67).speed).toBeGreaterThan(0);
  });

  it("clamps a tab-resume delta to the configured maximum", () => {
    const controller = new PlayerLocomotionController();
    controller.setMode("bicycle");
    const state = controller.update({ x: 1, y: 0 }, 1_000);
    expect(state.deltaMs).toBe(DEFAULT_BICYCLE_TUNING.maximumDeltaMs);
    expect(state.speed).toBe(DEFAULT_BICYCLE_TUNING.acceleration * 0.05);
  });

  it("is frame-rate tolerant across representative update rates", () => {
    const states = [30, 60, 120].map((fps) => {
      const controller = new PlayerLocomotionController();
      controller.setMode("bicycle");
      return runFor(controller, { x: 1, y: 0 }, fps, 0.5);
    });
    for (const state of states) expect(state.speed).toBeCloseTo(210, 5);
    expect(Math.max(...states.map((state) => state.speed)) - Math.min(...states.map((state) => state.speed))).toBeLessThan(8);
  });

  it("resets velocity when changing travel modes", () => {
    const controller = new PlayerLocomotionController();
    controller.setMode("bicycle");
    runFor(controller, { x: 1, y: 0 }, 60, 1);
    controller.setMode("walking");
    expect(controller.update({ x: 0, y: 0 }, 16.67)).toMatchObject({ speed: 0, velocityX: 0, velocityY: 0 });
  });
});
