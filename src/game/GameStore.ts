import { createMushroomSpawns, repairMushroomSpawnLayout } from "../content/mushrooms";
import { getItemDefinition, isItemId } from "../content/items";
import {
  advanceMissingControllerStage,
  advanceMushroomStage,
  advanceExploreBentCreekStage,
  advanceBonfireQuestStage,
  advancePaperAirplaneRelayStage,
  advanceRyanRideStage,
  IMPLEMENTED_QUEST_IDS,
  MUSHROOM_COUNT,
  QUEST_MILESTONES,
  isStageForQuest,
  milestonesForQuestStage,
  type PaperAirplaneRelayEvent,
} from "./quests/specs";
import { QUEST_COMPLETION_REWARDS } from "./quests/completionRewards";
import {
  migrateLegacyMissingControllerStage,
  progressAtStage,
  stageFromProgress,
  validateSaveInvariants,
  validateQuestProgress,
} from "./persistence/questState";
import { decodePersistedJson, isValidTimestamp } from "./persistence/decoder";
import { EVENT, gameEvents } from "./events";
import type { CloudSaveRepository, CloudSaveState } from "../platform/CloudSaveRepository";
import { MAP_IDS } from "./types";
import type {
  ChapterId,
  GameState,
  MapId,
  ItemId,
  InventoryStack,
  EquipmentState,
  MissingControllerStage,
  ExploreBentCreekStage,
  BonfireQuestStage,
  BentCreekCaddyCaperQuestState,
  CreekClubhouseQuestState,
  MushroomQuestStage,
  MushroomSpawn,
  PlayerSettings,
  QuestId,
  QuestMilestone,
  QuestProgress,
  QuestStage,
  SaveData,
  PlayerMapLocation,
  PlayerProfile,
  PaperAirplaneRelayQuestState,
  SportsQuestStage,
  RyanRideStage,
  RideDestination,
  SpawnIntent,
} from "./types";

const STORAGE_KEY = "milton-estates-save";
const LEGACY_CONTROLLER_ITEMS = new Set(["xbox-controller", "xbox controller"]);
const MICKEY_DRAG_RACE_INTRO = "mickey_drag_race.intro_seen";
const MICKEY_DRAG_RACE_BEATEN = "mickey_drag_race.beaten";
const MICKEY_DRAG_RACE_BEST_PREFIX = "mickey_drag_race.best_ms:";
export const CONTROLLER_ITEM = "xbox_controller";
export { MUSHROOM_COUNT } from "./quests/specs";

const LEGACY_QUEST_MILESTONES: readonly QuestMilestone[] = QUEST_MILESTONES.slice(0, 5);
const LEGACY_QUEST_IDS: readonly QuestId[] = [
  "missing_controller", "storm_drain_detectives", "creek_token_hunt", "last_day_of_summer",
];
const LEGACY_MAP_IDS = ["neighborhood", "creek"] as const;
const BASE_UNLOCKED_MAPS: readonly MapId[] = ["neighborhood", "creek"];
const RYAN_UNLOCKED_MAPS: readonly MapId[] = [
  "stonehenge",
  "reidenbaugh",
  "fruitville_pike",
  "bent_creek",
];
const DEFAULT_MUSHROOM_SEED = 0x4d455354;

const DEFAULT_SETTINGS: PlayerSettings = {
  masterVolume: 1,
  muted: false,
  textSize: "medium",
  reducedMotion: false,
};

const DEFAULT_EQUIPMENT: EquipmentState = { transport: null };
const DEFAULT_LAST_KNOWN_LOCATION: PlayerMapLocation = {
  map: "neighborhood",
  x: 560 / 1440,
  y: 656 / 1088,
};

function createQuestProgress(seed = DEFAULT_MUSHROOM_SEED): QuestProgress {
  return {
    missingControllerStage: "talk_to_billy",
    mushrooms: {
      stage: "talk_to_andrew_for_mushrooms",
      spawns: createMushroomSpawns(seed),
      collectedIds: [],
    },
    sports: { stage: "meet_jeremy_to_skateboard" },
    ryanRide: { stage: "invite", selectedDestination: null, routeSeed: null },
    exploreBentCreek: { stage: "open_gate" },
    bonfire: { stage: "talk_to_schwartz" },
    creekClubhouse: {
      stage: "talk_to_andrew",
      design: null,
      supplies: [],
      constructionStep: 0,
      knockBeats: [],
    },
    paperAirplaneRelay: {
      stage: "ask_for_advice",
      adviceIds: [],
      materialIds: [],
      windHits: 0,
      decoded: false,
      deliveredTo: null,
    },
    bentCreekCaddyCaper: {
      stage: "inspect_display",
      clueIndex: 0,
      puttGates: 0,
      sprinklerIndex: 0,
      bestRematchScore: null,
    },
  };
}

function createDefaultSave(seed = DEFAULT_MUSHROOM_SEED): SaveData {
  return {
    version: 9,
    activeChapterId: "chapter_1",
    activeQuestId: "missing_controller",
    completedChapterIds: [],
    completedQuestIds: [],
    questProgress: createQuestProgress(seed),
    questHistory: [],
    inventory: [],
    equipment: { ...DEFAULT_EQUIPMENT },
    collectedPickupIds: [],
    lastKnownLocation: { ...DEFAULT_LAST_KNOWN_LOCATION },
    secrets: [],
    currentMap: "neighborhood",
    discoveredMaps: ["neighborhood"],
    unlockedMaps: ["neighborhood", "creek"],
    settings: { ...DEFAULT_SETTINGS },
    lastSavedAt: null,
  };
}

/**
 * A deliberately clean schema for Game Lab slots. Browser v1-v8 payloads are
 * never fed into this decoder or uploaded to the service.
 */
export interface MiltonCloudSave extends Omit<SaveData, "version" | "lastSavedAt"> {
  schema: "milton-estates";
  schemaVersion: 1;
  introSeen: boolean;
  houseStorage: InventoryStack[];
}

const DEFAULT_SAVE = createDefaultSave();

type LegacyMissingControllerStage = MissingControllerStage | "search_yards";

type SaveDataV2 = {
  version: 2;
  questStage: LegacyMissingControllerStage;
  questHistory: QuestMilestone[];
  inventory: string[];
  secrets: string[];
  currentMap: "neighborhood" | "creek";
  discoveredMaps: ("neighborhood" | "creek")[];
  settings: PlayerSettings;
  lastSavedAt: string | null;
};

type SaveDataV3 = Omit<SaveData, "version" | "questProgress" | "inventory" | "equipment" | "collectedPickupIds" | "lastKnownLocation"> & {
  version: 3;
  questStage: LegacyMissingControllerStage;
  inventory: string[];
};

type LegacyQuestProgress = Omit<QuestProgress, "missingControllerStage" | "ryanRide" | "exploreBentCreek"> & {
  missingControllerStage: LegacyMissingControllerStage;
};

type SaveDataV4 = Omit<SaveData, "version" | "questProgress" | "inventory" | "equipment" | "collectedPickupIds" | "lastKnownLocation"> & {
  version: 4;
  questStage: QuestStage | "search_yards";
  questProgress: LegacyQuestProgress;
  inventory: string[];
};
type SaveDataV5 = Omit<SaveData, "version" | "questProgress" | "inventory" | "unlockedMaps" | "equipment" | "collectedPickupIds" | "lastKnownLocation"> & {
  version: 5;
  questProgress: Omit<QuestProgress, "ryanRide" | "exploreBentCreek">;
  inventory: string[];
};

type SaveDataV6MapId = "neighborhood" | "creek" | "reidenbaugh_road" | "reidenbaugh";
type SaveDataV6RyanRideStage = Exclude<RyanRideStage, "ride_stonehenge"> | "ride_reidenbaugh_road";
type SaveDataV6QuestProgress = Omit<QuestProgress, "mushrooms" | "ryanRide" | "exploreBentCreek"> & {
  mushrooms: Omit<QuestProgress["mushrooms"], "spawns"> & {
    spawns: Array<Omit<MushroomSpawn, "map"> & { map: SaveDataV6MapId }>;
  };
  ryanRide: Omit<QuestProgress["ryanRide"], "stage"> & { stage: SaveDataV6RyanRideStage };
};
type SaveDataV6 = Omit<SaveData, "version" | "questProgress" | "inventory" | "currentMap" | "discoveredMaps" | "unlockedMaps" | "equipment" | "collectedPickupIds" | "lastKnownLocation"> & {
  version: 6;
  questProgress: SaveDataV6QuestProgress;
  currentMap: SaveDataV6MapId;
  discoveredMaps: SaveDataV6MapId[];
  unlockedMaps: SaveDataV6MapId[];
  inventory: string[];
};

type SaveDataV7 = Omit<SaveData, "version" | "inventory" | "equipment" | "collectedPickupIds" | "lastKnownLocation"> & {
  version: 7;
  inventory: string[];
};

type SaveDataV8 = Omit<SaveData, "version" | "questProgress"> & {
  version: 8;
  questProgress: Omit<QuestProgress, "bonfire"> & { bonfire?: QuestProgress["bonfire"] };
};

type NormalizableSave = Omit<SaveData, "version" | "inventory" | "equipment" | "collectedPickupIds" | "lastKnownLocation" | "questProgress"> & {
  version: 7 | 8 | 9;
  inventory: readonly (InventoryStack | string)[];
  equipment?: EquipmentState;
  collectedPickupIds?: string[];
  lastKnownLocation?: PlayerMapLocation;
  questProgress: Omit<QuestProgress, "bonfire" | "creekClubhouse" | "paperAirplaneRelay" | "bentCreekCaddyCaper"> & {
    bonfire?: QuestProgress["bonfire"];
    creekClubhouse?: QuestProgress["creekClubhouse"];
    paperAirplaneRelay?: QuestProgress["paperAirplaneRelay"];
    bentCreekCaddyCaper?: QuestProgress["bentCreekCaddyCaper"];
  };
};

type LegacySaveData = Omit<SaveDataV2, "version" | "questHistory" | "discoveredMaps" | "settings" | "lastSavedAt"> & {
  version: 1;
};

function copyQuestProgress(progress: QuestProgress): QuestProgress {
  return {
    missingControllerStage: progress.missingControllerStage,
    mushrooms: {
      stage: progress.mushrooms.stage,
      spawns: progress.mushrooms.spawns.map((spawn) => ({ ...spawn })),
      collectedIds: [...progress.mushrooms.collectedIds],
    },
    sports: { stage: progress.sports.stage },
    ryanRide: { ...progress.ryanRide },
    exploreBentCreek: { ...progress.exploreBentCreek },
    bonfire: { ...progress.bonfire },
    creekClubhouse: {
      ...progress.creekClubhouse,
      supplies: [...progress.creekClubhouse.supplies],
      knockBeats: [...progress.creekClubhouse.knockBeats],
    },
    paperAirplaneRelay: {
      ...progress.paperAirplaneRelay,
      adviceIds: [...progress.paperAirplaneRelay.adviceIds],
      materialIds: [...progress.paperAirplaneRelay.materialIds],
    },
    bentCreekCaddyCaper: { ...progress.bentCreekCaddyCaper },
  };
}

function copySave(save: SaveData): SaveData {
  return {
    ...save,
    completedChapterIds: [...save.completedChapterIds],
    completedQuestIds: [...save.completedQuestIds],
    questProgress: copyQuestProgress(save.questProgress),
    questHistory: [...save.questHistory],
    inventory: save.inventory.map((stack) => ({ ...stack })),
    equipment: { ...save.equipment },
    collectedPickupIds: [...save.collectedPickupIds],
    lastKnownLocation: { ...save.lastKnownLocation },
    secrets: [...save.secrets],
    discoveredMaps: [...save.discoveredMaps],
    unlockedMaps: [...save.unlockedMaps],
    settings: { ...save.settings },
  };
}

