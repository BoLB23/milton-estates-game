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

export type ItemId =
  | "xbox_controller"
  | "bicycle"
  | "field_token"
  | "clubhouse_journal_page"
  | "paper_airplane"
  | "bent_creek_visitor_badge";

export interface InventoryStack {
  itemId: ItemId;
  quantity: number;
}

/** Appearance supplied by the authenticated Game Lab profile. */
export interface PlayerProfile {
  id: string;
  nickname: string;
  haircut: string;
  hairColor: string;
  tshirtColor: string;
  pantsColor: string;
  shoeColor: string;
}

export type SpawnIntent = "new-home" | "resume" | "regional-transition" | "move-in";

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
  | "attend_bonfire_at_andrews"
  | "creek_clubhouse"
  | "paper_airplane_relay"
  | "bent_creek_caddy_caper"
  | "storm_drain_detectives"
  | "creek_token_hunt"
  | "last_day_of_summer";

/** Quests with authored runtime rules. The remaining IDs are roadmap placeholders. */
export type ImplementedQuestId =
  | "missing_controller"
  | "andrew_mushroom_hunt"
  | "three_player_sports"
  | "catch_ryan"
  | "explore_bent_creek"
  | "attend_bonfire_at_andrews"
  | "creek_clubhouse"
  | "paper_airplane_relay"
  | "bent_creek_caddy_caper";

export type MissingControllerStage =
  | "talk_to_billy"
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

export type ExploreBentCreekStage = "open_gate" | "meet_schwartz" | "complete";
export type BonfireQuestStage = "talk_to_schwartz" | "attend_bonfire" | "survive_bad_trip" | "complete";
export type CreekClubhouseStage =
  | "talk_to_andrew"
  | "choose_design"
  | "collect_supplies"
  | "build_clubhouse"
  | "secret_knock"
  | "complete";
export type ClubhouseDesign = "lookout" | "fort" | "hidden_den";
export type ClubhouseSupply = "rope" | "blanket" | "branches";
export type PaperAirplaneRelayStage =
  | "ask_for_advice"
  | "find_materials"
  | "fold_plane"
  | "chase_plane"
  | "decode_message"
  | "deliver_message"
  | "complete";
export type PaperAirplaneAdvisor = "ryan" | "billy" | "andrew";
export type PaperAirplaneMaterial = "clean_sheet" | "card_wing" | "message_strip";
export type BentCreekCaddyCaperStage =
  | "inspect_display"
  | "follow_clues"
  | "putt_gates"
  | "sprinklers"
  | "chase_trophy"
  | "return_trophy"
  | "complete";

/** The stage belonging to the currently selected quest. */
export type QuestStage =
  | MissingControllerStage
  | MushroomQuestStage
  | SportsQuestStage
  | RyanRideStage
  | ExploreBentCreekStage
  | BonfireQuestStage
  | CreekClubhouseStage
  | PaperAirplaneRelayStage
  | BentCreekCaddyCaperStage;

/** Associates a persisted quest ID with the only stages it may own. */
export type StageForQuest<Q extends ImplementedQuestId> =
  Q extends "missing_controller" ? MissingControllerStage
    : Q extends "andrew_mushroom_hunt" ? MushroomQuestStage
      : Q extends "three_player_sports" ? SportsQuestStage
          : Q extends "catch_ryan" ? RyanRideStage
          : Q extends "explore_bent_creek" ? ExploreBentCreekStage
            : Q extends "attend_bonfire_at_andrews" ? BonfireQuestStage
              : Q extends "creek_clubhouse" ? CreekClubhouseStage
                : Q extends "paper_airplane_relay" ? PaperAirplaneRelayStage
                  : BentCreekCaddyCaperStage;

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
  | "explore_bent_creek.gate_opened"
  | "attend_bonfire_at_andrews.started"
  | "attend_bonfire_at_andrews.invitation_accepted"
  | "attend_bonfire_at_andrews.arrived_at_andrews"
  | "attend_bonfire_at_andrews.bad_trip_survived"
  | "creek_clubhouse.started"
  | "creek_clubhouse.design_chosen"
  | "creek_clubhouse.supplies_collected"
  | "creek_clubhouse.built"
  | "creek_clubhouse.secret_knock"
  | "paper_airplane_relay.started"
  | "paper_airplane_relay.advice_gathered"
  | "paper_airplane_relay.materials_found"
  | "paper_airplane_relay.plane_folded"
  | "paper_airplane_relay.flight_chased"
  | "paper_airplane_relay.message_decoded"
  | "paper_airplane_relay.message_delivered"
  | "bent_creek_caddy_caper.started"
  | "bent_creek_caddy_caper.clues_followed"
  | "bent_creek_caddy_caper.gates_putted"
  | "bent_creek_caddy_caper.trophy_found"
  | "bent_creek_caddy_caper.complete";

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

export interface BonfireQuestState {
  stage: BonfireQuestStage;
}

export interface CreekClubhouseQuestState {
  stage: CreekClubhouseStage;
  design: ClubhouseDesign | null;
  supplies: ClubhouseSupply[];
  constructionStep: number;
  knockBeats: number[];
}

export interface PaperAirplaneRelayQuestState {
  stage: PaperAirplaneRelayStage;
  adviceIds: PaperAirplaneAdvisor[];
  materialIds: PaperAirplaneMaterial[];
  windHits: number;
  decoded: boolean;
  deliveredTo: "andrew" | null;
}

export interface BentCreekCaddyCaperQuestState {
  stage: BentCreekCaddyCaperStage;
  clueIndex: 0 | 1 | 2 | 3;
  puttGates: 0 | 1 | 2 | 3;
  sprinklerIndex: 0 | 1 | 2 | 3;
  bestRematchScore: number | null;
}

export interface QuestProgress {
  missingControllerStage: MissingControllerStage;
  mushrooms: MushroomQuestState;
  sports: SportsQuestState;
  ryanRide: RyanRideQuestState;
  exploreBentCreek: ExploreBentCreekQuestState;
  bonfire: BonfireQuestState;
  creekClubhouse: CreekClubhouseQuestState;
  paperAirplaneRelay: PaperAirplaneRelayQuestState;
  bentCreekCaddyCaper: BentCreekCaddyCaperQuestState;
}

export interface PlayerSettings {
  masterVolume: number;
  muted: boolean;
  textSize: "small" | "medium" | "large";
  reducedMotion: boolean;
}

export interface SaveData {
  version: 9;
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

/**
 * Scene-facing projection. Derived/runtime fields are never serialized.
 *
 * replayQuestId exists only while a temporary quest replay is running. It
 * deliberately does not belong to SaveData: a reload must resume the
 * canonical adventure, rather than a disposable replay snapshot.
 */
export interface GameState extends SaveData {
  readonly questStage: QuestStage;
  readonly replayQuestId: QuestId | null;
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
