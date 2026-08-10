import type { QuestModule } from "../../../../../engine/content/contracts";
import { CREEK_CLUBHOUSE_DEFINITION } from "./definition";
import { CREEK_CLUBHOUSE_MILESTONES, CREEK_CLUBHOUSE_STAGES } from "./rules";

export const CREEK_CLUBHOUSE_MODULE = {
  definition: CREEK_CLUBHOUSE_DEFINITION,
  migrationStatus: "native",
  stages: CREEK_CLUBHOUSE_STAGES,
  milestones: CREEK_CLUBHOUSE_MILESTONES,
  assets: [],
  runtimeMapIds: ["neighborhood", "creek"],
} as const satisfies QuestModule;
