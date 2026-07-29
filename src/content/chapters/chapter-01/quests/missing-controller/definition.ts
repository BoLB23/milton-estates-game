import type { QuestDefinition } from "../../../../../engine/content/contracts";

export const MISSING_CONTROLLER_DEFINITION = {
  id: "missing_controller",
  chapterId: "chapter_1",
  title: "The Missing Controller",
  description: "Help Jeremy track down his missing Xbox controller.",
  kind: "main",
  required: true,
  optional: false,
  prerequisiteQuestIds: [],
  implemented: true,
} as const satisfies QuestDefinition;
