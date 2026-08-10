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

/**
 * Mushroom pickup prompts become active within 62px, so authored candidates
 * stay at least one full prompt diameter apart. This prevents two randomized
 * pickups from competing for the same interaction press.
 */
export const MUSHROOM_INTERACTION_CLEARANCE = 128;

/** Five backyard and five creek candidates are shuffled for every new save. */
const NEIGHBORHOOD_CANDIDATES: readonly Omit<MushroomSpawn, "id">[] = [
  { map: "neighborhood", x: 144, y: 336 },
  { map: "neighborhood", x: 336, y: 336 },
  { map: "neighborhood", x: 528, y: 336 },
  { map: "neighborhood", x: 720, y: 336 },
  { map: "neighborhood", x: 912, y: 336 },
  { map: "neighborhood", x: 1104, y: 336 },
  { map: "neighborhood", x: 1296, y: 336 },
  { map: "neighborhood", x: 240, y: 816 },
  { map: "neighborhood", x: 464, y: 816 },
  { map: "neighborhood", x: 688, y: 816 },
  { map: "neighborhood", x: 944, y: 816 },
  { map: "neighborhood", x: 1232, y: 816 },
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

type MushroomMap = "neighborhood" | "creek";

const CANDIDATES_BY_MAP: Readonly<Record<MushroomMap, readonly Omit<MushroomSpawn, "id">[]>> = {
  neighborhood: NEIGHBORHOOD_CANDIDATES,
  creek: CREEK_CANDIDATES,
};

/** Exposes immutable copies so the authored map acceptance tests cover every candidate. */
export function getAuthoredMushroomSpawnCandidates(
  map: MushroomMap,
): readonly Omit<MushroomSpawn, "id">[] {
  return CANDIDATES_BY_MAP[map].map((candidate) => ({ ...candidate }));
}

function positionKey(spawn: Pick<MushroomSpawn, "x" | "y">): string {
  return `${spawn.x},${spawn.y}`;
}

/**
 * Persisted coordinates are only safe when they still name an authored
 * candidate. A simple world-bounds check is insufficient because resized map
 * art can put an old in-bounds coordinate inside a house or collision region.
 */
export function isAuthoredMushroomSpawnPosition(
  spawn: Pick<MushroomSpawn, "map" | "x" | "y">,
): boolean {
  if (spawn.map !== "neighborhood" && spawn.map !== "creek") return false;
  return CANDIDATES_BY_MAP[spawn.map].some((candidate) =>
    candidate.x === spawn.x && candidate.y === spawn.y,
  );
}

/**
 * Repairs a structurally sound persisted layout after authored map positions
 * change. Stable spawn IDs (and therefore collected progress) remain attached
 * to the same map; valid positions do not move. Invalid or duplicate positions
 * are deterministically assigned to unused authored candidates.
 */
export function repairMushroomSpawnLayout(
  spawns: readonly MushroomSpawn[],
): MushroomSpawn[] | undefined {
  if (spawns.length !== MUSHROOM_COUNT || new Set(spawns.map(({ id }) => id)).size !== MUSHROOM_COUNT) {
    return undefined;
  }
  if (spawns.filter(({ map }) => map === "neighborhood").length !== MUSHROOM_COUNT / 2
    || spawns.filter(({ map }) => map === "creek").length !== MUSHROOM_COUNT / 2) {
    return undefined;
  }

  const repaired = spawns.map((spawn) => ({ ...spawn }));
  for (const map of ["neighborhood", "creek"] as const) {
    const usedPositions = new Set<string>();
    const needsReplacement: number[] = [];
    repaired.forEach((spawn, index) => {
      if (spawn.map !== map) return;
      const key = positionKey(spawn);
      if (!isAuthoredMushroomSpawnPosition(spawn) || usedPositions.has(key)) {
        needsReplacement.push(index);
        return;
      }
      usedPositions.add(key);
    });

    const available = CANDIDATES_BY_MAP[map].filter((candidate) =>
      !usedPositions.has(positionKey(candidate)),
    );
    if (available.length < needsReplacement.length) return undefined;
    needsReplacement.forEach((spawnIndex, replacementIndex) => {
      const replacement = available[replacementIndex]!;
      repaired[spawnIndex] = { ...repaired[spawnIndex]!, ...replacement, map };
    });
  }
  return repaired;
}

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
