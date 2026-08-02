import {
  MUSHROOM_COUNT,
  isImplementedQuestId,
  isStageForQuest,
  milestonesForQuestStage,
} from "../quests/specs";
import { MAP_IDS } from "../types";
import type { ImplementedQuestId, QuestId, QuestProgress, QuestStage, SaveData } from "../types";

const RYAN_UNLOCKED_MAPS = [
  "stonehenge",
  "reidenbaugh",
  "fruitville_pike",
  "bent_creek",
] as const;

/** The pre-release yard-search step was retired; only the decoder accepts it. */
export function migrateLegacyMissingControllerStage(stage: string): QuestProgress["missingControllerStage"] | undefined {
  if (stage === "search_yards") return "search_creek";
  return isStageForQuest("missing_controller", stage) ? stage : undefined;
}

/** Returns the sole authoritative active stage from quest progress. */
export function stageFromProgress(progress: QuestProgress, questId: QuestId): QuestStage | undefined {
  switch (questId) {
    case "missing_controller": return progress.missingControllerStage;
    case "andrew_mushroom_hunt": return progress.mushrooms.stage;
    case "three_player_sports": return progress.sports.stage;
    case "catch_ryan": return progress.ryanRide.stage;
    case "explore_bent_creek": return progress.exploreBentCreek.stage;
    default: return undefined;
  }
}

/** Rejects quest/stage combinations instead of silently ignoring them. */
export function progressAtStage(
  progress: QuestProgress,
  questId: ImplementedQuestId,
  stage: QuestStage,
): QuestProgress {
  if (!isStageForQuest(questId, stage)) {
    throw new RangeError(`Stage ${stage} does not belong to quest ${questId}`);
  }
  if (questId === "missing_controller") {
    return { ...progress, missingControllerStage: stage as QuestProgress["missingControllerStage"] };
  }
  if (questId === "andrew_mushroom_hunt") {
    return { ...progress, mushrooms: { ...progress.mushrooms, stage: stage as QuestProgress["mushrooms"]["stage"] } };
  }
  if (questId === "three_player_sports") return { ...progress, sports: { ...progress.sports, stage: stage as QuestProgress["sports"]["stage"] } };
  if (questId === "catch_ryan") {
    return { ...progress, ryanRide: { ...progress.ryanRide, stage: stage as QuestProgress["ryanRide"]["stage"] } };
  }
  return { ...progress, exploreBentCreek: { ...progress.exploreBentCreek, stage: stage as QuestProgress["exploreBentCreek"]["stage"] } };
}

export interface QuestProgressInvariantViolation {
  readonly path: string;
  readonly message: string;
}

/**
 * Validates relationships that JSON shape checks cannot express. The caller can
 * repair recoverable layout data, but impossible quest progression is rejected.
 */
