import type {
  ImplementedQuestId,
  QuestId,
  QuestMilestone,
  QuestStage,
  RyanRideStage,
  StageForQuest,
} from "../types";
import {
  MISSING_CONTROLLER_COMPLETED_MILESTONE_COUNT,
  MISSING_CONTROLLER_MILESTONES,
  MISSING_CONTROLLER_OBJECTIVES,
  MISSING_CONTROLLER_STAGES,
} from "../../content/chapters/chapter-01/quests/missing-controller/rules";
import {
  MUSHROOM_COMPLETED_MILESTONE_COUNT,
  MUSHROOM_MILESTONES,
  MUSHROOM_OBJECTIVES,
  MUSHROOM_STAGES,
} from "../../content/chapters/chapter-01/quests/andrew-mushroom-hunt/rules";
export {
  MUSHROOM_COUNT,
  MUSHROOM_STAGES,
  advanceMushroomStage,
  type MushroomQuestEvent,
} from "../../content/chapters/chapter-01/quests/andrew-mushroom-hunt/rules";
import {
  SPORTS_COMPLETED_MILESTONE_COUNT,
  SPORTS_MILESTONES,
  SPORTS_OBJECTIVES,
  SPORTS_STAGES,
} from "../../content/chapters/chapter-01/quests/three-player-sports/rules";
import {
  EXPLORE_BENT_CREEK_COMPLETED_MILESTONE_COUNT,
  EXPLORE_BENT_CREEK_MILESTONES,
  EXPLORE_BENT_CREEK_OBJECTIVES,
  EXPLORE_BENT_CREEK_STAGES,
} from "../../content/chapters/chapter-01/quests/explore-bent-creek/rules";
import {
  BONFIRE_QUEST_COMPLETED_MILESTONE_COUNT,
  BONFIRE_QUEST_MILESTONES,
  BONFIRE_QUEST_OBJECTIVES,
  BONFIRE_QUEST_STAGES,
} from "../../content/chapters/chapter-01/quests/attend-bonfire-at-andrews/rules";
import {
  CREEK_CLUBHOUSE_COMPLETED_MILESTONE_COUNT,
  CREEK_CLUBHOUSE_MILESTONES,
  CREEK_CLUBHOUSE_OBJECTIVES,
  CREEK_CLUBHOUSE_STAGES,
} from "../../content/chapters/chapter-01/quests/creek-clubhouse/rules";
import {
  PAPER_AIRPLANE_RELAY_COMPLETED_MILESTONE_COUNT,
  PAPER_AIRPLANE_RELAY_MILESTONES,
  PAPER_AIRPLANE_RELAY_OBJECTIVES,
  PAPER_AIRPLANE_RELAY_STAGES,
} from "../../content/chapters/chapter-01/quests/paper-airplane-relay/rules";
import {
  CADDY_CAPER_MILESTONES,
  CADDY_CAPER_OBJECTIVES,
  CADDY_CAPER_STAGES,
} from "../../content/chapters/chapter-01/quests/bent-creek-caddy-caper/rules";
export {
  advanceMissingControllerStage,
  MISSING_CONTROLLER_STAGES,
  type MissingControllerQuestEvent,
} from "../../content/chapters/chapter-01/quests/missing-controller/rules";
export {
  advanceSportsStage,
  SPORTS_STAGES,
  type SportsQuestEvent,
} from "../../content/chapters/chapter-01/quests/three-player-sports/rules";
export {
  advanceExploreBentCreekStage,
  EXPLORE_BENT_CREEK_STAGES,
  type ExploreBentCreekQuestEvent,
} from "../../content/chapters/chapter-01/quests/explore-bent-creek/rules";
export {
  advanceBonfireQuestStage,
  BONFIRE_QUEST_STAGES,
  type BonfireQuestEvent,
} from "../../content/chapters/chapter-01/quests/attend-bonfire-at-andrews/rules";
export {
  advanceCreekClubhouseStage,
  CREEK_CLUBHOUSE_STAGES,
  type CreekClubhouseEvent,
} from "../../content/chapters/chapter-01/quests/creek-clubhouse/rules";
export {
  advancePaperAirplaneRelayStage,
  PAPER_AIRPLANE_RELAY_STAGES,
  type PaperAirplaneRelayEvent,
} from "../../content/chapters/chapter-01/quests/paper-airplane-relay/rules";
export type RyanRideQuestEvent =
  | { type: "accepted_ride" }
  | { type: "selected_destination"; destination: "reidenbaugh" }
  | { type: "departed_neighborhood" }
  | { type: "reached_reidenbaugh" }
  | { type: "caught_ryan" };