function toCloudSave(save: SaveData, introSeen: boolean, houseStorage: readonly InventoryStack[]): MiltonCloudSave {
  const { version: _version, lastSavedAt: _lastSavedAt, ...state } = copySave(save);
  return {
    ...state,
    schema: "milton-estates",
    schemaVersion: 1,
    introSeen,
    houseStorage: houseStorage.map((stack) => ({ ...stack })),
  };
}

function isMiltonCloudSave(value: unknown): value is MiltonCloudSave {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<MiltonCloudSave>;
  if (candidate.schema !== "milton-estates" || candidate.schemaVersion !== 1
    || typeof candidate.introSeen !== "boolean" || !isInventoryStackArray(candidate.houseStorage)) return false;
  return isSaveData({ ...candidate, version: 9, lastSavedAt: null });
}

function toGameState(save: SaveData): GameState {
  const copy = copySave(save);
  const questStage = stageFromProgress(copy.questProgress, copy.activeQuestId);
  if (!questStage) throw new RangeError(`Quest ${copy.activeQuestId} has no runtime stage`);
  return { ...copy, questStage };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function normalizeInventory(inventory: readonly (InventoryStack | string)[]): InventoryStack[] {
  const quantities = new Map<ItemId, number>();
  for (const entry of inventory) {
    const itemId = typeof entry === "string"
      ? LEGACY_CONTROLLER_ITEMS.has(entry) ? CONTROLLER_ITEM : isItemId(entry) ? entry : undefined
      : entry.itemId;
    if (!itemId) continue;
    const quantity = typeof entry === "string" ? 1 : entry.quantity;
    if (!Number.isInteger(quantity) || quantity <= 0) continue;
    const limit = getItemDefinition(itemId).stackLimit;
    quantities.set(itemId, Math.min(limit, (quantities.get(itemId) ?? 0) + quantity));
  }
  return [...quantities].map(([itemId, quantity]) => ({ itemId, quantity }));
}

function addToInventory(inventory: readonly InventoryStack[], itemId: ItemId, quantity: number): InventoryStack[] | undefined {
  if (!isItemId(itemId) || !Number.isInteger(quantity) || quantity <= 0) return undefined;
  const next = inventory.map((stack) => ({ ...stack }));
  const definition = getItemDefinition(itemId);
  let remaining = quantity;
  const existing = next.find((stack) => stack.itemId === itemId);
  if (existing) {
    const room = definition.stackLimit - existing.quantity;
    const added = Math.min(room, remaining);
    existing.quantity += added;
    remaining -= added;
  }
  if (remaining > 0 && next.length < Number.POSITIVE_INFINITY) {
    // Item definitions currently have a single stack per item. Keeping this
    // branch explicit makes the stack limit the only capacity rule to revisit
    // when a future item needs multiple stacks.
    if (definition.stackLimit < remaining) return undefined;
    next.push({ itemId, quantity: remaining });
    remaining = 0;
  }
  return remaining === 0 ? next : undefined;
}

/** Adds the durable rewards for a completed quest without duplicating stacks. */
function grantQuestCompletionRewards(
  inventory: readonly InventoryStack[],
  secrets: readonly string[],
  questId: QuestId,
): Pick<SaveData, "inventory" | "secrets"> {
  const reward = QUEST_COMPLETION_REWARDS[questId as keyof typeof QUEST_COMPLETION_REWARDS];
  if (!reward) return { inventory: [...inventory], secrets: [...secrets] };
  let nextInventory = inventory.map((stack) => ({ ...stack }));
  for (const itemId of reward.items) {
    if (nextInventory.some((stack) => stack.itemId === itemId)) continue;
    nextInventory = addToInventory(nextInventory, itemId, 1) ?? nextInventory;
  }
  return { inventory: nextInventory, secrets: unique([...secrets, ...reward.secrets]) };
}

function removeFromInventory(inventory: readonly InventoryStack[], itemId: ItemId, quantity: number): InventoryStack[] | undefined {
  if (!isItemId(itemId) || !Number.isInteger(quantity) || quantity <= 0) return undefined;
  const next = inventory.map((stack) => ({ ...stack }));
  const stack = next.find((entry) => entry.itemId === itemId);
  if (!stack || stack.quantity < quantity) return undefined;
  stack.quantity -= quantity;
  return stack.quantity === 0 ? next.filter((entry) => entry !== stack) : next;
}

/** Quest-critical items remain carried so storage cannot strand a save. */
export function isStorageRestrictedItem(itemId: ItemId): boolean {
  return itemId === "xbox_controller" || itemId === "field_token";
}

export interface StorageTransferResult {
  inventory: InventoryStack[];
  houseStorage: InventoryStack[];
}

/** Pure, bounded inventory transfer used by home storage and tests. */
export function transferInventoryToStorage(
  inventory: readonly InventoryStack[], houseStorage: readonly InventoryStack[], itemId: ItemId, quantity: number,
): StorageTransferResult | undefined {
  if (isStorageRestrictedItem(itemId)) return undefined;
  const nextInventory = removeFromInventory(inventory, itemId, quantity);
  const nextStorage = addToInventory(houseStorage, itemId, quantity);
  return nextInventory && nextStorage ? { inventory: nextInventory, houseStorage: nextStorage } : undefined;
}

export function transferStorageToInventory(
  inventory: readonly InventoryStack[], houseStorage: readonly InventoryStack[], itemId: ItemId, quantity: number,
): StorageTransferResult | undefined {
  const nextStorage = removeFromInventory(houseStorage, itemId, quantity);
  const nextInventory = addToInventory(inventory, itemId, quantity);
  return nextStorage && nextInventory ? { inventory: nextInventory, houseStorage: nextStorage } : undefined;
}

function historyForQuestStage(questId: QuestId, stage: QuestStage): QuestMilestone[] {
  return milestonesForQuestStage(questId, stage);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isInventoryStack(value: unknown): value is InventoryStack {
  if (typeof value !== "object" || value === null) return false;
  const stack = value as Partial<InventoryStack>;
  return isItemId(stack.itemId) && typeof stack.quantity === "number"
    && Number.isInteger(stack.quantity) && stack.quantity > 0
    && stack.quantity <= getItemDefinition(stack.itemId).stackLimit;
}

function isInventoryStackArray(value: unknown): value is InventoryStack[] {
  return Array.isArray(value) && value.every(isInventoryStack);
}

function isEquipmentState(value: unknown): value is EquipmentState {
  if (typeof value !== "object" || value === null) return false;
  return (value as Partial<EquipmentState>).transport === null
    || (value as Partial<EquipmentState>).transport === "bicycle";
}

function isPlayerMapLocation(value: unknown): value is PlayerMapLocation {
  if (typeof value !== "object" || value === null) return false;
  const location = value as Partial<PlayerMapLocation>;
  return isMapId(location.map)
    && typeof location.x === "number" && Number.isFinite(location.x) && location.x >= 0 && location.x <= 1
    && typeof location.y === "number" && Number.isFinite(location.y) && location.y >= 0 && location.y <= 1;
}

function isEnumArray<T extends string>(value: unknown, allowed: readonly T[]): value is T[] {
  return Array.isArray(value) && value.every((item) => allowed.some((candidate) => candidate === item));
}

function isQuestStage(value: unknown): value is QuestStage {
  return IMPLEMENTED_QUEST_IDS.some((questId) => isStageForQuest(questId, value));
}

function isMissingControllerStage(value: unknown): value is MissingControllerStage {
  return isStageForQuest("missing_controller", value);
}

function isLegacyMissingControllerStage(value: unknown): value is LegacyMissingControllerStage {
  return value === "search_yards" || isMissingControllerStage(value);
}

function isMushroomQuestStage(value: unknown): value is MushroomQuestStage {
  return isStageForQuest("andrew_mushroom_hunt", value);
}

function isSportsQuestStage(value: unknown): value is SportsQuestStage {
  return isStageForQuest("three_player_sports", value);
}
function isRyanRideStage(value: unknown): value is RyanRideStage { return isStageForQuest("catch_ryan", value); }
function isExploreBentCreekStage(value: unknown): value is ExploreBentCreekStage {
  return isStageForQuest("explore_bent_creek", value);
}
function isBonfireQuestStage(value: unknown): value is BonfireQuestStage {
  return isStageForQuest("attend_bonfire_at_andrews", value);
}
function isCreekClubhouseQuestState(value: unknown): value is CreekClubhouseQuestState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<CreekClubhouseQuestState>;
  return isStageForQuest("creek_clubhouse", state.stage)
    && (state.design === null || state.design === "lookout" || state.design === "fort" || state.design === "hidden_den")
    && Array.isArray(state.supplies)
    && state.supplies.every((supply) => supply === "rope" || supply === "blanket" || supply === "branches")
    && new Set(state.supplies).size === state.supplies.length
    && typeof state.constructionStep === "number" && Number.isInteger(state.constructionStep)
    && state.constructionStep >= 0 && state.constructionStep <= 3
    && Array.isArray(state.knockBeats)
    && state.knockBeats.every((beat) => typeof beat === "number" && Number.isInteger(beat) && beat >= 0 && beat <= 9);
}
function isPaperAirplaneRelayQuestState(value: unknown): value is PaperAirplaneRelayQuestState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<PaperAirplaneRelayQuestState>;
  const advisors = ["ryan", "billy", "andrew"] as const;
  const materials = ["clean_sheet", "card_wing", "message_strip"] as const;
  return isStageForQuest("paper_airplane_relay", state.stage)
    && Array.isArray(state.adviceIds) && state.adviceIds.every((id) => advisors.includes(id as typeof advisors[number]))
    && new Set(state.adviceIds).size === state.adviceIds.length
    && Array.isArray(state.materialIds) && state.materialIds.every((id) => materials.includes(id as typeof materials[number]))
    && new Set(state.materialIds).size === state.materialIds.length
    && typeof state.windHits === "number" && Number.isInteger(state.windHits) && state.windHits >= 0 && state.windHits <= 3
    && typeof state.decoded === "boolean"
    && (state.deliveredTo === null || state.deliveredTo === "andrew");
}
function isBentCreekCaddyCaperQuestState(value: unknown): value is BentCreekCaddyCaperQuestState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<BentCreekCaddyCaperQuestState>;
  const isCounter = (candidate: unknown): candidate is 0 | 1 | 2 | 3 =>
    candidate === 0 || candidate === 1 || candidate === 2 || candidate === 3;
  return isStageForQuest("bent_creek_caddy_caper", state.stage)
    && isCounter(state.clueIndex) && isCounter(state.puttGates) && isCounter(state.sprinklerIndex)
    && (state.bestRematchScore === null || (typeof state.bestRematchScore === "number"
      && Number.isInteger(state.bestRematchScore) && state.bestRematchScore > 0));
}
function isSaveDataV6RyanRideStage(value: unknown): value is SaveDataV6RyanRideStage {
  return value === "invite" || value === "choose_destination" || value === "depart_neighborhood"
    || value === "ride_reidenbaugh_road" || value === "chase_reidenbaugh" || value === "complete";
}
function isRideDestination(value: unknown): value is RideDestination { return value === "reidenbaugh"; }

function isMapId(value: unknown): value is MapId {
  return MAP_IDS.some((mapId) => mapId === value);
}

function isLegacyMapId(value: unknown): value is (typeof LEGACY_MAP_IDS)[number] {
  return LEGACY_MAP_IDS.some((mapId) => mapId === value);
}

function isSaveDataV6MapId(value: unknown): value is SaveDataV6MapId {
  return value === "neighborhood" || value === "creek"
    || value === "reidenbaugh_road" || value === "reidenbaugh";
}

