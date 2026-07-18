import { describe, expect, it } from "vitest";
import { createMushroomSpawns, mushroomCountForMap } from "./mushrooms";

describe("Andrew's mushroom hunt locations", () => {
  it("creates ten unique, evenly split locations", () => {
    const spawns = createMushroomSpawns(2007);

    expect(spawns).toHaveLength(10);
    expect(new Set(spawns.map(({ id }) => id)).size).toBe(10);
    expect(mushroomCountForMap(spawns, "neighborhood")).toBe(5);
    expect(mushroomCountForMap(spawns, "creek")).toBe(5);
  });

  it("is deterministic for save generation but changes placement for a new seed", () => {
    expect(createMushroomSpawns(42)).toEqual(createMushroomSpawns(42));
    expect(createMushroomSpawns(42)).not.toEqual(createMushroomSpawns(43));
  });
});
