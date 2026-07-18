import type { DialogueLine, MissingControllerStage, QuestStage } from "../game/types";

export type ClueId = "jeremys_driveway" | "side_yard_gap" | "creek_tracks";

export type BlockedRoute =
  | "bent_creek"
  | "stonehenge"
  | "reidenbaugh"
  | "fruitville";

type DialogueTable = Readonly<Record<MissingControllerStage, readonly DialogueLine[]>>;

const line = (speaker: string, text: string): DialogueLine => ({ speaker, text });

const JEREMY: DialogueTable = {
  talk_to_jeremy: [
    line("Jeremy", "Billy! My Xbox controller vanished."),
    line("Jeremy", "Andrew was here earlier, acting way too innocent."),
    line("Billy", "I'll ask him. Try not to accuse the whole neighborhood yet."),
  ],
  talk_to_andrew: [line("Jeremy", "Andrew's outside. Start with Mr. Innocent.")],
  search_creek: [line("Jeremy", "The creek? Great. My controller is outdoorsy now.")],
  return_to_jeremy: [
    line("Jeremy", "You found it! Please tell me it didn't go swimming."),
    line("Billy", "Tall grass. A little dirt. No swimming."),
  ],
  complete: [line("Jeremy", "Case closed. Rematch after I clean the mystery mud off.")],
};

const ANDREW: DialogueTable = {
  talk_to_jeremy: [line("Andrew", "Jeremy looks like he lost something. Again.")],
  talk_to_andrew: [
    line("Billy", "Jeremy's controller is missing. Know anything?"),
    line("Andrew", "Maybe it wanted fresh air."),
    line("Andrew", "I'd check the yards—and the gap beside your house."),
    line("Billy", "That was extremely specific."),
  ],
  search_creek: [line("Andrew", "Follow the creek. The tall grass keeps secrets.")],
  return_to_jeremy: [line("Andrew", "Found it? I was helpful in a mysterious way.")],
  complete: [line("Andrew", "For the record, the controller hid itself.")],
};

const CLUES: Readonly<Record<ClueId, DialogueTable>> = {
  jeremys_driveway: {
    talk_to_jeremy: [line("Billy", "Just an empty driveway. I should talk to Jeremy.")],
    talk_to_andrew: [line("Billy", "No controller here. Andrew might know more.")],
    search_creek: [line("Billy", "The trail keeps going toward the creek.")],
    return_to_jeremy: [line("Billy", "Mystery solved. Time to return the evidence.")],
    complete: [line("Billy", "No more clues needed today.")],
  },
  side_yard_gap: {
    talk_to_jeremy: [line("Billy", "The path can wait. Jeremy wanted me.")],
    talk_to_andrew: [line("Billy", "Something bent the grass, but I need a better clue.")],
    search_creek: [line("Billy", "This is the way to the creek trail.")],
    return_to_jeremy: [line("Billy", "Shortcut home, then straight to Jeremy.")],
    complete: [line("Billy", "Our secret creek route never stays secret long.")],
  },
  creek_tracks: {
    talk_to_jeremy: [line("Billy", "I should find out what I'm looking for first.")],
    talk_to_andrew: [line("Billy", "Tracks by the creek? Better ask Andrew first.")],
    search_creek: [line("Billy", "Flattened grass leads toward that fallen log.")],
    return_to_jeremy: [line("Billy", "I have the controller. Back to Jeremy.")],
    complete: [line("Billy", "Only muddy footprints remain.")],
  },
};

const CONTROLLER: DialogueTable = {
  talk_to_jeremy: [line("Billy", "A controller? I should ask Jeremy about it.")],
  talk_to_andrew: [line("Billy", "That looks important, but Andrew owes me an explanation.")],
  search_creek: [
    line("Billy", "Found it! Jeremy's controller was hiding in the tall grass."),
    line("Billy", "Good news: dry. Bad news: full of grass crumbs."),
  ],
  return_to_jeremy: [line("Billy", "Controller secured. Jeremy's next.")],
  complete: [line("Billy", "The grass is controller-free now.")],
};

const COMPLETION: readonly DialogueLine[] = [
  line("Billy", "Here. One slightly grass-flavored Xbox controller."),
  line("Jeremy", "Yes! I knew it wasn't gone forever."),
  line("Andrew", "Technically, I said it wanted fresh air."),
  line("Jeremy", "Technically, you're helping clean it."),
  line("Andrew", "I suddenly remember an appointment in another neighborhood."),
  line("Billy", "Mystery solved. Andrew mysteriously missing."),
];