function isChapterId(value: unknown): value is ChapterId {
  return value === "chapter_1";
}

function isQuestId(value: unknown): value is QuestId {
  return value === "missing_controller" || value === "andrew_mushroom_hunt"
    || value === "three_player_sports" || value === "storm_drain_detectives"
    || value === "catch_ryan"
    || value === "explore_bent_creek"
    || value === "attend_bonfire_at_andrews"
    || value === "creek_clubhouse"
    || value === "paper_airplane_relay"
    || value === "bent_creek_caddy_caper"
    || value === "creek_token_hunt" || value === "last_day_of_summer";
}

function isSettings(value: unknown): value is PlayerSettings {
  if (typeof value !== "object" || value === null) return false;
  const settings = value as Partial<PlayerSettings>;
  return typeof settings.masterVolume === "number" && settings.masterVolume >= 0 && settings.masterVolume <= 1
    && typeof settings.muted === "boolean"
    && (settings.textSize === "small" || settings.textSize === "medium" || settings.textSize === "large")
    && typeof settings.reducedMotion === "boolean";
}

function isMushroomSpawn(value: unknown): value is MushroomSpawn {
  if (typeof value !== "object" || value === null) return false;
  const spawn = value as Partial<MushroomSpawn>;
  return typeof spawn.id === "string" && isMapId(spawn.map)
    && typeof spawn.x === "number" && Number.isFinite(spawn.x)
    && typeof spawn.y === "number" && Number.isFinite(spawn.y);
}

function isSaveDataV6MushroomSpawn(
  value: unknown,
): value is SaveDataV6QuestProgress["mushrooms"]["spawns"][number] {
  if (typeof value !== "object" || value === null) return false;
  const spawn = value as { id?: unknown; map?: unknown; x?: unknown; y?: unknown };
  return typeof spawn.id === "string" && isSaveDataV6MapId(spawn.map)
    && typeof spawn.x === "number" && Number.isFinite(spawn.x)
    && typeof spawn.y === "number" && Number.isFinite(spawn.y);
}

function isQuestProgress(value: unknown): value is QuestProgress {
  if (typeof value !== "object" || value === null) return false;
  const progress = value as Partial<QuestProgress>;
  const mushrooms = progress.mushrooms as Partial<QuestProgress["mushrooms"]> | undefined;
  const sports = progress.sports as Partial<QuestProgress["sports"]> | undefined;
  const ryanRide = progress.ryanRide as Partial<QuestProgress["ryanRide"]> | undefined;
  const exploreBentCreek = progress.exploreBentCreek as Partial<QuestProgress["exploreBentCreek"]> | undefined;
  const bonfire = progress.bonfire as Partial<QuestProgress["bonfire"]> | undefined;
  const creekClubhouse = progress.creekClubhouse as Partial<QuestProgress["creekClubhouse"]> | undefined;
  const paperAirplaneRelay = progress.paperAirplaneRelay as Partial<QuestProgress["paperAirplaneRelay"]> | undefined;
  const bentCreekCaddyCaper = progress.bentCreekCaddyCaper as Partial<QuestProgress["bentCreekCaddyCaper"]> | undefined;
  return isMissingControllerStage(progress.missingControllerStage)
    && typeof mushrooms === "object" && mushrooms !== null
    && isMushroomQuestStage(mushrooms.stage)
    && Array.isArray(mushrooms.spawns) && mushrooms.spawns.every(isMushroomSpawn)
    && isStringArray(mushrooms.collectedIds)
    && typeof sports === "object" && sports !== null
    && isSportsQuestStage(sports.stage)
    && typeof ryanRide === "object" && ryanRide !== null
    && isRyanRideStage(ryanRide.stage)
    && (ryanRide.selectedDestination === null || isRideDestination(ryanRide.selectedDestination))
    && (ryanRide.routeSeed === null || (typeof ryanRide.routeSeed === "number" && Number.isFinite(ryanRide.routeSeed)))
    // V7 saves predate this additive quest state; normalizeQuestProgress fills
    // that field before any invariants are evaluated.
    && (exploreBentCreek === undefined
      || (typeof exploreBentCreek === "object" && exploreBentCreek !== null && isExploreBentCreekStage(exploreBentCreek.stage)))
    // V8 saves predate this additive quest state; normalizeQuestProgress fills
    // it before any invariants are evaluated.
    && (bonfire === undefined
      || (typeof bonfire === "object" && bonfire !== null && isBonfireQuestStage(bonfire.stage)))
    // V9 saves predate the three additive side-quest records. Missing records
    // are repaired by normalizeQuestProgress before invariants are evaluated.
    && (creekClubhouse === undefined || isCreekClubhouseQuestState(creekClubhouse))
    && (paperAirplaneRelay === undefined || isPaperAirplaneRelayQuestState(paperAirplaneRelay))
    && (bentCreekCaddyCaper === undefined || isBentCreekCaddyCaperQuestState(bentCreekCaddyCaper));
}

function isSaveDataV6QuestProgress(value: unknown): value is SaveDataV6QuestProgress {
  if (typeof value !== "object" || value === null) return false;
  const progress = value as Partial<SaveDataV6QuestProgress>;
  const mushrooms = progress.mushrooms as Partial<SaveDataV6QuestProgress["mushrooms"]> | undefined;
  const sports = progress.sports as Partial<QuestProgress["sports"]> | undefined;
  const ryanRide = progress.ryanRide as Partial<SaveDataV6QuestProgress["ryanRide"]> | undefined;
  return isMissingControllerStage(progress.missingControllerStage)
    && typeof mushrooms === "object" && mushrooms !== null
    && isMushroomQuestStage(mushrooms.stage)
    && Array.isArray(mushrooms.spawns) && mushrooms.spawns.every(isSaveDataV6MushroomSpawn)
    && isStringArray(mushrooms.collectedIds)
    && typeof sports === "object" && sports !== null
    && isSportsQuestStage(sports.stage)
    && typeof ryanRide === "object" && ryanRide !== null
    && isSaveDataV6RyanRideStage(ryanRide.stage)
    && (ryanRide.selectedDestination === null || isRideDestination(ryanRide.selectedDestination))
    && (ryanRide.routeSeed === null || (typeof ryanRide.routeSeed === "number" && Number.isFinite(ryanRide.routeSeed)));
}

function isLegacySave(value: unknown): value is LegacySaveData {
  if (typeof value !== "object" || value === null) return false;
  const save = value as Partial<LegacySaveData>;
  return save.version === 1 && isLegacyMissingControllerStage(save.questStage) && isStringArray(save.inventory)
    && isStringArray(save.secrets) && isLegacyMapId(save.currentMap);
}

function isSaveDataV2(value: unknown): value is SaveDataV2 {
  if (typeof value !== "object" || value === null) return false;
  const save = value as Partial<SaveDataV2>;
  return save.version === 2 && isLegacyMissingControllerStage(save.questStage)
    && isEnumArray(save.questHistory, LEGACY_QUEST_MILESTONES)
    && isStringArray(save.inventory) && isStringArray(save.secrets)
    && isLegacyMapId(save.currentMap) && isEnumArray(save.discoveredMaps, LEGACY_MAP_IDS)
    && isSettings(save.settings)
    && (save.lastSavedAt === null || isValidTimestamp(save.lastSavedAt));
}

function isSaveDataV3(value: unknown): value is SaveDataV3 {
  if (typeof value !== "object" || value === null) return false;
  const save = value as Partial<SaveDataV3>;
  return save.version === 3 && isChapterId(save.activeChapterId)
    && isEnumArray(save.completedChapterIds, ["chapter_1"] as const)
    && isEnumArray(save.completedQuestIds, LEGACY_QUEST_IDS)
    && isQuestId(save.activeQuestId) && LEGACY_QUEST_IDS.includes(save.activeQuestId)
    && isLegacyMissingControllerStage(save.questStage)
    && isEnumArray(save.questHistory, LEGACY_QUEST_MILESTONES)
    && isStringArray(save.inventory) && isStringArray(save.secrets)
    && isLegacyMapId(save.currentMap) && isEnumArray(save.discoveredMaps, LEGACY_MAP_IDS)
    && isSettings(save.settings)
    && (save.lastSavedAt === null || isValidTimestamp(save.lastSavedAt));
}

function isSaveDataV4(value: unknown): value is SaveDataV4 {
  if (typeof value !== "object" || value === null) return false;
  const save = value as Partial<SaveDataV4>;
  return save.version === 4 && isChapterId(save.activeChapterId) && isQuestId(save.activeQuestId)
    && isEnumArray(save.completedChapterIds, ["chapter_1"] as const)
    && isEnumArray(save.completedQuestIds, [
      "missing_controller", "andrew_mushroom_hunt", "three_player_sports",
      "storm_drain_detectives", "creek_token_hunt", "last_day_of_summer",
    ] as const)
    && (isQuestStage(save.questStage) || save.questStage === "search_yards")
    && isLegacyQuestProgress(save.questProgress)
    && isEnumArray(save.questHistory, QUEST_MILESTONES)
    && isStringArray(save.inventory) && isStringArray(save.secrets)
    && isLegacyMapId(save.currentMap) && isEnumArray(save.discoveredMaps, LEGACY_MAP_IDS)
    && isSettings(save.settings)
    && (save.lastSavedAt === null || isValidTimestamp(save.lastSavedAt));
}


function isLegacyQuestProgress(value: unknown): value is LegacyQuestProgress {
  if (typeof value !== "object" || value === null) return false;
  const progress = value as Partial<LegacyQuestProgress>;
  const mushrooms = progress.mushrooms as Partial<QuestProgress["mushrooms"]> | undefined;
  const sports = progress.sports as Partial<QuestProgress["sports"]> | undefined;
  return isLegacyMissingControllerStage(progress.missingControllerStage)
    && typeof mushrooms === "object" && mushrooms !== null
    && isMushroomQuestStage(mushrooms.stage)
    && Array.isArray(mushrooms.spawns) && mushrooms.spawns.every(isMushroomSpawn)
    && isStringArray(mushrooms.collectedIds)
    && typeof sports === "object" && sports !== null
    && isSportsQuestStage(sports.stage);
}

function isSaveDataV5(value: unknown): value is SaveDataV5 {
  if (typeof value !== "object" || value === null) return false;
  const save = value as Partial<SaveDataV5>;
  return save.version === 5 && isChapterId(save.activeChapterId) && isQuestId(save.activeQuestId)
    && isEnumArray(save.completedChapterIds, ["chapter_1"] as const)
    && isEnumArray(save.completedQuestIds, [
      "missing_controller", "andrew_mushroom_hunt", "three_player_sports",
      "storm_drain_detectives", "creek_token_hunt", "last_day_of_summer",
    ] as const)
    && isLegacyQuestProgress(save.questProgress)
    && isEnumArray(save.questHistory, QUEST_MILESTONES)
    && isStringArray(save.inventory) && isStringArray(save.secrets)
    && isLegacyMapId(save.currentMap) && isEnumArray(save.discoveredMaps, LEGACY_MAP_IDS)
    && isSettings(save.settings)
    && (save.lastSavedAt === null || isValidTimestamp(save.lastSavedAt));
}

