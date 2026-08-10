import { describe, expect, it, vi } from "vitest";
import { CloudSaveRepository } from "./CloudSaveRepository";
import type { GameSave, GameSaveClient, GameSaveMetadata } from "./GamePlatformAdapter";

type Save = { value: number };

const metadata = (slotKey: string, revision = 1): GameSaveMetadata => ({
  id: `id-${slotKey}`, slotKey, revision, gameVersion: "test", schemaVersion: 1,
  byteSize: 20, createdAt: "2026-08-06T12:00:00.000Z", updatedAt: "2026-08-06T12:00:00.000Z",
});

const saved = (slotKey: string, value: number, revision = 1): GameSave<Save> => ({ ...metadata(slotKey, revision), data: { value } });

type Put = (gameSlug: string, slot: string, input: { data: Save; expectedRevision: number | null }) => Promise<GameSave<Save>>;
function repository(overrides: Partial<{ list: () => Promise<GameSaveMetadata[]>; get: (slot: string) => Promise<GameSave<Save>>; put: Put; delete: (slot: string) => Promise<void> }> = {}) {
  const saves = {
    list: vi.fn(overrides.list ?? (async () => [])),
    get: vi.fn(overrides.get ?? (async (slot: string) => saved(slot, 1))),
    put: vi.fn(overrides.put ?? (async (_gameSlug: string, slot: string, input: { data: Save; expectedRevision: number | null }) => saved(slot, input.data.value, (input.expectedRevision ?? 0) + 1))),
    delete: vi.fn(overrides.delete ?? (async () => undefined)),
  };
  return { saves, repository: new CloudSaveRepository<Save>({ client: { saves: saves as unknown as GameSaveClient } }) };
}

describe("CloudSaveRepository", () => {
  it("lists empty or multiple server-owned slots without selecting one", async () => {
    const { repository: empty } = repository();
    await expect(empty.listSlots()).resolves.toEqual([]);
    expect(empty.getSelectedSlot()).toBeUndefined();

    const slots = [metadata("primary"), metadata("save-2")];
    const { repository: multiple } = repository({ list: async () => slots });
    await expect(multiple.listSlots()).resolves.toEqual(slots);
  });

  it("creates with a null revision and loads existing slots with their server revision", async () => {
    const { repository: create, saves: createSaves } = repository();
    await create.create("primary", { value: 3 });
    expect(createSaves.put).toHaveBeenCalledWith("milton-estates", "primary", expect.objectContaining({ expectedRevision: null }));

    const { repository: load } = repository({ get: async (slot) => saved(slot, 7, 9) });
    await load.load("primary");
    expect(load.getRevision()).toBe(9);
  });

  it("coalesces rapid autosaves into serial revisioned writes", async () => {
    let resolveFirst: ((save: GameSave<Save>) => void) | undefined;
    let writes = 0;
    const put = vi.fn((_gameSlug: string, slot: string, input: { data: Save; expectedRevision: number | null }) => {
      writes += 1;
      if (writes === 1) return Promise.resolve(saved(slot, input.data.value, 1));
      if (!resolveFirst) return new Promise<GameSave<Save>>((resolve) => { resolveFirst = resolve; });
      return Promise.resolve(saved(slot, input.data.value, 2));
    });
    const { repository: saves } = repository({ put });
    await saves.create("primary", { value: 0 });
    const first = saves.requestSave({ value: 1 });
    const second = saves.requestSave({ value: 2 });
    await vi.waitFor(() => expect(resolveFirst).toBeDefined());
    resolveFirst?.(saved("primary", 1, 1));
    await Promise.all([first, second]);
    expect(put).toHaveBeenCalledTimes(3);
    expect(put.mock.calls[2]?.[2]).toMatchObject({ data: { value: 2 }, expectedRevision: 1 });
  });

  it("surfaces a revision conflict without overwriting the remote slot", async () => {
    const conflict = Object.assign(new Error("stale"), { code: "conflict" });
    const { repository: saves, saves: client } = repository({ put: async () => { throw conflict; } });
    await expect(saves.create("primary", { value: 1 })).rejects.toThrow("stale");
    expect(saves.getState()).toMatchObject({ status: "conflict", slotKey: "primary", local: { value: 1 } });
    expect(client.put).toHaveBeenCalledOnce();
  });

  it("only overwrites a conflict after the player explicitly keeps local progress", async () => {
    const conflict = Object.assign(new Error("stale"), { code: "conflict" });
    const put = vi.fn()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce(saved("primary", 1, 6));
    const { repository: saves, saves: client } = repository({
      get: async () => saved("primary", 9, 5),
      put,
    });
    await expect(saves.create("primary", { value: 1 })).rejects.toThrow("stale");
    await saves.keepLocalConflict();
    expect(client.get).toHaveBeenCalledWith("milton-estates", "primary");
    expect(put.mock.calls[1]?.[2]).toMatchObject({ data: { value: 1 }, expectedRevision: 5 });
    expect(saves.getState()).toMatchObject({ status: "saved", slotKey: "primary" });
  });
});
