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

  it("keeps Billy's quest journal request separate from the Backpack request", () => {
    const menuListener = vi.fn();
    const journalListener = vi.fn();
    gameEvents.on(EVENT.menuRequested, menuListener);
    gameEvents.on(EVENT.questJournalRequested, journalListener);

    gameEvents.emit(EVENT.questJournalRequested);

    expect(journalListener).toHaveBeenCalledOnce();
    expect(menuListener).not.toHaveBeenCalled();
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

  it("consumes a modal back/menu press without blocking pause over dialogue", () => {
    const capture = new InputCapture();
    const dialogueBack = { action: "back", pressed: true, source: "gamepad" } as const;
    capture.capture("dialogue");

    expect(capture.consumeMenuToggle(dialogueBack)).toBe(false);
    expect(capture.isConsumed(dialogueBack)).toBe(false);

    capture.capture("choice", { blockMenuToggle: true });
    const choiceBack = { action: "back", pressed: true, source: "gamepad" } as const;
    const choiceMenu = { action: "menu", pressed: true, source: "touch" } as const;
    expect(capture.consumeMenuToggle(choiceBack)).toBe(true);
    expect(capture.consumeMenuToggle(choiceMenu)).toBe(true);

    // Consumption belongs to these immutable broadcasts even after the choice
    // listener releases its lifetime capture before the menu listener runs.
    capture.release("choice");
    expect(capture.isConsumed(choiceBack)).toBe(true);
    expect(capture.isConsumed(choiceMenu)).toBe(true);
    expect(capture.consumeMenuToggle({ action: "back", pressed: true, source: "gamepad" })).toBe(false);
  });
});
