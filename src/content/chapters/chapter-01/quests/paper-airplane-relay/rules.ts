import type { PaperAirplaneRelayStage, QuestMilestone } from "../../../../../game/types";

export const PAPER_AIRPLANE_ADVISORS = ["ryan", "billy", "andrew"] as const;
export type PaperAirplaneAdvisor = typeof PAPER_AIRPLANE_ADVISORS[number];

export const PAPER_AIRPLANE_MATERIALS = ["clean_sheet", "card_wing", "message_strip"] as const;
export type PaperAirplaneMaterial = typeof PAPER_AIRPLANE_MATERIALS[number];

export const PAPER_AIRPLANE_RELAY_STAGES = [
  "ask_for_advice",
  "find_materials",
  "fold_plane",
  "chase_plane",
  "decode_message",
  "deliver_message",
  "complete",
] as const satisfies readonly PaperAirplaneRelayStage[];

export const PAPER_AIRPLANE_RELAY_MILESTONES = [
  "paper_airplane_relay.started",
  "paper_airplane_relay.advice_gathered",
  "paper_airplane_relay.materials_found",
  "paper_airplane_relay.plane_folded",
  "paper_airplane_relay.flight_chased",
  "paper_airplane_relay.message_decoded",
  "paper_airplane_relay.message_delivered",
] as const satisfies readonly QuestMilestone[];

export type PaperAirplaneRelayEvent =
  | { type: "advisor_consulted"; advisor: PaperAirplaneAdvisor }
  | { type: "material_found"; material: PaperAirplaneMaterial }
  | { type: "plane_folded" }
  | { type: "wind_gust_caught" }
  | { type: "message_decoded" }
  | { type: "message_delivered"; friend: "andrew" };

export const PAPER_AIRPLANE_RELAY_OBJECTIVES: Readonly<Record<PaperAirplaneRelayStage, string>> = {
  ask_for_advice: "Ask Ryan, Billy, and Andrew how to make a great paper airplane.",
  find_materials: "Find a clean sheet, stiff card wing, and message strip around Reidenbaugh.",
  fold_plane: "Fold the plane so both wings match.",
  chase_plane: "Launch from the playground and catch three gusts across the school grounds.",
  decode_message: "Read the painted court symbols and decode Ryan's message.",
  deliver_message: "Take the decoded message back to Andrew in Milton Estates.",
  complete: "Ryan's paper airplane relay is complete! A new route to Stonehenge is marked in your scrapbook.",
};

export const PAPER_AIRPLANE_RELAY_COMPLETED_MILESTONE_COUNT:
Readonly<Record<PaperAirplaneRelayStage, number>> = {
  ask_for_advice: 0,
  find_materials: 1,
  fold_plane: 2,
  chase_plane: 3,
  decode_message: 4,
  deliver_message: 5,
  complete: 7,
};

export function uniqueIds<T extends string>(ids: readonly T[], next: T): T[] {
  return ids.includes(next) ? [...ids] : [...ids, next];
}

/** Pure authored progression; persistence belongs to the GameStore adapter. */
export function advancePaperAirplaneRelayStage(
  current: PaperAirplaneRelayStage,
  event: PaperAirplaneRelayEvent,
  progress: { adviceIds: readonly string[]; materialIds: readonly string[]; windHits: number },
): PaperAirplaneRelayStage {
  if (current === "ask_for_advice" && event.type === "advisor_consulted") {
    return uniqueIds(progress.adviceIds, event.advisor).length === PAPER_AIRPLANE_ADVISORS.length
      ? "find_materials" : current;
  }
  if (current === "find_materials" && event.type === "material_found") {
    return uniqueIds(progress.materialIds, event.material).length === PAPER_AIRPLANE_MATERIALS.length
      ? "fold_plane" : current;
  }
  if (current === "fold_plane" && event.type === "plane_folded") return "chase_plane";
  if (current === "chase_plane" && event.type === "wind_gust_caught" && progress.windHits + 1 >= 3) return "decode_message";
  if (current === "decode_message" && event.type === "message_decoded") return "deliver_message";
  if (current === "deliver_message" && event.type === "message_delivered" && event.friend === "andrew") return "complete";
  return current;
}
