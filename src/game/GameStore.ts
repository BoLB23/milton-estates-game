import { EVENT, gameEvents } from "./events";
import type { ChapterId, MapId, PlayerSettings, QuestId, QuestMilestone, QuestStage, SaveData } from "./types";

const STORAGE_KEY = "milton-estates-save";
const LEGACY_CONTROLLER_ITEMS = new Set(["xbox-controller", "xbox controller"]);
export const CONTROLLER_ITEM = "xbox_controller";

const QUEST_STAGES: readonly QuestStage[] = [
  "talk_to_jeremy", "talk_to_andrew", "search_yards", "search_creek",
  "return_to_jeremy", "complete",
];
const MAP_IDS: readonly MapId[] = ["neighborhood", "creek"];
const QUEST_MILESTONES: readonly QuestMilestone[] = [
  "missing_controller.started", "missing_controller.andrew_consulted",
  "missing_controller.creek_clue_found", "missing_controller.controller_recovered",
  "missing_controller.controller_returned",
];

const DEFAULT_SETTINGS: PlayerSettings = {
  masterVolume: 1,
  muted: false,
  textSize: "medium",
  reducedMotion: false,
};

const DEFAULT_SAVE: SaveData = {
  version: 3,
  activeChapterId: "chapter_1",
  activeQuestId: "missing_controller",
  completedChapterIds: [],
  completedQuestIds: [],
  questStage: "talk_to_jeremy",
  questHistory: [],
  inventory: [],
  secrets: [],
  currentMap: "neighborhood",
  discoveredMaps: ["neighborhood"],
  settings: DEFAULT_SETTINGS,
  lastSavedAt: null,
};

type SaveDataV2 = Omit<SaveData, "version" | "activeChapterId" | "activeQuestId" | "completedChapterIds" | "completedQuestIds"> & { version: 2 };
type LegacySaveData = Omit<SaveDataV2, "version" | "questHistory" | "discoveredMaps" | "settings" | "lastSavedAt"> & { version: 1 };

