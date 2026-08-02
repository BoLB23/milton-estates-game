import { describe, expect, it } from "vitest";

import {
  decodePersistedJson,
  getPersistedVersion,
} from "./decoder";

describe("persisted save decoder boundary", () => {
  it("parses JSON without taking ownership of domain validation", () => {
    const parsed = decodePersistedJson(JSON.stringify({ version: 7, currentMap: "neighborhood" }));

    expect(getPersistedVersion(parsed)).toBe(7);
    expect(parsed).toEqual({ version: 7, currentMap: "neighborhood" });
  });
  it("reads only integer numeric schema markers", () => {
    expect(getPersistedVersion({ version: 6 })).toBe(6);
    expect(getPersistedVersion({ version: "6" })).toBeUndefined();
    expect(getPersistedVersion({ version: 6.5 })).toBeUndefined();
    expect(getPersistedVersion({ version: 7 })).toBe(7);
  });
});