/**
 * Quest rules live here rather than being spread across the store, UI copy, and
 * individual scenes. The persisted IDs remain deliberately stable.
 */
export const IMPLEMENTED_QUEST_IDS = [
  "missing_controller",
  "andrew_mushroom_hunt",
  "three_player_sports",
  "catch_ryan",
  "explore_bent_creek",
  "attend_bonfire_at_andrews",
  "creek_clubhouse",
  "paper_airplane_relay",
  "bent_creek_caddy_caper",
] as const satisfies readonly ImplementedQuestId[];

export const RYAN_RIDE_STAGES = [
  "invite", "choose_destination", "depart_neighborhood", "ride_stonehenge", "chase_reidenbaugh", "complete",
] as const satisfies readonly RyanRideStage[];

const RYAN_RIDE_MILESTONES = [
  "catch_ryan.started", "catch_ryan.destination_selected", "catch_ryan.neighborhood_departed",
  "catch_ryan.reidenbaugh_reached", "catch_ryan.ryan_caught",
] as const satisfies readonly QuestMilestone[];
export const QUEST_MILESTONES = [
  ...MISSING_CONTROLLER_MILESTONES,
  ...MUSHROOM_MILESTONES,
  ...SPORTS_MILESTONES,
  ...RYAN_RIDE_MILESTONES,
  ...EXPLORE_BENT_CREEK_MILESTONES,
  ...BONFIRE_QUEST_MILESTONES,
  ...CREEK_CLUBHOUSE_MILESTONES,
  ...PAPER_AIRPLANE_RELAY_MILESTONES,
  ...CADDY_CAPER_MILESTONES,
] as const satisfies readonly QuestMilestone[];

type QuestSpec<Q extends ImplementedQuestId> = {
  readonly id: Q;
  readonly stages: readonly StageForQuest<Q>[];
  readonly initialStage: StageForQuest<Q>;
  readonly objectives: Readonly<Record<StageForQuest<Q>, string>>;
  /** Milestones completed before each stage, in authored order. */
  readonly milestones: readonly QuestMilestone[];
  readonly completedMilestoneCount: Readonly<Record<StageForQuest<Q>, number>>;
};

