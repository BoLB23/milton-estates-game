import type { QuestModule } from "../../../../../engine/content/contracts";
import { MISSING_CONTROLLER_DEFINITION } from "./definition";
import {
  MISSING_CONTROLLER_MILESTONES,
  MISSING_CONTROLLER_STAGES,
} from "./rules";

export const MISSING_CONTROLLER_MODULE = {
  definition: MISSING_CONTROLLER_DEFINITION,
  migrationStatus: "native",
  stages: MISSING_CONTROLLER_STAGES,
  milestones: MISSING_CONTROLLER_MILESTONES,
  assets: [],
  runtimeMapIds: ["neighborhood", "creek"],
} as const satisfies QuestModule;
