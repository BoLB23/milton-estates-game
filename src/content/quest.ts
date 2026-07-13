import type { QuestStage } from "../game/types";

/** Player-facing objective copy for every durable quest stage. */
export const STAGE_OBJECTIVE: Readonly<Record<QuestStage, string>> = {
  talk_to_jeremy: "Talk to Jeremy outside his house.",
  talk_to_andrew: "Ask Andrew what he knows about the missing controller.",
  search_yards: "Look for clues around the yards.",
  search_creek: "Follow the creek trail and search the tall grass.",
  return_to_jeremy: "Bring the Xbox controller back to Jeremy.",
  complete: "Mystery solved! The controller is back where it belongs.",
};

export type QuestEvent =
  | { type: "talked_to_jeremy" }
  | { type: "talked_to_andrew" }
  | { type: "inspected_creek_clue" }
  | { type: "picked_up_controller" }
  | { type: "returned_controller" };

/**
 * Advances The Missing Controller without side effects.
 * Out-of-order and repeated events intentionally leave the stage unchanged.
 */
export function nextStage(
  current: QuestStage,
  event: QuestEvent,
): QuestStage {
  switch (current) {
    case "talk_to_jeremy":
      return event.type === "talked_to_jeremy" ? "talk_to_andrew" : current;
    case "talk_to_andrew":
      return event.type === "talked_to_andrew" ? "search_yards" : current;
    case "search_yards":
      return event.type === "inspected_creek_clue" ? "search_creek" : current;
    case "search_creek":
      return event.type === "picked_up_controller"
        ? "return_to_jeremy"
        : current;
    case "return_to_jeremy":
      return event.type === "returned_controller" ? "complete" : current;
    case "complete":
      return current;
  }
}

export function getObjective(stage: QuestStage): string {
  return STAGE_OBJECTIVE[stage];
}
