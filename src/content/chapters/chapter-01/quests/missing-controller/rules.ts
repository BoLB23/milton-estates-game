import type {
  MissingControllerStage,
  QuestMilestone,
  QuestStage,
} from "../../../../../game/types";

export type MissingControllerQuestEvent =
  | { type: "talked_to_billy" }
  | { type: "talked_to_jeremy" }
  | { type: "talked_to_andrew" }
  | { type: "picked_up_controller" }
  | { type: "returned_controller" };

export const MISSING_CONTROLLER_STAGES = [
  "talk_to_billy",
  "talk_to_jeremy",
  "talk_to_andrew",
  "search_creek",
  "return_to_jeremy",
  "complete",
] as const satisfies readonly MissingControllerStage[];

export const MISSING_CONTROLLER_MILESTONES = [
  "missing_controller.started",
  "missing_controller.andrew_consulted",
  "missing_controller.creek_clue_found",
  "missing_controller.controller_recovered",
  "missing_controller.controller_returned",
] as const satisfies readonly QuestMilestone[];

export const MISSING_CONTROLLER_OBJECTIVES: Readonly<Record<MissingControllerStage, string>> = {
  talk_to_billy: "Talk to Billy outside his house.",
  talk_to_jeremy: "Talk to Jeremy outside his house.",
  talk_to_andrew: "Ask Andrew what he knows about the missing controller.",
  search_creek: "Follow the creek trail and search the tall grass.",
  return_to_jeremy: "Bring the Xbox controller back to Jeremy.",
  complete: "Mystery solved! The controller is back where it belongs.",
};

export const MISSING_CONTROLLER_COMPLETED_MILESTONE_COUNT:
Readonly<Record<MissingControllerStage, number>> = {
  talk_to_billy: 0,
  talk_to_jeremy: 1,
  talk_to_andrew: 1,
  search_creek: 3,
  return_to_jeremy: 4,
  complete: 5,
};

export function advanceMissingControllerStage(
  current: QuestStage,
  event: MissingControllerQuestEvent,
): QuestStage {
  switch (current) {
    case "talk_to_billy": return event.type === "talked_to_billy" ? "talk_to_jeremy" : current;
    case "talk_to_jeremy": return event.type === "talked_to_jeremy" ? "talk_to_andrew" : current;
    case "talk_to_andrew": return event.type === "talked_to_andrew" ? "search_creek" : current;
    case "search_creek": return event.type === "picked_up_controller" ? "return_to_jeremy" : current;
    case "return_to_jeremy": return event.type === "returned_controller" ? "complete" : current;
    default: return current;
  }
}
