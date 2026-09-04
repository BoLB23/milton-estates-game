import { describe, expect, it, vi } from "vitest";
import type { GameLabSDK, GamePlatformClient } from "@bolb23/game-client-sdk";
import { GamePlatformAdapter } from "./GamePlatformAdapter";

class Events {
  listeners = new Map<string, () => void>();
  addEventListener(type: string, listener: () => void): void { this.listeners.set(type, listener); }
  removeEventListener(type: string, listener: () => void): void { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
  emit(type: string): void { this.listeners.get(type)?.(); }
}
class Visibility extends Events { hidden = false; }

function client(authenticated = true): GamePlatformClient & GameLabSDK {
  return {
    auth: { revalidate: vi.fn(async () => authenticated ? { status: "authenticated" as const, session: { user: { id: "player-a", display_name: "Molly" }, expiresAt: "x", isSliding: false as const } } : { status: "reauthentication_required" as const, error: { code: "unauthorized" } }) },
    sessions: { start: vi.fn(async () => ({ id: "session-1", session_id: "session-1" })), heartbeat: vi.fn(), end: vi.fn(async () => ({})) },
    leaderboards: { get: vi.fn(async () => ({ entries: [], current_user_entry: null })), submit: vi.fn(async () => ({})) },
  } as unknown as GamePlatformClient & GameLabSDK;
}

describe("GamePlatformAdapter visible-tab recovery", () => {
  it("exposes an actionable unavailable state when the initial auth check fails", async () => {
    const sdk = client();
    sdk.auth.revalidate = vi.fn(async () => { throw new Error("network"); });
    const adapter = new GamePlatformAdapter({ createClient: () => sdk });
    await adapter.initializeIdentity();
    expect(adapter.getIdentityState()).toEqual({ status: "unavailable" });
    expect(adapter.getRecoveryState()).toBe("offline");
  });

  it("revalidates and starts one fresh session after a hidden tab becomes visible", async () => {
    const sdk = client(); const page = new Events(); const visibility = new Visibility();
    const adapter = new GamePlatformAdapter({ createClient: () => sdk, pageLifecycleTarget: page, visibilityLifecycleTarget: visibility });
    await adapter.beginPlaySession();
    visibility.hidden = true; visibility.emit("visibilitychange");
    await vi.waitFor(() => expect(sdk.sessions.end).toHaveBeenCalledTimes(1));
    visibility.hidden = false; visibility.emit("visibilitychange");
    await vi.waitFor(() => expect(sdk.sessions.start).toHaveBeenCalledTimes(2));
    expect(sdk.auth.revalidate).toHaveBeenCalled();
  });

  it("keeps recovery gated when authentication expires", async () => {
    const sdk = client(false); const visibility = new Visibility(); const adapter = new GamePlatformAdapter({ createClient: () => sdk, visibilityLifecycleTarget: visibility });
    await adapter.beginPlaySession();
    expect(adapter.getIdentityState()).toMatchObject({ status: "unauthorized" });
    expect(adapter.getRecoveryState()).toBe("session-expired");
    expect(sdk.sessions.start).not.toHaveBeenCalled();
  });
});
