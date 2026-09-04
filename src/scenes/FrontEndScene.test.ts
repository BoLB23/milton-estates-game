import { describe, expect, it, vi } from "vitest";
import { isCurrentSlotRefresh, replaceWithRollback } from "./frontEndState";
vi.mock("phaser", () => ({ default: { Scene: class {}, Scenes: { Events: { SHUTDOWN: "shutdown" } } } }));
vi.mock("../platform/integration", () => ({ miltonCloudSaves: { listSlots: vi.fn(), peek: vi.fn() }, gamePlatform: {} }));
vi.mock("../game/GameStore", () => ({ gameStore: { connectCloudSave: vi.fn(), getState: () => ({ settings: { textSize: "medium" } }), getPlayerProfile: () => undefined, hasLegacyBrowserSave: () => false } }));
vi.mock("../game/events", () => ({ EVENT: {}, gameEvents: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } }));
vi.mock("../presentation/scrapbook", () => ({ SCRAPBOOK: {}, scrapbookButton: vi.fn(), scrapbookCard: vi.fn(), scrapbookText: vi.fn(), TextFocusController: class {} }));
vi.mock("../presentation/presentationPolicy", () => ({ createPresentationPolicy: () => ({ textScale: 1 }) }));
vi.mock("../world/PlayerAvatar", () => ({ PlayerAvatar: { createPreview: vi.fn() } }));
vi.mock("../platform/playerProfile", () => ({ toPlayerProfile: vi.fn() }));
vi.mock("../content/quest", () => ({ getObjective: vi.fn() }));
vi.mock("../game/persistence/questState", () => ({ stageFromProgress: vi.fn() }));
import { FrontEndScene } from "./FrontEndScene";
import { miltonCloudSaves } from "../platform/integration";
import { gameStore } from "../game/GameStore";

describe("front-end cloud slot state", () => {
  it("drops a stale refresh when the account changes", () => {
    const identity = { status: "authenticated", player: { id: "player-b" } } as never;
    expect(isCurrentSlotRefresh(1, 2, "player-a", identity)).toBe(false);
    expect(isCurrentSlotRefresh(1, 1, "player-a", identity)).toBe(false);
  });

  it("restores the previous snapshot after a failed replacement", async () => {
    const restore = vi.fn();
    await expect(replaceWithRollback({ value: 1 }, async () => { throw new Error("offline"); }, restore)).rejects.toThrow("offline");
    expect(restore).toHaveBeenCalledWith({ value: 1 });
  });

  it("allows a new identity refresh to finish while an older request is pending", async () => {
    const deferred = new Map<string, { resolve: (value: unknown) => void }>();
    const scene = Object.create(FrontEndScene.prototype) as any;
    vi.mocked(miltonCloudSaves.listSlots).mockImplementation(() => {
      const user = scene.platformIdentity.player.id;
      return new Promise<unknown>((resolve) => deferred.set(user, { resolve: (value) => resolve(value) })) as Promise<any>;
    });
    vi.mocked(miltonCloudSaves.peek).mockResolvedValue({ data: undefined } as never);
    vi.mocked(gameStore.connectCloudSave).mockImplementation(() => undefined);
    Object.assign(scene, { platformIdentity: { status: "authenticated", player: { id: "player-a" } }, refreshGeneration: 0, savesLoading: false, slots: [], slotPage: 0, sys: { isActive: () => false }, render: vi.fn() });
    const first = scene.refreshSlots() as Promise<void>;
    Object.assign(scene, { platformIdentity: { status: "authenticated", player: { id: "player-b" } }, refreshGeneration: 1, savesLoading: false });
    const second = scene.refreshSlots() as Promise<void>;
    expect(deferred.has("player-b")).toBe(true);
    deferred.get("player-b")?.resolve([{ slotKey: "b-slot", updatedAt: "2025-01-01" }]);
    await second;
    deferred.get("player-a")?.resolve([{ slotKey: "a-slot", updatedAt: "2025-01-01" }]);
    await first;
    expect(scene.slots.map((slot: any) => slot.metadata.slotKey)).toEqual(["b-slot"]);
    vi.mocked(miltonCloudSaves.listSlots).mockReset();
    vi.mocked(miltonCloudSaves.peek).mockReset();
    vi.mocked(gameStore.connectCloudSave).mockReset();
  });

});
