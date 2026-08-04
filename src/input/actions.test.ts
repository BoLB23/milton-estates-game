import { describe, expect, it } from "vitest";
import { ActionOwnership, GAMEPAD_BUTTON_ACTIONS, actionForKeyboardCode, applyDeadzone, gamepadMovement } from "./actions";

function pad(axes: number[], pressed: number[] = []): Pick<Gamepad, "axes" | "buttons"> {
  return {
    axes,
    buttons: Array.from({ length: 16 }, (_, index) => ({ pressed: pressed.includes(index) })) as GamepadButton[],
  };
}

describe("semantic input mapping", () => {
  it("maps keyboard aliases to the same actions", () => {
    expect(actionForKeyboardCode("KeyW")).toBe("moveUp");
    expect(actionForKeyboardCode("ArrowUp")).toBe("moveUp");
    expect(actionForKeyboardCode("Space")).toBe("interact");
    expect(actionForKeyboardCode("Escape")).toBe("back");
    expect(actionForKeyboardCode("KeyB")).toBe("menu");
    expect(actionForKeyboardCode("KeyF")).toBeUndefined();
    expect(GAMEPAD_BUTTON_ACTIONS[2]).toBeUndefined(); // Bicycle is controlled from the Backpack.
  });

  it("removes stick drift and rescales deliberate input", () => {
    expect(applyDeadzone(0.2)).toBe(0);
    expect(applyDeadzone(-0.24)).toBe(0);
    expect(applyDeadzone(0.62)).toBeCloseTo(0.5);
  });

  it("prefers the d-pad and normalizes diagonal movement", () => {
    expect(gamepadMovement(pad([0.8, 0], [14]))).toEqual({ x: -1, y: 0 });
    const diagonal = gamepadMovement(pad([1, 1]));
    expect(diagonal.x).toBeCloseTo(Math.SQRT1_2);
    expect(diagonal.y).toBeCloseTo(Math.SQRT1_2);
  });

  it("keeps an action pressed until every keyboard alias releases", () => {
    const ownership = new ActionOwnership();

    expect(ownership.set("moveUp", "keyboard:KeyW", true)).toBe(true);
    expect(ownership.set("moveUp", "keyboard:ArrowUp", true)).toBe(false);
    expect(ownership.set("moveUp", "keyboard:KeyW", false)).toBe(false);
    expect(ownership.isPressed("moveUp")).toBe(true);
    expect(ownership.set("moveUp", "keyboard:ArrowUp", false)).toBe(true);
    expect(ownership.isPressed("moveUp")).toBe(false);
  });

  it("keeps keyboard and multi-touch owners independent", () => {
    const ownership = new ActionOwnership();

    ownership.set("moveLeft", "keyboard:KeyA", true);
    ownership.set("moveLeft", "touch:3:11", true);
    ownership.set("moveLeft", "touch:3:12", true);

    expect(ownership.set("moveLeft", "touch:3:11", false)).toBe(false);
    expect(ownership.set("moveLeft", "keyboard:KeyA", false)).toBe(false);
    expect(ownership.isPressed("moveLeft")).toBe(true);
    expect(ownership.set("moveLeft", "touch:3:12", false)).toBe(true);
  });
});
