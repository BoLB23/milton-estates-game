import { describe, expect, it, vi } from "vitest";
import { createGamePlatformFacade } from "./integration";

describe("Game Lab SDK composition", () => {
  it("constructs the public 0.2 client once with the configured API URL", () => {
    const factory = vi.fn(() => ({ auth: {}, sessions: {}, leaderboards: {}, saves: {} }));
    expect(createGamePlatformFacade("http://localhost:8001/api/v1", factory as never)).toBeDefined();
    expect(factory).toHaveBeenCalledWith({ apiBaseUrl: "http://localhost:8001/api/v1" });
  });
});
