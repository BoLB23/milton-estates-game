import type {
  ExploreBentCreekStage,
  QuestMilestone,
} from "../../../../../game/types";

export type ExploreBentCreekQuestEvent = { type: "opened_gate" } | { type: "met_schwartz" };

export const EXPLORE_BENT_CREEK_STAGES = [
  "open_gate",
  "meet_schwartz",
  "complete",
] as const satisfies readonly ExploreBentCreekStage[];

export const EXPLORE_BENT_CREEK_MILESTONES = [
  "explore_bent_creek.started",
  "explore_bent_creek.gate_opened",
] as const satisfies readonly QuestMilestone[];

export const EXPLORE_BENT_CREEK_OBJECTIVES: Readonly<Record<ExploreBentCreekStage, string>> = {
  open_gate: "Get the Bent Creek gate to open.",
  meet_schwartz: "Beat Mickey, then talk to Schwartz in Bent Creek.",
  complete: "Bent Creek is open to explore.",
};

export const EXPLORE_BENT_CREEK_COMPLETED_MILESTONE_COUNT:
Readonly<Record<ExploreBentCreekStage, number>> = {
  open_gate: 0,
  meet_schwartz: 2,
  complete: 2,
};

export function advanceExploreBentCreekStage(
  current: ExploreBentCreekStage,
  event: ExploreBentCreekQuestEvent,
): ExploreBentCreekStage {
  if (current === "open_gate" && event.type === "opened_gate") return "meet_schwartz";
  if (current === "meet_schwartz" && event.type === "met_schwartz") return "complete";
  return current;
}
