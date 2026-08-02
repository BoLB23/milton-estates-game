import { afterEach, describe, expect, it, vi } from "vitest";

import { EVENT, InputCapture, gameEvents, type TextEntryRequest } from "../game/events";
import { TextEntrySession } from "./textEntry";

afterEach(() => gameEvents.removeAllListeners());

describe("TextEntryModal request boundary", () => {
  it("publishes the caller-owned request through the typed event", () => {
    const listener = vi.fn();
    const request: TextEntryRequest = { prompt: "Exact prompt", onSubmit: vi.fn() };
    gameEvents.on(EVENT.textEntry, listener);

    expect(gameEvents.emit(EVENT.textEntry, request)).toBe(true);
    expect(listener).toHaveBeenCalledWith(request);
  });

  it("keeps caller prompt text exact while applying the default short-answer limit", () => {
    const request: TextEntryRequest = {
      prompt: "Who are you here to visit?",
      onSubmit: vi.fn(),
    };
    const session = new TextEntrySession(request, { capture: new InputCapture() });

    expect(request.prompt).toBe("Who are you here to visit?");
    expect(session.maxLength).toBe(24);
    session.cleanup();
  });

  it("exposes confirm/cancel resolution semantics used by the Phaser adapter", () => {
    const capture = new InputCapture();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const request: TextEntryRequest = {
      prompt: "Answer",
      onSubmit,
      onCancel,
    };
    const session = new TextEntrySession(request, { capture });

    session.insert("yes");
    expect(session.submit()).toBe(true);
    expect(onSubmit).toHaveBeenCalledWith("yes");
    expect(onCancel).not.toHaveBeenCalled();
    expect(capture.isCaptured()).toBe(false);
  });
});
