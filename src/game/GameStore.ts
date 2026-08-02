import { createMushroomSpawns, repairMushroomSpawnLayout } from "../content/mushrooms";
import {
  advanceMushroomStage,
  advanceExploreBentCreekStage,
  advanceRyanRideStage,
  IMPLEMENTED_QUEST_IDS,
  MUSHROOM_COUNT,
  QUEST_MILESTONES,
  isStageForQuest,
  milestonesForQuestStage,
} from "./quests/specs";
import {
  migrateLegacyMissingControllerStage,
  progressAtStage,
  stageFromProgress,
  validateSaveInvariants,
  validateQuestProgress,
} from "./persistence/questState";
import { decodePersistedJson, isValidTimestamp } from "./persistence/decoder";
import { EVENT, gameEvents } from "./events";
import { MAP_IDS } from "./types";
import type {
  ChapterId,
  GameState,
  MapId,
  MissingControllerStage,
  ExploreBentCreekStage,
  MushroomQuestStage,
  MushroomSpawn,
  PlayerSettings,
  QuestId,
  QuestMilestone,
  QuestProgress,
  QuestStage,
  SaveData,
  SportsQuestStage,
  RyanRideStage,
  RideDestination,
} from "./types";

const STORAGE_KEY = "milton-estates-save";
const LEGACY_CONTROLLER_ITEMS = new Set(["xbox-controller", "xbox controller"]);
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

function createQuestProgress(seed = DEFAULT_MUSHROOM_SEED): QuestProgress {
  return {
    missingControllerStage: "talk_to_jeremy",
    mushrooms: {
      stage: "talk_to_andrew_for_mushrooms",
      spawns: createMushroomSpawns(seed),
      collectedIds: [],
    },
    sports: { stage: "meet_jeremy_to_skateboard" },
    ryanRide: { stage: "invite", selectedDestination: null, routeSeed: null },
    exploreBentCreek: { stage: "open_gate" },
  };
}

function createDefaultSave(seed = DEFAULT_MUSHROOM_SEED): SaveData {
  return {
    version: 7,
    activeChapterId: "chapter_1",
    activeQuestId: "missing_controller",
    completedChapterIds: [],
    completedQuestIds: [],
    questProgress: createQuestProgress(seed),
    questHistory: [],
    inventory: [],
    secrets: [],
    currentMap: "neighborhood",
    discoveredMaps: ["neighborhood"],
    unlockedMaps: ["neighborhood", "creek"],
    settings: { ...DEFAULT_SETTINGS },
    lastSavedAt: null,
  };
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

type SaveDataV3 = Omit<SaveData, "version" | "questProgress"> & {
  version: 3;
  questStage: LegacyMissingControllerStage;
};

type LegacyQuestProgress = Omit<QuestProgress, "missingControllerStage" | "ryanRide" | "exploreBentCreek"> & {
  missingControllerStage: LegacyMissingControllerStage;
};

type SaveDataV4 = Omit<SaveData, "version" | "questProgress"> & {
  version: 4;
  questStage: QuestStage | "search_yards";
  questProgress: LegacyQuestProgress;
};
type SaveDataV5 = Omit<SaveData, "version" | "questProgress" | "unlockedMaps"> & {
  version: 5;
  questProgress: Omit<QuestProgress, "ryanRide" | "exploreBentCreek">;
};

type SaveDataV6MapId = "neighborhood" | "creek" | "reidenbaugh_road" | "reidenbaugh";
type SaveDataV6RyanRideStage = Exclude<RyanRideStage, "ride_stonehenge"> | "ride_reidenbaugh_road";
type SaveDataV6QuestProgress = Omit<QuestProgress, "mushrooms" | "ryanRide" | "exploreBentCreek"> & {
  mushrooms: Omit<QuestProgress["mushrooms"], "spawns"> & {
    spawns: Array<Omit<MushroomSpawn, "map"> & { map: SaveDataV6MapId }>;
  };
  ryanRide: Omit<QuestProgress["ryanRide"], "stage"> & { stage: SaveDataV6RyanRideStage };
};
type SaveDataV6 = Omit<SaveData, "version" | "questProgress" | "currentMap" | "discoveredMaps" | "unlockedMaps"> & {
  version: 6;
  questProgress: SaveDataV6QuestProgress;
  currentMap: SaveDataV6MapId;
  discoveredMaps: SaveDataV6MapId[];
  unlockedMaps: SaveDataV6MapId[];
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
  };
}

