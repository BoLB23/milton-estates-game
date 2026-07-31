import type { ChapterModule } from "../../../engine/content/contracts";
import {
  CATCH_RYAN_MODULE,
  CREEK_TOKEN_HUNT_MODULE,
  LAST_DAY_OF_SUMMER_MODULE,
  STORM_DRAIN_DETECTIVES_MODULE,
} from "./quests/catalog";
import { MUSHROOM_HUNT_MODULE } from "./quests/andrew-mushroom-hunt/module";
import { MISSING_CONTROLLER_MODULE } from "./quests/missing-controller/module";
import { THREE_PLAYER_SPORTS_MODULE } from "./quests/three-player-sports/module";

export const CHAPTER_ONE_MODULE = {
  definition: {
    id: "chapter_1",
    number: 1,
    title: "Summer in Milton Estates",
    description: "Long afternoons, neighborhood mysteries, and the paths into Creek Woods.",
    dateLabel: "Summer 2007",
    coverAssetKey: "chapter-1-cover",
  },
  quests: [
    MISSING_CONTROLLER_MODULE,
    MUSHROOM_HUNT_MODULE,
    THREE_PLAYER_SPORTS_MODULE,
    CATCH_RYAN_MODULE,
    STORM_DRAIN_DETECTIVES_MODULE,
    CREEK_TOKEN_HUNT_MODULE,
    LAST_DAY_OF_SUMMER_MODULE,
  ],
  assets: [
    {
      key: "chapter-1-cover",
      kind: "image",
      path: "assets/concepts/chapter-1-neighborhood-concept.png",
    },
    {
      key: "regional-foldout-map",
      kind: "image",
      path: "assets/concepts/phase-a/regional-foldout-map-target.png",
    },
  ],
} as const satisfies ChapterModule;
