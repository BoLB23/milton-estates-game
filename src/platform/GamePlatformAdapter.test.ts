import { describe, expect, it, vi } from "vitest";
import {
  GAME_PLATFORM_HEARTBEAT_MS,
  GAME_PLATFORM_SIGN_IN_MESSAGE,
  GamePlatformAdapter,
  type GamePlatformClient,
  type GamePlatformSession,
  type PlatformLifecycleTarget,
  type PlatformTimers,
  type PlatformVisibilityTarget,
} from "./GamePlatformAdapter";

type TimerHandle = ReturnType<typeof setInterval>;

class FakeTimers implements PlatformTimers {
  private nextHandle = 1;
  private readonly callbacks = new Map<TimerHandle, () => void>();

  setInterval(callback: () => void, delayMs: number): TimerHandle {
    expect(delayMs).toBe(GAME_PLATFORM_HEARTBEAT_MS);
    const handle = this.nextHandle as unknown as TimerHandle;
    this.nextHandle += 1;
    this.callbacks.set(handle, callback);
    return handle;
  }

  clearInterval(handle: TimerHandle): void {
    this.callbacks.delete(handle);
  }

  tick(): void {
    for (const callback of this.callbacks.values()) callback();
  }
}

class FakeLifecycleTarget implements PlatformLifecycleTarget {
  protected readonly listeners = new Map<string, EventListenerOrEventListenerObject>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.set(type, listener);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  emit(type: string): void {
    const listener = this.listeners.get(type);
    if (typeof listener === "function") listener(new Event(type));
    else listener?.handleEvent(new Event(type));
  }
}

class FakeVisibilityTarget extends FakeLifecycleTarget implements PlatformVisibilityTarget {
  visibilityState: DocumentVisibilityState = "visible";
}