export const QUEST_SPECS: { readonly [Q in ImplementedQuestId]: QuestSpec<Q> } = {
  missing_controller: {
    id: "missing_controller",
    stages: MISSING_CONTROLLER_STAGES,
    initialStage: "talk_to_billy",
    objectives: MISSING_CONTROLLER_OBJECTIVES,
    milestones: MISSING_CONTROLLER_MILESTONES,
    completedMilestoneCount: MISSING_CONTROLLER_COMPLETED_MILESTONE_COUNT,
  },
  andrew_mushroom_hunt: {
    id: "andrew_mushroom_hunt",
    stages: MUSHROOM_STAGES,
    initialStage: "talk_to_andrew_for_mushrooms",
    objectives: MUSHROOM_OBJECTIVES,
    milestones: MUSHROOM_MILESTONES,
    completedMilestoneCount: MUSHROOM_COMPLETED_MILESTONE_COUNT,
  },
  three_player_sports: {
    id: "three_player_sports",
    stages: SPORTS_STAGES,
    initialStage: "meet_jeremy_to_skateboard",
    objectives: SPORTS_OBJECTIVES,
    milestones: SPORTS_MILESTONES,
    completedMilestoneCount: SPORTS_COMPLETED_MILESTONE_COUNT,
  },
  catch_ryan: {
    id: "catch_ryan",
    stages: RYAN_RIDE_STAGES,
    initialStage: "invite",
    objectives: {
      invite: "Talk to Ryan near his house.",
      choose_destination: "Choose where to ride with Ryan.",
      depart_neighborhood: "Follow Ryan to the Stonehenge exit.",
      ride_stonehenge: "Keep up with Ryan through Stonehenge.",
      chase_reidenbaugh: "Find and catch Ryan in Reidenbaugh.",
      complete: "Ryan's ride complete! Reidenbaugh is open to explore.",
    },
    milestones: RYAN_RIDE_MILESTONES,
    completedMilestoneCount: { invite: 0, choose_destination: 1, depart_neighborhood: 2, ride_stonehenge: 3, chase_reidenbaugh: 4, complete: 5 },
  },
  explore_bent_creek: {
    id: "explore_bent_creek",
    stages: EXPLORE_BENT_CREEK_STAGES,
    initialStage: "open_gate",
    objectives: EXPLORE_BENT_CREEK_OBJECTIVES,
    milestones: EXPLORE_BENT_CREEK_MILESTONES,
    completedMilestoneCount: EXPLORE_BENT_CREEK_COMPLETED_MILESTONE_COUNT,
  },
  attend_bonfire_at_andrews: {
    id: "attend_bonfire_at_andrews",
    stages: BONFIRE_QUEST_STAGES,
    initialStage: "talk_to_schwartz",
    objectives: BONFIRE_QUEST_OBJECTIVES,
    milestones: BONFIRE_QUEST_MILESTONES,
    completedMilestoneCount: BONFIRE_QUEST_COMPLETED_MILESTONE_COUNT,
  },
  creek_clubhouse: {
    id: "creek_clubhouse",
    stages: CREEK_CLUBHOUSE_STAGES,
    initialStage: "talk_to_andrew",
    objectives: CREEK_CLUBHOUSE_OBJECTIVES,
    milestones: CREEK_CLUBHOUSE_MILESTONES,
    completedMilestoneCount: CREEK_CLUBHOUSE_COMPLETED_MILESTONE_COUNT,
  },
  paper_airplane_relay: {
    id: "paper_airplane_relay",
    stages: PAPER_AIRPLANE_RELAY_STAGES,
    initialStage: "ask_for_advice",
    objectives: PAPER_AIRPLANE_RELAY_OBJECTIVES,
    milestones: PAPER_AIRPLANE_RELAY_MILESTONES,
    completedMilestoneCount: PAPER_AIRPLANE_RELAY_COMPLETED_MILESTONE_COUNT,
  },
  bent_creek_caddy_caper: {
    id: "bent_creek_caddy_caper",
    stages: CADDY_CAPER_STAGES,
    initialStage: "inspect_display",
    objectives: CADDY_CAPER_OBJECTIVES,
    milestones: CADDY_CAPER_MILESTONES,
    completedMilestoneCount: {
      inspect_display: 0,
      follow_clues: 1,
      putt_gates: 2,
      sprinklers: 3,
      chase_trophy: 4,
      return_trophy: 4,
      complete: 5,
    },
  },
};

export function isImplementedQuestId(value: unknown): value is ImplementedQuestId {
  return IMPLEMENTED_QUEST_IDS.some((questId) => questId === value);
}

export function isStageForQuest<Q extends ImplementedQuestId>(questId: Q, stage: unknown): stage is StageForQuest<Q> {
  return QUEST_SPECS[questId].stages.some((candidate) => candidate === stage);
}

