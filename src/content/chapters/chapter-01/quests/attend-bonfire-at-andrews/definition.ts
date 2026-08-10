import type { QuestDefinition } from "../../../../../engine/content/contracts";

export const ATTEND_BONFIRE_AT_ANDREWS_DEFINITION = {
  id: "attend_bonfire_at_andrews",
  chapterId: "chapter_1",
  title: "Attend Bonfire at Andrew's",
  description: "Schwartz invites you to a Bent Creek bonfire and a strange crew initiation.",
  kind: "side",
  required: false,
  optional: true,
  prerequisiteQuestIds: ["explore_bent_creek"],
  implemented: true,
} as const satisfies QuestDefinition;
