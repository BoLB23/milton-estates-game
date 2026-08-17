import {
  createDurableLeaderboardOutbox,
  createGameSessionLifecycle,
  type DurableLeaderboardOutbox,
  type GamePlatformClient,
  type GameLabSDK,
  type GameSessionLifecycle,
  type LeaderboardOutboxState,
} from "@bolb23/game-client-sdk";

export const MILTON_ESTATES_GAME_ID = "milton-estates";
export const GAME_PLATFORM_SIGN_IN_MESSAGE = "Your Game Lab session expired. Sign in again from the catalog, then return to Milton Estates.";

export interface GamePlatformPlayer { id: string; [field: string]: unknown; }
export interface LeaderboardEntry { userId: string; nickname: string; value: number; rank: number; }
export type { GamePlatformClient, GameSave, GameSaveMetadata, CloudSaveClient as GameSaveClient, PutGameSaveInput } from "@bolb23/game-client-sdk";

export type GamePlatformIdentityState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "authenticated"; player: GamePlatformPlayer }
  | { status: "unauthorized"; message: typeof GAME_PLATFORM_SIGN_IN_MESSAGE }
  | { status: "unavailable" };

export type PlatformRecoveryState = "ready" | "reconnecting" | "offline" | "session-expired" | "failed" | "hidden";
export type LeaderboardDelivery =
  | { status: "accepted"; entries: LeaderboardEntry[] }
  | { status: "pending"; detail: "offline" | "queued" }
  | { status: "session-expired" }
  | { status: "failed" };

export interface PlatformLifecycleTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}
export interface PlatformVisibilityTarget extends PlatformLifecycleTarget { readonly hidden: boolean; }
export interface GamePlatformAdapterOptions {
  createClient: () => GamePlatformClient & GameLabSDK;
  pageLifecycleTarget?: PlatformLifecycleTarget;
  visibilityLifecycleTarget?: PlatformVisibilityTarget;
}

type IdentityListener = (identity: GamePlatformIdentityState) => void;
type RecoveryListener = (state: PlatformRecoveryState) => void;
type AuthenticatedRecovery = () => Promise<void> | void;

function defaultPageLifecycleTarget(): PlatformLifecycleTarget | undefined {
  return typeof window === "undefined" ? undefined : window;
}
function defaultVisibilityLifecycleTarget(): PlatformVisibilityTarget | undefined {
  return typeof document === "undefined" ? undefined : document;
}

/** One browser-owned boundary for identity, sessions, and durable score delivery. */
export class GamePlatformAdapter {
  private readonly client: GamePlatformClient & GameLabSDK;
  private readonly page: PlatformLifecycleTarget | undefined;
  private readonly visibility: PlatformVisibilityTarget | undefined;
  private lifecycle: GameSessionLifecycle | undefined;
  private outbox: DurableLeaderboardOutbox | undefined;
  private outboxUserId: string | undefined;
  private identity: GamePlatformIdentityState = { status: "idle" };
  private recovery: PlatformRecoveryState = "ready";
  private serial: Promise<void> = Promise.resolve();
  private disposed = false;
  private readonly identityListeners = new Set<IdentityListener>();
  private readonly recoveryListeners = new Set<RecoveryListener>();
  private readonly authenticatedRecovery = new Set<AuthenticatedRecovery>();

  public constructor(options: GamePlatformAdapterOptions) {
    this.client = options.createClient();
    this.page = options.pageLifecycleTarget ?? defaultPageLifecycleTarget();
    this.visibility = options.visibilityLifecycleTarget ?? defaultVisibilityLifecycleTarget();
    this.page?.addEventListener("pagehide", this.onPageHide);
    this.visibility?.addEventListener("visibilitychange", this.onVisibilityChange);
    this.page?.addEventListener("online", this.onOnline);
  }

  public getIdentityState(): GamePlatformIdentityState { return this.identity; }
  public getRecoveryState(): PlatformRecoveryState { return this.recovery; }
  public subscribeIdentity(listener: IdentityListener): () => void { this.identityListeners.add(listener); listener(this.identity); return () => this.identityListeners.delete(listener); }
  public subscribeRecovery(listener: RecoveryListener): () => void { this.recoveryListeners.add(listener); listener(this.recovery); return () => this.recoveryListeners.delete(listener); }
  /** Runs after visible authentication and fresh session start, before play is un-gated. */
  public registerAuthenticatedRecovery(listener: AuthenticatedRecovery): () => void { this.authenticatedRecovery.add(listener); return () => this.authenticatedRecovery.delete(listener); }

  public initializeIdentity(): Promise<GamePlatformIdentityState> { return this.recover(false).then(() => this.identity); }
  public beginPlaySession(): Promise<void> { return this.recover(true); }
  public endPlaySession(): Promise<void> { return this.enqueue(async () => { await this.lifecycle?.end(); }); }