export function objectiveForQuest(questId: QuestId, stage: QuestStage): string {
  if (questId === "missing_controller" && isStageForQuest("missing_controller", stage)) {
    return QUEST_SPECS.missing_controller.objectives[stage];
  }
  if (questId === "andrew_mushroom_hunt" && isStageForQuest("andrew_mushroom_hunt", stage)) {
    return QUEST_SPECS.andrew_mushroom_hunt.objectives[stage];
  }
  if (questId === "three_player_sports" && isStageForQuest("three_player_sports", stage)) {
    return QUEST_SPECS.three_player_sports.objectives[stage];
  }
  if (questId === "catch_ryan" && isStageForQuest("catch_ryan", stage)) return QUEST_SPECS.catch_ryan.objectives[stage];
  if (questId === "explore_bent_creek" && isStageForQuest("explore_bent_creek", stage)) {
    return QUEST_SPECS.explore_bent_creek.objectives[stage];
  }
  if (questId === "attend_bonfire_at_andrews" && isStageForQuest("attend_bonfire_at_andrews", stage)) {
    return QUEST_SPECS.attend_bonfire_at_andrews.objectives[stage];
  }
  if (questId === "creek_clubhouse" && isStageForQuest("creek_clubhouse", stage)) {
    return QUEST_SPECS.creek_clubhouse.objectives[stage];
  }
  if (questId === "paper_airplane_relay" && isStageForQuest("paper_airplane_relay", stage)) {
    return QUEST_SPECS.paper_airplane_relay.objectives[stage];
  }
  if (questId === "bent_creek_caddy_caper" && isStageForQuest("bent_creek_caddy_caper", stage)) {
    return QUEST_SPECS.bent_creek_caddy_caper.objectives[stage];
  }
  return QUEST_SPECS.missing_controller.objectives.talk_to_billy;
}

export function milestonesForQuestStage(questId: QuestId, stage: QuestStage): QuestMilestone[] {
  if (questId === "missing_controller" && isStageForQuest("missing_controller", stage)) {
    const spec = QUEST_SPECS.missing_controller;
    return spec.milestones.slice(0, spec.completedMilestoneCount[stage]);
  }
  if (questId === "andrew_mushroom_hunt" && isStageForQuest("andrew_mushroom_hunt", stage)) {
    const spec = QUEST_SPECS.andrew_mushroom_hunt;
    return spec.milestones.slice(0, spec.completedMilestoneCount[stage]);
  }
  if (questId === "three_player_sports" && isStageForQuest("three_player_sports", stage)) {
    const spec = QUEST_SPECS.three_player_sports;
    return spec.milestones.slice(0, spec.completedMilestoneCount[stage]);
  }
  if (questId === "catch_ryan" && isStageForQuest("catch_ryan", stage)) {
    const spec = QUEST_SPECS.catch_ryan;
    return spec.milestones.slice(0, spec.completedMilestoneCount[stage]);
  }
  if (questId === "explore_bent_creek" && isStageForQuest("explore_bent_creek", stage)) {
    const spec = QUEST_SPECS.explore_bent_creek;
    return spec.milestones.slice(0, spec.completedMilestoneCount[stage]);
  }
  if (questId === "attend_bonfire_at_andrews" && isStageForQuest("attend_bonfire_at_andrews", stage)) {
    const spec = QUEST_SPECS.attend_bonfire_at_andrews;
    return spec.milestones.slice(0, spec.completedMilestoneCount[stage]);
  }
  if (questId === "creek_clubhouse" && isStageForQuest("creek_clubhouse", stage)) {
    const spec = QUEST_SPECS.creek_clubhouse;
    return spec.milestones.slice(0, spec.completedMilestoneCount[stage]);
  }
  if (questId === "paper_airplane_relay" && isStageForQuest("paper_airplane_relay", stage)) {
    const spec = QUEST_SPECS.paper_airplane_relay;
    return spec.milestones.slice(0, spec.completedMilestoneCount[stage]);
  }
  if (questId === "bent_creek_caddy_caper" && isStageForQuest("bent_creek_caddy_caper", stage)) {
    const spec = QUEST_SPECS.bent_creek_caddy_caper;
    return spec.milestones.slice(0, spec.completedMilestoneCount[stage]);
  }
  return [];
}

export function advanceRyanRideStage(current: RyanRideStage, event: RyanRideQuestEvent): RyanRideStage {
  switch (current) {
    case "invite": return event.type === "accepted_ride" ? "choose_destination" : current;
    case "choose_destination": return event.type === "selected_destination" ? "depart_neighborhood" : current;
    case "depart_neighborhood": return event.type === "departed_neighborhood" ? "ride_stonehenge" : current;
    case "ride_stonehenge": return event.type === "reached_reidenbaugh" ? "chase_reidenbaugh" : current;
    case "chase_reidenbaugh": return event.type === "caught_ryan" ? "complete" : current;
    default: return current;
  }
}
