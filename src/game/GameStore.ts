import { EVENT, gameEvents } from "./events";
import type { MapId, PlayerSettings, QuestMilestone, QuestStage, SaveData } from "./types";

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
  version: 2,
  questStage: "talk_to_jeremy",
  questHistory: [],
  inventory: [],
  secrets: [],
  currentMap: "neighborhood",
  discoveredMaps: ["neighborhood"],
  settings: DEFAULT_SETTINGS,
  lastSavedAt: null,
};

type LegacySaveData = Omit<SaveData, "version" | "questHistory" | "discoveredMaps" | "settings" | "lastSavedAt"> & { version: 1 };

function copySave(save: SaveData): SaveData {
  return {
    ...save,
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

function isSaveData(value: unknown): value is SaveData {
  if (typeof value !== "object" || value === null) return false;
  const save = value as Partial<SaveData>;
  return save.version === 2 && isQuestStage(save.questStage)
    && isEnumArray(save.questHistory, QUEST_MILESTONES)
    && isStringArray(save.inventory) && isStringArray(save.secrets)
    && isMapId(save.currentMap) && isEnumArray(save.discoveredMaps, MAP_IDS)
    && isSettings(save.settings)
    && (save.lastSavedAt === null || (typeof save.lastSavedAt === "string" && !Number.isNaN(Date.parse(save.lastSavedAt))));
}

function normalizeSave(save: SaveData): SaveData {
  return {
    ...save,
    questHistory: unique(save.questHistory),
    inventory: normalizeInventory(save.inventory),
    secrets: unique(save.secrets),
    discoveredMaps: unique(["neighborhood", save.currentMap, ...save.discoveredMaps]),
    settings: { ...save.settings },
  };
}

function migrateLegacySave(save: LegacySaveData): SaveData {
  return normalizeSave({
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

  public constructor(
    private readonly storage: Storage | undefined = browserStorage(),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.state = this.load();
  }

  public getState(): SaveData { return copySave(this.state); }

  public setQuestStage(questStage: QuestStage): void {
    if (questStage === this.state.questStage) return;
    const inferredHistory = historyForStage(questStage);
    this.update({ ...this.state, questStage, questHistory: unique([...this.state.questHistory, ...inferredHistory]) });
  }

  public recordQuestMilestone(milestone: QuestMilestone): void {
    if (this.state.questHistory.includes(milestone)) return;
    this.update({ ...this.state, questHistory: [...this.state.questHistory, milestone] });
  }

  public addInventoryItem(item: string): void {
    const normalized = LEGACY_CONTROLLER_ITEMS.has(item) ? CONTROLLER_ITEM : item;
    if (this.state.inventory.includes(normalized)) return;
    this.update({ ...this.state, inventory: [...this.state.inventory, normalized] });
  }

  public addSecret(secret: string): void {
    if (this.state.secrets.includes(secret)) return;
    this.update({ ...this.state, secrets: [...this.state.secrets, secret] });
  }

  public setCurrentMap(currentMap: MapId): void {
    if (currentMap === this.state.currentMap && this.state.discoveredMaps.includes(currentMap)) return;
    this.update({ ...this.state, currentMap, discoveredMaps: unique([...this.state.discoveredMaps, currentMap]) });
  }

  public discoverMap(map: MapId): void {
    if (this.state.discoveredMaps.includes(map)) return;
    this.update({ ...this.state, discoveredMaps: [...this.state.discoveredMaps, map] });
  }

  public updateSettings(settings: Partial<PlayerSettings>): void {
    const next = { ...this.state.settings, ...settings };
    if (!isSettings(next)) throw new RangeError("Invalid player settings");
    this.update({ ...this.state, settings: next });
  }

  public saveNow(): void { this.update(this.state); }
  public hasInventoryItem(item: string): boolean { return this.state.inventory.includes(item); }
  public hasSecret(secret: string): boolean { return this.state.secrets.includes(secret); }
  public reset(): void { this.update(copySave(DEFAULT_SAVE)); }

  private load(): SaveData {
    if (!this.storage) return copySave(DEFAULT_SAVE);
    try {
      const serialized = this.storage.getItem(STORAGE_KEY);
      if (serialized === null) return copySave(DEFAULT_SAVE);
      const parsed: unknown = JSON.parse(serialized);
      if (isSaveData(parsed)) return normalizeSave(parsed);
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
