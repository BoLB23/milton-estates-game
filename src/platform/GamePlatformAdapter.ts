/**
 * Small boundary around the Game Lab browser SDK.
 *
 * The SDK is deliberately not imported here. The application supplies a facade
 * made with `createGamePlatformClient` at its composition root, which keeps
 * gameplay code and this module independent from SDK installation details.
 */

export const MILTON_ESTATES_GAME_ID = "milton-estates";
export const GAME_PLATFORM_HEARTBEAT_MS = 45_000;
export const GAME_PLATFORM_SIGN_IN_MESSAGE = "Sign in through Game Lab, then reopen Milton Estates.";

export interface GamePlatformPlayer {
  id: string;
  [field: string]: unknown;
}

export interface GamePlatformSession {
  id: string;
  [field: string]: unknown;
}

export interface LeaderboardEntry {
  userId: string;
  nickname: string;
  value: number;
  rank: number;
}

export interface GamePlatformLeaderboardClient {
  submit(gameId: string, leaderboardKey: string, value: number): Promise<unknown>;
  get(leaderboardKey: string, gameId: string, limit: number): Promise<{ entries: LeaderboardEntry[] }>;
}

export interface GameSaveMetadata {
  id: string;
  slotKey: string;
  gameVersion: string;
  schemaVersion: number;
  revision: number;
  byteSize: number;
  createdAt: string;
  updatedAt: string;
}

export interface GameSave<T> extends GameSaveMetadata {
  data: T;
}

export interface PutGameSaveInput<T> {
  data: T;
  gameVersion: string;
  schemaVersion: number;
  expectedRevision: number | null;
}

export interface GameSaveClient {
  list(gameSlug: string): Promise<GameSaveMetadata[]>;
  get<T>(gameSlug: string, slotKey: string): Promise<GameSave<T>>;
  put<T>(gameSlug: string, slotKey: string, input: PutGameSaveInput<T>): Promise<GameSave<T>>;
  delete(gameSlug: string, slotKey: string): Promise<void>;
}

/**
 * A narrow facade over the SDK. Bind the SDK's exact session method signatures
 * in the composition root instead of leaking them into game scenes or stores.
 */
export interface GamePlatformClient {
  getCurrentPlayer(): Promise<GamePlatformPlayer>;
  startGameSession(gameId: string): Promise<GamePlatformSession>;
  heartbeatGameSession(session: GamePlatformSession): Promise<unknown>;
  endGameSession(session: GamePlatformSession): Promise<unknown>;
  leaderboards?: GamePlatformLeaderboardClient;
  saves: GameSaveClient;
}

export type GamePlatformClientFactory = () => GamePlatformClient | undefined | Promise<GamePlatformClient | undefined>;

export type GamePlatformIdentityState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "authenticated"; player: GamePlatformPlayer }
  | { status: "unauthorized"; message: typeof GAME_PLATFORM_SIGN_IN_MESSAGE }
  | { status: "unavailable" };

export interface PlatformLifecycleTarget {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

export interface PlatformVisibilityTarget extends PlatformLifecycleTarget {
  readonly visibilityState?: DocumentVisibilityState;
}

export interface PlatformTimers {
  setInterval(callback: () => void, delayMs: number): ReturnType<typeof setInterval>;
  clearInterval(handle: ReturnType<typeof setInterval>): void;
}

export interface GamePlatformAdapterOptions {
  createClient: GamePlatformClientFactory;
  pageLifecycleTarget?: PlatformLifecycleTarget;
  visibilityLifecycleTarget?: PlatformVisibilityTarget;
  timers?: PlatformTimers;
}

type IdentityListener = (identity: GamePlatformIdentityState) => void;

function defaultPageLifecycleTarget(): PlatformLifecycleTarget | undefined {
  return typeof window === "undefined" ? undefined : window;
}

function defaultVisibilityLifecycleTarget(): PlatformVisibilityTarget | undefined {
  return typeof document === "undefined" ? undefined : document;
}

function defaultTimers(): PlatformTimers {
  return {
    setInterval: (callback, delayMs) => globalThis.setInterval(callback, delayMs),
    clearInterval: (handle) => globalThis.clearInterval(handle),
  };
}

function isUnauthorized(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { status?: unknown; response?: { status?: unknown } };
  return candidate.status === 401 || candidate.response?.status === 401;
}

/**
 * Manages optional Game Lab identity and telemetry without changing gameplay or
 * local saves. All platform failures are intentionally absorbed at this edge.
 */
export class GamePlatformAdapter {
  private client?: GamePlatformClient;
  private clientPromise?: Promise<GamePlatformClient | undefined>;
  private identity: GamePlatformIdentityState = { status: "idle" };
  private readonly identityListeners = new Set<IdentityListener>();
  private activeSession?: GamePlatformSession;
  private startPromise?: Promise<void>;
  private endPromise?: Promise<void>;
  private heartbeatHandle?: ReturnType<typeof setInterval>;
  private heartbeatInFlight = false;
  private sessionGeneration = 0;
  private disposed = false;
  private readonly timers: PlatformTimers;
  private readonly pageLifecycleTarget?: PlatformLifecycleTarget;
  private readonly visibilityLifecycleTarget?: PlatformVisibilityTarget;

