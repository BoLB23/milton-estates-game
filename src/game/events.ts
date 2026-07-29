import type { DialogueRequest, GameState, MapId } from "./types";
import type { SemanticActionEvent } from "../input/actions";

export type { SemanticAction as InputAction, SemanticActionEvent as InputActionEvent } from "../input/actions";

export type MenuPage = "resume" | "chapters" | "quests" | "map" | "save" | "settings" | "help";
interface MenuRequest {
  page?: MenuPage;
}

/** A small application-level choice contract owned and rendered by UIScene. */
export interface ChoiceOption {
  id: string;
  label: string;
  enabled?: boolean;
  disabledReason?: string;
}

export interface ChoiceRequest {
  speaker: string;
  prompt: string;
  options: readonly ChoiceOption[];
  onSelect: (optionId: string) => void;
  onCancel?: () => void;
}

export type AudioCue =
  | "menuNavigate"
  | "confirm"
  | "back"
  | "dialogueAdvance"
  | "interaction"
  | "controllerPickup"
  | "tokenPickup"
  | "objectiveUpdate"
  | "questComplete"
  | "saveConfirmation";

/** Application event names are kept separate from Phaser's own event constants. */
export const EVENT = {
  stateChanged: "state-changed",
  dialogue: "dialogue",
  dialogueCancelled: "dialogue-cancelled",
  choice: "choice",
  choiceCancelled: "choice-cancelled",
  toast: "toast",
  hint: "hint",
  inputAction: "input-action",
  interactRequested: "interact-requested",
  menuRequested: "menu-requested",
  playerLocationChanged: "player-location-changed",
  audioCue: "audio-cue",
} as const;

/** A live, normalized world coordinate used by the backpack map. */
export interface PlayerMapLocation {
  map: MapId;
  x: number;
  y: number;
}

/**
 * The complete contract for cross-scene application communication.
 *
 * A tuple per event preserves the argument count and payload type at every
 * `on`, `off`, and `emit` call. Phaser events remain on their native emitters;
 * this bus is only for game-level domain and presentation messages.
 */
export interface GameEventMap {
  [EVENT.stateChanged]: [state: GameState];
  [EVENT.dialogue]: [request: DialogueRequest];
  [EVENT.dialogueCancelled]: [];
  [EVENT.choice]: [request: ChoiceRequest];
  [EVENT.choiceCancelled]: [];
  [EVENT.toast]: [message: string];
  [EVENT.hint]: [message: string];
  [EVENT.inputAction]: [event: SemanticActionEvent];
  [EVENT.interactRequested]: [];
  [EVENT.menuRequested]: [request?: MenuRequest];
  [EVENT.playerLocationChanged]: [location: PlayerMapLocation];
  [EVENT.audioCue]: [cue: AudioCue];
}

type ListenerEntry = {
  readonly callback: (...args: unknown[]) => void;
  readonly context?: unknown;
};

/** A small, typed EventEmitter-compatible bus for game-level events. */
export class TypedEventBus<Events extends { [EventName in keyof Events]: unknown[] }> {
  private readonly listeners = new Map<keyof Events, ListenerEntry[]>();

  on<EventName extends keyof Events>(
    event: EventName,
    callback: (...args: Events[EventName]) => void,
    context?: unknown,
  ): this {
    const listeners = this.listeners.get(event) ?? [];
    // The cast is contained at the storage boundary; callers retain the exact
    // event tuple type rather than the old unknown/never API.
    listeners.push({ callback: callback as (...args: unknown[]) => void, context });
    this.listeners.set(event, listeners);
    return this;
  }

  off<EventName extends keyof Events>(
    event: EventName,
    callback: (...args: Events[EventName]) => void,
    context?: unknown,
  ): this {
    const listeners = this.listeners.get(event);
    if (!listeners) return this;
    this.listeners.set(event, listeners.filter((listener) =>
      listener.callback !== callback || listener.context !== context,
    ));
    return this;
  }

  emit<EventName extends keyof Events>(event: EventName, ...args: Events[EventName]): boolean {
    const listeners = this.listeners.get(event);
    if (!listeners?.length) return false;
    for (const { callback, context } of [...listeners]) callback.apply(context, args);
    return true;
  }

  removeAllListeners(event?: keyof Events): this {
    if (event === undefined) this.listeners.clear();
    else this.listeners.delete(event);
    return this;
  }
}

/**
 * Tracks visible modal owners without relying on event-listener order.
 * Input events are immutable broadcasts; worlds query this guard before
 * handling interaction, while UI and menus own capture for their lifetime.
 */
export class InputCapture {
  private readonly owners = new Set<string>();

  capture(owner: string): void { this.owners.add(owner); }
  release(owner: string): void { this.owners.delete(owner); }
  isCaptured(): boolean { return this.owners.size > 0; }
  clear(): void { this.owners.clear(); }
}

export const gameEvents = new TypedEventBus<GameEventMap>();
export const inputCapture = new InputCapture();
