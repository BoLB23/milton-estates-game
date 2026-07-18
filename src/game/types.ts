export type MapId = "neighborhood" | "creek";

/** Stable content IDs. These values are persisted and must not be renamed. */
export type ChapterId = "chapter_1";
export type QuestId =
  | "missing_controller"
  | "andrew_mushroom_hunt"
  | "three_player_sports"
  | "storm_drain_detectives"
  | "creek_token_hunt"
  | "last_day_of_summer";

/** Quests with authored runtime rules. The remaining IDs are roadmap placeholders. */
export type ImplementedQuestId =
  | "missing_controller"
  | "andrew_mushroom_hunt"
  | "three_player_sports";

export type MissingControllerStage =
  | "talk_to_jeremy"
  | "talk_to_andrew"
  | "search_creek"
  | "return_to_jeremy"
  | "complete";

export type MushroomQuestStage =
  | "talk_to_andrew_for_mushrooms"
  | "search_mushrooms"
  | "feed_mushroom_to_jeremy"
  | "place_mushroom_at_billy"
  | "give_mushrooms_to_andrew"
  | "complete";

export type SportsQuestStage =
  | "meet_jeremy_to_skateboard"
  | "meet_billy_to_play_baseball"
  | "meet_andrew_to_play_basketball"
  | "complete";

/** The stage belonging to the currently selected quest. */
export type QuestStage = MissingControllerStage | MushroomQuestStage | SportsQuestStage;

/** Associates a persisted quest ID with the only stages it may own. */
export type StageForQuest<Q extends ImplementedQuestId> =
  Q extends "missing_controller" ? MissingControllerStage
    : Q extends "andrew_mushroom_hunt" ? MushroomQuestStage
      : SportsQuestStage;

/** Stable, non-presentational IDs used to build the quest checklist/history. */
export type QuestMilestone =
  | "missing_controller.started"
  | "missing_controller.andrew_consulted"
  | "missing_controller.creek_clue_found"
  | "missing_controller.controller_recovered"
  | "missing_controller.controller_returned"
  | "andrew_mushroom_hunt.started"
  | "andrew_mushroom_hunt.all_collected"
  | "andrew_mushroom_hunt.jeremy_fed"
  | "andrew_mushroom_hunt.billy_supplied"
  | "andrew_mushroom_hunt.andrew_supplied"
  | "three_player_sports.started"
  | "three_player_sports.skateboarded"
  | "three_player_sports.played_baseball"
  | "three_player_sports.played_basketball";

export interface MushroomSpawn {
  id: string;
  map: MapId;
  x: number;
  y: number;
}

export interface MushroomQuestState {
  stage: MushroomQuestStage;
  /** Authored once per save so mushrooms remain in the same random places after reload. */
  spawns: MushroomSpawn[];
  collectedIds: string[];
}

export interface SportsQuestState {
  stage: SportsQuestStage;
}

export interface QuestProgress {
  missingControllerStage: MissingControllerStage;
  mushrooms: MushroomQuestState;
  sports: SportsQuestState;
}

export interface PlayerSettings {
  masterVolume: number;
  muted: boolean;
  textSize: "small" | "medium" | "large";
  reducedMotion: boolean;
}

export interface SaveData {
  version: 5;
  activeChapterId: ChapterId;
  activeQuestId: QuestId;
  completedChapterIds: ChapterId[];
  completedQuestIds: QuestId[];
  questProgress: QuestProgress;
  /** Ordered semantic milestones. Display strings must not be persisted here. */
  questHistory: QuestMilestone[];
  inventory: string[];
  secrets: string[];
  currentMap: MapId;
  discoveredMaps: MapId[];
  settings: PlayerSettings;
  /** ISO timestamp of the most recent successful persistence operation. */
  lastSavedAt: string | null;
}

/** Scene-facing projection. questStage is derived and is never serialized. */
export interface GameState extends SaveData {
  readonly questStage: QuestStage;
}

export interface DialogueLine {
  speaker: string;
  text: string;
}

export interface DialogueRequest {
  lines: DialogueLine[];
  onComplete?: () => void;
}

export interface Interactable {
  id: string;
  x: number;
  y: number;
  label: string;
  isAvailable?: () => boolean;
  interact: () => void;
}
