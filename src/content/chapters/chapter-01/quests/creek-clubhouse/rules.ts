import type { QuestMilestone } from "../../../../../game/types";

/** Stages deliberately group the three yard pickups into one clear objective. */
export type CreekClubhouseStage =
  | "talk_to_andrew"
  | "choose_design"
  | "collect_supplies"
  | "build_clubhouse"
  | "secret_knock"
  | "complete";

export type ClubhouseDesign = "lookout" | "fort" | "hidden_den";
export type ClubhouseSupply = "rope" | "blanket" | "branches";

export type CreekClubhouseEvent =
  | { type: "talked_to_andrew" }
  | { type: "design_chosen"; design: ClubhouseDesign }
  | { type: "supplies_collected" }
  | { type: "construction_finished" }
  | { type: "knock_matched" };

export const CREEK_CLUBHOUSE_STAGES = [
  "talk_to_andrew", "choose_design", "collect_supplies", "build_clubhouse", "secret_knock", "complete",
] as const satisfies readonly CreekClubhouseStage[];

export const CREEK_CLUBHOUSE_MILESTONES = [
  "creek_clubhouse.started",
  "creek_clubhouse.design_chosen",
  "creek_clubhouse.supplies_collected",
  "creek_clubhouse.built",
  "creek_clubhouse.secret_knock",
] as const satisfies readonly QuestMilestone[];

export const CREEK_CLUBHOUSE_OBJECTIVES: Readonly<Record<CreekClubhouseStage, string>> = {
  talk_to_andrew: "Talk to Andrew about his secret clubhouse idea.",
  choose_design: "Pick a clubhouse design from Andrew's chalk sketches.",
  collect_supplies: "Collect Billy's rope, Jeremy's blanket, and branches from Creek Woods.",
  build_clubhouse: "Bring the supplies to the Fallen Log Clearing and build in order.",
  secret_knock: "Learn the clubhouse's secret knock: tap, tap, pause, tap.",
  complete: "The Creek Clubhouse is open — and its hidden shortcut is yours to use.",
};

export const CREEK_CLUBHOUSE_COMPLETED_MILESTONE_COUNT: Readonly<Record<CreekClubhouseStage, number>> = {
  talk_to_andrew: 0, choose_design: 1, collect_supplies: 2,
  build_clubhouse: 3, secret_knock: 4, complete: 5,
};

export function advanceCreekClubhouseStage(
  current: CreekClubhouseStage,
  event: CreekClubhouseEvent,
): CreekClubhouseStage {
  switch (current) {
    case "talk_to_andrew": return event.type === "talked_to_andrew" ? "choose_design" : current;
    case "choose_design": return event.type === "design_chosen" ? "collect_supplies" : current;
    case "collect_supplies": return event.type === "supplies_collected" ? "build_clubhouse" : current;
    case "build_clubhouse": return event.type === "construction_finished" ? "secret_knock" : current;
    case "secret_knock": return event.type === "knock_matched" ? "complete" : current;
    default: return current;
  }
}

export function hasAllClubhouseSupplies(supplies: readonly ClubhouseSupply[]): boolean {
  return (["rope", "blanket", "branches"] as const).every((supply) => supplies.includes(supply));
}
