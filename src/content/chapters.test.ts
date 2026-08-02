import { describe, expect, it } from "vitest";

import {
  CHAPTER_REGISTRY,
  hasAvailableQuest,
  QUEST_BY_ID,
  isFinaleUnlocked,
  selectChapterProgress,
  selectQuestState,
} from "./chapters";

const progress = (completedQuestIds: readonly (keyof typeof QUEST_BY_ID)[] = []) => ({
  activeChapterId: "chapter_1" as const,
  activeQuestId: "missing_controller" as const,
  completedChapterIds: [] as const,
  completedQuestIds,
});

describe("chapter and quest registry", () => {
  it("registers Missing Controller as playable Chapter 1 content", () => {
    const chapter = CHAPTER_REGISTRY[0];
    expect(chapter.title).toBe("Summer in Milton Estates");
    expect(QUEST_BY_ID.missing_controller).toMatchObject({
      chapterId: "chapter_1",
      kind: "main",
      required: true,
      implemented: true,
    });
    expect(selectQuestState(QUEST_BY_ID.missing_controller, progress())).toBe("active");
  });

  it("registers both new Chapter 1 memories as implemented optional quests", () => {
    expect(QUEST_BY_ID.andrew_mushroom_hunt).toMatchObject({
      chapterId: "chapter_1",
      kind: "side",
      optional: true,
      implemented: true,
    });
    expect(QUEST_BY_ID.three_player_sports).toMatchObject({
      chapterId: "chapter_1",
      prerequisiteQuestIds: ["andrew_mushroom_hunt"],
      implemented: true,
    });
    expect(selectQuestState(QUEST_BY_ID.andrew_mushroom_hunt, progress(["missing_controller"]))).toBe("available");
    expect(selectQuestState(QUEST_BY_ID.three_player_sports, progress(["missing_controller"]))).toBe("locked");
    expect(selectQuestState(QUEST_BY_ID.catch_ryan, {
      ...progress(["missing_controller", "andrew_mushroom_hunt", "three_player_sports"]),
      activeQuestId: "catch_ryan",
    })).toBe("active");
    expect(QUEST_BY_ID.explore_bent_creek).toMatchObject({
      title: "Explore Bent Creek",
      prerequisiteQuestIds: ["catch_ryan"],
      implemented: true,
    });
    expect(selectQuestState(QUEST_BY_ID.explore_bent_creek, {
      ...progress(["missing_controller", "andrew_mushroom_hunt", "three_player_sports", "catch_ryan"]),
      activeQuestId: "explore_bent_creek",
    })).toBe("active");
    expect(hasAvailableQuest(progress(["missing_controller"]))).toBe(true);
  });

  it("does not flag the journal until a playable quest has been unlocked", () => {
    expect(hasAvailableQuest(progress())).toBe(false);
  });

  it("keeps linear future quests locked until prerequisites and implementation exist", () => {
    expect(selectQuestState(QUEST_BY_ID.storm_drain_detectives, progress())).toBe("locked");
    expect(selectQuestState(QUEST_BY_ID.storm_drain_detectives, progress(["missing_controller"]))).toBe("locked");
  });

  it("unlocks a finale only after every configured required non-finale quest", () => {
    const chapter = CHAPTER_REGISTRY[0];
    expect(isFinaleUnlocked(chapter, ["missing_controller"])).toBe(false);
    expect(isFinaleUnlocked(chapter, ["missing_controller", "storm_drain_detectives"])).toBe(true);
  });

  it("does not make optional quests block the finale", () => {
    const chapter = CHAPTER_REGISTRY[0];
    const completed = ["missing_controller", "storm_drain_detectives"] as const;
    expect(isFinaleUnlocked(chapter, completed)).toBe(true);
    expect(selectChapterProgress(chapter, completed)).toMatchObject({
      completed: 2,
      total: 8,
      percentage: 25,
      finaleUnlocked: true,
    });
  });
});