function copySave(save: SaveData): SaveData {
  return {
    ...save,
    completedChapterIds: [...save.completedChapterIds],
    completedQuestIds: [...save.completedQuestIds],
    questHistory: [...save.questHistory],
    inventory: [...save.inventory],
    secrets: [...save.secrets],
    discoveredMaps: [...save.discoveredMaps],
    settings: { ...save.settings },
  };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function normalizeInventory(inventory: string[]): string[] {
  return unique(inventory.map((item) => LEGACY_CONTROLLER_ITEMS.has(item) ? CONTROLLER_ITEM : item));
}

function historyForStage(stage: QuestStage): QuestMilestone[] {
  const count: Record<QuestStage, number> = {
    talk_to_jeremy: 0,
    talk_to_andrew: 1,
    search_yards: 2,
    search_creek: 3,
    return_to_jeremy: 4,
    complete: 5,
  };
  return QUEST_MILESTONES.slice(0, count[stage]);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isEnumArray<T extends string>(value: unknown, allowed: readonly T[]): value is T[] {
  return Array.isArray(value) && value.every((item) => allowed.some((candidate) => candidate === item));
}

function isQuestStage(value: unknown): value is QuestStage {
  return QUEST_STAGES.some((stage) => stage === value);
}

function isMapId(value: unknown): value is MapId {
  return MAP_IDS.some((map) => map === value);
}

function isChapterId(value: unknown): value is ChapterId {
  return value === "chapter_1";
}

function isQuestId(value: unknown): value is QuestId {
  return value === "missing_controller" || value === "storm_drain_detectives"
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

function isLegacySave(value: unknown): value is LegacySaveData {
  if (typeof value !== "object" || value === null) return false;
  const save = value as Partial<LegacySaveData>;
  return save.version === 1 && isQuestStage(save.questStage) && isStringArray(save.inventory)
    && isStringArray(save.secrets) && isMapId(save.currentMap);
}

function isSaveDataV2(value: unknown): value is SaveDataV2 {
  if (typeof value !== "object" || value === null) return false;
  const save = value as Partial<SaveDataV2>;
  return save.version === 2 && isQuestStage(save.questStage)
    && isEnumArray(save.questHistory, QUEST_MILESTONES)
    && isStringArray(save.inventory) && isStringArray(save.secrets)
    && isMapId(save.currentMap) && isEnumArray(save.discoveredMaps, MAP_IDS)
    && isSettings(save.settings)
    && (save.lastSavedAt === null || (typeof save.lastSavedAt === "string" && !Number.isNaN(Date.parse(save.lastSavedAt))));
}

function isSaveData(value: unknown): value is SaveData {
  if (typeof value !== "object" || value === null) return false;
  const save = value as Partial<SaveData>;
  return save.version === 3 && isChapterId(save.activeChapterId) && isQuestId(save.activeQuestId)
    && isEnumArray(save.completedChapterIds, ["chapter_1"] as const)
    && isEnumArray(save.completedQuestIds, ["missing_controller", "storm_drain_detectives", "creek_token_hunt", "last_day_of_summer"] as const)
    && isQuestStage(save.questStage) && isEnumArray(save.questHistory, QUEST_MILESTONES)
    && isStringArray(save.inventory) && isStringArray(save.secrets)
    && isMapId(save.currentMap) && isEnumArray(save.discoveredMaps, MAP_IDS)
    && isSettings(save.settings)
    && (save.lastSavedAt === null || (typeof save.lastSavedAt === "string" && !Number.isNaN(Date.parse(save.lastSavedAt))));
}

function normalizeSave(save: SaveData): SaveData {
  return {
    ...save,
    completedChapterIds: unique(save.completedChapterIds),
    completedQuestIds: unique([
      ...save.completedQuestIds,
      ...(save.questStage === "complete" ? ["missing_controller" as const] : []),
    ]),
    questHistory: unique(save.questHistory),
    inventory: normalizeInventory(save.inventory),
    secrets: unique(save.secrets),
    discoveredMaps: unique(["neighborhood", save.currentMap, ...save.discoveredMaps]),
    settings: { ...save.settings },
  };
}

function migrateV2Save(save: SaveDataV2): SaveData {
  return normalizeSave({
    ...save,
    version: 3,
    activeChapterId: "chapter_1",
    activeQuestId: "missing_controller",
    completedChapterIds: [],
    completedQuestIds: save.questStage === "complete" ? ["missing_controller"] : [],
  });
}

function migrateLegacySave(save: LegacySaveData): SaveData {
  return migrateV2Save({
    version: 2,
    questStage: save.questStage,
    questHistory: historyForStage(save.questStage),
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

export class GameStore {
  private state: SaveData;
  private replayState: SaveData | null = null;
  private replayQuestId: QuestId | null = null;

  public constructor(
    private readonly storage: Storage | undefined = browserStorage(),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.state = this.load();
  }

  public getState(): SaveData { return copySave(this.replayState ?? this.state); }
  public getCanonicalState(): SaveData { return copySave(this.state); }
  public isReplaying(): boolean { return this.replayState !== null; }
  public getReplayQuestId(): QuestId | null { return this.replayQuestId; }

  public setQuestStage(questStage: QuestStage): void {
    const current = this.replayState ?? this.state;
    if (questStage === current.questStage) return;
    const inferredHistory = historyForStage(questStage);
    const completedQuestIds = !this.replayState && questStage === "complete"
      ? unique([...current.completedQuestIds, current.activeQuestId])
      : current.completedQuestIds;
    this.update({ ...current, questStage, completedQuestIds, questHistory: unique([...current.questHistory, ...inferredHistory]) });
  }

  public recordQuestMilestone(milestone: QuestMilestone): void {
    const current = this.replayState ?? this.state;
    if (current.questHistory.includes(milestone)) return;
    this.update({ ...current, questHistory: [...current.questHistory, milestone] });
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

  public setCurrentMap(currentMap: MapId): void {
    const current = this.replayState ?? this.state;
    if (currentMap === current.currentMap && current.discoveredMaps.includes(currentMap)) return;
    this.update({ ...current, currentMap, discoveredMaps: unique([...current.discoveredMaps, currentMap]) });
  }

  public discoverMap(map: MapId): void {
    const current = this.replayState ?? this.state;
    if (current.discoveredMaps.includes(map)) return;
    this.update({ ...current, discoveredMaps: [...current.discoveredMaps, map] });
  }

  public updateSettings(settings: Partial<PlayerSettings>): void {
    const current = this.replayState ?? this.state;
    const next = { ...current.settings, ...settings };
    if (!isSettings(next)) throw new RangeError("Invalid player settings");
    this.update({ ...current, settings: next });
  }

  public setActiveQuest(activeChapterId: ChapterId, activeQuestId: QuestId): void {
    const current = this.replayState ?? this.state;
    this.update({ ...current, activeChapterId, activeQuestId });
  }

  /** Starts a temporary Missing Controller run. Nothing in this state is persisted. */
  public startQuestReplay(questId: QuestId): void {
    if (questId !== "missing_controller") throw new RangeError(`Quest ${questId} cannot be replayed yet`);
    if (!this.state.completedQuestIds.includes(questId)) throw new RangeError("Only completed quests can be replayed");
    this.replayQuestId = questId;
    this.replayState = {
      ...copySave(this.state),
      activeChapterId: "chapter_1",
      activeQuestId: questId,
      questStage: "talk_to_jeremy",
      questHistory: [],
      inventory: [],
      secrets: [],
      currentMap: "neighborhood",
      discoveredMaps: ["neighborhood"],
    };
    gameEvents.emit(EVENT.stateChanged, this.getState());
  }

  public endQuestReplay(): void {
    if (!this.replayState) return;
    this.replayState = null;
    this.replayQuestId = null;
    gameEvents.emit(EVENT.stateChanged, this.getState());
  }

  public saveNow(): void { this.update(this.replayState ?? this.state); }
  public hasInventoryItem(item: string): boolean { return (this.replayState ?? this.state).inventory.includes(item); }
  public hasSecret(secret: string): boolean { return (this.replayState ?? this.state).secrets.includes(secret); }
  /** Starts a canonical fresh game while preserving the player's preferences. */
  public newGame(): void {
    const settings = { ...this.state.settings };
    this.replayState = null;
    this.replayQuestId = null;
    this.update({ ...copySave(DEFAULT_SAVE), settings });
  }
  public reset(): void {
    if (this.replayState && this.replayQuestId) {
      const questId = this.replayQuestId;
      this.replayState = null;
      this.replayQuestId = null;
      this.startQuestReplay(questId);
      return;
    }
    this.update(copySave(DEFAULT_SAVE));
  }

  private load(): SaveData {
    if (!this.storage) return copySave(DEFAULT_SAVE);
    try {
      const serialized = this.storage.getItem(STORAGE_KEY);
      if (serialized === null) return copySave(DEFAULT_SAVE);
      const parsed: unknown = JSON.parse(serialized);
      if (isSaveData(parsed)) return normalizeSave(parsed);
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
