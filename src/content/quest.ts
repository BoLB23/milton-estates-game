/**
 * Compatibility facade for scene imports. Quest rules and authored copy live in
 * game/quests/specs so persistence and gameplay share one definition.
 */
import {
  advanceMissingControllerStage,
  advanceRyanRideStage,
  objectiveForQuest,
} from "../game/quests/specs";
import type {
  MissingControllerQuestEvent,
  MushroomQuestEvent,
  SportsQuestEvent,
  RyanRideQuestEvent,
} from "../game/quests/specs";
import type { QuestId, QuestStage, RyanRideStage } from "../game/types";

export type QuestEvent = MissingControllerQuestEvent;
export type { MushroomQuestEvent, SportsQuestEvent, RyanRideQuestEvent };

export function nextStage(current: QuestStage, event: QuestEvent): QuestStage {
  return advanceMissingControllerStage(current, event);
}

export function nextRyanRideStage(current: RyanRideStage, event: RyanRideQuestEvent): RyanRideStage {
  return advanceRyanRideStage(current, event);
}

export function getObjective(stage: QuestStage, questId: QuestId = "missing_controller"): string {
  return objectiveForQuest(questId, stage);
}