function isSaveDataV6(value: unknown): value is SaveDataV6 {
  if (typeof value !== "object" || value === null) return false;
  const save = value as Partial<SaveDataV6>;
  return save.version === 6 && isChapterId(save.activeChapterId) && isQuestId(save.activeQuestId)
    && isEnumArray(save.completedChapterIds, ["chapter_1"] as const)
    && isEnumArray(save.completedQuestIds, ["missing_controller", "andrew_mushroom_hunt", "three_player_sports", "catch_ryan", "explore_bent_creek", "storm_drain_detectives", "creek_token_hunt", "last_day_of_summer"] as const)
    && isSaveDataV6QuestProgress(save.questProgress)
    && isEnumArray(save.questHistory, QUEST_MILESTONES)
    && isStringArray(save.inventory) && isStringArray(save.secrets)
    && isSaveDataV6MapId(save.currentMap)
    && isEnumArray(save.discoveredMaps, ["neighborhood", "creek", "reidenbaugh_road", "reidenbaugh"] as const)
    && isEnumArray(save.unlockedMaps, ["neighborhood", "creek", "reidenbaugh_road", "reidenbaugh"] as const)
    && isSettings(save.settings) && (save.lastSavedAt === null || isValidTimestamp(save.lastSavedAt));
}

function isSaveDataV7(value: unknown): value is SaveDataV7 {
  if (typeof value !== "object" || value === null) return false;
  const save = value as Partial<SaveDataV7>;
  return save.version === 7 && isChapterId(save.activeChapterId) && isQuestId(save.activeQuestId)
    && isEnumArray(save.completedChapterIds, ["chapter_1"] as const)
    && isEnumArray(save.completedQuestIds, ["missing_controller", "andrew_mushroom_hunt", "three_player_sports", "catch_ryan", "explore_bent_creek", "storm_drain_detectives", "creek_token_hunt", "last_day_of_summer"] as const)
    && isQuestProgress(save.questProgress)
    && isEnumArray(save.questHistory, QUEST_MILESTONES)
    && isStringArray(save.inventory) && isStringArray(save.secrets)
    && isMapId(save.currentMap) && isEnumArray(save.discoveredMaps, MAP_IDS)
    && isEnumArray(save.unlockedMaps, MAP_IDS)
    && isSettings(save.settings) && (save.lastSavedAt === null || isValidTimestamp(save.lastSavedAt));
}

function isSaveDataV8(value: unknown): value is SaveDataV8 {
  if (typeof value !== "object" || value === null) return false;
  const save = value as Partial<SaveDataV8>;
  return save.version === 8 && isChapterId(save.activeChapterId) && isQuestId(save.activeQuestId)
    && isEnumArray(save.completedChapterIds, ["chapter_1"] as const)
    && isEnumArray(save.completedQuestIds, ["missing_controller", "andrew_mushroom_hunt", "three_player_sports", "catch_ryan", "explore_bent_creek", "storm_drain_detectives", "creek_token_hunt", "last_day_of_summer"] as const)
    && isQuestProgress(save.questProgress)
    && isEnumArray(save.questHistory, QUEST_MILESTONES)
    && isInventoryStackArray(save.inventory) && isEquipmentState(save.equipment)
    && isStringArray(save.collectedPickupIds) && isPlayerMapLocation(save.lastKnownLocation)
    && isStringArray(save.secrets)
    && isMapId(save.currentMap) && isEnumArray(save.discoveredMaps, MAP_IDS)
    && isEnumArray(save.unlockedMaps, MAP_IDS)
    && isSettings(save.settings) && (save.lastSavedAt === null || isValidTimestamp(save.lastSavedAt));
}

function isSaveData(value: unknown): value is SaveData {
  if (typeof value !== "object" || value === null) return false;
  const save = value as Partial<SaveData>;
  return save.version === 9 && isChapterId(save.activeChapterId) && isQuestId(save.activeQuestId)
    && isEnumArray(save.completedChapterIds, ["chapter_1"] as const)
    && isEnumArray(save.completedQuestIds, [
      "missing_controller", "andrew_mushroom_hunt", "three_player_sports", "catch_ryan", "explore_bent_creek",
      "attend_bonfire_at_andrews", "creek_clubhouse", "paper_airplane_relay", "bent_creek_caddy_caper",
      "storm_drain_detectives", "creek_token_hunt", "last_day_of_summer",
    ] as const)
    && isQuestProgress(save.questProgress)
    && isEnumArray(save.questHistory, QUEST_MILESTONES)
    && isInventoryStackArray(save.inventory) && isEquipmentState(save.equipment)
    && isStringArray(save.collectedPickupIds) && isPlayerMapLocation(save.lastKnownLocation)
    && isStringArray(save.secrets)
    && isMapId(save.currentMap) && isEnumArray(save.discoveredMaps, MAP_IDS)
    && isEnumArray(save.unlockedMaps, MAP_IDS)
    && isSettings(save.settings) && (save.lastSavedAt === null || isValidTimestamp(save.lastSavedAt));
}

function normalizeQuestProgress(progress: NormalizableSave["questProgress"]): QuestProgress {
  const spawns = repairMushroomSpawnLayout(progress.mushrooms.spawns)
    ?? createMushroomSpawns(DEFAULT_MUSHROOM_SEED);
  const validIds = new Set(spawns.map((spawn) => spawn.id));
  return {
    missingControllerStage: progress.missingControllerStage,
    mushrooms: {
      stage: progress.mushrooms.stage,
      spawns,
      collectedIds: unique(progress.mushrooms.collectedIds.filter((id) => validIds.has(id))),
    },
    sports: { stage: progress.sports.stage },
    ryanRide: { ...progress.ryanRide },
    exploreBentCreek: { stage: progress.exploreBentCreek?.stage ?? "open_gate" },
    bonfire: { stage: progress.bonfire?.stage ?? "talk_to_schwartz" },
    creekClubhouse: progress.creekClubhouse
      ? {
        ...progress.creekClubhouse,
        supplies: unique(progress.creekClubhouse.supplies),
        knockBeats: [...progress.creekClubhouse.knockBeats],
      }
      : { stage: "talk_to_andrew", design: null, supplies: [], constructionStep: 0, knockBeats: [] },
    paperAirplaneRelay: progress.paperAirplaneRelay
      ? {
        ...progress.paperAirplaneRelay,
        adviceIds: unique(progress.paperAirplaneRelay.adviceIds),
        materialIds: unique(progress.paperAirplaneRelay.materialIds),
      }
      : { stage: "ask_for_advice", adviceIds: [], materialIds: [], windHits: 0, decoded: false, deliveredTo: null },
    bentCreekCaddyCaper: progress.bentCreekCaddyCaper
      ? { ...progress.bentCreekCaddyCaper }
      : { stage: "inspect_display", clueIndex: 0, puttGates: 0, sprinklerIndex: 0, bestRematchScore: null },
  };
}

function normalizeSave(save: NormalizableSave): SaveData | undefined {
  const questProgress = normalizeQuestProgress(save.questProgress);
  // Older builds completed Bent Creek as soon as the gate opened. Reopen that
  // handoff for saves that have not started the bonfire quest yet.
  if (questProgress.exploreBentCreek.stage === "complete"
    && questProgress.bonfire.stage === "talk_to_schwartz"
    && !save.completedQuestIds.includes("attend_bonfire_at_andrews")) {
    questProgress.exploreBentCreek.stage = "meet_schwartz";
  }
  if (!IMPLEMENTED_QUEST_IDS.includes(save.activeQuestId as typeof IMPLEMENTED_QUEST_IDS[number])) return undefined;
  // Saves created while the Sports-to-Ryan handoff was being introduced can
  // legitimately record Sports as complete while still pointing at it as the
  // active quest. Reconcile that stale pointer on load so the new invitation
  // is immediately playable instead of remaining hidden in the journal.
  const shouldActivateRyan = save.activeQuestId === "three_player_sports"
    && save.completedQuestIds.includes("three_player_sports")
    && !save.completedQuestIds.includes("catch_ryan")
    && questProgress.ryanRide.stage === "invite";
  const shouldActivateBentCreek = save.activeQuestId === "catch_ryan"
    && save.completedQuestIds.includes("catch_ryan")
    && !save.completedQuestIds.includes("explore_bent_creek")
    && questProgress.ryanRide.stage === "complete";
  // Recoverable cases are normalized explicitly: duplicate scalar IDs,
  // missing map discovery, controller aliases, invalid mushroom layout, and a
  // missing completion flag when authoritative progress is already complete.
  const completedFromProgress = IMPLEMENTED_QUEST_IDS.filter((questId) =>
    stageFromProgress(questProgress, questId) === "complete");
  const completedQuestIds = unique<QuestId>([
    ...save.completedQuestIds.filter((questId) =>
      !(questId === "explore_bent_creek" && questProgress.exploreBentCreek.stage !== "complete")),
    ...completedFromProgress,
  ]);
  const discoveredMaps = unique<MapId>(["neighborhood", save.currentMap, ...save.discoveredMaps]);
  const regionalAccessGranted = questProgress.ryanRide.selectedDestination === "reidenbaugh"
    || questProgress.ryanRide.stage === "complete"
    || save.completedQuestIds.includes("catch_ryan");
  const unlockedMaps = unique<MapId>([
    ...BASE_UNLOCKED_MAPS,
    ...save.unlockedMaps,
    ...(regionalAccessGranted ? RYAN_UNLOCKED_MAPS : []),
  ]);
  if (!unlockedMaps.includes(save.currentMap) || discoveredMaps.some((map) => !unlockedMaps.includes(map))) return undefined;
  let inventory = normalizeInventory(save.inventory);
  if (questProgress.missingControllerStage !== "search_creek"
    && questProgress.missingControllerStage !== "return_to_jeremy") {
    inventory = inventory.filter((stack) => stack.itemId !== CONTROLLER_ITEM);
  }
  const catchRyanComplete = save.completedQuestIds.includes("catch_ryan")
    || questProgress.ryanRide.stage === "complete";
  if (catchRyanComplete && !inventory.some((stack) => stack.itemId === "bicycle")) {
    inventory.push({ itemId: "bicycle", quantity: 1 });
  }
  let secrets = unique(save.secrets);
  for (const questId of completedQuestIds) {
    ({ inventory, secrets } = grantQuestCompletionRewards(inventory, secrets, questId));
  }
  const normalized: SaveData = {
    ...save,
    version: 9,
    activeQuestId: shouldActivateBentCreek
      ? "explore_bent_creek"
      : shouldActivateRyan ? "catch_ryan" : save.activeQuestId,
    completedChapterIds: unique(save.completedChapterIds),
    completedQuestIds,
    questProgress,
    questHistory: unique(save.questHistory),
    inventory,
    equipment: { ...(save.equipment ?? DEFAULT_EQUIPMENT) },
    collectedPickupIds: unique(save.collectedPickupIds ?? []),
    lastKnownLocation: {
      ...(save.lastKnownLocation ?? { ...DEFAULT_LAST_KNOWN_LOCATION, map: save.currentMap }),
    },
    secrets,
    discoveredMaps,
    unlockedMaps,
    settings: { ...save.settings },
  };
  return validateSaveInvariants(normalized).length === 0 ? normalized : undefined;
}

function migrateV3Save(save: SaveDataV3): SaveData {
  const missingControllerStage = migrateLegacyMissingControllerStage(save.questStage);
  if (!missingControllerStage) return copySave(DEFAULT_SAVE);
  return normalizeSave({
    version: 7,
    activeChapterId: save.activeChapterId,
    activeQuestId: save.activeQuestId,
    completedChapterIds: save.completedChapterIds,
    completedQuestIds: save.completedQuestIds,
    questProgress: {
      ...createQuestProgress(),
      missingControllerStage,
    },
    questHistory: save.questHistory,
    inventory: save.inventory,
    secrets: save.secrets,
    currentMap: save.currentMap,
    discoveredMaps: save.discoveredMaps,
    unlockedMaps: ["neighborhood", "creek", save.currentMap, ...save.discoveredMaps],
    settings: save.settings,
    lastSavedAt: save.lastSavedAt,
  }) ?? copySave(DEFAULT_SAVE);
}

