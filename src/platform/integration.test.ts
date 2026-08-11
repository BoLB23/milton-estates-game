import { describe, expect, it, vi } from "vitest";
import { createGamePlatformFacade } from "./integration";

describe("Game Lab SDK facade", () => {
  it("maps SDK identity and session handles without exposing SDK methods to the adapter", async () => {
    const heartbeat = vi.fn(async () => undefined);
    const end = vi.fn(async () => undefined);
    const sdkFactory = vi.fn(() => ({
      getCurrentPlayer: vi.fn(async () => ({
        userId: "user-42",
        nickname: "Molly",
        haircut: "short",
        hairColor: "brown",
        tshirtColor: "green",
        pantsColor: "blue",
        shoeColor: "black",
      })),
      startGameSession: vi.fn(async () => ({ sessionId: "sdk-session-7", heartbeat, end })),
      submitLeaderboardEntry: vi.fn(),
      leaderboards: { get: vi.fn(async () => ({
        entries: [{ user_id: "other", nickname: "June", display_name: "June", value: 12_000, rank: 1 }],
        current_user_entry: { user_id: "user-42", nickname: "Molly", display_name: "Molly", value: 12_300, rank: 2 },
      })) as never },
      saves: {
        list: vi.fn(async () => []),
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      },
    }));

    const facade = createGamePlatformFacade("http://localhost:8001/api/v1", sdkFactory);

    await expect(facade.getCurrentPlayer()).resolves.toMatchObject({
      id: "user-42",
      userId: "user-42",
      nickname: "Molly",
    });
    expect(sdkFactory).toHaveBeenCalledWith({ apiBaseUrl: "http://localhost:8001/api/v1" });

    const session = await facade.startGameSession("milton-estates");
    expect(session).toEqual({ id: "sdk-session-7" });
    await facade.heartbeatGameSession(session);
    await facade.endGameSession(session);
    await facade.heartbeatGameSession(session);
    await facade.endGameSession(session);

    expect(heartbeat).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
    await expect(facade.leaderboards?.get("mushrooms", "milton-estates", 10)).resolves.toEqual({ entries: [
      { userId: "other", nickname: "June", value: 12_000, rank: 1 },
      { userId: "user-42", nickname: "Molly", value: 12_300, rank: 2 },
    ] });
  });
});
