export type Direction = "north" | "east" | "south" | "west";

export type MapId = "neighborhood" | "creek";

export type QuestStage =
  | "talk_to_jeremy"
  | "talk_to_andrew"
  | "search_yards"
  | "search_creek"
  | "return_to_jeremy"
  | "complete";

/** Stable, non-presentational IDs used to build the quest checklist/history. */
export type QuestMilestone =
  | "missing_controller.started"
  | "missing_controller.andrew_consulted"
  | "missing_controller.creek_clue_found"
  | "missing_controller.controller_recovered"
  | "missing_controller.controller_returned";

export interface PlayerSettings {
  masterVolume: number;
  muted: boolean;
  textSize: "small" | "medium" | "large";
  reducedMotion: boolean;
}

export interface SaveData {
  version: 2;
  questStage: QuestStage;
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
  interact: () => void;
}
