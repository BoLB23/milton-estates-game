import type { ChapterId, QuestId } from "../game/types";

export type QuestKind = "main" | "side" | "finale";

export interface QuestDefinition {
  id: QuestId;
  chapterId: ChapterId;
  title: string;
  description: string;
  kind: QuestKind;
  required: boolean;
  optional: boolean;
  prerequisiteQuestIds: readonly QuestId[];
  implemented: boolean;
}

export interface ChapterDefinition {
  id: ChapterId;
  number: number;
  title: string;
  description: string;
  dateLabel: string;
  coverAssetKey: string;
  prerequisiteChapterId?: ChapterId;
  quests: readonly QuestDefinition[];
}

const chapterOneQuests = [
  {
    id: "missing_controller",
    chapterId: "chapter_1",
    title: "The Missing Controller",
    description: "Help Jeremy track down his missing Xbox controller.",
    kind: "main",
    required: true,
    optional: false,
    prerequisiteQuestIds: [],
    implemented: true,
  },
  {
    id: "storm_drain_detectives",
    chapterId: "chapter_1",
    title: "Storm Drain Detectives",
    description: "A future neighborhood mystery, penciled into Billy's journal.",
    kind: "main",
    required: true,
    optional: false,
    prerequisiteQuestIds: ["missing_controller"],
    implemented: false,
  },
  {
    id: "creek_token_hunt",
    chapterId: "chapter_1",
    title: "Creek Token Hunt",
    description: "A future optional hunt through Creek Woods.",
    kind: "side",
    required: false,
    optional: true,
    prerequisiteQuestIds: ["missing_controller"],
    implemented: false,
  },
  {
    id: "last_day_of_summer",
    chapterId: "chapter_1",
    title: "The Last Day of Summer",
    description: "Chapter finale. Finish every required memory to unlock it.",
    kind: "finale",
    required: true,
    optional: false,
    prerequisiteQuestIds: [],
    implemented: false,
  },
] as const satisfies readonly QuestDefinition[];

export const CHAPTER_REGISTRY = [
  {
    id: "chapter_1",
    number: 1,
    title: "Summer in Milton Estates",
    description: "Long afternoons, neighborhood mysteries, and the paths into Creek Woods.",
    dateLabel: "Summer 2007",
    coverAssetKey: "chapter-1-cover",
    quests: chapterOneQuests,
  },
] as const satisfies readonly ChapterDefinition[];

export const CHAPTER_BY_ID: Readonly<Record<ChapterId, ChapterDefinition>> = Object.freeze({
  chapter_1: CHAPTER_REGISTRY[0],
});

export const QUEST_BY_ID: Readonly<Record<QuestId, QuestDefinition>> = Object.freeze({
  missing_controller: chapterOneQuests[0],
  storm_drain_detectives: chapterOneQuests[1],
  creek_token_hunt: chapterOneQuests[2],
  last_day_of_summer: chapterOneQuests[3],
});

export interface RegistryProgress {
  activeChapterId: ChapterId;
  activeQuestId: QuestId;
  completedChapterIds: readonly ChapterId[];
  completedQuestIds: readonly QuestId[];
}

export type QuestRegistryState = "locked" | "available" | "active" | "completed";
export type ChapterRegistryState = "locked" | "available" | "active" | "completed";

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
  if (progress.completedQuestIds.includes(quest.id)) return "completed";
  if (!quest.implemented) return "locked";
  const chapter = CHAPTER_BY_ID[quest.chapterId];
  if (!arePrerequisitesComplete(quest, progress.completedQuestIds)) return "locked";
  if (quest.kind === "finale" && !isFinaleUnlocked(chapter, progress.completedQuestIds)) return "locked";
  return progress.activeQuestId === quest.id ? "active" : "available";
}

export function selectChapterState(
  chapter: ChapterDefinition,
  progress: RegistryProgress,
): ChapterRegistryState {
  if (progress.completedChapterIds.includes(chapter.id)) return "completed";
  if (chapter.prerequisiteChapterId && !progress.completedChapterIds.includes(chapter.prerequisiteChapterId)) {
    return "locked";
  }
  return progress.activeChapterId === chapter.id ? "active" : "available";
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
