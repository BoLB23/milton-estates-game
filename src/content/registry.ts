import type {
  ChapterDefinition,
  QuestDefinition,
} from "../engine/content/contracts";
import { validateContentModules } from "../engine/content/validation";
import type { ChapterId, MapId, QuestId } from "../game/types";
import { CHAPTER_ONE_MODULE } from "./chapters/chapter-01/chapter";

export const CONTENT_MODULES = [CHAPTER_ONE_MODULE] as const;

type QuestDefinitions<T extends readonly { definition: QuestDefinition }[]> = {
  readonly [K in keyof T]: T[K]["definition"];
};

type MaterializedChapter<T extends {
  definition: object;
  quests: readonly { definition: QuestDefinition }[];
}> = T["definition"] & {
  readonly quests: QuestDefinitions<T["quests"]>;
};

function materializeChapters<const T extends readonly {
  definition: object;
  quests: readonly { definition: QuestDefinition }[];
}[]>(
  chapters: T,
): { readonly [K in keyof T]: MaterializedChapter<T[K]> } {
  return chapters.map((chapter) => ({
    ...chapter.definition,
    quests: chapter.quests.map((quest) => quest.definition),
  })) as { readonly [K in keyof T]: MaterializedChapter<T[K]> };
}

export const CHAPTER_REGISTRY = materializeChapters(CONTENT_MODULES);

export const CHAPTER_BY_ID: Readonly<Record<ChapterId, ChapterDefinition>> = Object.freeze(
  Object.fromEntries(CHAPTER_REGISTRY.map((chapter) => [chapter.id, chapter])) as unknown as Record<
    ChapterId,
    ChapterDefinition
  >,
);

export const QUEST_BY_ID: Readonly<Record<QuestId, QuestDefinition>> = Object.freeze(
  Object.fromEntries(
    CHAPTER_REGISTRY.flatMap((chapter) => chapter.quests.map((quest) => [quest.id, quest])),
  ) as Record<QuestId, QuestDefinition>,
);

export function validateRegisteredContent(knownMapIds: ReadonlySet<MapId>): void {
  const issues = validateContentModules(CONTENT_MODULES, knownMapIds);
  if (issues.length === 0) return;
  throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
}
