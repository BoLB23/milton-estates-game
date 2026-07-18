import type {
  ImplementedQuestId,
  MissingControllerStage,
  MushroomQuestStage,
  QuestId,
  QuestMilestone,
  QuestStage,
  SportsQuestStage,
  StageForQuest,
} from "../types";

export type MissingControllerQuestEvent =
  | { type: "talked_to_jeremy" }
  | { type: "talked_to_andrew" }
  | { type: "picked_up_controller" }
  | { type: "returned_controller" };
export type MushroomQuestEvent =
  | { type: "talked_to_andrew_for_mushrooms" }
  | { type: "collected_all_mushrooms" }
  | { type: "fed_mushroom_to_jeremy" }
  | { type: "placed_mushroom_at_billy" }
  | { type: "gave_mushrooms_to_andrew" };
export type SportsQuestEvent =
  | { type: "skateboarded_with_jeremy" }
  | { type: "played_baseball_with_billy" }
  | { type: "played_basketball_with_andrew" };

/**
 * Quest rules live here rather than being spread across the store, UI copy, and
 * individual scenes. The persisted IDs remain deliberately stable.
 */
export const IMPLEMENTED_QUEST_IDS = [
  "missing_controller",
  "andrew_mushroom_hunt",
  "three_player_sports",
] as const satisfies readonly ImplementedQuestId[];

export const MUSHROOM_COUNT = 10;

export const MISSING_CONTROLLER_STAGES = [
  "talk_to_jeremy", "talk_to_andrew", "search_creek", "return_to_jeremy", "complete",
] as const satisfies readonly MissingControllerStage[];
export const MUSHROOM_STAGES = [
  "talk_to_andrew_for_mushrooms", "search_mushrooms", "feed_mushroom_to_jeremy",
  "place_mushroom_at_billy", "give_mushrooms_to_andrew", "complete",
] as const satisfies readonly MushroomQuestStage[];
export const SPORTS_STAGES = [
  "meet_jeremy_to_skateboard", "meet_billy_to_play_baseball", "meet_andrew_to_play_basketball", "complete",
] as const satisfies readonly SportsQuestStage[];

export const QUEST_MILESTONES = [
  "missing_controller.started", "missing_controller.andrew_consulted",
  "missing_controller.creek_clue_found", "missing_controller.controller_recovered",
  "missing_controller.controller_returned", "andrew_mushroom_hunt.started",
  "andrew_mushroom_hunt.all_collected", "andrew_mushroom_hunt.jeremy_fed",
  "andrew_mushroom_hunt.billy_supplied", "andrew_mushroom_hunt.andrew_supplied",
  "three_player_sports.started", "three_player_sports.skateboarded",
  "three_player_sports.played_baseball", "three_player_sports.played_basketball",
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
    initialStage: "talk_to_jeremy",
    objectives: {
      talk_to_jeremy: "Talk to Jeremy outside his house.",
      talk_to_andrew: "Ask Andrew what he knows about the missing controller.",
      search_creek: "Follow the creek trail and search the tall grass.",
      return_to_jeremy: "Bring the Xbox controller back to Jeremy.",
      complete: "Mystery solved! The controller is back where it belongs.",
    },
    milestones: QUEST_MILESTONES.slice(0, 5),
    completedMilestoneCount: { talk_to_jeremy: 0, talk_to_andrew: 1, search_creek: 3, return_to_jeremy: 4, complete: 5 },
  },
  andrew_mushroom_hunt: {
    id: "andrew_mushroom_hunt",
    stages: MUSHROOM_STAGES,
    initialStage: "talk_to_andrew_for_mushrooms",
    objectives: {
      talk_to_andrew_for_mushrooms: "Ask Andrew why he needs ten mushrooms.",
      search_mushrooms: "Find all 10 mushrooms in Milton's backyards and Creek Woods.",
      feed_mushroom_to_jeremy: "Feed one mushroom to Jeremy at his house.",
      place_mushroom_at_billy: "Put one mushroom at Billy's house.",
      give_mushrooms_to_andrew: "Give the last 8 mushrooms to Andrew.",
      complete: "Mushroom mission complete! Andrew has his ten mushrooms.",
    },
    milestones: QUEST_MILESTONES.slice(5, 10),
    completedMilestoneCount: { talk_to_andrew_for_mushrooms: 0, search_mushrooms: 1, feed_mushroom_to_jeremy: 2, place_mushroom_at_billy: 3, give_mushrooms_to_andrew: 4, complete: 5 },
  },
  three_player_sports: {
    id: "three_player_sports",
    stages: SPORTS_STAGES,
    initialStage: "meet_jeremy_to_skateboard",
    objectives: {
      meet_jeremy_to_skateboard: "Meet Jeremy at his house to skateboard together.",
      meet_billy_to_play_baseball: "Meet at Billy's house to play baseball together.",
      meet_andrew_to_play_basketball: "Meet Andrew at his house to play basketball together.",
      complete: "Sports day complete! All three friends played together.",
    },
    milestones: QUEST_MILESTONES.slice(10),
    completedMilestoneCount: { meet_jeremy_to_skateboard: 0, meet_billy_to_play_baseball: 1, meet_andrew_to_play_basketball: 2, complete: 4 },
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
  return QUEST_SPECS.missing_controller.objectives.talk_to_jeremy;
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
  return [];
}

export function advanceMissingControllerStage(current: QuestStage, event: MissingControllerQuestEvent): QuestStage {
  switch (current) {
    case "talk_to_jeremy": return event.type === "talked_to_jeremy" ? "talk_to_andrew" : current;
    case "talk_to_andrew": return event.type === "talked_to_andrew" ? "search_creek" : current;
    case "search_creek": return event.type === "picked_up_controller" ? "return_to_jeremy" : current;
    case "return_to_jeremy": return event.type === "returned_controller" ? "complete" : current;
    default: return current;
  }
}

export function advanceMushroomStage(current: MushroomQuestStage, event: MushroomQuestEvent): MushroomQuestStage {
  switch (current) {
    case "talk_to_andrew_for_mushrooms": return event.type === "talked_to_andrew_for_mushrooms" ? "search_mushrooms" : current;
    case "search_mushrooms": return event.type === "collected_all_mushrooms" ? "feed_mushroom_to_jeremy" : current;
    case "feed_mushroom_to_jeremy": return event.type === "fed_mushroom_to_jeremy" ? "place_mushroom_at_billy" : current;
    case "place_mushroom_at_billy": return event.type === "placed_mushroom_at_billy" ? "give_mushrooms_to_andrew" : current;
    case "give_mushrooms_to_andrew": return event.type === "gave_mushrooms_to_andrew" ? "complete" : current;
    default: return current;
  }
}

export function advanceSportsStage(current: SportsQuestStage, event: SportsQuestEvent): SportsQuestStage {
  switch (current) {
    case "meet_jeremy_to_skateboard": return event.type === "skateboarded_with_jeremy" ? "meet_billy_to_play_baseball" : current;
    case "meet_billy_to_play_baseball": return event.type === "played_baseball_with_billy" ? "meet_andrew_to_play_basketball" : current;
    case "meet_andrew_to_play_basketball": return event.type === "played_basketball_with_andrew" ? "complete" : current;
    default: return current;
  }
}