export function validateQuestProgress(progress: QuestProgress): QuestProgressInvariantViolation[] {
  const violations: QuestProgressInvariantViolation[] = [];
  if (!isStageForQuest("missing_controller", progress.missingControllerStage)) {
    violations.push({ path: "questProgress.missingControllerStage", message: "Unknown Missing Controller stage" });
  }
  if (!isStageForQuest("andrew_mushroom_hunt", progress.mushrooms.stage)) {
    violations.push({ path: "questProgress.mushrooms.stage", message: "Unknown mushroom quest stage" });
  }
  if (!isStageForQuest("three_player_sports", progress.sports.stage)) {
    violations.push({ path: "questProgress.sports.stage", message: "Unknown sports quest stage" });
  }
  if (!isStageForQuest("catch_ryan", progress.ryanRide.stage)) {
    violations.push({ path: "questProgress.ryanRide.stage", message: "Unknown Catch Ryan stage" });
  }
  if (!isStageForQuest("explore_bent_creek", progress.exploreBentCreek.stage)) {
    violations.push({ path: "questProgress.exploreBentCreek.stage", message: "Unknown Explore Bent Creek stage" });
  }
  const ride = progress.ryanRide;
  const selected = ride.selectedDestination === "reidenbaugh";
  const hasSeed = typeof ride.routeSeed === "number" && Number.isFinite(ride.routeSeed);
  if ((ride.stage === "invite" || ride.stage === "choose_destination") && (ride.selectedDestination !== null || ride.routeSeed !== null)) {
    violations.push({ path: "questProgress.ryanRide", message: "Ride selection is not valid before departure" });
  }
  if (["depart_neighborhood", "ride_stonehenge", "chase_reidenbaugh", "complete"].includes(ride.stage) && (!selected || !hasSeed)) {
    violations.push({ path: "questProgress.ryanRide", message: "Ride departure requires Reidenbaugh and a route seed" });
  }
  const spawnIds = new Set(progress.mushrooms.spawns.map((spawn) => spawn.id));
  const neighborhoodCount = progress.mushrooms.spawns.filter((spawn) => spawn.map === "neighborhood").length;
  const creekCount = progress.mushrooms.spawns.filter((spawn) => spawn.map === "creek").length;
  if (progress.mushrooms.spawns.length !== MUSHROOM_COUNT || spawnIds.size !== MUSHROOM_COUNT
    || neighborhoodCount !== MUSHROOM_COUNT / 2 || creekCount !== MUSHROOM_COUNT / 2) {
    violations.push({ path: "questProgress.mushrooms.spawns", message: "Mushroom layout must contain five unique spawns on each map" });
  }
  if (progress.mushrooms.collectedIds.some((id) => !spawnIds.has(id))) {
    violations.push({ path: "questProgress.mushrooms.collectedIds", message: "Collected mushroom IDs must exist in the authored layout" });
  }
  const collectedCount = new Set(progress.mushrooms.collectedIds).size;
  const mushroomStage = progress.mushrooms.stage;
  if (mushroomStage === "talk_to_andrew_for_mushrooms" && collectedCount !== 0) {
    violations.push({ path: "questProgress.mushrooms.collectedIds", message: "Mushrooms cannot be collected before the hunt starts" });
  } else if (mushroomStage === "search_mushrooms" && collectedCount >= MUSHROOM_COUNT) {
    violations.push({ path: "questProgress.mushrooms.stage", message: "A completed search must advance to the first handoff" });
  } else if (mushroomStage !== "talk_to_andrew_for_mushrooms"
    && mushroomStage !== "search_mushrooms" && collectedCount !== MUSHROOM_COUNT) {
    violations.push({ path: "questProgress.mushrooms.collectedIds", message: "Mushroom handoffs require all ten mushrooms" });
  }
  return violations;
}

/** Validates cross-field save invariants after the JSON shape has been decoded. */
export function validateSaveInvariants(save: SaveData): QuestProgressInvariantViolation[] {
  const violations = validateQuestProgress(save.questProgress);
  if (!isImplementedQuestId(save.activeQuestId)) {
    violations.push({ path: "activeQuestId", message: "Active quest must have runtime rules" });
    return violations;
  }
  for (const questId of ["missing_controller", "andrew_mushroom_hunt", "three_player_sports", "catch_ryan", "explore_bent_creek"] as const) {
    const stage = stageFromProgress(save.questProgress, questId);
    if (save.completedQuestIds.includes(questId) && stage !== "complete") {
      violations.push({ path: "completedQuestIds", message: `Quest ${questId} is recorded complete but its progress is not complete` });
    }
    const allowedMilestones = new Set(milestonesForQuestStage(questId, stage!));
    if (save.questHistory.some((milestone) => milestone.startsWith(`${questId}.`) && !allowedMilestones.has(milestone))) {
      violations.push({ path: "questHistory", message: `Quest ${questId} history is ahead of its authoritative progress` });
    }
  }
  if (!MAP_IDS.includes(save.currentMap) || !save.unlockedMaps.includes(save.currentMap)) {
    violations.push({ path: "currentMap", message: "Current map must be unlocked" });
  }
  if (save.discoveredMaps.some((map) => !save.unlockedMaps.includes(map))) {
    violations.push({ path: "discoveredMaps", message: "Discovered maps must be unlocked" });
  }
  if (save.questProgress.ryanRide.selectedDestination === "reidenbaugh"
    && RYAN_UNLOCKED_MAPS.some((map) => !save.unlockedMaps.includes(map))) {
    violations.push({ path: "unlockedMaps", message: "Selecting Reidenbaugh unlocks the regional maps atomically" });
  }
  return violations;
}
