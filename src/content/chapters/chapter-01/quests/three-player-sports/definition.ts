import type { QuestDefinition } from "../../../../../engine/content/contracts";

export const THREE_PLAYER_SPORTS_DEFINITION = {
  id: "three_player_sports",
  chapterId: "chapter_1",
  title: "Three-Player Sports Day",
  description: "Meet Jeremy to skateboard, play baseball at Billy's house, and meet Andrew for basketball.",
  kind: "side",
  required: false,
  optional: true,
  prerequisiteQuestIds: ["andrew_mushroom_hunt"],
  implemented: true,
} as const satisfies QuestDefinition;
