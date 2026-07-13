import type { QuestStage } from "../game/types";

export const MISSING_CONTROLLER_QUEST_ID = "missing_controller" as const;

export type MissingControllerMilestoneId =
  | "missing_controller.started"
  | "missing_controller.andrew_consulted"
  | "missing_controller.creek_clue_found"
  | "missing_controller.controller_recovered"
  | "missing_controller.controller_returned";

export type QuestChecklistStatus = "completed" | "current" | "upcoming";

export interface QuestMilestoneDefinition {
  id: MissingControllerMilestoneId;
  checklistCopy: string;
  historyCopy: string;
}

export interface QuestChecklistItem extends QuestMilestoneDefinition {
  status: QuestChecklistStatus;
}

export interface QuestHistoryItem {
  id: MissingControllerMilestoneId;
  text: string;
}

export interface QuestDiscoveryItem {
  id: "creek_token";
  text: string;
}

export interface MissingControllerQuestDisplay {
  id: typeof MISSING_CONTROLLER_QUEST_ID;
  title: "The Missing Controller";
  status: "active" | "completed";
  checklist: QuestChecklistItem[];
  completedHistory: QuestHistoryItem[];
  discoveries: QuestDiscoveryItem[];
}

/**
 * Stable milestone IDs are save data; player-facing copy is deliberately kept
 * here so wording can change without migrating a save.
 */
export const MISSING_CONTROLLER_MILESTONES: readonly QuestMilestoneDefinition[] = [
  {
    id: "missing_controller.started",
    checklistCopy: "Talk to Jeremy outside his house.",
    historyCopy: "Jeremy asked Billy to find his missing Xbox controller.",
  },
  {
    id: "missing_controller.andrew_consulted",
    checklistCopy: "Ask Andrew what he knows.",
    historyCopy: "Andrew pointed Billy toward the side yard.",
  },
  {
    id: "missing_controller.creek_clue_found",
    checklistCopy: "Follow the clues toward the creek.",
    historyCopy: "A trail through the yards led toward the creek.",
  },
  {
    id: "missing_controller.controller_recovered",
    checklistCopy: "Search the creek and recover the controller.",
    historyCopy: "Billy recovered the controller from the creek trail.",
  },
  {
    id: "missing_controller.controller_returned",
    checklistCopy: "Return the controller to Jeremy.",
    historyCopy: "Billy returned the controller to Jeremy.",
  },
] as const;

const COMPLETED_COUNT_BY_STAGE: Readonly<Record<QuestStage, number>> = {
  talk_to_jeremy: 0,
  talk_to_andrew: 1,
  search_yards: 2,
  search_creek: 3,
  return_to_jeremy: 4,
  complete: 5,
};

/**
 * Builds the Quests-page model from plain save values. Recorded semantic IDs
 * supplement stage-derived legacy history. Unknown IDs are safely ignored.
 * Undiscovered optional content is omitted entirely rather than teased.
 */
export function selectMissingControllerQuestDisplay(
  stage: QuestStage,
  recordedMilestoneIds: readonly string[] = [],
  discoveredSecretIds: readonly string[] = [],
): MissingControllerQuestDisplay {
  const stageCompletedCount = COMPLETED_COUNT_BY_STAGE[stage];
  const recorded = new Set(recordedMilestoneIds);
  const completedIds = new Set<MissingControllerMilestoneId>();

  MISSING_CONTROLLER_MILESTONES.forEach((milestone, index) => {
    if (index < stageCompletedCount || recorded.has(milestone.id)) {
      completedIds.add(milestone.id);
    }
  });

  const isComplete = stage === "complete";
  const currentIndex = isComplete ? -1 : stageCompletedCount;
  const checklist = MISSING_CONTROLLER_MILESTONES.map((milestone, index) => ({
    ...milestone,
    status: completedIds.has(milestone.id)
      ? "completed" as const
      : index === currentIndex
        ? "current" as const
        : "upcoming" as const,
  }));

  const completedHistory = MISSING_CONTROLLER_MILESTONES
    .filter((milestone) => completedIds.has(milestone.id))
    .map((milestone) => ({ id: milestone.id, text: milestone.historyCopy }));

  const discoveries: QuestDiscoveryItem[] = discoveredSecretIds.includes("creek_token")
    ? [{ id: "creek_token", text: "Found an old Milton Estates arcade token." }]
    : [];

  return {
    id: MISSING_CONTROLLER_QUEST_ID,
    title: "The Missing Controller",
    status: isComplete ? "completed" : "active",
    checklist,
    completedHistory,
    discoveries,
  };
}
