import {
  createDurableGameSave,
  type DurableGameSave,
  type DurableSaveState,
  type GamePlatformClient,
  type GameSave,
  type GameSaveMetadata,
  type LocalSaveStorage,
} from "@bolb23/game-client-sdk";
import { MILTON_ESTATES_GAME_ID } from "./GamePlatformAdapter";

export const MILTON_CLOUD_SAVE_SCHEMA_VERSION = 1;
export const MILTON_CLOUD_SAVE_GAME_VERSION = "2026.08";
export type CloudSaveState<T> =
  | { status: "idle"; slotKey?: string }
  | { status: "loading"; slotKey?: string }
  | { status: "dirty" | "saving" | "offline" | "unauthorized" | "failed"; slotKey: string; pendingAt?: string; error?: unknown }
  | { status: "saved"; slotKey: string; savedAt: string; pendingAt?: string }
  | { status: "conflict"; slotKey: string; local: T; remote?: GameSaveMetadata; pendingAt?: string };

export interface CloudSaveRepositoryOptions {
  client: Pick<GamePlatformClient, "auth" | "saves">;
  storage?: LocalSaveStorage;
  gameSlug?: string;
  gameVersion?: string;
  schemaVersion?: number;
}

/** Game-owned projection over SDK durable delivery; cloud slots remain authoritative. */
export class CloudSaveRepository<T> {
  private readonly client: Pick<GamePlatformClient, "auth" | "saves">;
  private readonly storage?: LocalSaveStorage;
  private readonly gameSlug: string;
  private readonly gameVersion: string;
  private readonly schemaVersion: number;
  private userId?: string;
  private selectedSlot?: string;
  private durable?: DurableGameSave<T>;
  private unsubscribe?: () => void;
  private state: CloudSaveState<T> = { status: "idle" };
  private readonly listeners = new Set<(state: CloudSaveState<T>) => void>();
  private pendingAt?: string;

  public constructor(options: CloudSaveRepositoryOptions) {
    this.client = options.client; this.storage = options.storage;
    this.gameSlug = options.gameSlug ?? MILTON_ESTATES_GAME_ID;
    this.gameVersion = options.gameVersion ?? MILTON_CLOUD_SAVE_GAME_VERSION;
    this.schemaVersion = options.schemaVersion ?? MILTON_CLOUD_SAVE_SCHEMA_VERSION;
  }
  public setAuthenticatedUser(userId: string): void {
    if (this.userId === userId) return;
    this.disposeDurable(); this.userId = userId; this.selectedSlot = undefined; this.pendingAt = undefined; this.setState({ status: "idle" });
  }
  public clearAuthenticatedUser(): void { this.disposeDurable(); this.userId = undefined; this.selectedSlot = undefined; this.setState({ status: "idle" }); }
  public getState(): CloudSaveState<T> { return this.state; }
  public getSelectedSlot(): string | undefined { return this.selectedSlot; }
  public subscribe(listener: (state: CloudSaveState<T>) => void): () => void { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }

  public async listSlots(): Promise<GameSaveMetadata[]> { return this.client.saves.list(this.gameSlug); }
  public async peek(slotKey: string): Promise<GameSave<T>> { return this.client.saves.get<T>(this.gameSlug, slotKey); }
  public async load(slotKey: string): Promise<GameSave<T>> {
    this.requireUser(); this.selectedSlot = slotKey; this.setState({ status: "loading", slotKey });
    try { const save = await this.client.saves.get<T>(this.gameSlug, slotKey); this.bind(slotKey, save); return save; }
    catch (error) { this.setState({ status: "failed", slotKey, error }); throw error; }
  }
  public async create(slotKey: string, data: T): Promise<GameSave<T>> {
    this.requireUser(); this.selectedSlot = slotKey; this.bind(slotKey, null); this.pendingAt = new Date().toISOString();
    this.durable!.save(this.input(data, null));
    await this.durable!.flush();
    if (this.durable!.state.status !== "saved" || !this.durable!.state.saved) throw this.deliveryError(this.durable!.state);
    return this.durable!.state.saved;
  }
  /** Persists synchronously to the SDK's account-scoped pending-save store before returning. */
  public requestSave(data: T): Promise<CloudSaveState<T>> {
    if (!this.durable || !this.selectedSlot) return Promise.reject(new Error("No cloud-save slot selected"));
    this.pendingAt = new Date().toISOString();
    this.durable.save(this.input(data, this.durable.state.saved?.revision ?? null));
    return Promise.resolve(this.state);
  }
  /** Save Now awaits server confirmation; autosave deliberately does not. */
  public async saveNow(data: T): Promise<CloudSaveState<T>> {
    await this.requestSave(data); await this.durable?.flush(); return this.state;
  }
  public async retry(): Promise<CloudSaveState<T>> { await this.durable?.flush(); return this.state; }
  public async recoverAfterReauthentication(): Promise<void> { if (this.durable) await this.durable.recoverAfterReauthentication(); }
  public async useRemoteConflict(): Promise<GameSave<T>> {
    const slotKey = this.requireSlot(); const remote = await this.client.saves.get<T>(this.gameSlug, slotKey);
    // This is an explicit player choice to discard the scoped pending copy.
    this.removePending(slotKey); this.bind(slotKey, remote); return remote;
  }
  public async keepLocalConflict(): Promise<GameSave<T>> {
    const slotKey = this.requireSlot(); const local = this.durable?.state.pending?.data;
    if (!local) throw new Error("No local cloud-save conflict to resolve");
    const remote = await this.client.saves.get<T>(this.gameSlug, slotKey);
    this.bind(slotKey, remote); this.pendingAt = new Date().toISOString();
    this.durable!.save(this.input(local, remote.revision)); await this.durable!.flush();
    if (this.durable!.state.status !== "saved" || !this.durable!.state.saved) throw this.deliveryError(this.durable!.state);
    return this.durable!.state.saved;
  }
  public async delete(slotKey = this.selectedSlot): Promise<void> {
    if (!slotKey) return; await this.client.saves.delete(this.gameSlug, slotKey); this.removePending(slotKey);
    if (slotKey === this.selectedSlot) { this.disposeDurable(); this.selectedSlot = undefined; this.setState({ status: "idle" }); }
  }
  public dispose(): void { this.disposeDurable(); this.listeners.clear(); }

  private bind(slotKey: string, initialSave: GameSave<T> | null): void {
    this.disposeDurable(); this.selectedSlot = slotKey;
    this.durable = createDurableGameSave({ client: this.client, userId: this.requireUser(), gameSlug: this.gameSlug, slotKey, storage: this.storage, initialSave });
    this.unsubscribe = this.durable.subscribe((state) => this.project(slotKey, state));
  }
  private project(slotKey: string, state: DurableSaveState<T>): void {
    const pendingAt = state.pending ? (this.pendingAt ?? new Date().toISOString()) : undefined;
    if (state.pending && !this.pendingAt) this.pendingAt = pendingAt;
    if (state.status === "conflict") { this.setState({ status: "conflict", slotKey, local: state.pending!.data, pendingAt }); return; }
    if (state.status === "saved" && state.saved) { this.pendingAt = undefined; this.setState({ status: "saved", slotKey, savedAt: state.saved.updatedAt }); return; }
    if (state.status === "dirty" || state.status === "saving" || state.status === "offline" || state.status === "unauthorized" || state.status === "failed") this.setState({ status: state.status, slotKey, pendingAt, error: state.error });
  }
  private input(data: T, expectedRevision: number | null) { return { data, gameVersion: this.gameVersion, schemaVersion: this.schemaVersion, expectedRevision }; }
  private pendingKey(slotKey: string): string { return `@game-platform/durable-save/v1/${encodeURIComponent(this.requireUser())}/${encodeURIComponent(this.gameSlug)}/${encodeURIComponent(slotKey)}`; }
  private removePending(slotKey: string): void { try { this.storage?.removeItem(this.pendingKey(slotKey)); } catch { /* explicit recovery remains in memory */ } }
  private requireUser(): string { if (!this.userId) throw new Error("Cloud saves require an authenticated Game Lab player"); return this.userId; }
  private requireSlot(): string { if (!this.selectedSlot) throw new Error("No cloud-save slot selected"); return this.selectedSlot; }
  private disposeDurable(): void { this.unsubscribe?.(); this.unsubscribe = undefined; this.durable?.dispose(); this.durable = undefined; }
  private deliveryError(state: DurableSaveState<T>): Error { return new Error(state.status === "unauthorized" ? "Reauthentication required" : state.status === "conflict" ? "Cloud save conflict" : "Cloud save was not confirmed"); }
  private setState(state: CloudSaveState<T>): void { this.state = state; for (const listener of this.listeners) listener(state); }
}
