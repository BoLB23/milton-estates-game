import { describe, expect, it } from "vitest";
import { transferInventoryToStorage, transferStorageToInventory } from "./GameStore";

describe("house storage transfers", () => {
  it("moves normal stacks while preserving item limits and quantities", () => {
    expect(transferInventoryToStorage(
      [{ itemId: "bicycle", quantity: 1 }], [], "bicycle", 1,
    )).toEqual({ inventory: [], houseStorage: [{ itemId: "bicycle", quantity: 1 }] });
    expect(transferStorageToInventory(
      [], [{ itemId: "bicycle", quantity: 1 }], "bicycle", 1,
    )).toEqual({ inventory: [{ itemId: "bicycle", quantity: 1 }], houseStorage: [] });
  });

  it("refuses to store quest-critical items or overdraw a stack", () => {
    expect(transferInventoryToStorage(
      [{ itemId: "xbox_controller", quantity: 1 }], [], "xbox_controller", 1,
    )).toBeUndefined();
    expect(transferStorageToInventory([], [{ itemId: "bicycle", quantity: 1 }], "bicycle", 2)).toBeUndefined();
  });

  it("does not create a duplicate stack when the destination stack is full", () => {
    expect(transferStorageToInventory(
      [{ itemId: "bicycle", quantity: 1 }], [{ itemId: "bicycle", quantity: 1 }], "bicycle", 1,
    )).toBeUndefined();
    expect(transferInventoryToStorage(
      [{ itemId: "bicycle", quantity: 1 }], [{ itemId: "bicycle", quantity: 1 }], "bicycle", 1,
    )).toBeUndefined();
  });
});
