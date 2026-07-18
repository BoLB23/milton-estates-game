import { afterEach, describe, expect, it, vi } from "vitest";

import { EVENT, InputCapture, gameEvents, inputCapture } from "./events";
import { GameStore } from "./GameStore";

afterEach(() => {
  gameEvents.removeAllListeners();
  inputCapture.clear();
});

describe("game events", () => {
  it("delivers the declared event tuple and removes the exact listener", () => {
    const listener = vi.fn();
    const state = new GameStore(undefined).getState();

    gameEvents.on(EVENT.stateChanged, listener);
    expect(gameEvents.emit(EVENT.stateChanged, state)).toBe(true);
    expect(listener).toHaveBeenCalledWith(state);

    gameEvents.off(EVENT.stateChanged, listener);
    expect(gameEvents.emit(EVENT.stateChanged, state)).toBe(false);
  });

  it("keeps modal ownership independent of emitter listener order", () => {
    const capture = new InputCapture();
    capture.capture("dialogue");
    capture.capture("menu");
    capture.release("dialogue");
    expect(capture.isCaptured()).toBe(true);
    capture.release("menu");
    expect(capture.isCaptured()).toBe(false);
  });
});
