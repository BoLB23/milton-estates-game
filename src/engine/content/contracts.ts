import type {
  ChapterId,
  MapId,
  QuestId,
  QuestMilestone,
} from "../../game/types";

export type QuestKind = "main" | "side" | "finale";

export interface QuestDefinition {
  id: QuestId;
  chapterId: ChapterId;
  title: string;
  description: string;
  kind: QuestKind;
  required: boolean;
  optional: boolean;
  prerequisiteQuestIds: readonly QuestId[];
  implemented: boolean;
}

export interface ChapterDefinition {
  id: ChapterId;
  number: number;
  title: string;
  description: string;
  dateLabel: string;
  coverAssetKey: string;
  prerequisiteChapterId?: ChapterId;
  quests: readonly QuestDefinition[];
}

export type AssetKind = "image" | "spritesheet" | "tilemap";

/** A globally unique Phaser cache key and the public URL that owns it. */
export interface AssetManifestEntry {
  readonly key: string;
  readonly kind: AssetKind;
  readonly path: string;
}

/**
 * The catalog-safe portion of a quest module. Quest-local reducers and codecs
 * retain their concrete State/Event types beside the authored content.
 */
interface QuestModuleBase {
  readonly definition: QuestDefinition;
  readonly assets: readonly AssetManifestEntry[];
  readonly runtimeMapIds: readonly MapId[];
}

export interface NativeQuestModule extends QuestModuleBase {
  readonly migrationStatus: "native";
  readonly stages: readonly string[];
  readonly milestones: readonly QuestMilestone[];
}

/** Temporary adapter removed as each existing quest becomes a native module. */
export interface LegacyQuestModule extends QuestModuleBase {
  readonly migrationStatus: "legacy";
}

export type QuestModule = NativeQuestModule | LegacyQuestModule;

export interface ChapterModule {
  readonly definition: Omit<ChapterDefinition, "quests">;
  readonly quests: readonly QuestModule[];
  readonly assets: readonly AssetManifestEntry[];
}
