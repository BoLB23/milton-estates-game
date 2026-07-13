import { describe, expect, it } from "vitest";
import { actionForKeyboardCode, applyDeadzone, gamepadMovement } from "./actions";

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
});
