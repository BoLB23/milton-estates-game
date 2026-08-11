import type {
  ChapterDefinition,
  QuestDefinition,
} from "../engine/content/contracts";
import type { ChapterId, QuestId } from "../game/types";
import {
  CHAPTER_BY_ID,
  CHAPTER_REGISTRY,
  QUEST_BY_ID,
} from "./registry";

export type {
  ChapterDefinition,
  QuestDefinition,
  QuestKind,
} from "../engine/content/contracts";
export { CHAPTER_BY_ID, CHAPTER_REGISTRY, QUEST_BY_ID };

export interface RegistryProgress {
  activeChapterId: ChapterId;
  activeQuestId: QuestId;
  completedChapterIds: readonly ChapterId[];
  completedQuestIds: readonly QuestId[];
  /** Runtime-only identity of the quest being replayed, if any. */
  replayQuestId?: QuestId | null;
}

export type QuestRegistryState = "locked" | "available" | "active" | "completed" | "replaying";

export function arePrerequisitesComplete(
  quest: QuestDefinition,
  completedQuestIds: readonly QuestId[],
): boolean {
  return quest.prerequisiteQuestIds.every((id) => completedQuestIds.includes(id));
}

export function isFinaleUnlocked(
  chapter: ChapterDefinition,
  completedQuestIds: readonly QuestId[],
): boolean {
  return chapter.quests
    .filter((quest) => quest.required && quest.kind !== "finale")
    .every((quest) => completedQuestIds.includes(quest.id));
}

export function selectQuestState(
  quest: QuestDefinition,
  progress: RegistryProgress,
): QuestRegistryState {
  if (progress.replayQuestId === quest.id) return "replaying";
  if (progress.completedQuestIds.includes(quest.id)) return "completed";
  if (!quest.implemented) return "locked";
  const chapter = CHAPTER_BY_ID[quest.chapterId];
  if (!arePrerequisitesComplete(quest, progress.completedQuestIds)) return "locked";
  if (quest.kind === "finale" && !isFinaleUnlocked(chapter, progress.completedQuestIds)) return "locked";
  return progress.activeQuestId === quest.id ? "active" : "available";
}

/** Whether the journal has a playable memory the player has not started yet. */
export function hasAvailableQuest(progress: RegistryProgress): boolean {
  return CHAPTER_REGISTRY.some((chapter) => chapter.quests.some((quest) =>
    selectQuestState(quest, progress) === "available",
  ));
}

export function selectOptionalProgress(
  chapter: ChapterDefinition,
  completedQuestIds: readonly QuestId[],
): { completed: number; total: number } {
  const optionalQuests = chapter.quests.filter((quest) => quest.optional);
  return {
    completed: optionalQuests.filter((quest) => completedQuestIds.includes(quest.id)).length,
    total: optionalQuests.length,
  };
}

export function selectChapterProgress(
  chapter: ChapterDefinition,
  completedQuestIds: readonly QuestId[],
): { completed: number; total: number; percentage: number; finaleUnlocked: boolean } {
  const completed = chapter.quests.filter((quest) => completedQuestIds.includes(quest.id)).length;
  const total = chapter.quests.length;
  return {
    completed,
    total,
    percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
    finaleUnlocked: isFinaleUnlocked(chapter, completedQuestIds),
  };
}
