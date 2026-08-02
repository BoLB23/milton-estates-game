import type { QuestDefinition } from "../../../../../engine/content/contracts";

export const EXPLORE_BENT_CREEK_DEFINITION = {
  id: "explore_bent_creek",
  chapterId: "chapter_1",
  title: "Explore Bent Creek",
  description: "Ride through Fruitville Pike and convince the Bent Creek gate attendant to open the gate.",
  kind: "side",
  required: false,
  optional: true,
  prerequisiteQuestIds: ["catch_ryan"],
  implemented: true,
} as const satisfies QuestDefinition;
