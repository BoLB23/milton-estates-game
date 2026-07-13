export type SemanticAction =
  | "moveUp"
  | "moveDown"
  | "moveLeft"
  | "moveRight"
  | "interact"
  | "back"
  | "menu"
  | "tabPrevious"
  | "tabNext";

export interface SemanticActionEvent {
  action: SemanticAction;
  pressed: boolean;
  source: "keyboard" | "gamepad" | "touch";
}

export interface MovementVector { x: number; y: number }

export const GAMEPAD_DEADZONE = 0.24;

const KEY_ACTIONS: Readonly<Record<string, SemanticAction>> = {
  ArrowUp: "moveUp", KeyW: "moveUp",
  ArrowDown: "moveDown", KeyS: "moveDown",
  ArrowLeft: "moveLeft", KeyA: "moveLeft",
  ArrowRight: "moveRight", KeyD: "moveRight",
  KeyE: "interact", Space: "interact", Enter: "interact",
  Escape: "back", KeyB: "menu",
  BracketLeft: "tabPrevious", KeyQ: "tabPrevious",
  BracketRight: "tabNext", KeyR: "tabNext",
};

export function actionForKeyboardCode(code: string): SemanticAction | undefined {
  return KEY_ACTIONS[code];
}

export function applyDeadzone(value: number, deadzone = GAMEPAD_DEADZONE): number {
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  return Math.sign(value) * ((magnitude - deadzone) / (1 - deadzone));
}

export function normalizeMovement(x: number, y: number): MovementVector {
  const length = Math.hypot(x, y);
  if (length <= 1) return { x, y };
  return { x: x / length, y: y / length };
}

export function gamepadMovement(gamepad: Pick<Gamepad, "axes" | "buttons">): MovementVector {
  const left = gamepad.buttons[14]?.pressed ?? false;
  const right = gamepad.buttons[15]?.pressed ?? false;
  const up = gamepad.buttons[12]?.pressed ?? false;
  const down = gamepad.buttons[13]?.pressed ?? false;
  const x = Number(right) - Number(left) || applyDeadzone(gamepad.axes[0] ?? 0);
  const y = Number(down) - Number(up) || applyDeadzone(gamepad.axes[1] ?? 0);
  return normalizeMovement(x, y);
}

export const GAMEPAD_BUTTON_ACTIONS: Readonly<Record<number, SemanticAction>> = {
  0: "interact",
  1: "back",
  4: "tabPrevious",
  5: "tabNext",
  9: "menu",
};
