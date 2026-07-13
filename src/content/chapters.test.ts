import { describe, expect, it } from "vitest";

import {
  CHAPTER_REGISTRY,
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
      total: 4,
      percentage: 50,
      finaleUnlocked: true,
    });
  });
});