function copySave(save: SaveData): SaveData {
  return {
    ...save,
    completedChapterIds: [...save.completedChapterIds],
    completedQuestIds: [...save.completedQuestIds],
    questProgress: copyQuestProgress(save.questProgress),
    questHistory: [...save.questHistory],
    inventory: [...save.inventory],
    secrets: [...save.secrets],
    discoveredMaps: [...save.discoveredMaps],
    unlockedMaps: [...save.unlockedMaps],
    settings: { ...save.settings },
  };
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

function normalizeInventory(inventory: string[]): string[] {
  return unique(inventory.map((item) => LEGACY_CONTROLLER_ITEMS.has(item) ? CONTROLLER_ITEM : item));
}

function historyForQuestStage(questId: QuestId, stage: QuestStage): QuestMilestone[] {
  return milestonesForQuestStage(questId, stage);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
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
      || (typeof exploreBentCreek === "object" && exploreBentCreek !== null && isExploreBentCreekStage(exploreBentCreek.stage)));
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

function isSaveData(value: unknown): value is SaveData {
  if (typeof value !== "object" || value === null) return false;
  const save = value as Partial<SaveData>;
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

function normalizeQuestProgress(progress: QuestProgress): QuestProgress {
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
  };
}

function normalizeSave(save: SaveData): SaveData | undefined {
  const questProgress = normalizeQuestProgress(save.questProgress);
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
  const normalized: SaveData = {
    ...save,
    activeQuestId: shouldActivateBentCreek
      ? "explore_bent_creek"
      : shouldActivateRyan ? "catch_ryan" : save.activeQuestId,
    completedChapterIds: unique(save.completedChapterIds),
    completedQuestIds: unique([...save.completedQuestIds, ...completedFromProgress]),
    questProgress,
    questHistory: unique(save.questHistory),
    inventory: normalizeInventory(save.inventory),
    secrets: unique(save.secrets),
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

  public constructor(
    private readonly storage: Storage | undefined = browserStorage(),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.firstVisit = this.hasStoredSave() === false;
    this.state = this.load();
  }

  public getState(): GameState { return toGameState(this.replayState ?? this.state); }
  public getCanonicalState(): GameState { return toGameState(this.state); }
  public isReplaying(): boolean { return this.replayState !== null; }
  /** Captured before Boot creates its initial autosave, so the welcome scene runs once. */
  public isFirstVisit(): boolean { return this.firstVisit; }

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
    this.update({
      ...current,
      activeQuestId: activatesBentCreek
        ? "explore_bent_creek"
        : activatesRyanRide ? "catch_ryan" : current.activeQuestId,
      completedQuestIds,
      questProgress,
      questHistory: unique([...current.questHistory, ...historyForQuestStage(current.activeQuestId, questStage)]),
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
    const current = this.replayState ?? this.state;
    const normalized = LEGACY_CONTROLLER_ITEMS.has(item) ? CONTROLLER_ITEM : item;
    if (current.inventory.includes(normalized)) return;
    this.update({ ...current, inventory: [...current.inventory, normalized] });
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

  public isMapUnlocked(mapId: SaveData["currentMap"]): boolean { return (this.replayState ?? this.state).unlockedMaps.includes(mapId); }
  public isBicycleUnlocked(): boolean { return (this.replayState ?? this.state).completedQuestIds.includes("catch_ryan"); }
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
    this.update({
      ...current,
      activeQuestId: !this.replayState && next === "complete" ? "explore_bent_creek" : current.activeQuestId,
      currentMap: currentMap ?? current.currentMap,
      discoveredMaps: currentMap ? unique<SaveData["currentMap"]>([...current.discoveredMaps, currentMap]) : current.discoveredMaps,
      unlockedMaps,
      completedQuestIds,
      questProgress: { ...copyQuestProgress(current.questProgress), ryanRide: { ...current.questProgress.ryanRide, stage: next } },
      questHistory: unique([...current.questHistory, ...historyForQuestStage("catch_ryan", next)]),
    });
  }

  /** Starts a temporary replay of any implemented quest. Nothing in this state is persisted. */
  public startQuestReplay(questId: QuestId): void {
    if (!["missing_controller", "andrew_mushroom_hunt", "three_player_sports", "catch_ryan", "explore_bent_creek"].includes(questId)) {
      throw new RangeError(`Quest ${questId} cannot be replayed yet`);
    }
    if (!this.state.completedQuestIds.includes(questId)) throw new RangeError("Only completed quests can be replayed");

    const questProgress = copyQuestProgress(this.state.questProgress);
    if (questId === "missing_controller") {
      questProgress.missingControllerStage = "talk_to_jeremy";
    } else if (questId === "andrew_mushroom_hunt") {
      questProgress.mushrooms = { ...questProgress.mushrooms, stage: "talk_to_andrew_for_mushrooms", collectedIds: [] };
    } else if (questId === "three_player_sports") {
      questProgress.sports.stage = "meet_jeremy_to_skateboard";
    } else if (questId === "catch_ryan") {
      questProgress.ryanRide = { stage: "invite", selectedDestination: null, routeSeed: null };
    } else {
      questProgress.exploreBentCreek = { stage: "open_gate" };
    }

    this.replayQuestId = questId;
    this.replayState = {
      ...copySave(this.state),
      activeChapterId: "chapter_1",
      activeQuestId: questId,
      questProgress,
      questHistory: [],
      inventory: [],
      secrets: [],
      currentMap: "neighborhood",
      discoveredMaps: ["neighborhood"],
      unlockedMaps: questId === "explore_bent_creek"
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
  public hasInventoryItem(item: string): boolean { return (this.replayState ?? this.state).inventory.includes(item); }
  public hasSecret(secret: string): boolean { return (this.replayState ?? this.state).secrets.includes(secret); }

  /** Starts a canonical fresh game while preserving the player's preferences. */
  public newGame(): void {
    const settings = { ...this.state.settings };
    this.replayState = null;
    this.replayQuestId = null;
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
    if (this.storage) {
      const stamped = { ...persisted, lastSavedAt: this.now().toISOString() };
      try {
        this.storage.setItem(STORAGE_KEY, JSON.stringify(stamped));
        persisted = stamped;
      } catch { /* Gameplay remains available and the previous successful timestamp is retained. */ }
    }
    this.state = persisted;
    gameEvents.emit(EVENT.stateChanged, this.getState());
  }
}

export const gameStore = new GameStore();