function migrateV4Save(save: SaveDataV4): SaveData {
  const missingControllerStage = migrateLegacyMissingControllerStage(save.questProgress.missingControllerStage);
  if (!missingControllerStage) return copySave(DEFAULT_SAVE);
  return normalizeSave({
    version: 7,
    activeChapterId: save.activeChapterId,
    activeQuestId: save.activeQuestId,
    completedChapterIds: save.completedChapterIds,
    completedQuestIds: save.completedQuestIds,
    questProgress: {
      ...save.questProgress,
      missingControllerStage,
      ryanRide: { stage: "invite", selectedDestination: null, routeSeed: null },
      exploreBentCreek: { stage: "open_gate" },
    },
    questHistory: save.questHistory,
    inventory: save.inventory,
    secrets: save.secrets,
    currentMap: save.currentMap,
    discoveredMaps: save.discoveredMaps,
    unlockedMaps: ["neighborhood", "creek", save.currentMap, ...save.discoveredMaps],
    settings: save.settings,
    lastSavedAt: save.lastSavedAt,
  }) ?? copySave(DEFAULT_SAVE);
}

function migrateV5Save(save: SaveDataV5): SaveData {
  const sportsComplete = save.completedQuestIds.includes("three_player_sports");
  return normalizeSave({
    ...save,
    version: 7,
    activeQuestId: sportsComplete && save.activeQuestId === "three_player_sports" ? "catch_ryan" : save.activeQuestId,
    questProgress: {
      ...save.questProgress,
      ryanRide: { stage: "invite", selectedDestination: null, routeSeed: null },
      exploreBentCreek: { stage: "open_gate" },
    },
    unlockedMaps: unique(["neighborhood", "creek", save.currentMap, ...save.discoveredMaps]),
  }) ?? copySave(DEFAULT_SAVE);
}

function migrateV6MapId(mapId: SaveDataV6MapId): MapId {
  return mapId === "reidenbaugh_road" ? "stonehenge" : mapId;
}

function migrateV6RyanRideStage(stage: SaveDataV6RyanRideStage): RyanRideStage {
  return stage === "ride_reidenbaugh_road" ? "ride_stonehenge" : stage;
}

function migrateV6Save(save: SaveDataV6): SaveData {
  const questProgress: QuestProgress = {
    missingControllerStage: save.questProgress.missingControllerStage,
    mushrooms: {
      ...save.questProgress.mushrooms,
      spawns: save.questProgress.mushrooms.spawns.map((spawn) => ({
        ...spawn,
        map: migrateV6MapId(spawn.map),
      })),
    },
    sports: { ...save.questProgress.sports },
    ryanRide: {
      ...save.questProgress.ryanRide,
      stage: migrateV6RyanRideStage(save.questProgress.ryanRide.stage),
    },
    exploreBentCreek: { stage: "open_gate" },
    bonfire: { stage: "talk_to_schwartz" },
    creekClubhouse: { stage: "talk_to_andrew", design: null, supplies: [], constructionStep: 0, knockBeats: [] },
    paperAirplaneRelay: { stage: "ask_for_advice", adviceIds: [], materialIds: [], windHits: 0, decoded: false, deliveredTo: null },
    bentCreekCaddyCaper: { stage: "inspect_display", clueIndex: 0, puttGates: 0, sprinklerIndex: 0, bestRematchScore: null },
  };
  return normalizeSave({
    ...save,
    version: 7,
    questProgress,
    currentMap: migrateV6MapId(save.currentMap),
    discoveredMaps: save.discoveredMaps.map(migrateV6MapId),
    unlockedMaps: save.unlockedMaps.map(migrateV6MapId),
  }) ?? copySave(DEFAULT_SAVE);
}

function migrateV7Save(save: SaveDataV7): SaveData {
  return normalizeSave({ ...save, version: 7 }) ?? copySave(DEFAULT_SAVE);
}

function migrateV2Save(save: SaveDataV2): SaveData {
  const missingControllerStage = migrateLegacyMissingControllerStage(save.questStage);
  if (!missingControllerStage) return copySave(DEFAULT_SAVE);
  return normalizeSave({
    version: 7,
    activeChapterId: "chapter_1",
    activeQuestId: "missing_controller",
    completedChapterIds: [],
    completedQuestIds: missingControllerStage === "complete" ? ["missing_controller"] : [],
    questProgress: {
      ...createQuestProgress(),
      missingControllerStage,
    },
    questHistory: save.questHistory,
    inventory: save.inventory,
    secrets: save.secrets,
    currentMap: save.currentMap,
    discoveredMaps: save.discoveredMaps,
    unlockedMaps: ["neighborhood", "creek", save.currentMap, ...save.discoveredMaps],
    settings: save.settings,
    lastSavedAt: save.lastSavedAt,
  }) ?? copySave(DEFAULT_SAVE);
}

function migrateLegacySave(save: LegacySaveData): SaveData {
  return migrateV2Save({
    version: 2,
    questStage: save.questStage,
    questHistory: historyForQuestStage("missing_controller", migrateLegacyMissingControllerStage(save.questStage) ?? "talk_to_jeremy"),
    inventory: save.inventory,
    secrets: save.secrets,
    currentMap: save.currentMap,
    discoveredMaps: ["neighborhood", save.currentMap],
    settings: { ...DEFAULT_SETTINGS },
    lastSavedAt: null,
  });
}

function browserStorage(): Storage | undefined {
  try { return typeof localStorage === "undefined" ? undefined : localStorage; }
  catch { return undefined; }
}

function activeStage(save: SaveData): QuestStage {
  const stage = stageFromProgress(save.questProgress, save.activeQuestId);
  if (!stage) throw new RangeError(`Quest ${save.activeQuestId} has no runtime stage`);
  return stage;
}

function progressWithStage(progress: QuestProgress, questId: QuestId, stage: QuestStage): QuestProgress | undefined {
  if (!IMPLEMENTED_QUEST_IDS.includes(questId as typeof IMPLEMENTED_QUEST_IDS[number])) return undefined;
  return progressAtStage(copyQuestProgress(progress), questId as typeof IMPLEMENTED_QUEST_IDS[number], stage);
}

export class GameStore {
  private state: SaveData;
  private replayState: SaveData | null = null;
  private replayQuestId: QuestId | null = null;
  private readonly firstVisit: boolean;
  private readonly legacyBrowserSaveDetected: boolean;
  private readonly useLegacyLocalStorage: boolean;
  private cloudRepository?: CloudSaveRepository<MiltonCloudSave>;
  private cloudSaveState: CloudSaveState<MiltonCloudSave> = { status: "idle" };
  private stopCloudSubscription?: () => void;
  private introSeen = false;
  private houseStorage: InventoryStack[] = [];
  private playerProfile?: PlayerProfile;
  private spawnIntent: SpawnIntent = "new-home";

  public constructor(
    private readonly storage: Storage | undefined = browserStorage(),
    private readonly now: () => Date = () => new Date(),
  ) {
    // Injected stores retain the old persistence behavior for focused legacy
    // tests and recovery tooling. The real browser singleton never reads or
    // writes its former local save as gameplay state.
    this.useLegacyLocalStorage = storage !== browserStorage();
    this.legacyBrowserSaveDetected = !this.useLegacyLocalStorage && this.hasStoredSave() === true;
    this.firstVisit = this.useLegacyLocalStorage && this.hasStoredSave() === false;
    this.state = this.useLegacyLocalStorage ? this.load() : copySave(DEFAULT_SAVE);
  }

  public getState(): GameState { return toGameState(this.replayState ?? this.state); }
  public getCanonicalState(): GameState { return toGameState(this.state); }
  public isReplaying(): boolean { return this.replayState !== null; }
  /** Captured before Boot creates its initial autosave, so the welcome scene runs once. */
  public isFirstVisit(): boolean { return this.firstVisit; }
  public hasLegacyBrowserSave(): boolean { return this.legacyBrowserSaveDetected; }
  public getCloudSaveState(): CloudSaveState<MiltonCloudSave> { return this.cloudSaveState; }
  public getHouseStorage(): InventoryStack[] { return this.houseStorage.map((stack) => ({ ...stack })); }
  public hasSeenIntro(): boolean { return this.introSeen; }
  public getSpawnIntent(): SpawnIntent { return this.spawnIntent; }
  public setSpawnIntent(intent: SpawnIntent): void { this.spawnIntent = intent; }
  public getPlayerProfile(): PlayerProfile | undefined { return this.playerProfile ? { ...this.playerProfile } : undefined; }
  public setPlayerProfile(profile: PlayerProfile): void {
    this.playerProfile = { ...profile };
    gameEvents.emit(EVENT.stateChanged, this.getState());
  }

  /** Connects the async authoritative store after required login succeeds. */
  public connectCloudSave(repository: CloudSaveRepository<MiltonCloudSave>): void {
    this.stopCloudSubscription?.();
    this.cloudRepository = repository;
    this.stopCloudSubscription = repository.subscribe((state) => {
      this.cloudSaveState = state;
      if (state.status === "saved") {
        this.state = { ...this.state, lastSavedAt: state.savedAt };
      }
      gameEvents.emit(EVENT.stateChanged, this.getState());
    });
  }

  /** Hydrates only an already-selected server slot; it never touches LocalStorage. */
  public hydrateCloudSave(save: MiltonCloudSave): boolean {
    if (!isMiltonCloudSave(save)) return false;
    const normalized = normalizeSave({ ...save, version: 9, lastSavedAt: null });
    if (!normalized) return false;
    this.replayState = null;
    this.replayQuestId = null;
    this.state = normalized;
    this.spawnIntent = "resume";
    this.introSeen = save.introSeen;
    this.houseStorage = normalizeInventory(save.houseStorage).filter((stack) =>
      normalized.questProgress.missingControllerStage !== "complete" || stack.itemId !== CONTROLLER_ITEM);
    gameEvents.emit(EVENT.stateChanged, this.getState());
    return true;
  }

  public createFreshCloudSave(seed = Math.floor(Math.random() * 0xffffffff)): MiltonCloudSave {
    const settings = { ...this.state.settings };
    this.replayState = null;
    this.replayQuestId = null;
    this.state = { ...createDefaultSave(seed), settings };
    this.spawnIntent = "new-home";
    this.introSeen = false;
    this.houseStorage = [];
    gameEvents.emit(EVENT.stateChanged, this.getState());
    return this.getCloudSnapshot();
  }

  public getCloudSnapshot(): MiltonCloudSave {
    return toCloudSave(this.state, this.introSeen, this.houseStorage);
  }

  /** User-selected recovery path after the server rejects an autosave revision. */
  public async useRemoteCloudConflict(): Promise<boolean> {
    if (!this.cloudRepository) return false;
    const remote = await this.cloudRepository.useRemoteConflict();
    return this.hydrateCloudSave(remote.data);
  }

  /** User-selected recovery path after the server rejects an autosave revision. */
  public async keepLocalCloudConflict(): Promise<void> {
    if (!this.cloudRepository) return;
    await this.cloudRepository.keepLocalConflict();
  }

  public markIntroSeen(): void {
    if (this.introSeen) return;
    this.introSeen = true;
    this.persistCloudOnly();
  }

  public depositToHouseStorage(itemId: ItemId, quantity: number): boolean {
    if (this.replayState) return false;
    const result = transferInventoryToStorage(this.state.inventory, this.houseStorage, itemId, quantity);
    if (!result) return false;
    this.houseStorage = result.houseStorage;
    this.update({ ...this.state, inventory: result.inventory });
    return true;
  }

  public withdrawFromHouseStorage(itemId: ItemId, quantity: number): boolean {
    if (this.replayState) return false;
    const result = transferStorageToInventory(this.state.inventory, this.houseStorage, itemId, quantity);
    if (!result) return false;
    this.houseStorage = result.houseStorage;
    this.update({ ...this.state, inventory: result.inventory });
    return true;
  }

