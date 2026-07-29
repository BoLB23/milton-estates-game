import type { QuestDefinition } from "../../../../../engine/content/contracts";

export const MUSHROOM_HUNT_DEFINITION = {
  id: "andrew_mushroom_hunt",
  chapterId: "chapter_1",
  title: "Mushrooms for Andrew",
  description: "Find ten mushrooms across Milton's backyards and Creek Woods, then share them with the neighborhood.",
  kind: "side",
  required: false,
  optional: true,
  prerequisiteQuestIds: ["missing_controller"],
  implemented: true,
} as const satisfies QuestDefinition;
