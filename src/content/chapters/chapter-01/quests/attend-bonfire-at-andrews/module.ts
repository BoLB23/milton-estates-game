import type { QuestModule } from "../../../../../engine/content/contracts";
import { ATTEND_BONFIRE_AT_ANDREWS_DEFINITION } from "./definition";
import { BONFIRE_QUEST_MILESTONES, BONFIRE_QUEST_STAGES } from "./rules";

export const ATTEND_BONFIRE_AT_ANDREWS_MODULE = {
  definition: ATTEND_BONFIRE_AT_ANDREWS_DEFINITION,
  migrationStatus: "native",
  stages: BONFIRE_QUEST_STAGES,
  milestones: BONFIRE_QUEST_MILESTONES,
  assets: [],
  runtimeMapIds: ["bent_creek", "neighborhood"],
} as const satisfies QuestModule;
