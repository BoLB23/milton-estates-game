import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("phaser", () => ({ default: { Scene: class {}, Scenes: { Events: { SHUTDOWN: "shutdown" } } } }));
import { InputRouterScene, inputState } from "./InputRouterScene";
describe("platform input gating", () => {
  beforeEach(() => { vi.stubGlobal("navigator", { getGamepads: () => [{ connected: true, axes: [1, 0], buttons: [] }] }); inputState.clear(); });
  it("blocks polled gamepad movement during recovery and resumes afterward", () => {
    const scene = new InputRouterScene() as any;
    scene.handlePlatformRecovery("offline"); scene.update(); expect(inputState.movement()).toEqual({ x: 0, y: 0 });
    scene.handlePlatformRecovery("ready"); scene.update(); expect(inputState.movement().x).toBeGreaterThan(0);
  });
});
