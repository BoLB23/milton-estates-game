import { describe, expect, it, vi } from "vitest";
import { GamePlatformApiError, type GamePlatformClient, type GameSave } from "@bolb23/game-client-sdk";
import { CloudSaveRepository } from "./CloudSaveRepository";

type Save = { value: number };
function memory(): Storage { const values = new Map<string, string>(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); }, clear: () => values.clear(), key: () => null, get length() { return values.size; } }; }
function saved(value: number, revision = 1): GameSave<Save> { return { id: "id", slotKey: "primary", gameVersion: "test", schemaVersion: 1, revision, byteSize: 10, createdAt: "x", updatedAt: "2026-08-16T00:00:00.000Z", data: { value } }; }
function client(put = vi.fn(async (_g: string, _s: string, input: { data: Save; expectedRevision: number | null }) => saved(input.data.value, (input.expectedRevision ?? 0) + 1))): GamePlatformClient {
  return { auth: { revalidate: vi.fn(async () => ({ status: "authenticated" as const, session: { user: { id: "player-a" }, expiresAt: "x", isSliding: false as const } })) }, saves: { list: vi.fn(async () => []), get: vi.fn(async () => saved(0)), put, delete: vi.fn() } } as unknown as GamePlatformClient;
}
describe("CloudSaveRepository durable recovery", () => {
  it("stores then confirms a pending snapshot with the latest revision", async () => {
    const sdk = client(); const repo = new CloudSaveRepository<Save>({ client: sdk, storage: memory() }); repo.setAuthenticatedUser("player-a");
    await repo.load("primary"); await repo.saveNow({ value: 2 });
    expect(sdk.saves.put).toHaveBeenCalledWith("milton-estates", "primary", expect.objectContaining({ expectedRevision: 1, data: { value: 2 } }));
    expect(repo.getState()).toMatchObject({ status: "saved" });
  });
  it("does not bind a pending snapshot to a changed account", async () => {
    const storage = memory(); const sdk = client(); const repo = new CloudSaveRepository<Save>({ client: sdk, storage }); repo.setAuthenticatedUser("player-a");
    await repo.load("primary"); await repo.requestSave({ value: 4 }); repo.setAuthenticatedUser("player-b");
    expect(repo.getSelectedSlot()).toBeUndefined();
    expect(repo.getState()).toEqual({ status: "idle" });
  });
  it("keeps a revision conflict pending until the player explicitly keeps local progress", async () => {
    const put = vi.fn()
      .mockRejectedValueOnce(new GamePlatformApiError("stale", 409, "conflict"))
      .mockResolvedValueOnce(saved(7, 9));
    const sdk = client(put); const repo = new CloudSaveRepository<Save>({ client: sdk, storage: memory() }); repo.setAuthenticatedUser("player-a");
    await repo.load("primary");
    await expect(repo.saveNow({ value: 7 })).resolves.toMatchObject({ status: "conflict" });
    expect(repo.getState()).toMatchObject({ status: "conflict", local: { value: 7 } });
    await repo.keepLocalConflict();
    expect(put.mock.calls[1]?.[2]).toMatchObject({ expectedRevision: 1, data: { value: 7 } });
  });
});
