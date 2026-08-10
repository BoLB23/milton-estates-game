import type { QuestDefinition } from "../../../../../engine/content/contracts";

export const CREEK_CLUBHOUSE_DEFINITION = {
  id: "creek_clubhouse",
  chapterId: "chapter_1",
  title: "The Creek Clubhouse",
  description: "Help Andrew turn a fallen-log clearing into the neighborhood's best-kept secret.",
  kind: "side",
  required: false,
  optional: true,
  prerequisiteQuestIds: ["andrew_mushroom_hunt"],
  implemented: true,
} as const satisfies QuestDefinition;