  public async submitLeaderboardTime(leaderboardKey: string, value: number): Promise<LeaderboardDelivery> {
    const player = this.identity.status === "authenticated" ? this.identity.player : undefined;
    if (!player || !Number.isInteger(value) || value <= 0) return { status: "session-expired" };
    const outbox = this.ensureOutbox(player.id);
    outbox.enqueue({ leaderboardKey, value });
    const state = await outbox.flush();
    if (state.status === "accepted") return { status: "accepted", entries: await this.fetchLeaderboard(leaderboardKey, 25) };
    if (state.status === "unauthorized") return { status: "session-expired" };
    if (state.status === "offline") return { status: "pending", detail: "offline" };
    return { status: state.status === "queued" ? "pending" : "failed", ...(state.status === "queued" ? { detail: "queued" as const } : {}) } as LeaderboardDelivery;
  }

  public async fetchLeaderboard(leaderboardKey: string, limit = 10): Promise<LeaderboardEntry[]> {
    try {
      const response = await this.client.leaderboards.get(leaderboardKey, MILTON_ESTATES_GAME_ID, limit);
      const entries = response.entries.map((entry) => ({ userId: entry.user_id, nickname: entry.nickname || entry.display_name, value: entry.value, rank: entry.rank }));
      const current = response.current_user_entry;
      if (current && !entries.some((entry) => entry.userId === current.user_id)) entries.push({ userId: current.user_id, nickname: current.nickname || current.display_name, value: current.value, rank: current.rank });
      return entries;
    } catch { return []; }
  }

  public getLeaderboardState(): LeaderboardOutboxState | undefined { return this.outbox?.state; }
  public async retryPendingWork(): Promise<void> { await this.recover(true); }

  public dispose(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.disposed = true;
    this.page?.removeEventListener("pagehide", this.onPageHide);
    this.visibility?.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.page?.removeEventListener("online", this.onOnline);
    this.outbox?.dispose(); this.outbox = undefined;
    return this.enqueue(async () => { await this.lifecycle?.dispose(); this.lifecycle = undefined; });
  }

  private recover(startSession: boolean): Promise<void> {
    return this.enqueue(async () => {
      if (this.disposed || this.visibility?.hidden) return;
      this.setRecovery("reconnecting");
      let authentication;
      try { authentication = await this.client.auth.revalidate(); }
      catch { this.setRecovery("offline"); return; }
      if (authentication.status === "reauthentication_required") {
        this.setIdentity({ status: "unauthorized", message: GAME_PLATFORM_SIGN_IN_MESSAGE });
        await this.lifecycle?.end();
        this.setRecovery("session-expired");
        return;
      }
      let player: GamePlatformPlayer = { id: authentication.session.user.id, displayName: authentication.session.user.display_name };
      // Session metadata proves identity; profile enrichment is non-critical and
      // must not turn a valid session into a false logout.
      try { player = { id: authentication.session.user.id, ...(await this.client.getCurrentPlayer()) }; } catch { /* use safe session display name */ }
      const changed = this.identity.status !== "authenticated" || this.identity.player.id !== player.id;
      this.setIdentity({ status: "authenticated", player });
      if (changed) { this.outbox?.dispose(); this.outbox = undefined; this.outboxUserId = undefined; }
      this.lifecycle ??= createGameSessionLifecycle({ client: this.client, gameSlug: MILTON_ESTATES_GAME_ID, events: this.page, visibility: this.visibility });
      if (startSession) {
        const status = await this.lifecycle.start();
        if (status === "reauthentication_required") { this.setIdentity({ status: "unauthorized", message: GAME_PLATFORM_SIGN_IN_MESSAGE }); this.setRecovery("session-expired"); return; }
        if (status === "offline") { this.setRecovery("offline"); return; }
        if (status === "failed") { this.setRecovery("failed"); return; }
      }
      for (const recover of this.authenticatedRecovery) await recover();
      this.setRecovery("ready");
    });
  }

  private ensureOutbox(userId: string): DurableLeaderboardOutbox {
    if (!this.outbox || this.outboxUserId !== userId) {
      this.outbox?.dispose();
      this.outbox = createDurableLeaderboardOutbox({ client: this.client, userId, gameSlug: MILTON_ESTATES_GAME_ID });
      this.outboxUserId = userId;
    }
    return this.outbox;
  }
  private enqueue(task: () => Promise<void>): Promise<void> { this.serial = this.serial.then(task, task); return this.serial; }
  private setIdentity(identity: GamePlatformIdentityState): void { this.identity = identity; for (const listener of this.identityListeners) listener(identity); }
  private setRecovery(state: PlatformRecoveryState): void { this.recovery = state; for (const listener of this.recoveryListeners) listener(state); }
  private readonly onPageHide = (): void => { void this.endPlaySession(); };
  private readonly onVisibilityChange = (): void => { if (this.visibility?.hidden) { this.setRecovery("hidden"); void this.endPlaySession(); } else void this.recover(true); };
  private readonly onOnline = (): void => { if (!this.visibility?.hidden) void this.recover(true); };
}
