import type { ChapterModule } from "./contracts";

export interface ContentValidationIssue {
  readonly path: string;
  readonly message: string;
}

/** Validates authored relationships before Phaser or persistence consume them. */
export function validateContentModules(
  chapters: readonly ChapterModule[],
  knownMapIds: ReadonlySet<string>,
): ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];
  const chapterIds = new Set<string>();
  const questIds = new Set<string>();
  const assetKeys = new Set<string>();
  const prerequisiteGraph = new Map<string, readonly string[]>();

  const registerAssetKeys = (owner: string, assets: ChapterModule["assets"]): void => {
    for (const asset of assets) {
      if (assetKeys.has(asset.key)) {
        issues.push({ path: `${owner}.assets`, message: `Duplicate asset key: ${asset.key}` });
      }
      assetKeys.add(asset.key);
      if (asset.path.startsWith("/")) {
        issues.push({ path: `${owner}.assets`, message: `Asset path must respect Vite's base: ${asset.path}` });
      }
    }
  };

  for (const chapter of chapters) {
    const chapterPath = `chapters.${chapter.definition.id}`;
    if (chapterIds.has(chapter.definition.id)) {
      issues.push({ path: chapterPath, message: `Duplicate chapter ID: ${chapter.definition.id}` });
    }
    chapterIds.add(chapter.definition.id);
    registerAssetKeys(chapterPath, chapter.assets);

    for (const quest of chapter.quests) {
      const questPath = `${chapterPath}.quests.${quest.definition.id}`;
      if (questIds.has(quest.definition.id)) {
        issues.push({ path: questPath, message: `Duplicate quest ID: ${quest.definition.id}` });
      }
      questIds.add(quest.definition.id);
      if (quest.definition.chapterId !== chapter.definition.id) {
        issues.push({
          path: `${questPath}.definition.chapterId`,
          message: `Quest belongs to ${quest.definition.chapterId}, not ${chapter.definition.id}`,
        });
      }
      prerequisiteGraph.set(quest.definition.id, quest.definition.prerequisiteQuestIds);
      registerAssetKeys(questPath, quest.assets);
      for (const mapId of quest.runtimeMapIds) {
        if (!knownMapIds.has(mapId)) {
          issues.push({ path: `${questPath}.runtimeMapIds`, message: `Unknown runtime map: ${mapId}` });
        }
      }
    }
  }

  for (const [questId, prerequisiteIds] of prerequisiteGraph) {
    for (const prerequisiteId of prerequisiteIds) {
      if (!questIds.has(prerequisiteId)) {
        issues.push({
          path: `quests.${questId}.prerequisiteQuestIds`,
          message: `Unknown prerequisite quest: ${prerequisiteId}`,
        });
      }
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (questId: string): void => {
    if (visited.has(questId)) return;
    if (visiting.has(questId)) {
      issues.push({ path: `quests.${questId}.prerequisiteQuestIds`, message: "Cyclic quest prerequisite" });
      return;
    }
    visiting.add(questId);
    for (const prerequisiteId of prerequisiteGraph.get(questId) ?? []) {
      if (prerequisiteGraph.has(prerequisiteId)) visit(prerequisiteId);
    }
    visiting.delete(questId);
    visited.add(questId);
  };
  for (const questId of prerequisiteGraph.keys()) visit(questId);

  return issues;
}