function client(overrides: Partial<GamePlatformClient> = {}): GamePlatformClient {
  return {
    getCurrentPlayer: vi.fn(async () => ({ id: "player-1", displayName: "Molly" })),
    startGameSession: vi.fn(async () => ({ id: "session-1" })),
    heartbeatGameSession: vi.fn(async () => undefined),
    endGameSession: vi.fn(async () => undefined),
    saves: {
      list: vi.fn(async () => []),
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
    ...overrides,
  };
}

function adapterFor(fakeClient: GamePlatformClient, timers = new FakeTimers()): {
  adapter: GamePlatformAdapter;
  timers: FakeTimers;
  page: FakeLifecycleTarget;
  visibility: FakeVisibilityTarget;
} {
  const page = new FakeLifecycleTarget();
  const visibility = new FakeVisibilityTarget();
  return {
    adapter: new GamePlatformAdapter({
      createClient: () => fakeClient,
      timers,
      pageLifecycleTarget: page,
      visibilityLifecycleTarget: visibility,
    }),
    timers,
    page,
    visibility,
  };
}

describe("GamePlatformAdapter identity", () => {
  it("loads the shared player and immediately publishes identity state to subscribers", async () => {
    const sdk = client();
    const { adapter } = adapterFor(sdk);
    const states: string[] = [];
    const unsubscribe = adapter.subscribeIdentity((identity) => states.push(identity.status));

    await expect(adapter.initializeIdentity()).resolves.toEqual({
      status: "authenticated",
      player: { id: "player-1", displayName: "Molly" },
    });
    expect(states).toEqual(["idle", "loading", "authenticated"]);
    expect(sdk.getCurrentPlayer).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("provides an actionable unauthorized state without throwing", async () => {
    const sdk = client({ getCurrentPlayer: vi.fn(async () => Promise.reject({ status: 401 })) });
    const { adapter } = adapterFor(sdk);

    await expect(adapter.initializeIdentity()).resolves.toEqual({
      status: "unauthorized",
      message: GAME_PLATFORM_SIGN_IN_MESSAGE,
    });
  });

  it("treats a missing client or API failure as non-fatal platform unavailability", async () => {
    const unavailable = new GamePlatformAdapter({ createClient: () => { throw new Error("offline"); } });
    await expect(unavailable.initializeIdentity()).resolves.toEqual({ status: "unavailable" });

    const sdk = client({ getCurrentPlayer: vi.fn(async () => Promise.reject(new Error("network"))) });
    const { adapter } = adapterFor(sdk);
    await expect(adapter.initializeIdentity()).resolves.toEqual({ status: "unavailable" });
  });
});

describe("GamePlatformAdapter leaderboards", () => {
  it("submits a completed time and returns up to three other players", async () => {
    const submit = vi.fn(async () => undefined);
    const get = vi.fn(async () => ({ entries: [
      { userId: "player-1", nickname: "Molly", value: 12_000, rank: 1 },
      { userId: "player-2", nickname: "June", value: 12_300, rank: 2 },
      { userId: "player-3", nickname: "Sam", value: 12_800, rank: 3 },
      { userId: "player-4", nickname: "Bea", value: 13_100, rank: 4 },
      { userId: "player-5", nickname: "Lee", value: 13_400, rank: 5 },
    ] }));
    const sdk = client({ leaderboards: { submit, get } });
    const { adapter } = adapterFor(sdk);
    await adapter.initializeIdentity();

    await expect(adapter.submitLeaderboardTime("mushrooms", 12_000)).resolves.toEqual([
      { userId: "player-2", nickname: "June", value: 12_300, rank: 2 },
      { userId: "player-3", nickname: "Sam", value: 12_800, rank: 3 },
      { userId: "player-4", nickname: "Bea", value: 13_100, rank: 4 },
    ]);
    expect(submit).toHaveBeenCalledWith("milton-estates", "mushrooms", 12_000);
    expect(get).toHaveBeenCalledWith("mushrooms", "milton-estates", 25);
  });
});

describe("GamePlatformAdapter sessions", () => {
  it("starts one session only when requested, then heartbeats and ends it", async () => {
    const sdk = client();
    const { adapter, timers } = adapterFor(sdk);

    expect(sdk.startGameSession).not.toHaveBeenCalled();
    const firstStart = adapter.beginPlaySession();
    expect(adapter.beginPlaySession()).toBe(firstStart);
    await firstStart;
    expect(sdk.startGameSession).toHaveBeenCalledTimes(1);
    expect(sdk.startGameSession).toHaveBeenCalledWith("milton-estates");

    timers.tick();
    await Promise.resolve();
    expect(sdk.heartbeatGameSession).toHaveBeenCalledWith({ id: "session-1" });

    await adapter.endPlaySession();
    expect(sdk.endGameSession).toHaveBeenCalledWith({ id: "session-1" });
    timers.tick();
    expect(sdk.heartbeatGameSession).toHaveBeenCalledTimes(1);
  });

  it("ends a just-created session if the caller exits while start is pending", async () => {
    let resolveStart: ((session: GamePlatformSession) => void) | undefined;
    const sdk = client({
      startGameSession: vi.fn(() => new Promise<GamePlatformSession>((resolve) => { resolveStart = resolve; })),
    });
    const { adapter } = adapterFor(sdk);

    const start = adapter.beginPlaySession();
    await vi.waitFor(() => expect(resolveStart).toBeDefined());
    const end = adapter.endPlaySession();
    resolveStart?.({ id: "late-session" });
    await Promise.all([start, end]);
    expect(sdk.endGameSession).toHaveBeenCalledTimes(1);
    expect(sdk.endGameSession).toHaveBeenCalledWith({ id: "late-session" });
  });

  it("waits for an in-flight end before starting a rapid new play session", async () => {
    let resolveEnd: (() => void) | undefined;
    const sdk = client({
      endGameSession: vi.fn(() => new Promise<void>((resolve) => { resolveEnd = resolve; })),
    });
    const { adapter } = adapterFor(sdk);
    await adapter.beginPlaySession();

    const ending = adapter.endPlaySession();
    await vi.waitFor(() => expect(resolveEnd).toBeDefined());
    const nextStart = adapter.beginPlaySession();
    expect(sdk.startGameSession).toHaveBeenCalledTimes(1);

    resolveEnd?.();
    await Promise.all([ending, nextStart]);
    expect(sdk.startGameSession).toHaveBeenCalledTimes(2);
  });

  it("uses visibility and page lifecycle events as idempotent best-effort session endings", async () => {
    const sdk = client();
    const { adapter, page, visibility } = adapterFor(sdk);
    await adapter.beginPlaySession();

    visibility.visibilityState = "hidden";
    visibility.emit("visibilitychange");
    page.emit("pagehide");
    await Promise.resolve();
    await Promise.resolve();
    expect(sdk.endGameSession).toHaveBeenCalledTimes(1);
  });

  it("absorbs failed session calls so gameplay callers never receive an error", async () => {
    const sdk = client({
      startGameSession: vi.fn(async () => Promise.reject(new Error("offline"))),
    });
    const { adapter } = adapterFor(sdk);

    await expect(adapter.beginPlaySession()).resolves.toBeUndefined();
    await expect(adapter.endPlaySession()).resolves.toBeUndefined();
  });
});
