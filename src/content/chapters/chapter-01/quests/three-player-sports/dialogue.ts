import type { DialogueLine } from "../../../../../game/types";

export type SportsStop = "jeremy" | "billy" | "andrew";

const line = (speaker: string, text: string): DialogueLine => ({ speaker, text });
const copy = (lines: readonly DialogueLine[]): DialogueLine[] =>
  lines.map(({ speaker, text }) => ({ speaker, text }));

const SPORTS_DIALOGUE: Readonly<Record<SportsStop, readonly DialogueLine[]>> = {
  jeremy: [
    line("Jeremy", "Everybody's here! Let's skateboard down the driveway together."),
    line("Andrew", "All three of us. No leaving anyone behind."),
    line("You", "First stop: skateboards."),
  ],
  billy: [
    line("You", "Billy's house, Billy's baseball, our turn at bat."),
    line("Jeremy", "Three players, one very serious backyard league."),
    line("Andrew", "I call batting cleanup."),
  ],
  andrew: [
    line("Andrew", "Basketball next. We all play until the streetlights come on."),
    line("Jeremy", "No spectators today. Everybody takes a shot."),
    line("You", "Three friends, three stops, one perfect summer afternoon."),
  ],
};

export const getSportsDialogue = (stop: SportsStop): DialogueLine[] => copy(SPORTS_DIALOGUE[stop]);
