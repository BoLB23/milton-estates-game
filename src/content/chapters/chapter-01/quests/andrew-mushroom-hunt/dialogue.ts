import type { DialogueLine } from "../../../../../game/types";

export type MushroomDialogueId =
  | "ask_andrew"
  | "found_mushroom"
  | "feed_jeremy"
  | "place_billy"
  | "give_andrew";

const line = (speaker: string, text: string): DialogueLine => ({ speaker, text });
const copy = (lines: readonly DialogueLine[]): DialogueLine[] =>
  lines.map(({ speaker, text }) => ({ speaker, text }));

const MUSHROOM_DIALOGUE: Readonly<Record<MushroomDialogueId, readonly DialogueLine[]>> = {
  ask_andrew: [
    line("You", "Andrew, why do you need ten mushrooms?"),
    line("Andrew", "I want to make a tiny mushroom garden for the creek critters."),
    line("Andrew", "Find ten in the Milton backyards and Creek Woods, then share them around."),
    line("You", "All right. Ten mushrooms, three stops, no mushroom left behind."),
  ],
  found_mushroom: [
    line("You", "A mushroom! Andrew is going to love this little forest treasure."),
  ],
  feed_jeremy: [
    line("You", "Jeremy, Andrew said you should try this mushroom."),
    line("Jeremy", "A snack from the backyard? I trust you, but I have questions."),
    line("You", "One mushroom for Jeremy. Eight left for Andrew."),
  ],
  place_billy: [
    line("You", "This mushroom needs a home at Billy's house."),
    line("You", "There. A tiny garden for the windowsill, just like Andrew asked."),
  ],
  give_andrew: [
    line("You", "Here are the last eight mushrooms."),
    line("Andrew", "Perfect! Jeremy got one, Billy got one, and I get the rest."),
    line("You", "Ten mushrooms delivered exactly as promised."),
  ],
};

export const getMushroomDialogue = (id: MushroomDialogueId): DialogueLine[] =>
  copy(MUSHROOM_DIALOGUE[id]);
