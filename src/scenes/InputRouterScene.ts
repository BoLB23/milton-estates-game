import Phaser from "phaser";
import { EVENT, gameEvents } from "../game/events";
import {
  GAMEPAD_BUTTON_ACTIONS,
  actionForKeyboardCode,
  gamepadMovement,
  normalizeMovement,
  type MovementVector,
  type SemanticAction,
} from "../input/actions";

const MOVE_ACTIONS: readonly SemanticAction[] = ["moveUp", "moveDown", "moveLeft", "moveRight"];

class InputState {
  private readonly pressed = new Set<SemanticAction>();
  private gamepad: MovementVector = { x: 0, y: 0 };

  set(action: SemanticAction, pressed: boolean): void {
    if (pressed) this.pressed.add(action); else this.pressed.delete(action);
  }

  setGamepadMovement(movement: MovementVector): void { this.gamepad = movement; }

  movement(): MovementVector {
    const keyboardOrTouch = normalizeMovement(
      Number(this.pressed.has("moveRight")) - Number(this.pressed.has("moveLeft")),
      Number(this.pressed.has("moveDown")) - Number(this.pressed.has("moveUp")),
    );
    return keyboardOrTouch.x || keyboardOrTouch.y ? keyboardOrTouch : this.gamepad;
  }

  clear(): void {
    this.pressed.clear();
    this.gamepad = { x: 0, y: 0 };
  }
}

export const inputState = new InputState();

export class InputRouterScene extends Phaser.Scene {
  private previousButtons = new Map<number, boolean>();
  private previousDirections = new Map<SemanticAction, boolean>();
  private touchReleases = new Map<HTMLElement, () => void>();

  constructor() { super("input-router"); }

  create(): void {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
    document.querySelectorAll<HTMLElement>("[data-game-action]").forEach((element) => {
      const action = element.dataset.gameAction as SemanticAction | undefined;
      if (!action) return;
      const press = (event: PointerEvent) => {
        event.preventDefault();
        element.setPointerCapture?.(event.pointerId);
        this.setAction(action, true, "touch");
      };
      const release = (event: PointerEvent) => {
        event.preventDefault();
        this.setAction(action, false, "touch");
      };
      element.addEventListener("pointerdown", press);
      element.addEventListener("pointerup", release);
      element.addEventListener("pointercancel", release);
      element.addEventListener("lostpointercapture", release);
      this.touchReleases.set(element, () => {
        element.removeEventListener("pointerdown", press);
        element.removeEventListener("pointerup", release);
        element.removeEventListener("pointercancel", release);
        element.removeEventListener("lostpointercapture", release);
      });
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  update(): void {
    const gamepad = navigator.getGamepads?.().find((candidate) => candidate?.connected) ?? null;
    const movement = gamepad ? gamepadMovement(gamepad) : { x: 0, y: 0 };
    inputState.setGamepadMovement(movement);
    const directions: ReadonlyArray<[SemanticAction, boolean]> = [
      ["moveUp", movement.y < -0.45],
      ["moveDown", movement.y > 0.45],
      ["moveLeft", movement.x < -0.45],
      ["moveRight", movement.x > 0.45],
    ];
    for (const [action, pressed] of directions) {
      if (pressed !== (this.previousDirections.get(action) ?? false)) {
        this.setAction(action, pressed, "gamepad");
        this.previousDirections.set(action, pressed);
      }
    }
    for (const [button, action] of Object.entries(GAMEPAD_BUTTON_ACTIONS)) {
      const index = Number(button);
      const pressed = gamepad?.buttons[index]?.pressed ?? false;
      if (pressed !== (this.previousButtons.get(index) ?? false)) {
        this.setAction(action, pressed, "gamepad");
        this.previousButtons.set(index, pressed);
      }
    }
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const action = actionForKeyboardCode(event.code);
    if (!action || event.repeat) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
    this.setAction(action, true, "keyboard");
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    const action = actionForKeyboardCode(event.code);
    if (action) this.setAction(action, false, "keyboard");
  };

  private setAction(action: SemanticAction, pressed: boolean, source: "keyboard" | "gamepad" | "touch"): void {
    if (source !== "gamepad" && MOVE_ACTIONS.includes(action)) inputState.set(action, pressed);
    gameEvents.emit(EVENT.inputAction, { action, pressed, source });
  }

  private handleBlur = (): void => inputState.clear();

  private cleanup(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleBlur);
    this.touchReleases.forEach((release) => release());
    this.touchReleases.clear();
    inputState.clear();
  }
}
