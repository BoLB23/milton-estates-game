import { createGameSaveCache, type GameSaveCache } from "@bolb23/game-client-sdk";
import {
  MILTON_ESTATES_GAME_ID,
  type GamePlatformClient,
  type GameSave,
  type GameSaveMetadata,
} from "./GamePlatformAdapter";

export const MILTON_CLOUD_SAVE_SCHEMA_VERSION = 1;
export const MILTON_CLOUD_SAVE_GAME_VERSION = "2026.08";

export type CloudSaveState<T> =
  | { status: "idle"; slotKey?: string }
  | { status: "loading"; slotKey?: string }
  | { status: "dirty"; slotKey: string }
  | { status: "saving"; slotKey: string }
  | { status: "saved"; slotKey: string; savedAt: string }
  | { status: "failed"; slotKey: string; error: unknown; retryable: true }
  | { status: "conflict"; slotKey: string; local: T; remote?: GameSaveMetadata };

export interface CloudSaveRepositoryOptions {
  client: Pick<GamePlatformClient, "saves">;
  cache?: GameSaveCache;
  gameSlug?: string;
  gameVersion?: string;
  schemaVersion?: number;
}

function conflictMetadata(error: unknown): GameSaveMetadata | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const detail = (error as { detail?: unknown }).detail;
  if (typeof detail !== "object" || detail === null) return undefined;
  const candidate = detail as Partial<GameSaveMetadata>;
  return typeof candidate.slotKey === "string" && typeof candidate.revision === "number"
    ? candidate as GameSaveMetadata
    : undefined;
}

export function isCloudSaveConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null
    && (error as { code?: unknown }).code === "conflict";
}

/**
 * The only authoritative path to Milton's Game Lab slots. The SDK cache is
 * updated after successful reads/writes solely as an explicit recovery aid;
 * nothing in this class uses it as a source for normal game startup.
 */
export class CloudSaveRepository<T> {
  private readonly cache: GameSaveCache;
  private readonly gameSlug: string;
  private readonly gameVersion: string;
  private readonly schemaVersion: number;
  private selectedSlot?: string;
  private revision: number | null = null;
  private state: CloudSaveState<T> = { status: "idle" };
  private readonly listeners = new Set<(state: CloudSaveState<T>) => void>();
  private queued?: T;
  private draining?: Promise<void>;
  private lastFailed?: T;

  public constructor(options: CloudSaveRepositoryOptions) {
    this.client = options.client;
    this.cache = options.cache ?? createGameSaveCache();
    this.gameSlug = options.gameSlug ?? MILTON_ESTATES_GAME_ID;
    this.gameVersion = options.gameVersion ?? MILTON_CLOUD_SAVE_GAME_VERSION;
    this.schemaVersion = options.schemaVersion ?? MILTON_CLOUD_SAVE_SCHEMA_VERSION;
  }

  private readonly client: Pick<GamePlatformClient, "saves">;