  public depositAllToHouseStorage(): number {
    let moved = 0;
    for (const stack of [...this.state.inventory]) {
      if (this.depositToHouseStorage(stack.itemId, stack.quantity)) moved += stack.quantity;
    }
    return moved;
  }

  public withdrawAllFromHouseStorage(): number {
    let moved = 0;
    for (const stack of [...this.houseStorage]) {
      if (this.withdrawFromHouseStorage(stack.itemId, stack.quantity)) moved += stack.quantity;
    }
    return moved;
  }

  private hasStoredSave(): boolean | undefined {
    if (!this.storage) return undefined;
    try { return this.storage.getItem(STORAGE_KEY) !== null; }
    catch { return undefined; }
  }

  /** Cheap primitive selectors for per-frame gameplay checks. */
  public isQuestActive(questId: QuestId): boolean {
    return (this.replayState ?? this.state).activeQuestId === questId;
  }

  public isAtStage(stage: QuestStage): boolean {
    return activeStage(this.replayState ?? this.state) === stage;
  }

  public isQuestAt(questId: QuestId, stage: QuestStage): boolean {
    const current = this.replayState ?? this.state;
    return current.activeQuestId === questId && activeStage(current) === stage;
  }

  public isMushroomCollectible(id: string): boolean {
    const current = this.replayState ?? this.state;
    return current.activeQuestId === "andrew_mushroom_hunt"
      && current.questProgress.mushrooms.stage === "search_mushrooms"
      && !current.questProgress.mushrooms.collectedIds.includes(id);
  }

  public setQuestStage(questStage: QuestStage): void {
    const current = this.replayState ?? this.state;
    if (!IMPLEMENTED_QUEST_IDS.includes(current.activeQuestId as typeof IMPLEMENTED_QUEST_IDS[number])) {
      throw new RangeError(`Quest ${current.activeQuestId} is not implemented`);
    }
    const questProgress = progressWithStage(current.questProgress, current.activeQuestId, questStage);
    if (!questProgress || questStage === activeStage(current)) return;
    const progressViolations = validateQuestProgress(questProgress)
      .filter((violation) => !violation.path.endsWith("spawns"));
    if (progressViolations.length > 0) throw new RangeError(progressViolations[0]!.message);
    const completedQuestIds = !this.replayState && questStage === "complete"
      ? unique([...current.completedQuestIds, current.activeQuestId])
      : current.completedQuestIds;
    const activatesRyanRide = !this.replayState && current.activeQuestId === "three_player_sports" && questStage === "complete";
    const activatesBentCreek = !this.replayState && current.activeQuestId === "catch_ryan" && questStage === "complete";
    let inventory = current.activeQuestId === "missing_controller" && questStage === "complete"
      ? current.inventory.filter((stack) => stack.itemId !== CONTROLLER_ITEM)
      : current.inventory;
    let secrets = current.secrets;
    if (!this.replayState && questStage === "complete") {
      ({ inventory, secrets } = grantQuestCompletionRewards(inventory, secrets, current.activeQuestId));
    }
    this.update({
      ...current,
      activeQuestId: activatesBentCreek
        ? "explore_bent_creek"
        : activatesRyanRide ? "catch_ryan" : current.activeQuestId,
      completedQuestIds,
      inventory,
      secrets,
      questProgress,
      questHistory: unique([...current.questHistory, ...historyForQuestStage(current.activeQuestId, questStage)]),
    });
  }

  /** Returns a defensive copy of the Creek Clubhouse's durable mini-game state. */
  public getCreekClubhouseRecord(): CreekClubhouseQuestState {
    const record = (this.replayState ?? this.state).questProgress.creekClubhouse;
    return { ...record, supplies: [...record.supplies], knockBeats: [...record.knockBeats] };
  }

  /** Persists a validated Creek Clubhouse record and synchronizes its journal stage. */
  public setCreekClubhouseRecord(record: CreekClubhouseQuestState): boolean {
    const current = this.replayState ?? this.state;
    if (current.activeQuestId !== "creek_clubhouse" || !isCreekClubhouseQuestState(record)) return false;
    const questProgress = copyQuestProgress(current.questProgress);
    questProgress.creekClubhouse = {
      ...record,
      supplies: [...record.supplies],
      knockBeats: [...record.knockBeats],
    };
    this.persistQuestProgressRecord(current, "creek_clubhouse", questProgress);
    return true;
  }

  /** Advances the relay atomically, so individual advice and pickups survive scene changes. */
  public advancePaperAirplaneRelay(event: PaperAirplaneRelayEvent): boolean {
    const current = this.replayState ?? this.state;
    if (current.activeQuestId !== "paper_airplane_relay") return false;
    const record = current.questProgress.paperAirplaneRelay;
    if (record.stage === "complete") return false;
    const next: PaperAirplaneRelayQuestState = {
      ...record,
      adviceIds: [...record.adviceIds],
      materialIds: [...record.materialIds],
    };
    if (event.type === "advisor_consulted" && record.stage === "ask_for_advice") {
      next.adviceIds = unique([...next.adviceIds, event.advisor]);
    } else if (event.type === "material_found" && record.stage === "find_materials") {
      next.materialIds = unique([...next.materialIds, event.material]);
    } else if (event.type === "wind_gust_caught" && record.stage === "chase_plane") {
      next.windHits = Math.min(3, next.windHits + 1);
    } else if (event.type === "message_decoded" && record.stage === "decode_message") {
      next.decoded = true;
    } else if (event.type === "message_delivered" && record.stage === "deliver_message") {
      next.deliveredTo = event.friend;
    }
    next.stage = advancePaperAirplaneRelayStage(record.stage, event, record);
    const changed = next.stage !== record.stage
      || next.windHits !== record.windHits
      || next.decoded !== record.decoded
      || next.deliveredTo !== record.deliveredTo
      || next.adviceIds.length !== record.adviceIds.length
      || next.materialIds.length !== record.materialIds.length;
    if (!changed || !isPaperAirplaneRelayQuestState(next)) return false;
    const questProgress = copyQuestProgress(current.questProgress);
    questProgress.paperAirplaneRelay = next;
    this.persistQuestProgressRecord(current, "paper_airplane_relay", questProgress);
    return true;
  }

  /** Returns the Caddy Caper record; rematch scores are part of the same save-safe slice. */
  public getBentCreekCaddyCaperRecord(): BentCreekCaddyCaperQuestState {
    return { ...(this.replayState ?? this.state).questProgress.bentCreekCaddyCaper };
  }

  public setBentCreekCaddyCaperRecord(record: BentCreekCaddyCaperQuestState): boolean {
    const current = this.replayState ?? this.state;
    const previous = current.questProgress.bentCreekCaddyCaper;
    const canUpdateRematch = previous.stage === "complete" && record.stage === "complete";
    if ((!this.replayState && current.activeQuestId !== "bent_creek_caddy_caper" && !canUpdateRematch)
      || !isBentCreekCaddyCaperQuestState(record)) return false;
    const questProgress = copyQuestProgress(current.questProgress);
    questProgress.bentCreekCaddyCaper = { ...record };
    this.persistQuestProgressRecord(current, "bent_creek_caddy_caper", questProgress);
    return true;
  }

  private persistQuestProgressRecord(
    current: SaveData,
    questId: "creek_clubhouse" | "paper_airplane_relay" | "bent_creek_caddy_caper",
    questProgress: QuestProgress,
  ): void {
    const stage = stageFromProgress(questProgress, questId);
    if (!stage) throw new RangeError(`Quest ${questId} has no runtime stage`);
    const completedQuestIds = !this.replayState && stage === "complete"
      ? unique([...current.completedQuestIds, questId])
      : current.completedQuestIds;
    const rewards = !this.replayState && stage === "complete"
      ? grantQuestCompletionRewards(current.inventory, current.secrets, questId)
      : { inventory: current.inventory, secrets: current.secrets };
    this.update({
      ...current,
      questProgress,
      completedQuestIds,
      ...rewards,
      questHistory: unique([...current.questHistory, ...historyForQuestStage(questId, stage)]),
    });
  }

  /** Collects one of Andrew's persisted mushroom locations and advances the hunt when all ten are found. */
  public collectMushroom(id: string): boolean {
    const current = this.replayState ?? this.state;
    const mushrooms = current.questProgress.mushrooms;
    if (current.activeQuestId !== "andrew_mushroom_hunt" || mushrooms.stage !== "search_mushrooms") return false;
    if (!mushrooms.spawns.some((spawn) => spawn.id === id) || mushrooms.collectedIds.includes(id)) return false;

    const collectedIds = [...mushrooms.collectedIds, id];
    const questStage = collectedIds.length === MUSHROOM_COUNT
      ? advanceMushroomStage(mushrooms.stage, { type: "collected_all_mushrooms" })
      : mushrooms.stage;
    const questProgress = copyQuestProgress(current.questProgress);
    questProgress.mushrooms = { ...mushrooms, collectedIds, stage: questStage };
    this.update({
      ...current,
      questProgress,
      questHistory: unique([...current.questHistory, ...historyForQuestStage(current.activeQuestId, questStage)]),
    });
    return true;
  }

  public getMushroomSpawns(map?: "neighborhood" | "creek"): MushroomSpawn[] {
    const spawns = (this.replayState ?? this.state).questProgress.mushrooms.spawns;
    return spawns.filter((spawn) => !map || spawn.map === map).map((spawn) => ({ ...spawn }));
  }

  public addInventoryItem(item: string): void {
    const normalized = LEGACY_CONTROLLER_ITEMS.has(item) ? CONTROLLER_ITEM : item;
    if (!isItemId(normalized)) return;
    const current = this.replayState ?? this.state;
    if (normalized === CONTROLLER_ITEM
      && (current.activeQuestId !== "missing_controller"
        || (current.questProgress.missingControllerStage !== "search_creek"
          && current.questProgress.missingControllerStage !== "return_to_jeremy"))) return;
    if (this.hasItem(normalized)) return;
    const inventory = addToInventory(current.inventory, normalized, 1);
    if (!inventory) return;
    this.update({ ...current, inventory });
  }

  public collectPickup(pickupId: string, itemId: ItemId, quantity = 1): boolean {
    const current = this.replayState ?? this.state;
    if (!pickupId || !isItemId(itemId) || !Number.isInteger(quantity) || quantity <= 0) return false;
    if (current.collectedPickupIds.includes(pickupId)) return false;
    const inventory = addToInventory(current.inventory, itemId, quantity);
    if (!inventory) return false;
    this.update({
      ...current,
      inventory,
      collectedPickupIds: [...current.collectedPickupIds, pickupId],
    });
    return true;
  }

  public countItem(itemId: ItemId): number {
    return (this.replayState ?? this.state).inventory
      .filter((stack) => stack.itemId === itemId)
      .reduce((total, stack) => total + stack.quantity, 0);
  }

  public hasItem(itemId: ItemId): boolean {
    return this.countItem(itemId) > 0;
  }

  public setEquippedTransport(itemId: "bicycle" | null): boolean {
    const current = this.replayState ?? this.state;
    if (itemId !== null && (!isItemId(itemId) || !this.hasItem(itemId))) return false;
    if (current.equipment.transport === itemId) return true;
    this.update({ ...current, equipment: { transport: itemId } });
    return true;
  }

  public setLastKnownLocation(location: PlayerMapLocation): void {
    if (!isPlayerMapLocation(location)) throw new RangeError("Invalid player map location");
    const current = this.replayState ?? this.state;
    if (current.lastKnownLocation.map === location.map
      && current.lastKnownLocation.x === location.x
      && current.lastKnownLocation.y === location.y) return;
    this.update({ ...current, lastKnownLocation: { ...location } });
  }

