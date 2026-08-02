import type {
  ExploreBentCreekStage,
  QuestMilestone,
} from "../../../../../game/types";

export type ExploreBentCreekQuestEvent = { type: "opened_gate" };

export const EXPLORE_BENT_CREEK_STAGES = [
  "open_gate",
  "complete",
] as const satisfies readonly ExploreBentCreekStage[];

export const EXPLORE_BENT_CREEK_MILESTONES = [
  "explore_bent_creek.started",
  "explore_bent_creek.gate_opened",
] as const satisfies readonly QuestMilestone[];

export const EXPLORE_BENT_CREEK_OBJECTIVES: Readonly<Record<ExploreBentCreekStage, string>> = {
  open_gate: "Get the Bent Creek gate to open.",
  complete: "Bent Creek is open to explore.",
};

export const EXPLORE_BENT_CREEK_COMPLETED_MILESTONE_COUNT:
Readonly<Record<ExploreBentCreekStage, number>> = {
  open_gate: 0,
  complete: 2,
};

export function advanceExploreBentCreekStage(
  current: ExploreBentCreekStage,
  event: ExploreBentCreekQuestEvent,
): ExploreBentCreekStage {
  if (current === "open_gate" && event.type === "opened_gate") return "complete";
  return current;
}
