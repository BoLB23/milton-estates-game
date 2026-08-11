import type { QuestDefinition } from "../engine/content/contracts";
import type { QuestId } from "../game/types";
import { CHAPTER_REGISTRY, selectQuestState, type RegistryProgress } from "./chapters";

/** The actions a journal row may expose; presentation decides the copy/icons. */
export type QuestJournalAction =
  | "continue-quest"
  | "start-quest"
  | "replay-quest"
  | "continue-replay"
  | "return-to-adventure"
  | "locked";

export interface QuestJournalPolicyProgress extends RegistryProgress {
  /** True only after the disposable replay has reached its terminal stage. */
  replayComplete?: boolean;
}

function allQuests(): readonly QuestDefinition[] {
  return CHAPTER_REGISTRY.flatMap((chapter) => chapter.quests);
}

/**
 * Determines the row to focus when opening the journal. This intentionally
 * treats a completed canonical active quest as completed, not in progress.
 */
export function selectDefaultQuestId(progress: RegistryProgress): QuestId {
  if (progress.replayQuestId) return progress.replayQuestId;

  const quests = allQuests();
  const active = quests.find((quest) =>
    quest.id === progress.activeQuestId && selectQuestState(quest, progress) === "active",
  );
  if (active) return active.id;

  const available = quests.find((quest) => selectQuestState(quest, progress) === "available");
  if (available) return available.id;

  if (quests.some((quest) => quest.id === progress.activeQuestId)) return progress.activeQuestId;
  const firstQuest = quests[0];
  if (!firstQuest) throw new RangeError("Quest journal requires at least one registered quest");
  return firstQuest.id;
}

/**
 * Central policy for a journal row. A replay is exclusive: its row can be
 * continued (or exited after completion), while every other row is view-only.
 */
export function selectQuestJournalAction(
  quest: QuestDefinition,
  progress: QuestJournalPolicyProgress,
): QuestJournalAction {
  const status = selectQuestState(quest, progress);

  if (progress.replayQuestId) {
    if (quest.id !== progress.replayQuestId) return "locked";
    return progress.replayComplete ? "return-to-adventure" : "continue-replay";
  }

  switch (status) {
    case "active": return "continue-quest";
    case "available": return "start-quest";
    case "completed": return "replay-quest";
    case "locked": return "locked";
    case "replaying": return "continue-replay";
  }
}