  public getState(): CloudSaveState<T> { return this.state; }
  public getSelectedSlot(): string | undefined { return this.selectedSlot; }
  public getRevision(): number | null { return this.revision; }
  public subscribe(listener: (state: CloudSaveState<T>) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  public async listSlots(): Promise<GameSaveMetadata[]> {
    this.setState({ status: "loading", slotKey: this.selectedSlot });
    try {
      const slots = await this.client.saves.list(this.gameSlug);
      this.setState(this.selectedSlot
        ? { status: "idle", slotKey: this.selectedSlot }
        : { status: "idle" });
      return slots;
    } catch (error) {
      this.setFailed(error);
      throw error;
    }
  }

  public async load(slotKey: string): Promise<GameSave<T>> {
    this.selectedSlot = slotKey;
    this.revision = null;
    this.setState({ status: "loading", slotKey });
    try {
      const save = await this.client.saves.get<T>(this.gameSlug, slotKey);
      this.acceptServerSave(save);
      return save;
    } catch (error) {
      this.setFailed(error);
      throw error;
    }
  }

  /** Read-only slot inspection for a save picker; it does not select a slot. */
  public async peek(slotKey: string): Promise<GameSave<T>> {
    const save = await this.client.saves.get<T>(this.gameSlug, slotKey);
    this.cache.write(this.gameSlug, slotKey, save);
    return save;
  }

  public async create(slotKey: string, data: T): Promise<GameSave<T>> {
    this.selectedSlot = slotKey;
    this.revision = null;
    this.setState({ status: "saving", slotKey });
    try {
      const save = await this.client.saves.put<T>(this.gameSlug, slotKey, this.input(data, null));
      this.acceptServerSave(save);
      return save;
    } catch (error) {
      this.handleWriteError(error, data);
      throw error;
    }
  }

  /** Queue the newest snapshot; one write at a time preserves server revisions. */
  public requestSave(data: T): Promise<void> {
    if (!this.selectedSlot) return Promise.reject(new Error("No cloud-save slot selected"));
    this.queued = data;
    this.setState({ status: "dirty", slotKey: this.selectedSlot });
    if (!this.draining) this.draining = this.drain();
    return this.draining;
  }

  public retry(): Promise<void> {
    if (!this.lastFailed) return Promise.resolve();
    return this.requestSave(this.lastFailed);
  }

  /** Explicit conflict choice: replace local in-memory progress with server data. */
  public async useRemoteConflict(): Promise<GameSave<T>> {
    const slotKey = this.selectedSlot;
    if (!slotKey) throw new Error("No cloud-save slot selected");
    return this.load(slotKey);
  }

  /** Explicit conflict choice: re-read the server revision, then save local data. */
  public async keepLocalConflict(): Promise<GameSave<T>> {
    const slotKey = this.selectedSlot;
    const local = this.state.status === "conflict" ? this.state.local : this.lastFailed;
    if (!slotKey || !local) throw new Error("No local cloud-save conflict to resolve");
    this.setState({ status: "saving", slotKey });
    try {
      // This is intentionally a two-step, user-initiated overwrite. A 409 on
      // the follow-up PUT is still surfaced as another conflict, never hidden.
      const remote = await this.client.saves.get<T>(this.gameSlug, slotKey);
      this.revision = remote.revision;
      const saved = await this.client.saves.put<T>(this.gameSlug, slotKey, this.input(local, remote.revision));
      this.acceptServerSave(saved);
      return saved;
    } catch (error) {
      this.handleWriteError(error, local);
      throw error;
    }
  }

  public async delete(slotKey = this.selectedSlot): Promise<void> {
    if (!slotKey) return;
    this.setState({ status: "loading", slotKey });
    try {
      await this.client.saves.delete(this.gameSlug, slotKey);
      this.cache.remove(this.gameSlug, slotKey);
      if (slotKey === this.selectedSlot) {
        this.selectedSlot = undefined;
        this.revision = null;
      }
      this.setState({ status: "idle" });
    } catch (error) {
      this.setFailed(error, slotKey);
      throw error;
    }
  }

  private async drain(): Promise<void> {
    try {
      while (this.queued !== undefined) {
        const data = this.queued;
        this.queued = undefined;
        const slotKey = this.selectedSlot;
        if (!slotKey) throw new Error("No cloud-save slot selected");
        this.setState({ status: "saving", slotKey });
        try {
          const save = await this.client.saves.put<T>(this.gameSlug, slotKey, this.input(data, this.revision));
          this.acceptServerSave(save);
        } catch (error) {
          this.handleWriteError(error, data);
          throw error;
        }
      }
    } finally {
      this.draining = undefined;
    }
  }

  private input(data: T, expectedRevision: number | null) {
    return { data, gameVersion: this.gameVersion, schemaVersion: this.schemaVersion, expectedRevision };
  }

  private acceptServerSave(save: GameSave<T>): void {
    this.revision = save.revision;
    this.lastFailed = undefined;
    this.cache.write(this.gameSlug, save.slotKey, save);
    this.setState({ status: "saved", slotKey: save.slotKey, savedAt: save.updatedAt });
  }

  private handleWriteError(error: unknown, local: T): void {
    this.lastFailed = local;
    const slotKey = this.selectedSlot;
    if (!slotKey) return;
    if (isCloudSaveConflict(error)) {
      this.setState({ status: "conflict", slotKey, local, remote: conflictMetadata(error) });
      return;
    }
    this.setFailed(error, slotKey);
  }

  private setFailed(error: unknown, slotKey = this.selectedSlot): void {
    if (slotKey) this.setState({ status: "failed", slotKey, error, retryable: true });
    else this.setState({ status: "idle" });
  }

  private setState(state: CloudSaveState<T>): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
