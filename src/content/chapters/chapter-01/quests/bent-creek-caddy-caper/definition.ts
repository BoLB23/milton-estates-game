import type { QuestDefinition } from "../../../../../engine/content/contracts";

/** A self-contained Bent Creek side story, unlocked after the gate introduction. */
export const BENT_CREEK_CADDY_CAPER_DEFINITION = {
  id: "bent_creek_caddy_caper",
  chapterId: "chapter_1",
  title: "The Bent Creek Caddy Caper",
  description: "Help Billy recover Schwartz's ceremonial trophy before Mickey turns it into another race.",
  kind: "side",
  required: false,
  optional: true,
  prerequisiteQuestIds: ["explore_bent_creek"],
  implemented: true,
} as const satisfies QuestDefinition;
