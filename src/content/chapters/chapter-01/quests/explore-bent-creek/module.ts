import type { QuestModule } from "../../../../../engine/content/contracts";
import { EXPLORE_BENT_CREEK_DEFINITION } from "./definition";
import {
  EXPLORE_BENT_CREEK_MILESTONES,
  EXPLORE_BENT_CREEK_STAGES,
} from "./rules";

export const EXPLORE_BENT_CREEK_MODULE = {
  definition: EXPLORE_BENT_CREEK_DEFINITION,
  migrationStatus: "native",
  stages: EXPLORE_BENT_CREEK_STAGES,
  milestones: EXPLORE_BENT_CREEK_MILESTONES,
  assets: [],
  runtimeMapIds: ["fruitville_pike", "bent_creek"],
} as const satisfies QuestModule;
