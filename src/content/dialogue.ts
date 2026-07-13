import type { DialogueLine, QuestStage } from "../game/types";

export type ClueId = "jeremys_driveway" | "side_yard_gap" | "creek_tracks";

export type BlockedRoute =
  | "bent_creek"
  | "stonehenge"
  | "reidenbaugh"
  | "fruitville";

type DialogueTable = Readonly<Record<QuestStage, readonly DialogueLine[]>>;

const line = (speaker: string, text: string): DialogueLine => ({ speaker, text });

const JEREMY: DialogueTable = {
  talk_to_jeremy: [
    line("Jeremy", "Billy! My Xbox controller vanished."),
    line("Jeremy", "Andrew was here earlier, acting way too innocent."),
    line("Billy", "I'll ask him. Try not to accuse the whole neighborhood yet."),
  ],
  talk_to_andrew: [line("Jeremy", "Andrew's outside. Start with Mr. Innocent.")],
  search_yards: [line("Jeremy", "Any clues? Check the yards before it grows legs.")],
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
  search_yards: [line("Andrew", "Look low. Controllers are terrible at climbing trees.")],
  search_creek: [line("Andrew", "Follow the creek. The tall grass keeps secrets.")],
  return_to_jeremy: [line("Andrew", "Found it? I was helpful in a mysterious way.")],
  complete: [line("Andrew", "For the record, the controller hid itself.")],
};

const CLUES: Readonly<Record<ClueId, DialogueTable>> = {
  jeremys_driveway: {
    talk_to_jeremy: [line("Billy", "Just an empty driveway. I should talk to Jeremy.")],
    talk_to_andrew: [line("Billy", "No controller here. Andrew might know more.")],
    search_yards: [line("Billy", "A trail of crushed grass heads toward my yard.")],
    search_creek: [line("Billy", "The trail keeps going toward the creek.")],
    return_to_jeremy: [line("Billy", "Mystery solved. Time to return the evidence.")],
    complete: [line("Billy", "No more clues needed today.")],
  },
  side_yard_gap: {
    talk_to_jeremy: [line("Billy", "The path can wait. Jeremy wanted me.")],
    talk_to_andrew: [line("Billy", "Something bent the grass, but I need a better clue.")],
    search_yards: [
      line("Billy", "Fresh sneaker marks lead between the houses."),
      line("Billy", "They turn behind my house, toward the creek."),
    ],
    search_creek: [line("Billy", "This is the way to the creek trail.")],
    return_to_jeremy: [line("Billy", "Shortcut home, then straight to Jeremy.")],
    complete: [line("Billy", "Our secret creek route never stays secret long.")],
  },
  creek_tracks: {
    talk_to_jeremy: [line("Billy", "I should find out what I'm looking for first.")],
    talk_to_andrew: [line("Billy", "Tracks by the creek? Better ask Andrew first.")],
    search_yards: [line("Billy", "The marks continue north beside the creek.")],
    search_creek: [line("Billy", "Flattened grass leads toward that fallen log.")],
    return_to_jeremy: [line("Billy", "I have the controller. Back to Jeremy.")],
    complete: [line("Billy", "Only muddy footprints remain.")],
  },
};

const CONTROLLER: DialogueTable = {
  talk_to_jeremy: [line("Billy", "A controller? I should ask Jeremy about it.")],
  talk_to_andrew: [line("Billy", "That looks important, but Andrew owes me an explanation.")],
  search_yards: [line("Billy", "Something is hidden here, but the trail continues creek-side.")],
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

export const getJeremyDialogue = (stage: QuestStage): DialogueLine[] => copy(JEREMY[stage]);

export const getAndrewDialogue = (stage: QuestStage): DialogueLine[] => copy(ANDREW[stage]);

export const getClueDialogue = (clue: ClueId, stage: QuestStage): DialogueLine[] =>
  copy(CLUES[clue][stage]);

export const getControllerDialogue = (stage: QuestStage): DialogueLine[] =>
  copy(CONTROLLER[stage]);

export const getQuestCompletionDialogue = (): DialogueLine[] => copy(COMPLETION);

export function getBlockedRouteDialogue(
  route: BlockedRoute,
  stage: QuestStage,
): DialogueLine[] {
  const objectiveReminder = stage === "complete"
    ? "Maybe another mission will lead that way."
    : "Billy has a controller mystery to solve first.";

  return [line("Billy", BLOCKED_ROUTE_TEXT[route]), line("Billy", objectiveReminder)];
}