const BLOCKED_ROUTE_TEXT: Readonly<Record<BlockedRoute, string>> = {
  bent_creek: "The road toward Bent Creek is closed for repairs.",
  stonehenge: "Construction blocks the way toward Stonehenge today.",
  reidenbaugh: "The path toward Reidenbaugh is too overgrown for this trip.",
  fruitville: "Fruitville Pike is off-limits without an adult.",
};

const copy = (lines: readonly DialogueLine[]): DialogueLine[] =>
  lines.map(({ speaker, text }) => ({ speaker, text }));

export const getJeremyDialogue = (stage: MissingControllerStage): DialogueLine[] => copy(JEREMY[stage]);

export const getAndrewDialogue = (stage: MissingControllerStage): DialogueLine[] => copy(ANDREW[stage]);

export const getClueDialogue = (clue: ClueId, stage: MissingControllerStage): DialogueLine[] =>
  copy(CLUES[clue][stage]);

export const getControllerDialogue = (stage: MissingControllerStage): DialogueLine[] =>
  copy(CONTROLLER[stage]);

export const getQuestCompletionDialogue = (): DialogueLine[] => copy(COMPLETION);

export type MushroomDialogueId =
  | "ask_andrew"
  | "found_mushroom"
  | "feed_jeremy"
  | "place_billy"
  | "give_andrew";

const MUSHROOM_DIALOGUE: Readonly<Record<MushroomDialogueId, readonly DialogueLine[]>> = {
  ask_andrew: [
    line("Billy", "Andrew, why do you need ten mushrooms?"),
    line("Andrew", "I want to make a tiny mushroom garden for the creek critters."),
    line("Andrew", "Find ten in the Milton backyards and Creek Woods, then share them around."),
    line("Billy", "All right. Ten mushrooms, three stops, no mushroom left behind."),
  ],
  found_mushroom: [line("Billy", "A mushroom! Andrew is going to love this little forest treasure.")],
  feed_jeremy: [
    line("Billy", "Jeremy, Andrew said you should try this mushroom."),
    line("Jeremy", "A snack from the backyard? I trust you, but I have questions."),
    line("Billy", "One mushroom for Jeremy. Eight left for Andrew."),
  ],
  place_billy: [
    line("Billy", "This mushroom needs a home at my house."),
    line("Billy", "There. A tiny garden for the windowsill, just like Andrew asked."),
  ],
  give_andrew: [
    line("Billy", "Here are the last eight mushrooms."),
    line("Andrew", "Perfect! Jeremy got one, Billy got one, and I get the rest."),
    line("Billy", "Ten mushrooms delivered exactly as promised."),
  ],
};

export const getMushroomDialogue = (id: MushroomDialogueId): DialogueLine[] => copy(MUSHROOM_DIALOGUE[id]);

export type SportsStop = "jeremy" | "billy" | "andrew";

const SPORTS_DIALOGUE: Readonly<Record<SportsStop, readonly DialogueLine[]>> = {
  jeremy: [
    line("Jeremy", "Everybody's here! Let's skateboard down the driveway together."),
    line("Andrew", "All three of us. No leaving Billy behind."),
    line("Billy", "First stop: skateboards."),
  ],
  billy: [
    line("Billy", "My house, my baseball, our turn at bat."),
    line("Jeremy", "Three players, one very serious backyard league."),
    line("Andrew", "I call batting cleanup."),
  ],
  andrew: [
    line("Andrew", "Basketball next. We all play until the streetlights come on."),
    line("Jeremy", "No spectators today. Everybody takes a shot."),
    line("Billy", "Three friends, three stops, one perfect summer afternoon."),
  ],
};

export const getSportsDialogue = (stop: SportsStop): DialogueLine[] => copy(SPORTS_DIALOGUE[stop]);

export function getBlockedRouteDialogue(
  route: BlockedRoute,
  stage: QuestStage,
): DialogueLine[] {
  const objectiveReminder = stage === "complete"
    ? "Maybe another mission will lead that way."
    : "Billy has a controller mystery to solve first.";

  return [line("Billy", BLOCKED_ROUTE_TEXT[route]), line("Billy", objectiveReminder)];
}
