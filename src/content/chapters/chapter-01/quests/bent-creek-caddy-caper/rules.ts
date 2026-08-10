/** Runtime stages intentionally live with the quest until the shared save schema adopts them. */
export const CADDY_CAPER_STAGES = [
  "inspect_display", "follow_clues", "putt_gates", "sprinklers", "chase_trophy", "return_trophy", "complete",
] as const;

export type CaddyCaperStage = typeof CADDY_CAPER_STAGES[number];

export type CaddyCaperEvent =
  | { type: "display_inspected" }
  | { type: "clues_followed" }
  | { type: "gates_putted" }
  | { type: "sprinklers_set" }
  | { type: "trophy_caught" }
  | { type: "trophy_returned" };

export const CADDY_CAPER_MILESTONES = [
  "bent_creek_caddy_caper.started",
  "bent_creek_caddy_caper.clues_followed",
  "bent_creek_caddy_caper.gates_putted",
  "bent_creek_caddy_caper.trophy_found",
  "bent_creek_caddy_caper.complete",
] as const;

export const CADDY_CAPER_OBJECTIVES: Readonly<Record<CaddyCaperStage, string>> = {
  inspect_display: "Talk to Schwartz and inspect the ceremonial trophy display.",
  follow_clues: "Follow the golf-ball trail without stepping into a passing cart's lane.",
  putt_gates: "Sink a putt through all three practice gates.",
  sprinklers: "Set the maintenance-yard sprinklers in the right order.",
  chase_trophy: "Catch the trophy Mickey kicked down the cart path.",
  return_trophy: "Return Schwartz's trophy to the clubhouse display.",
  complete: "Caddy Caper complete — honorary visitor badge earned!",
};

export function advanceCaddyCaperStage(stage: CaddyCaperStage, event: CaddyCaperEvent): CaddyCaperStage {
  if (stage === "inspect_display" && event.type === "display_inspected") return "follow_clues";
  if (stage === "follow_clues" && event.type === "clues_followed") return "putt_gates";
  if (stage === "putt_gates" && event.type === "gates_putted") return "sprinklers";
  if (stage === "sprinklers" && event.type === "sprinklers_set") return "chase_trophy";
  if (stage === "chase_trophy" && event.type === "trophy_caught") return "return_trophy";
  if (stage === "return_trophy" && event.type === "trophy_returned") return "complete";
  return stage;
}
