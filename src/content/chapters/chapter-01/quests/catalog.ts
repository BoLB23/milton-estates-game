import type {
  QuestDefinition,
  QuestModule,
} from "../../../../engine/content/contracts";

function legacyQuestModule(
  definition: QuestDefinition,
  runtimeMapIds: QuestModule["runtimeMapIds"],
): QuestModule {
  return {
    definition,
    migrationStatus: "legacy",
    assets: [],
    runtimeMapIds,
  };
}

export const CATCH_RYAN_MODULE = legacyQuestModule({
  id: "catch_ryan",
  chapterId: "chapter_1",
  title: "Catch Ryan",
  description: "Ryan challenges Billy to a bicycle ride out to Reidenbaugh.",
  kind: "side",
  required: false,
  optional: true,
  prerequisiteQuestIds: ["three_player_sports"],
  implemented: true,
}, ["neighborhood", "stonehenge", "reidenbaugh"]);

export const STORM_DRAIN_DETECTIVES_MODULE = legacyQuestModule({
  id: "storm_drain_detectives",
  chapterId: "chapter_1",
  title: "Storm Drain Detectives",
  description: "A future neighborhood mystery, penciled into Billy's journal.",
  kind: "main",
  required: true,
  optional: false,
  prerequisiteQuestIds: ["missing_controller"],
  implemented: false,
}, []);

export const CREEK_TOKEN_HUNT_MODULE = legacyQuestModule({
  id: "creek_token_hunt",
  chapterId: "chapter_1",
  title: "Creek Token Hunt",
  description: "A future optional hunt through Creek Woods.",
  kind: "side",
  required: false,
  optional: true,
  prerequisiteQuestIds: ["missing_controller"],
  implemented: false,
}, []);

export const LAST_DAY_OF_SUMMER_MODULE = legacyQuestModule({
  id: "last_day_of_summer",
  chapterId: "chapter_1",
  title: "The Last Day of Summer",
  description: "Chapter finale. Finish every required memory to unlock it.",
  kind: "finale",
  required: true,
  optional: false,
  prerequisiteQuestIds: [],
  implemented: false,
}, []);
