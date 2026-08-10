import type { QuestModule } from "../../../../../engine/content/contracts";
import { PAPER_AIRPLANE_RELAY_DEFINITION } from "./definition";
import { PAPER_AIRPLANE_RELAY_MILESTONES, PAPER_AIRPLANE_RELAY_STAGES } from "./rules";

export const PAPER_AIRPLANE_RELAY_MODULE = {
  definition: PAPER_AIRPLANE_RELAY_DEFINITION,
  migrationStatus: "native",
  stages: PAPER_AIRPLANE_RELAY_STAGES,
  milestones: PAPER_AIRPLANE_RELAY_MILESTONES,
  assets: [],
  runtimeMapIds: ["reidenbaugh", "neighborhood", "stonehenge"],
} as const satisfies QuestModule;
