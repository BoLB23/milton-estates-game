import Phaser from "phaser";
import { EVENT, gameEvents, inputCapture } from "../game/events";
import {
  ActionOwnership,
  GAMEPAD_BUTTON_ACTIONS,
  actionForKeyboardCode,
  gamepadMovement,
  normalizeMovement,
  type MovementVector,
  type SemanticAction,
} from "../input/actions";
import { gameStore } from "../game/GameStore";
import type { GameState } from "../game/types";

const MOVE_ACTIONS: readonly SemanticAction[] = ["moveUp", "moveDown", "moveLeft", "moveRight"];

class InputState {
  private readonly actions = new ActionOwnership();
  private readonly movementActions = new ActionOwnership();
  private gamepad: MovementVector = { x: 0, y: 0 };
  private touchJoystick: MovementVector = { x: 0, y: 0 };

  set(action: SemanticAction, token: string, pressed: boolean, contributesToMovement: boolean): boolean {
    const changed = this.actions.set(action, token, pressed);
    if (contributesToMovement && MOVE_ACTIONS.includes(action)) {
      this.movementActions.set(action, token, pressed);
    }
    return changed;
  }

  setGamepadMovement(movement: MovementVector): void { this.gamepad = movement; }
  setTouchJoystickMovement(movement: MovementVector): void { this.touchJoystick = movement; }

  movement(): MovementVector {
    const keyboardOrTouch = normalizeMovement(
      Number(this.movementActions.isPressed("moveRight")) - Number(this.movementActions.isPressed("moveLeft")),
      Number(this.movementActions.isPressed("moveDown")) - Number(this.movementActions.isPressed("moveUp")),
    );
    if (keyboardOrTouch.x || keyboardOrTouch.y) return keyboardOrTouch;
    if (this.touchJoystick.x || this.touchJoystick.y) return this.touchJoystick;
    return this.gamepad;
  }

  clear(): void {
    this.actions.clear();
    this.movementActions.clear();
    this.gamepad = { x: 0, y: 0 };
    this.touchJoystick = { x: 0, y: 0 };
  }
}

export const inputState = new InputState();

export class InputRouterScene extends Phaser.Scene {
  private previousButtons = new Map<number, boolean>();
  private previousDirections = new Map<SemanticAction, boolean>();
  private touchReleases = new Map<HTMLElement, () => void>();
  private nextTouchControlId = 0;
  private bicycleButton?: HTMLButtonElement;

  constructor() { super("input-router"); }

  create(): void {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
    this.bicycleButton = document.querySelector<HTMLButtonElement>('[data-game-action="toggleBicycle"]') ?? undefined;
    this.syncBicycleButton(gameStore.getState());
    gameEvents.on(EVENT.stateChanged, this.handleStateChanged, this);
    document.querySelectorAll<HTMLElement>("[data-game-action]").forEach((element) => {
      const action = element.dataset.gameAction as SemanticAction | undefined;
      if (!action) return;
      const controlId = this.nextTouchControlId++;
      const press = (event: PointerEvent) => {
        event.preventDefault();
        element.setPointerCapture?.(event.pointerId);
        this.setAction(action, true, "touch", `touch:${controlId}:${event.pointerId}`);
      };
      const release = (event: PointerEvent) => {
        event.preventDefault();
        this.setAction(action, false, "touch", `touch:${controlId}:${event.pointerId}`);
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
    document.querySelectorAll<HTMLElement>("[data-game-joystick]").forEach((element) => {
      const stick = element.querySelector<HTMLElement>(".touch-joystick-stick");
      let activePointerId: number | null = null;
      const reset = () => {
        activePointerId = null;
        inputState.setTouchJoystickMovement({ x: 0, y: 0 });
        stick?.style.removeProperty("transform");
      };
      const move = (event: PointerEvent) => {
        if (event.pointerId !== activePointerId) return;
        event.preventDefault();
        const bounds = element.getBoundingClientRect();
        const radius = bounds.width / 2;
        const maxOffset = Math.max(1, radius - 28);
        const offsetX = event.clientX - (bounds.left + radius);
        const offsetY = event.clientY - (bounds.top + radius);
        const distance = Math.hypot(offsetX, offsetY);
        const scale = distance > maxOffset ? maxOffset / distance : 1;
        const x = offsetX * scale;
        const y = offsetY * scale;
        inputState.setTouchJoystickMovement(normalizeMovement(x / maxOffset, y / maxOffset));
        if (stick) stick.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
      };
      const press = (event: PointerEvent) => {
        if (activePointerId !== null) return;
        event.preventDefault();
        activePointerId = event.pointerId;
        element.setPointerCapture?.(event.pointerId);
        move(event);
      };
      const release = (event: PointerEvent) => {
        if (event.pointerId === activePointerId) reset();
      };
      element.addEventListener("pointerdown", press);
      element.addEventListener("pointermove", move);
      element.addEventListener("pointerup", release);
      element.addEventListener("pointercancel", release);
      element.addEventListener("lostpointercapture", release);
      this.touchReleases.set(element, () => {
        element.removeEventListener("pointerdown", press);
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerup", release);
        element.removeEventListener("pointercancel", release);
        element.removeEventListener("lostpointercapture", release);
        reset();
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
        this.setAction(action, pressed, "gamepad", `gamepad:direction:${action}`);
        this.previousDirections.set(action, pressed);
      }
    }
    for (const [button, action] of Object.entries(GAMEPAD_BUTTON_ACTIONS)) {
      const index = Number(button);
      const pressed = gamepad?.buttons[index]?.pressed ?? false;
      if (pressed !== (this.previousButtons.get(index) ?? false)) {
        this.setAction(action, pressed, "gamepad", `gamepad:button:${index}`);
        this.previousButtons.set(index, pressed);
      }
    }
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const action = actionForKeyboardCode(event.code);
    if (!action) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape"].includes(event.code)) event.preventDefault();
    // Browser key repeat can otherwise make Escape/B appear unreliable: the
    // first repeated keydown may close a newly opened menu immediately.
    if (event.repeat) return;
    this.setAction(action, true, "keyboard", `keyboard:${event.code}`);
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    const action = actionForKeyboardCode(event.code);
    if (action) this.setAction(action, false, "keyboard", `keyboard:${event.code}`);
  };

  private setAction(
    action: SemanticAction,
    pressed: boolean,
    source: "keyboard" | "gamepad" | "touch",
    token: string,
  ): void {
    if (pressed && action === "toggleBicycle" && !gameStore.isBicycleUnlocked()) return;
    const changed = inputState.set(action, token, pressed, source !== "gamepad");
    if (!changed) return;
    const event = { action, pressed, source } as const;
    inputCapture.consumeMenuToggle(event);
    gameEvents.emit(EVENT.inputAction, event);
  }

  private handleBlur = (): void => this.resetInputState();

  private handleStateChanged = (state: GameState): void => this.syncBicycleButton(state);

  private syncBicycleButton(state: GameState): void {
    const button = this.bicycleButton;
    if (!button) return;
    const unlocked = state.completedQuestIds.includes("catch_ryan");
    button.hidden = !unlocked;
    button.disabled = !unlocked;
    button.setAttribute("aria-disabled", String(!unlocked));
  }

  private resetInputState(): void {
    inputState.clear();
    this.previousButtons.clear();
    this.previousDirections.clear();
  }

  private cleanup(): void {
    gameEvents.off(EVENT.stateChanged, this.handleStateChanged, this);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleBlur);
    this.touchReleases.forEach((release) => release());
    this.touchReleases.clear();
    this.nextTouchControlId = 0;
    this.bicycleButton = undefined;
    this.resetInputState();
  }
}
