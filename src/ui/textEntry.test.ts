import { afterEach, describe, expect, it, vi } from "vitest";

import { InputCapture } from "../game/events";
import {
  DEFAULT_TEXT_ENTRY_MAX_LENGTH,
  TextEntrySession,
  limitTextEntry,
  normalizeTextEntry,
  normalizeTextEntryForComparison,
  textEntryCursorPrefix,
} from "./textEntry";

afterEach(() => vi.restoreAllMocks());

describe("text-entry normalization", () => {
  it("trims the bounded value and leaves comparison casing explicit", () => {
    expect(normalizeTextEntry("  Schwartz  ", 24)).toBe("Schwartz");
    expect(normalizeTextEntryForComparison("  VoTiLlA  ", 24)).toBe("votilla");
  });

  it("applies the default limit and does not split Unicode characters", () => {
    expect(limitTextEntry("x".repeat(DEFAULT_TEXT_ENTRY_MAX_LENGTH + 4))).toHaveLength(DEFAULT_TEXT_ENTRY_MAX_LENGTH);
    expect(limitTextEntry("A😀B", 3)).toBe("A😀B");
    expect(limitTextEntry("A😀BC", 3)).toBe("A😀B");
  });

  it("returns the code-point prefix at the editing cursor", () => {
    expect(textEntryCursorPrefix("A😀BC", 0)).toBe("");
    expect(textEntryCursorPrefix("A😀BC", 2)).toBe("A😀");
    expect(textEntryCursorPrefix("A😀BC", 99)).toBe("A😀BC");
  });
});

describe("TextEntrySession", () => {
  it("submits once, trims the answer, and releases capture before the callback", () => {
    const capture = new InputCapture();
    const order: string[] = [];
    const onSubmit = vi.fn((value: string) => {
      expect(capture.isCaptured()).toBe(false);
      expect(value).toBe("Schwartz");
      order.push("callback");
    });
    const session = new TextEntrySession({
      prompt: "Who are you here to visit?",
      initialValue: "  Schwartz  ",
      onSubmit,
    }, {
      capture,
      onResolve: () => {
        expect(capture.isCaptured()).toBe(false);
        order.push("resolved");
      },
    });

    expect(capture.isCaptured()).toBe(true);
    expect(session.submit()).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(session.submit()).toBe(false);
    expect(capture.isCaptured()).toBe(false);
    expect(order).toEqual(["resolved", "callback"]);
  });

  it("supports bounded insertion and editing", () => {
    const session = new TextEntrySession({
      prompt: "Answer",
      maxLength: 4,
      onSubmit: vi.fn(),
    }, { capture: new InputCapture() });

    expect(session.insert("ABCD")).toBe(true);
    expect(session.insert("E")).toBe(false);
    expect(session.value).toBe("ABCD");
    expect(session.backspace()).toBe(true);
    expect(session.deleteForward()).toBe(false);
    expect(session.value).toBe("ABC");
    expect(session.moveCursor(-1)).toBe(true);
    expect(session.deleteForward()).toBe(true);
    expect(session.value).toBe("AB");
    session.cleanup();
  });

  it("cancels once and releases only its own capture owner", () => {
    const capture = new InputCapture();
    const order: string[] = [];
    const onCancel = vi.fn(() => {
      expect(capture.isCaptured()).toBe(false);
      order.push("callback");
    });
    const session = new TextEntrySession({ prompt: "Answer", onSubmit: vi.fn(), onCancel }, {
      capture,
      onResolve: () => order.push("resolved"),
    });

    expect(session.cancel()).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(session.cancel()).toBe(false);
    expect(capture.isCaptured()).toBe(false);
    expect(order).toEqual(["resolved", "callback"]);
  });

  it("cleans up without resolving the application callback and is idempotent", () => {
    const capture = new InputCapture();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const onResolve = vi.fn();
    const session = new TextEntrySession({ prompt: "Answer", onSubmit, onCancel }, { capture, onResolve });

    expect(session.cleanup()).toBe(true);
    expect(session.cleanup()).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onResolve).not.toHaveBeenCalled();
    expect(capture.isCaptured()).toBe(false);
    expect(session.insert("ignored")).toBe(false);
  });

  it("keeps a replacement session captured when the previous session is cleaned up", () => {
    const capture = new InputCapture();
    const first = new TextEntrySession({ prompt: "First", onSubmit: vi.fn() }, { capture });
    const replacement = new TextEntrySession({ prompt: "Replacement", onSubmit: vi.fn() }, { capture });

    expect(first.owner).not.toBe(replacement.owner);
    expect(capture.isCaptured()).toBe(true);
    first.cleanup();
    expect(capture.isCaptured()).toBe(true);
    replacement.cleanup();
    expect(capture.isCaptured()).toBe(false);
  });
});