  public addSecret(secret: string): void {
    const current = this.replayState ?? this.state;
    if (current.secrets.includes(secret)) return;
    this.update({ ...current, secrets: [...current.secrets, secret] });
  }

  public setCurrentMap(currentMap: SaveData["currentMap"]): void {
    const current = this.replayState ?? this.state;
    if (!isMapId(currentMap)) throw new RangeError(`Invalid map ${String(currentMap)}`);
    if (!current.unlockedMaps.includes(currentMap)) throw new RangeError(`Map ${currentMap} is locked`);
    if (currentMap === current.currentMap && current.discoveredMaps.includes(currentMap)) return;
    this.update({ ...current, currentMap, discoveredMaps: unique([...current.discoveredMaps, currentMap]) });
  }

  public updateSettings(settings: Partial<PlayerSettings>): void {
    const current = this.replayState ?? this.state;
    const next = { ...current.settings, ...settings };
    if (!isSettings(next)) throw new RangeError("Invalid player settings");
    this.update({ ...current, settings: next });
  }

  public setActiveQuest(activeChapterId: ChapterId, activeQuestId: QuestId): void {
    const current = this.replayState ?? this.state;
    if (!IMPLEMENTED_QUEST_IDS.includes(activeQuestId as typeof IMPLEMENTED_QUEST_IDS[number])) {
      throw new RangeError(`Quest ${activeQuestId} is not implemented`);
    }
    this.update({
      ...current,
      activeChapterId,
      activeQuestId,
    });
  }

  /** Billy assigns the first controller quest after the new neighbor meets him. */
  public beginMissingControllerQuest(): boolean {
    const current = this.replayState ?? this.state;
    if (current.activeQuestId !== "missing_controller"
      || current.questProgress.missingControllerStage !== "talk_to_billy") return false;
    const next = advanceMissingControllerStage("talk_to_billy", { type: "talked_to_billy" });
    this.setQuestStage(next);
    return true;
  }

  /**
   * Restarts the canonical in-progress quest while preserving every unrelated
   * quest's progress, rewards, and completion record.
   */
  public resetActiveQuest(): boolean {
    if (this.replayState) return false;
    const questId = this.state.activeQuestId;
    if (!IMPLEMENTED_QUEST_IDS.includes(questId as typeof IMPLEMENTED_QUEST_IDS[number])
      || this.state.completedQuestIds.includes(questId)
      || activeStage(this.state) === "complete") return false;

    const questProgress = copyQuestProgress(this.state.questProgress);
    let inventory = this.state.inventory.map((stack) => ({ ...stack }));
    let unlockedMaps = [...this.state.unlockedMaps];
    let discoveredMaps = [...this.state.discoveredMaps];
    if (questId === "missing_controller") {
      questProgress.missingControllerStage = "talk_to_billy";
      inventory = inventory.filter((stack) => stack.itemId !== CONTROLLER_ITEM);
    } else if (questId === "andrew_mushroom_hunt") {
      questProgress.mushrooms = {
        ...questProgress.mushrooms,
        stage: "talk_to_andrew_for_mushrooms",
        collectedIds: [],
      };
    } else if (questId === "three_player_sports") {
      questProgress.sports = { stage: "meet_jeremy_to_skateboard" };
    } else if (questId === "catch_ryan") {
      questProgress.ryanRide = { stage: "invite", selectedDestination: null, routeSeed: null };
      unlockedMaps = unlockedMaps.filter((map) => !RYAN_UNLOCKED_MAPS.includes(map as typeof RYAN_UNLOCKED_MAPS[number]));
      discoveredMaps = discoveredMaps.filter((map) => unlockedMaps.includes(map));
    } else if (questId === "explore_bent_creek") {
      questProgress.exploreBentCreek = { stage: "open_gate" };
    } else if (questId === "attend_bonfire_at_andrews") {
      questProgress.bonfire = { stage: "talk_to_schwartz" };
    } else if (questId === "creek_clubhouse") {
      questProgress.creekClubhouse = { stage: "talk_to_andrew", design: null, supplies: [], constructionStep: 0, knockBeats: [] };
    } else if (questId === "paper_airplane_relay") {
      questProgress.paperAirplaneRelay = { stage: "ask_for_advice", adviceIds: [], materialIds: [], windHits: 0, decoded: false, deliveredTo: null };
    } else {
      questProgress.bentCreekCaddyCaper = { stage: "inspect_display", clueIndex: 0, puttGates: 0, sprinklerIndex: 0, bestRematchScore: null };
    }

    this.spawnIntent = "new-home";
    this.update({
      ...this.state,
      questProgress,
      questHistory: this.state.questHistory.filter((milestone) => !milestone.startsWith(`${questId}.`)),
      inventory,
      currentMap: "neighborhood",
      discoveredMaps: unique<MapId>(["neighborhood", ...discoveredMaps]),
      unlockedMaps: unique<MapId>([...BASE_UNLOCKED_MAPS, ...unlockedMaps]),
      lastKnownLocation: { ...DEFAULT_LAST_KNOWN_LOCATION },
    });
    return true;
  }

  public isMapUnlocked(mapId: SaveData["currentMap"]): boolean { return (this.replayState ?? this.state).unlockedMaps.includes(mapId); }
  public isBicycleUnlocked(): boolean { return this.hasItem("bicycle"); }
  public isRyanRideStage(stage: RyanRideStage): boolean { return this.isQuestAt("catch_ryan", stage); }

  public acceptRyanRide(): void { this.advanceRyanRide({ type: "accepted_ride" }); }
  /** Destination-menu Back returns to Ryan's original invitation without unlocking a map. */
  public returnToRyanRideInvitation(): void {
    const current = this.replayState ?? this.state;
    if (!this.isQuestAt("catch_ryan", "choose_destination")) return;
    this.update({
      ...current,
      questProgress: { ...copyQuestProgress(current.questProgress), ryanRide: { stage: "invite", selectedDestination: null, routeSeed: null } },
      questHistory: current.questHistory.filter((milestone) => !milestone.startsWith("catch_ryan.")),
    });
  }
  public selectRyanRideDestination(destination: RideDestination = "reidenbaugh", seed = Math.floor(Math.random() * 0xffffffff)): void {
    const current = this.replayState ?? this.state;
    if (!this.isQuestAt("catch_ryan", "choose_destination")) return;
    if (!isRideDestination(destination)) throw new RangeError(`Invalid ride destination ${String(destination)}`);
    if (!Number.isFinite(seed)) throw new RangeError("Ride route seed must be finite");
    const next = advanceRyanRideStage(current.questProgress.ryanRide.stage, { type: "selected_destination", destination });
    this.update({
      ...current,
      questProgress: {
        ...copyQuestProgress(current.questProgress),
        ryanRide: { stage: next, selectedDestination: destination, routeSeed: seed },
      },
      unlockedMaps: unique<MapId>([...current.unlockedMaps, ...RYAN_UNLOCKED_MAPS]),
      questHistory: unique([...current.questHistory, ...historyForQuestStage("catch_ryan", next)]),
    });
  }
  public departNeighborhoodRide(): void { this.advanceRyanRide({ type: "departed_neighborhood" }, "stonehenge"); }
  public reachReidenbaugh(): void { this.advanceRyanRide({ type: "reached_reidenbaugh" }, "reidenbaugh"); }
  public catchRyan(): void { this.advanceRyanRide({ type: "caught_ryan" }); }
  public openBentCreekGate(): void {
    const current = this.replayState ?? this.state;
    if (!this.isQuestAt("explore_bent_creek", "open_gate")) return;
    const next = advanceExploreBentCreekStage(current.questProgress.exploreBentCreek.stage, { type: "opened_gate" });
    this.setQuestStage(next);
  }

  /** Schwartz's invitation only appears after the gate and Mickey's race are both complete. */
  public canAcceptBonfireInvitation(): boolean {
    const current = this.replayState ?? this.state;
    return current.activeQuestId === "attend_bonfire_at_andrews"
      || (current.activeQuestId === "explore_bent_creek"
        && current.questProgress.exploreBentCreek.stage === "meet_schwartz"
        && current.secrets.includes(MICKEY_DRAG_RACE_BEATEN));
  }

  /** Accepts Schwartz's Bent Creek invitation and starts the bonfire handoff. */
  public acceptBonfireInvitation(): boolean {
    const current = this.replayState ?? this.state;
    if (!this.canAcceptBonfireInvitation()) return false;
    const stage = current.questProgress.bonfire.stage;
    if (stage !== "talk_to_schwartz") return false;
    const next = advanceBonfireQuestStage(stage, { type: "accepted_schwartz_invitation" });
    const exploreNext = advanceExploreBentCreekStage(
      current.questProgress.exploreBentCreek.stage,
      { type: "met_schwartz" },
    );
    this.update({
      ...current,
      activeQuestId: "attend_bonfire_at_andrews",
      completedQuestIds: this.replayState
        ? current.completedQuestIds
        : unique([...current.completedQuestIds, "explore_bent_creek"]),
      questProgress: {
        ...copyQuestProgress(current.questProgress),
        exploreBentCreek: { stage: exploreNext },
        bonfire: { stage: next },
      },
      questHistory: unique([
        ...current.questHistory,
        ...historyForQuestStage("explore_bent_creek", exploreNext),
        ...historyForQuestStage("attend_bonfire_at_andrews", next),
      ]),
    });
    return true;
  }

  /** Called after the Bent Creek departure transition has placed the player at Andrew's fire. */
  public arriveAtAndrewsBonfire(): boolean {
    const current = this.replayState ?? this.state;
    if (!this.isQuestAt("attend_bonfire_at_andrews", "attend_bonfire")) return false;
    const next = advanceBonfireQuestStage(current.questProgress.bonfire.stage, { type: "arrived_at_andrews" });
    this.setQuestStage(next);
    return true;
  }

  /** Records a successful 45-second bad-trip run and completes the initiation. */
  public completeBonfireInitiation(): boolean {
    const current = this.replayState ?? this.state;
    if (!this.isQuestAt("attend_bonfire_at_andrews", "survive_bad_trip")) return false;
    const next = advanceBonfireQuestStage(current.questProgress.bonfire.stage, { type: "survived_bad_trip" });
    this.setQuestStage(next);
    return true;
  }

  private advanceRyanRide(event: import("./quests/specs").RyanRideQuestEvent, currentMap?: SaveData["currentMap"]): void {
    const current = this.replayState ?? this.state;
    if (!this.isQuestAt("catch_ryan", current.questProgress.ryanRide.stage)) return;
    const next = advanceRyanRideStage(current.questProgress.ryanRide.stage, event);
    if (next === current.questProgress.ryanRide.stage) return;
    if (currentMap !== undefined && (!isMapId(currentMap) || !current.unlockedMaps.includes(currentMap))) {
      throw new RangeError(`Map ${String(currentMap)} is locked`);
    }
    const completedQuestIds: QuestId[] = !this.replayState && next === "complete"
      ? unique<QuestId>([...current.completedQuestIds, "catch_ryan"])
      : current.completedQuestIds;
    const unlockedMaps = next === "complete"
      ? unique<MapId>([...current.unlockedMaps, ...RYAN_UNLOCKED_MAPS])
      : current.unlockedMaps;
    const inventory = !this.replayState && next === "complete"
      ? addToInventory(current.inventory, "bicycle", 1) ?? current.inventory
      : current.inventory;
    this.update({
      ...current,
      activeQuestId: !this.replayState && next === "complete" ? "explore_bent_creek" : current.activeQuestId,
      currentMap: currentMap ?? current.currentMap,
      discoveredMaps: currentMap ? unique<SaveData["currentMap"]>([...current.discoveredMaps, currentMap]) : current.discoveredMaps,
      unlockedMaps,
      completedQuestIds,
      inventory,
      questProgress: { ...copyQuestProgress(current.questProgress), ryanRide: { ...current.questProgress.ryanRide, stage: next } },
      questHistory: unique([...current.questHistory, ...historyForQuestStage("catch_ryan", next)]),
    });
  }

