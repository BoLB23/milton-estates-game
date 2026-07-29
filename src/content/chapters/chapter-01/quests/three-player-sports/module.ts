import type { QuestModule } from "../../../../../engine/content/contracts";
import { THREE_PLAYER_SPORTS_DEFINITION } from "./definition";
import { SPORTS_MILESTONES, SPORTS_STAGES } from "./rules";

export const THREE_PLAYER_SPORTS_MODULE = {
  definition: THREE_PLAYER_SPORTS_DEFINITION,
  migrationStatus: "native",
  stages: SPORTS_STAGES,
  milestones: SPORTS_MILESTONES,
  assets: [],
  runtimeMapIds: ["neighborhood"],
} as const satisfies QuestModule;
