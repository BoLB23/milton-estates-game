import type { QuestDefinition } from "../../../../../engine/content/contracts";

/** Ryan's post-school relay across the Reidenbaugh grounds. */
export const PAPER_AIRPLANE_RELAY_DEFINITION = {
  id: "paper_airplane_relay",
  chapterId: "chapter_1",
  title: "Ryan's Paper Airplane Relay",
  description: "Build Ryan's best paper airplane, follow it through Reidenbaugh, and deliver its secret Milton message.",
  kind: "side",
  required: false,
  optional: true,
  prerequisiteQuestIds: ["catch_ryan"],
  implemented: true,
} as const satisfies QuestDefinition;