  public constructor(private readonly options: GamePlatformAdapterOptions) {
    this.timers = options.timers ?? defaultTimers();
    this.pageLifecycleTarget = options.pageLifecycleTarget ?? defaultPageLifecycleTarget();
    this.visibilityLifecycleTarget = options.visibilityLifecycleTarget ?? defaultVisibilityLifecycleTarget();
    this.pageLifecycleTarget?.addEventListener("pagehide", this.onPageHide);
    this.visibilityLifecycleTarget?.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  public getIdentityState(): GamePlatformIdentityState {
    return this.identity;
  }

  public subscribeIdentity(listener: IdentityListener): () => void {
    this.identityListeners.add(listener);
    listener(this.identity);
    return () => this.identityListeners.delete(listener);
  }

  /** Records a time and returns up to three competitors, without affecting play on failure. */
  public async submitLeaderboardTime(leaderboardKey: string, value: number): Promise<LeaderboardEntry[]> {
    const client = await this.resolveClient();
    if (!client?.leaderboards || !Number.isInteger(value) || value <= 0) return [];
    try {
      await client.leaderboards.submit(MILTON_ESTATES_GAME_ID, leaderboardKey, value);
      const response = await client.leaderboards.get(leaderboardKey, MILTON_ESTATES_GAME_ID, 25);
      const currentPlayerId = this.identity.status === "authenticated" ? this.identity.player.id : undefined;
      return response.entries.filter((entry) => entry.userId !== currentPlayerId).slice(0, 3);
    } catch {
      return [];
    }
  }

  /** Load shared browser-cookie identity; callers should not await this for gameplay startup. */
  public async initializeIdentity(): Promise<GamePlatformIdentityState> {
    if (this.disposed) return this.identity;
    this.setIdentity({ status: "loading" });
    const client = await this.resolveClient();
    if (!client) return this.setIdentity({ status: "unavailable" });

    try {
      const player = await client.getCurrentPlayer();
      return this.setIdentity({ status: "authenticated", player });
    } catch (error) {
      return this.setIdentity(isUnauthorized(error)
        ? { status: "unauthorized", message: GAME_PLATFORM_SIGN_IN_MESSAGE }
        : { status: "unavailable" });
    }
  }

  /** Start telemetry only after the caller has begun a real play session. */
  public beginPlaySession(): Promise<void> {
    if (this.disposed || this.activeSession) return Promise.resolve();
    if (this.startPromise) return this.startPromise;

    const ending = this.endPromise;
    const start = ending
      ? ending.then(() => {
        if (this.disposed || this.activeSession) return;
        return this.startSession(this.sessionGeneration);
      })
      : this.startSession(this.sessionGeneration);
    return this.trackStart(start);
  }

  /** End once, even when menu, visibility, and page lifecycle events overlap. */
  public endPlaySession(): Promise<void> {
    if (this.endPromise) return this.endPromise;
    this.sessionGeneration += 1;
    this.stopHeartbeat();
    const session = this.activeSession;
    this.activeSession = undefined;

    const end = session ? this.endSession(session) : (this.startPromise ?? Promise.resolve());
    this.endPromise = end;
    void end.finally(() => {
      if (this.endPromise === end) this.endPromise = undefined;
    });
    return end;
  }

  /** Removes lifecycle listeners and best-effort ends any active platform session. */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pageLifecycleTarget?.removeEventListener("pagehide", this.onPageHide);
    this.visibilityLifecycleTarget?.removeEventListener("visibilitychange", this.onVisibilityChange);
    void this.endPlaySession();
  }

  private trackStart(start: Promise<void>): Promise<void> {
    this.startPromise = start;
    void start.finally(() => {
      if (this.startPromise === start) this.startPromise = undefined;
    });
    return start;
  }

  private async startSession(generation: number): Promise<void> {
    const client = await this.resolveClient();
    if (!client || this.disposed) return;

    try {
      const session = await client.startGameSession(MILTON_ESTATES_GAME_ID);
      if (this.disposed || generation !== this.sessionGeneration) {
        await this.endSession(session);
        return;
      }
      this.activeSession = session;
      this.heartbeatHandle = this.timers.setInterval(() => this.heartbeat(), GAME_PLATFORM_HEARTBEAT_MS);
    } catch {
      // Platform telemetry must never interrupt local gameplay.
    }
  }

  private heartbeat(): void {
    const session = this.activeSession;
    if (!session || this.heartbeatInFlight) return;
    this.heartbeatInFlight = true;
    void this.resolveClient()
      .then((client) => client?.heartbeatGameSession(session))
      .catch(() => undefined)
      .finally(() => { this.heartbeatInFlight = false; });
  }

  private async endSession(session: GamePlatformSession): Promise<void> {
    try {
      const client = await this.resolveClient();
      await client?.endGameSession(session);
    } catch {
      // Ending a platform session is best effort, especially during page unload.
    }
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatHandle) return;
    this.timers.clearInterval(this.heartbeatHandle);
    this.heartbeatHandle = undefined;
  }

  private async resolveClient(): Promise<GamePlatformClient | undefined> {
    if (this.client) return this.client;
    if (!this.clientPromise) {
      this.clientPromise = Promise.resolve()
        .then(() => this.options.createClient())
        .catch(() => undefined)
        .then((client) => {
          this.client = client;
          return client;
        });
    }
    return this.clientPromise;
  }

  private setIdentity(identity: GamePlatformIdentityState): GamePlatformIdentityState {
    this.identity = identity;
    for (const listener of this.identityListeners) listener(identity);
    return identity;
  }

  private readonly onPageHide = (): void => { void this.endPlaySession(); };

  private readonly onVisibilityChange = (): void => {
    if (this.visibilityLifecycleTarget?.visibilityState === "hidden") void this.endPlaySession();
  };
}
