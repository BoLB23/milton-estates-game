export type MapId =
  | "neighborhood"
  | "creek"
  | "stonehenge"
  | "reidenbaugh"
  | "fruitville_pike"
  | "bent_creek";

export const MAP_IDS = [
  "neighborhood",
  "creek",
  "stonehenge",
  "reidenbaugh",
  "fruitville_pike",
  "bent_creek",
] as const satisfies readonly MapId[];

export type ItemId = "xbox_controller" | "bicycle" | "field_token";

export interface InventoryStack {
  itemId: ItemId;
  quantity: number;
}

export interface EquipmentState {
  transport: "bicycle" | null;
}

export interface PlayerMapLocation {
  map: MapId;
  x: number;
  y: number;
}

/** Stable content IDs. These values are persisted and must not be renamed. */
export type ChapterId = "chapter_1";
export type QuestId =
  | "missing_controller"
  | "andrew_mushroom_hunt"
  | "three_player_sports"
  | "catch_ryan"
  | "explore_bent_creek"
  | "storm_drain_detectives"
  | "creek_token_hunt"
  | "last_day_of_summer";

/** Quests with authored runtime rules. The remaining IDs are roadmap placeholders. */
export type ImplementedQuestId =
  | "missing_controller"
  | "andrew_mushroom_hunt"
  | "three_player_sports"
  | "catch_ryan"
  | "explore_bent_creek";

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

export type RideDestination = "reidenbaugh";
export type RyanRideStage =
  | "invite"
  | "choose_destination"
  | "depart_neighborhood"
  | "ride_stonehenge"
  | "chase_reidenbaugh"
  | "complete";

export type ExploreBentCreekStage = "open_gate" | "complete";

/** The stage belonging to the currently selected quest. */
export type QuestStage = MissingControllerStage | MushroomQuestStage | SportsQuestStage | RyanRideStage | ExploreBentCreekStage;

/** Associates a persisted quest ID with the only stages it may own. */
export type StageForQuest<Q extends ImplementedQuestId> =
  Q extends "missing_controller" ? MissingControllerStage
    : Q extends "andrew_mushroom_hunt" ? MushroomQuestStage
      : Q extends "three_player_sports" ? SportsQuestStage
        : Q extends "catch_ryan" ? RyanRideStage
          : ExploreBentCreekStage;

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
  | "three_player_sports.played_basketball"
  | "catch_ryan.started"
  | "catch_ryan.destination_selected"
  | "catch_ryan.neighborhood_departed"
  | "catch_ryan.reidenbaugh_reached"
  | "catch_ryan.ryan_caught"
  | "explore_bent_creek.started"
  | "explore_bent_creek.gate_opened";

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

export interface RyanRideQuestState {
  stage: RyanRideStage;
  selectedDestination: RideDestination | null;
  routeSeed: number | null;
}

export interface ExploreBentCreekQuestState {
  stage: ExploreBentCreekStage;
}

export interface QuestProgress {
  missingControllerStage: MissingControllerStage;
  mushrooms: MushroomQuestState;
  sports: SportsQuestState;
  ryanRide: RyanRideQuestState;
  exploreBentCreek: ExploreBentCreekQuestState;
}

export interface PlayerSettings {
  masterVolume: number;
  muted: boolean;
  textSize: "small" | "medium" | "large";
  reducedMotion: boolean;
}

export interface SaveData {
  version: 8;
  activeChapterId: ChapterId;
  activeQuestId: QuestId;
  completedChapterIds: ChapterId[];
  completedQuestIds: QuestId[];
  questProgress: QuestProgress;
  /** Ordered semantic milestones. Display strings must not be persisted here. */
  questHistory: QuestMilestone[];
  inventory: InventoryStack[];
  equipment: EquipmentState;
  collectedPickupIds: string[];
  lastKnownLocation: PlayerMapLocation;
  secrets: string[];
  currentMap: MapId;
  discoveredMaps: MapId[];
  /** Maps legally accessible to the player; discovery remains separate. */
  unlockedMaps: MapId[];
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