  /** Starts a temporary replay of any implemented quest. Nothing in this state is persisted. */
  public startQuestReplay(questId: QuestId): void {
    if (![
      "missing_controller", "andrew_mushroom_hunt", "three_player_sports", "catch_ryan", "explore_bent_creek",
      "attend_bonfire_at_andrews", "creek_clubhouse", "paper_airplane_relay", "bent_creek_caddy_caper",
    ].includes(questId)) {
      throw new RangeError(`Quest ${questId} cannot be replayed yet`);
    }
    if (!this.state.completedQuestIds.includes(questId)) throw new RangeError("Only completed quests can be replayed");

    const questProgress = copyQuestProgress(this.state.questProgress);
    if (questId === "missing_controller") {
      questProgress.missingControllerStage = "talk_to_billy";
    } else if (questId === "andrew_mushroom_hunt") {
      questProgress.mushrooms = { ...questProgress.mushrooms, stage: "talk_to_andrew_for_mushrooms", collectedIds: [] };
    } else if (questId === "three_player_sports") {
      questProgress.sports.stage = "meet_jeremy_to_skateboard";
    } else if (questId === "catch_ryan") {
      questProgress.ryanRide = { stage: "invite", selectedDestination: null, routeSeed: null };
    } else if (questId === "explore_bent_creek") {
      questProgress.exploreBentCreek = { stage: "open_gate" };
    } else if (questId === "attend_bonfire_at_andrews") {
      questProgress.bonfire = { stage: "talk_to_schwartz" };
    } else if (questId === "creek_clubhouse") {
      questProgress.creekClubhouse = { stage: "talk_to_andrew", design: null, supplies: [], constructionStep: 0, knockBeats: [] };
    } else if (questId === "paper_airplane_relay") {
      questProgress.paperAirplaneRelay = { stage: "ask_for_advice", adviceIds: [], materialIds: [], windHits: 0, decoded: false, deliveredTo: null };
    } else {
      questProgress.bentCreekCaddyCaper = { stage: "inspect_display", clueIndex: 0, puttGates: 0, sprinklerIndex: 0, bestRematchScore: null };
    }

    this.replayQuestId = questId;
    this.replayState = {
      ...copySave(this.state),
      activeChapterId: "chapter_1",
      activeQuestId: questId,
      questProgress,
      questHistory: [],
      inventory: [],
      equipment: { ...DEFAULT_EQUIPMENT },
      collectedPickupIds: [],
      lastKnownLocation: { ...DEFAULT_LAST_KNOWN_LOCATION },
      secrets: [],
      currentMap: "neighborhood",
      discoveredMaps: ["neighborhood"],
      unlockedMaps: questId === "explore_bent_creek" || questId === "attend_bonfire_at_andrews"
        || questId === "paper_airplane_relay" || questId === "bent_creek_caddy_caper"
        ? unique<MapId>([...BASE_UNLOCKED_MAPS, ...RYAN_UNLOCKED_MAPS])
        : ["neighborhood", "creek"],
    };
    gameEvents.emit(EVENT.stateChanged, this.getState());
  }

  /** Leaves an isolated replay and restores the untouched canonical save. */
  public endQuestReplay(): boolean {
    if (!this.replayState) return false;
    this.replayState = null;
    this.replayQuestId = null;
    gameEvents.emit(EVENT.stateChanged, this.getState());
    return true;
  }

  public saveNow(): void { this.update(this.replayState ?? this.state); }
  public hasInventoryItem(item: string): boolean {
    const normalized = LEGACY_CONTROLLER_ITEMS.has(item) ? CONTROLLER_ITEM : item;
    return isItemId(normalized) && this.hasItem(normalized);
  }
  public hasSecret(secret: string): boolean { return (this.replayState ?? this.state).secrets.includes(secret); }

  /**
   * Mini-game records are stored in the existing save's extensible secrets
 * list. This keeps the mini-game record lightweight and self-contained.
   * migration while still resetting records with a new game or mission reset.
   */
  public getMickeyDragRaceRecord(): { unlocked: boolean; introSeen: boolean; beaten: boolean; bestTimeMs?: number } {
    const current = this.replayState ?? this.state;
    const best = current.secrets
      .filter((secret) => secret.startsWith(MICKEY_DRAG_RACE_BEST_PREFIX))
      .map((secret) => Number(secret.slice(MICKEY_DRAG_RACE_BEST_PREFIX.length)))
      .filter((value) => Number.isInteger(value) && value > 0)
      .reduce<number | undefined>((fastest, value) => fastest === undefined ? value : Math.min(fastest, value), undefined);
    return {
      unlocked: current.questProgress.exploreBentCreek.stage !== "open_gate",
      introSeen: current.secrets.includes(MICKEY_DRAG_RACE_INTRO),
      beaten: current.secrets.includes(MICKEY_DRAG_RACE_BEATEN),
      bestTimeMs: best,
    };
  }

  public markMickeyDragRaceIntroSeen(): void {
    const current = this.replayState ?? this.state;
    if (current.secrets.includes(MICKEY_DRAG_RACE_INTRO)) return;
    this.update({ ...current, secrets: [...current.secrets, MICKEY_DRAG_RACE_INTRO] });
  }

  public recordMickeyDragRace(timeMs: number, won: boolean): void {
    if (!Number.isInteger(timeMs) || timeMs <= 0) return;
    const current = this.replayState ?? this.state;
    const existingBest = this.getMickeyDragRaceRecord().bestTimeMs;
    const bestTimeMs = existingBest === undefined ? timeMs : Math.min(existingBest, timeMs);
    const secrets = current.secrets.filter((secret) => !secret.startsWith(MICKEY_DRAG_RACE_BEST_PREFIX));
    secrets.push(`${MICKEY_DRAG_RACE_BEST_PREFIX}${bestTimeMs}`);
    if (won && !secrets.includes(MICKEY_DRAG_RACE_BEATEN)) secrets.push(MICKEY_DRAG_RACE_BEATEN);
    this.update({ ...current, secrets: unique(secrets) });
  }

  /** Starts a canonical fresh game while preserving the player's preferences. */
  public newGame(): void {
    const settings = { ...this.state.settings };
    this.replayState = null;
    this.replayQuestId = null;
    this.introSeen = false;
    this.houseStorage = [];
    this.spawnIntent = "new-home";
    this.update({ ...createDefaultSave(Math.floor(Math.random() * 0xffffffff)), settings });
  }

  public reset(): void {
    if (this.replayState && this.replayQuestId) {
      const questId = this.replayQuestId;
      this.replayState = null;
      this.replayQuestId = null;
      this.startQuestReplay(questId);
      return;
    }
    const settings = { ...this.state.settings };
    this.introSeen = false;
    this.houseStorage = [];
    this.spawnIntent = "new-home";
    this.update({ ...createDefaultSave(Math.floor(Math.random() * 0xffffffff)), settings });
  }

  private load(): SaveData {
    if (!this.storage) return copySave(DEFAULT_SAVE);
    try {
      const serialized = this.storage.getItem(STORAGE_KEY);
      if (serialized === null) return copySave(DEFAULT_SAVE);
      const parsed = decodePersistedJson(serialized);
      if (parsed === undefined) return copySave(DEFAULT_SAVE);
      if (isSaveData(parsed)) {
        const normalized = normalizeSave(parsed);
        if (!normalized) return copySave(DEFAULT_SAVE);
        if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
          try { this.storage.setItem(STORAGE_KEY, JSON.stringify(normalized)); }
          catch { /* The repaired in-memory save remains usable if storage is read-only. */ }
        }
        return normalized;
      }
      if (isSaveDataV7(parsed)) {
        const migrated = migrateV7Save(parsed);
        try { this.storage.setItem(STORAGE_KEY, JSON.stringify(migrated)); }
        catch { /* The in-memory migration remains usable if storage is read-only. */ }
        return migrated;
      }
      if (isSaveDataV8(parsed)) {
        const migrated = normalizeSave(parsed);
        if (!migrated) return copySave(DEFAULT_SAVE);
        try { this.storage.setItem(STORAGE_KEY, JSON.stringify(migrated)); }
        catch { /* migration remains in memory */ }
        return migrated;
      }
      if (isSaveDataV6(parsed)) {
        const migrated = migrateV6Save(parsed);
        try { this.storage.setItem(STORAGE_KEY, JSON.stringify(migrated)); }
        catch { /* The in-memory migration remains usable if storage is read-only. */ }
        return migrated;
      }
      if (isSaveDataV5(parsed)) {
        const migrated = migrateV5Save(parsed);
        try { this.storage.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch { /* migration remains in memory */ }
        return migrated;
      }
      if (isSaveDataV4(parsed)) {
        const migrated = migrateV4Save(parsed);
        try { this.storage.setItem(STORAGE_KEY, JSON.stringify(migrated)); }
        catch { /* The in-memory migration remains usable if storage is read-only. */ }
        return migrated;
      }
      if (isSaveDataV3(parsed)) {
        const migrated = migrateV3Save(parsed);
        try { this.storage.setItem(STORAGE_KEY, JSON.stringify(migrated)); }
        catch { /* The in-memory migration remains usable if storage is read-only. */ }
        return migrated;
      }
      if (isSaveDataV2(parsed)) {
        const migrated = migrateV2Save(parsed);
        try { this.storage.setItem(STORAGE_KEY, JSON.stringify(migrated)); }
        catch { /* The in-memory migration remains usable if storage is read-only. */ }
        return migrated;
      }
      if (isLegacySave(parsed)) {
        const migrated = migrateLegacySave(parsed);
        try { this.storage.setItem(STORAGE_KEY, JSON.stringify(migrated)); }
        catch { /* The in-memory migration remains usable if storage is read-only. */ }
        return migrated;
      }
    } catch { /* Invalid/unavailable persistence falls back to a safe new mission. */ }
    return copySave(DEFAULT_SAVE);
  }

  private update(nextState: SaveData): void {
    if (!isMapId(nextState.currentMap) || !nextState.unlockedMaps.includes(nextState.currentMap)) {
      throw new RangeError("Current map must be a valid unlocked map");
    }
    if (this.replayState) {
      this.replayState = {
        ...copySave(nextState),
        completedChapterIds: [...this.state.completedChapterIds],
        completedQuestIds: [...this.state.completedQuestIds],
        lastSavedAt: this.state.lastSavedAt,
      };
      gameEvents.emit(EVENT.stateChanged, this.getState());
      return;
    }
    let persisted = copySave(nextState);
    if (this.storage && this.useLegacyLocalStorage) {
      const stamped = { ...persisted, lastSavedAt: this.now().toISOString() };
      try {
        this.storage.setItem(STORAGE_KEY, JSON.stringify(stamped));
        persisted = stamped;
      } catch { /* Gameplay remains available and the previous successful timestamp is retained. */ }
    }
    this.state = persisted;
    gameEvents.emit(EVENT.stateChanged, this.getState());
    this.persistCloudOnly();
  }

  private persistCloudOnly(): void {
    if (!this.cloudRepository || this.replayState) return;
    // Gameplay mutations are synchronous; persistence is queued and coalesced
    // by the repository so mutations never produce overlapping PUT requests.
    void this.cloudRepository.requestSave(this.getCloudSnapshot()).catch(() => undefined);
  }
}

export const gameStore = new GameStore();
