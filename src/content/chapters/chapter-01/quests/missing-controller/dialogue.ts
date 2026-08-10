import type {
  DialogueLine,
  MissingControllerStage,
  QuestStage,
} from "../../../../../game/types";

export type ClueId = "jeremys_driveway" | "side_yard_gap" | "creek_tracks";
export type BlockedRoute = "bent_creek" | "stonehenge" | "reidenbaugh" | "fruitville";

type DialogueTable = Readonly<Record<MissingControllerStage, readonly DialogueLine[]>>;

const line = (speaker: string, text: string): DialogueLine => ({ speaker, text });
const copy = (lines: readonly DialogueLine[]): DialogueLine[] =>
  lines.map(({ speaker, text }) => ({ speaker, text }));

const BILLY: DialogueTable = {
  talk_to_billy: [
    line("Billy", "Welcome to Wheatfield Drive! I'm Billy."),
    line("Billy", "Jeremy lives nearby, and Andrew is usually outside looking for something interesting."),
    line("Billy", "Come back and talk to me whenever you want another neighborhood quest—or need to restart one."),
    line("Billy", "For your first quest, Jeremy needs help finding his missing Xbox controller."),
  ],
  talk_to_jeremy: [line("Billy", "Jeremy is waiting outside his house. He'll tell you what went missing.")],
  talk_to_andrew: [line("Billy", "Andrew knows more about Jeremy's controller than he's saying.")],
  search_creek: [line("Billy", "Follow Andrew's clue toward the creek and check the tall grass.")],
  return_to_jeremy: [line("Billy", "You found the controller. Take it back to Jeremy to finish the quest.")],
  complete: [line("Billy", "Nice work. Come back whenever you're ready for another quest.")],
};

const JEREMY: DialogueTable = {
  talk_to_billy: [line("Jeremy", "Billy can get you started. He's outside his house.")],
  talk_to_jeremy: [
    line("Jeremy", "Hey! My Xbox controller vanished."),
    line("Jeremy", "Andrew was here earlier, acting way too innocent."),
    line("You", "I'll ask him. Try not to accuse the whole neighborhood yet."),
  ],
  talk_to_andrew: [line("Jeremy", "Andrew's outside. Start with Mr. Innocent.")],
  search_creek: [line("Jeremy", "The creek? Great. My controller is outdoorsy now.")],
  return_to_jeremy: [
    line("Jeremy", "You found it! Please tell me it didn't go swimming."),
    line("You", "Tall grass. A little dirt. No swimming."),
  ],
  complete: [line("Jeremy", "Case closed. Rematch after I clean the mystery mud off.")],
};

const ANDREW: DialogueTable = {
  talk_to_billy: [line("Andrew", "New neighbor? Billy's the one to ask about adventures around here.")],
  talk_to_jeremy: [line("Andrew", "Jeremy looks like he lost something. Again.")],
  talk_to_andrew: [
    line("You", "Jeremy's controller is missing. Know anything?"),
    line("Andrew", "Maybe it wanted fresh air."),
    line("Andrew", "I'd check the yards—and the gap beside your house."),
    line("You", "That was extremely specific."),
  ],
  search_creek: [line("Andrew", "Follow the creek. The tall grass keeps secrets.")],
  return_to_jeremy: [line("Andrew", "Found it? I was helpful in a mysterious way.")],
  complete: [line("Andrew", "For the record, the controller hid itself.")],
};

const CLUES: Readonly<Record<ClueId, DialogueTable>> = {
  jeremys_driveway: {
    talk_to_billy: [line("You", "I should meet Billy before I start exploring clues.")],
    talk_to_jeremy: [line("You", "Just an empty driveway. I should talk to Jeremy.")],
    talk_to_andrew: [line("You", "No controller here. Andrew might know more.")],
    search_creek: [line("You", "The trail keeps going toward the creek.")],
    return_to_jeremy: [line("You", "Mystery solved. Time to return the evidence.")],
    complete: [line("You", "No more clues needed today.")],
  },
  side_yard_gap: {
    talk_to_billy: [line("You", "Billy asked me to meet him first.")],
    talk_to_jeremy: [line("You", "The path can wait. Jeremy wanted me.")],
    talk_to_andrew: [line("You", "Something bent the grass, but I need a better clue.")],
    search_creek: [line("You", "This is the way to the creek trail.")],
    return_to_jeremy: [line("You", "Shortcut home, then straight to Jeremy.")],
    complete: [line("You", "Our secret creek route never stays secret long.")],
  },
  creek_tracks: {
    talk_to_billy: [line("You", "I don't know what I'm looking for yet. I should talk to Billy.")],
    talk_to_jeremy: [line("You", "I should find out what I'm looking for first.")],
    talk_to_andrew: [line("You", "Tracks by the creek? Better ask Andrew first.")],
    search_creek: [line("You", "Flattened grass leads toward that fallen log.")],
    return_to_jeremy: [line("You", "I have the controller. Back to Jeremy.")],
    complete: [line("You", "Only muddy footprints remain.")],
  },
};

const CONTROLLER: DialogueTable = {
  talk_to_billy: [line("You", "I should talk to Billy before picking up anything important.")],
  talk_to_jeremy: [line("You", "A controller? I should ask Jeremy about it.")],
  talk_to_andrew: [line("You", "That looks important, but Andrew owes me an explanation.")],
  search_creek: [
    line("You", "Found it! Jeremy's controller was hiding in the tall grass."),
    line("You", "Good news: dry. Bad news: full of grass crumbs."),
  ],
  return_to_jeremy: [line("You", "Controller secured. Jeremy's next.")],
  complete: [line("You", "The grass is controller-free now.")],
};

const COMPLETION: readonly DialogueLine[] = [
  line("You", "Here. One slightly grass-flavored Xbox controller."),
  line("Jeremy", "Yes! I knew it wasn't gone forever."),
  line("Andrew", "Technically, I said it wanted fresh air."),
  line("Jeremy", "Technically, you're helping clean it."),
  line("Andrew", "I suddenly remember an appointment in another neighborhood."),
  line("You", "Mystery solved. Andrew mysteriously missing."),
];

const BLOCKED_ROUTE_TEXT: Readonly<Record<BlockedRoute, string>> = {
  bent_creek: "The road toward Bent Creek is closed for repairs.",
  stonehenge: "Construction blocks the way toward Stonehenge today.",
  reidenbaugh: "The path toward Reidenbaugh is too overgrown for this trip.",
  fruitville: "Fruitville Pike is off-limits without an adult.",
};

export const getJeremyDialogue = (stage: MissingControllerStage): DialogueLine[] => copy(JEREMY[stage]);
export const getAndrewDialogue = (stage: MissingControllerStage): DialogueLine[] => copy(ANDREW[stage]);
export const getBillyDialogue = (stage: MissingControllerStage): DialogueLine[] => copy(BILLY[stage]);
export const getClueDialogue = (clue: ClueId, stage: MissingControllerStage): DialogueLine[] =>
  copy(CLUES[clue][stage]);
export const getControllerDialogue = (stage: MissingControllerStage): DialogueLine[] =>
  copy(CONTROLLER[stage]);
export const getQuestCompletionDialogue = (): DialogueLine[] => copy(COMPLETION);

export function getBlockedRouteDialogue(route: BlockedRoute, stage: QuestStage): DialogueLine[] {
  const objectiveReminder = stage === "complete"
    ? "Maybe another mission will lead that way."
    : "Billy has a controller mystery to solve first.";
  return [line("You", BLOCKED_ROUTE_TEXT[route]), line("You", objectiveReminder)];
}
