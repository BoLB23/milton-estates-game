type Listener = { callback: (...args: never[]) => void; context?: unknown };

class EventBus {
  private readonly listeners = new Map<string, Listener[]>();

  on(event: string, callback: (...args: never[]) => void, context?: unknown): this {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push({ callback, context });
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, callback: (...args: never[]) => void, context?: unknown): this {
    const listeners = this.listeners.get(event);
    if (!listeners) return this;
    this.listeners.set(event, listeners.filter((listener) =>
      listener.callback !== callback || listener.context !== context
    ));
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const listeners = this.listeners.get(event);
    if (!listeners?.length) return false;
    for (const { callback, context } of [...listeners]) callback.apply(context, args as never[]);
    return true;
  }

  removeAllListeners(): this {
    this.listeners.clear();
    return this;
  }
}

export const gameEvents = new EventBus();

export type InputAction = "move" | "interact" | "menu" | "back";
export interface InputActionEvent {
  action: InputAction;
  direction?: import("./types").Direction;
  pressed: boolean;
}

export type MenuPage = "resume" | "quests" | "map" | "save" | "settings";
export interface MenuRequest {
  page?: MenuPage;
}

export const EVENT = {
  stateChanged: "state-changed",
  dialogue: "dialogue",
  dialogueClosed: "dialogue-closed",
  toast: "toast",
  hint: "hint",
  inputAction: "input-action",
  interactRequested: "interact-requested",
  menuRequested: "menu-requested",
  menuClosed: "menu-closed",
} as const;
