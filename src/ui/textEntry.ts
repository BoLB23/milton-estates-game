import { inputCapture, type InputCapture, type TextEntryRequest } from "../game/events";

export const DEFAULT_TEXT_ENTRY_MAX_LENGTH = 24;
export const TEXT_ENTRY_CAPTURE_OWNER = "text-entry";

let nextTextEntryOwnerId = 0;

/** Returns the configured limit, treating invalid limits as the shared default. */
export function resolveTextEntryMaxLength(maxLength?: number): number {
  if (maxLength === undefined || !Number.isFinite(maxLength)) return DEFAULT_TEXT_ENTRY_MAX_LENGTH;
  return Math.max(0, Math.floor(maxLength));
}

/** Limits user-visible text without splitting a surrogate pair. */
export function limitTextEntry(value: string, maxLength?: number): string {
  const limit = resolveTextEntryMaxLength(maxLength);
  return Array.from(value).slice(0, limit).join("");
}

/** Trims the bounded value for the map-owned submit callback. */
export function normalizeTextEntry(value: string, maxLength?: number): string {
  return limitTextEntry(value, maxLength).trim();
}

/** Normalizes a bounded answer for exact, case-insensitive map validation. */
export function normalizeTextEntryForComparison(value: string, maxLength?: number): string {
  return normalizeTextEntry(value, maxLength).toLowerCase();
}

/** Returns the visible value before a code-point cursor for caret measurement. */
export function textEntryCursorPrefix(value: string, cursor: number): string {
  const offset = Number.isFinite(cursor) ? Math.max(0, Math.floor(cursor)) : 0;
  return Array.from(value).slice(0, offset).join("");
}

export function createTextEntryOwner(): string {
  nextTextEntryOwnerId += 1;
  return `${TEXT_ENTRY_CAPTURE_OWNER}:${nextTextEntryOwnerId}`;
}

export interface TextEntrySessionOptions {
  capture?: InputCapture;
  /** Supply only when a coordinator needs a diagnostic owner suffix. */
  owner?: string;
  /** Runs after capture is released and before the request callback. */
  onResolve?: () => void;
}

export interface TextEntrySnapshot {
  readonly value: string;
  /** Cursor offset in Unicode code points, not UTF-16 code units. */
  readonly cursor: number;
  readonly maxLength: number;
  readonly active: boolean;
}

/**
 * Browser-independent text editing and request lifecycle.
 *
 * Phaser and DOM adapters can forward keystrokes here while tests exercise
 * the same submit, cancel, replacement, and cleanup behavior without a game.
 */
export class TextEntrySession {
  private readonly request: TextEntryRequest;
  private readonly capture: InputCapture;
  private readonly captureOwner: string;
  private readonly onResolve?: () => void;
  private readonly limit: number;
  private valueText: string;
  private cursorPosition: number;
  private active = true;

  public constructor(request: TextEntryRequest, options: TextEntrySessionOptions = {}) {
    this.request = request;
    this.capture = options.capture ?? inputCapture;
    this.captureOwner = options.owner ?? createTextEntryOwner();
    this.onResolve = options.onResolve;
    this.limit = resolveTextEntryMaxLength(request.maxLength);
    this.valueText = limitTextEntry(request.initialValue ?? "", this.limit);
    this.cursorPosition = Array.from(this.valueText).length;
    this.capture.capture(this.captureOwner, { blockMenuToggle: true });
  }

  public get owner(): string { return this.captureOwner; }
  public get maxLength(): number { return this.limit; }
  public get value(): string { return this.valueText; }
  public get cursor(): number { return this.cursorPosition; }
  public get isActive(): boolean { return this.active; }

  public snapshot(): TextEntrySnapshot {
    return {
      value: this.valueText,
      cursor: this.cursorPosition,
      maxLength: this.limit,
      active: this.active,
    };
  }

  public insert(text: string): boolean {
    if (!this.active) return false;
    const inserted = Array.from(text);
    if (!inserted.length) return false;

    const current = Array.from(this.valueText);
    const available = this.limit - current.length;
    if (available <= 0) return false;

    const accepted = inserted.slice(0, available);
    current.splice(this.cursorPosition, 0, ...accepted);
    this.valueText = current.join("");
    this.cursorPosition += accepted.length;
    return accepted.length > 0;
  }

  /** Replaces the visible value, as used by a native touch-input adapter. */
  public setValue(value: string, cursor?: number): boolean {
    if (!this.active) return false;
    const nextValue = limitTextEntry(value, this.limit);
    const nextLength = Array.from(nextValue).length;
    const nextCursor = cursor === undefined
      ? nextLength
      : Math.min(nextLength, Math.max(0, Math.floor(cursor)));
    const changed = nextValue !== this.valueText || nextCursor !== this.cursorPosition;
    this.valueText = nextValue;
    this.cursorPosition = nextCursor;
    return changed;
  }

  public backspace(): boolean {
    if (!this.active || this.cursorPosition === 0) return false;
    const current = Array.from(this.valueText);
    current.splice(this.cursorPosition - 1, 1);
    this.cursorPosition -= 1;
    this.valueText = current.join("");
    return true;
  }

  public deleteForward(): boolean {
    if (!this.active) return false;
    const current = Array.from(this.valueText);
    if (this.cursorPosition >= current.length) return false;
    current.splice(this.cursorPosition, 1);
    this.valueText = current.join("");
    return true;
  }

  public moveCursor(direction: -1 | 1): boolean {
    if (!this.active) return false;
    const next = Math.min(
      Array.from(this.valueText).length,
      Math.max(0, this.cursorPosition + direction),
    );
    if (next === this.cursorPosition) return false;
    this.cursorPosition = next;
    return true;
  }

  public moveCursorToEnd(): boolean {
    if (!this.active) return false;
    const next = Array.from(this.valueText).length;
    if (next === this.cursorPosition) return false;
    this.cursorPosition = next;
    return true;
  }

  /** Resolves the request exactly once and releases capture before the callback. */
  public submit(): boolean {
    if (!this.active) return false;
    const callback = this.request.onSubmit;
    const value = normalizeTextEntry(this.valueText, this.limit);
    this.close();
    this.onResolve?.();
    callback(value);
    return true;
  }

  /** Cancels the request exactly once and releases capture before the callback. */
  public cancel(): boolean {
    if (!this.active) return false;
    const callback = this.request.onCancel;
    this.close();
    this.onResolve?.();
    callback?.();
    return true;
  }

  /** Releases capture without invoking application callbacks; safe to repeat. */
  public cleanup(): boolean {
    if (!this.active) return false;
    this.close();
    return true;
  }

  private close(): void {
    this.active = false;
    this.capture.release(this.captureOwner);
  }
}
