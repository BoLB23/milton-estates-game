import type { QuestModule } from "../../../../../engine/content/contracts";
import { BENT_CREEK_CADDY_CAPER_DEFINITION } from "./definition";
import { CADDY_CAPER_MILESTONES, CADDY_CAPER_STAGES } from "./rules";

export const BENT_CREEK_CADDY_CAPER_MODULE = {
  definition: BENT_CREEK_CADDY_CAPER_DEFINITION,
  migrationStatus: "native",
  stages: CADDY_CAPER_STAGES,
  milestones: CADDY_CAPER_MILESTONES,
  assets: [],
  runtimeMapIds: ["bent_creek"],
} as const satisfies QuestModule;
