import type {
  MapId,
  MushroomQuestStage,
  MushroomSpawn,
  QuestMilestone,
} from "../../../../../game/types";

export type MushroomQuestEvent =
  | { type: "talked_to_andrew_for_mushrooms" }
  | { type: "collected_all_mushrooms" }
  | { type: "fed_mushroom_to_jeremy" }
  | { type: "placed_mushroom_at_billy" }
  | { type: "gave_mushrooms_to_andrew" };

export const MUSHROOM_COUNT = 10;

export const MUSHROOM_STAGES = [
  "talk_to_andrew_for_mushrooms",
  "search_mushrooms",
  "feed_mushroom_to_jeremy",
  "place_mushroom_at_billy",
  "give_mushrooms_to_andrew",
  "complete",
] as const satisfies readonly MushroomQuestStage[];

export const MUSHROOM_MILESTONES = [
  "andrew_mushroom_hunt.started",
  "andrew_mushroom_hunt.all_collected",
  "andrew_mushroom_hunt.jeremy_fed",
  "andrew_mushroom_hunt.billy_supplied",
  "andrew_mushroom_hunt.andrew_supplied",
] as const satisfies readonly QuestMilestone[];

export const MUSHROOM_OBJECTIVES: Readonly<Record<MushroomQuestStage, string>> = {
  talk_to_andrew_for_mushrooms: "Ask Andrew why he needs ten mushrooms.",
  search_mushrooms: "Find all 10 mushrooms in Milton's backyards and Creek Woods.",
  feed_mushroom_to_jeremy: "Feed one mushroom to Jeremy at his house.",
  place_mushroom_at_billy: "Put one mushroom at Billy's house.",
  give_mushrooms_to_andrew: "Give the last 8 mushrooms to Andrew.",
  complete: "Mushroom mission complete! Andrew has his ten mushrooms.",
};

export const MUSHROOM_COMPLETED_MILESTONE_COUNT:
Readonly<Record<MushroomQuestStage, number>> = {
  talk_to_andrew_for_mushrooms: 0,
  search_mushrooms: 1,
  feed_mushroom_to_jeremy: 2,
  place_mushroom_at_billy: 3,
  give_mushrooms_to_andrew: 4,
  complete: 5,
};

/** Five backyard and five creek candidates are shuffled for every new save. */
const NEIGHBORHOOD_CANDIDATES: readonly Omit<MushroomSpawn, "id">[] = [
  { map: "neighborhood", x: 655, y: 330 },
  { map: "neighborhood", x: 875, y: 350 },
  { map: "neighborhood", x: 1045, y: 285 },
  { map: "neighborhood", x: 1585, y: 360 },
  { map: "neighborhood", x: 2145, y: 360 },
  { map: "neighborhood", x: 470, y: 520 },
  { map: "neighborhood", x: 970, y: 525 },
  { map: "neighborhood", x: 1615, y: 535 },
  { map: "neighborhood", x: 2180, y: 535 },
  { map: "neighborhood", x: 820, y: 610 },
  { map: "neighborhood", x: 1465, y: 540 },
  { map: "neighborhood", x: 1950, y: 590 },
];

const CREEK_CANDIDATES: readonly Omit<MushroomSpawn, "id">[] = [
  { map: "creek", x: 410, y: 320 },
  { map: "creek", x: 720, y: 365 },
  { map: "creek", x: 1450, y: 350 },
  { map: "creek", x: 1700, y: 610 },
  { map: "creek", x: 480, y: 1080 },
  { map: "creek", x: 760, y: 1270 },
  { map: "creek", x: 1430, y: 1110 },
  { map: "creek", x: 1690, y: 1230 },
  { map: "creek", x: 620, y: 740 },
  { map: "creek", x: 1500, y: 820 },
  { map: "creek", x: 830, y: 980 },
  { map: "creek", x: 1320, y: 1240 },
];

function randomUnit(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function chooseFive<T>(values: readonly T[], random: () => number): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled.slice(0, 5);
}

/**
 * Creates the ten authored-but-randomized locations for Andrew's hunt.
 * The generated result is persisted so mushrooms do not move after reload.
 */
export function createMushroomSpawns(seed: number): MushroomSpawn[] {
  const random = randomUnit(seed);
  const selected = [
    ...chooseFive(NEIGHBORHOOD_CANDIDATES, random),
    ...chooseFive(CREEK_CANDIDATES, random),
  ];
  return selected.map((spawn, index) => ({
    ...spawn,
    id: `mushroom_${String(index + 1).padStart(2, "0")}`,
  }));
}

export function mushroomCountForMap(
  spawns: readonly MushroomSpawn[],
  map: MapId,
): number {
  return spawns.filter((spawn) => spawn.map === map).length;
}

export function advanceMushroomStage(
  current: MushroomQuestStage,
  event: MushroomQuestEvent,
): MushroomQuestStage {
  switch (current) {
    case "talk_to_andrew_for_mushrooms":
      return event.type === "talked_to_andrew_for_mushrooms" ? "search_mushrooms" : current;
    case "search_mushrooms":
      return event.type === "collected_all_mushrooms" ? "feed_mushroom_to_jeremy" : current;
    case "feed_mushroom_to_jeremy":
      return event.type === "fed_mushroom_to_jeremy" ? "place_mushroom_at_billy" : current;
    case "place_mushroom_at_billy":
      return event.type === "placed_mushroom_at_billy" ? "give_mushrooms_to_andrew" : current;
    case "give_mushrooms_to_andrew":
      return event.type === "gave_mushrooms_to_andrew" ? "complete" : current;
    default:
      return current;
  }
}
