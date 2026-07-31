import { describe, expect, it } from "vitest";

import type { ChapterModule } from "../engine/content/contracts";
import { validateContentModules } from "../engine/content/validation";
import type { MapId } from "../game/types";
import { CHAPTER_ONE_MODULE } from "./chapters/chapter-01/chapter";
import { MAP_DEFINITIONS } from "./maps";
import { CONTENT_MODULES, validateRegisteredContent } from "./registry";

const knownMapIds = new Set(Object.keys(MAP_DEFINITIONS) as MapId[]);

describe("composed content registry", () => {
  it("registers the shipped catalog without integrity violations", () => {
    expect(validateContentModules(CONTENT_MODULES, knownMapIds)).toEqual([]);
    expect(() => validateRegisteredContent(knownMapIds)).not.toThrow();
  });

  it("tracks native and compatibility-backed quest migrations explicitly", () => {
    const quests = CONTENT_MODULES[0].quests;
    expect(quests.filter(({ migrationStatus }) => migrationStatus === "native")
      .map(({ definition }) => definition.id)).toEqual([
      "missing_controller",
      "andrew_mushroom_hunt",
      "three_player_sports",
    ]);
    expect(quests.find(({ definition }) => definition.id === "catch_ryan")?.migrationStatus)
      .toBe("legacy");
  });

  it("rejects duplicate stable IDs and Phaser cache keys", () => {
    const duplicate = {
      ...CHAPTER_ONE_MODULE,
      assets: [...CHAPTER_ONE_MODULE.assets, CHAPTER_ONE_MODULE.assets[0]],
    } as ChapterModule;
    const issues = validateContentModules([duplicate, CHAPTER_ONE_MODULE], knownMapIds);
    expect(issues.some(({ message }) => message.includes("Duplicate chapter ID"))).toBe(true);
    expect(issues.some(({ message }) => message.includes("Duplicate quest ID"))).toBe(true);
    expect(issues.some(({ message }) => message.includes("Duplicate asset key"))).toBe(true);
  });

  it("rejects cyclic quest prerequisites", () => {
    const cycle = {
      ...CHAPTER_ONE_MODULE,
      quests: CHAPTER_ONE_MODULE.quests.map((quest) => ({
        ...quest,
        definition: {
          ...quest.definition,
          prerequisiteQuestIds: quest.definition.id === "missing_controller"
            ? ["catch_ryan"]
            : quest.definition.id === "catch_ryan"
              ? ["missing_controller"]
              : quest.definition.prerequisiteQuestIds,
        },
      })),
    } as ChapterModule;
    expect(validateContentModules([cycle], knownMapIds)
      .some(({ message }) => message === "Cyclic quest prerequisite")).toBe(true);
  });
});
