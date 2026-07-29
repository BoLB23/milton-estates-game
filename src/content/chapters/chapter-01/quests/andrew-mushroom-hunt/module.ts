import type { QuestModule } from "../../../../../engine/content/contracts";
import { MUSHROOM_HUNT_DEFINITION } from "./definition";
import {
  MUSHROOM_MILESTONES,
  MUSHROOM_STAGES,
} from "./rules";

export const MUSHROOM_HUNT_MODULE = {
  definition: MUSHROOM_HUNT_DEFINITION,
  migrationStatus: "native",
  stages: MUSHROOM_STAGES,
  milestones: MUSHROOM_MILESTONES,
  assets: [],
  runtimeMapIds: ["neighborhood", "creek"],
} as const satisfies QuestModule;
