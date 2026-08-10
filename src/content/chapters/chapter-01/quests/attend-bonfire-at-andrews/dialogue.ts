import type { DialogueLine } from "../../../../../game/types";

export type BonfireDialogueId = "schwartz_welcome" | "schwartz_decline" | "initiation" | "jeremy_failed" | "player_initiated";

const line = (speaker: string, text: string): DialogueLine => ({ speaker, text });
const copy = (lines: readonly DialogueLine[]): DialogueLine[] => lines.map(({ speaker, text }) => ({ speaker, text }));

const BONFIRE_DIALOGUE: Readonly<Record<BonfireDialogueId, readonly DialogueLine[]>> = {
  schwartz_welcome: [
    line("Schwartz", "Welcome to Bent Creek. Its social topography is surprisingly welcoming once you acclimate."),
    line("Schwartz", "Andrew's having a bonfire tonight. Are you going?"),
    line("You", "Yeah, I'll go."),
    line("Schwartz", "Excellent. Consider this an invitation to a highly memorable evening."),
  ],
  schwartz_decline: [
    line("You", "Not tonight."),
    line("Schwartz", "A defensible position. The invitation remains available should your disposition evolve."),
  ],
  initiation: [
    line("Andrew", "You made it. Pull up a spot by the fire."),
    line("Billy", "Andrew, is it time to initiate them into the crew?"),
    line("Andrew", "Billy and I are already in. Jeremy goes first."),
    line("Jeremy", "What do I have to do?"),
    line("Billy", "Take a puff, then eat one Dorito chip from the fire. Then you're in."),
    line("Ryan", "It sounds easy until you're standing there."),
    line("Schwartz", "The ritual has a certain… ceremonial gravity."),
  ],
  jeremy_failed: [
    line("Jeremy", "I got it—"),
    line("Jeremy", "COUGH! COUGH!"),
    line("Billy", "Try again. You were close."),
    line("Jeremy", "I can totally do this."),
    line("Andrew", "Jeremy? Hey—he passed out."),
    line("Andrew", "He'll be fine. He can try again next time."),
    line("Billy", "Your turn."),
  ],
  player_initiated: [
    line("You", "I made it back."),
    line("Billy", "You got the Dorito. You're in the crew."),
    line("Andrew", "Welcome in."),
    line("Ryan", "That was a seriously weird night."),
    line("Schwartz", "An unforgettable conclusion to a remarkably eventful evening."),
  ],
};

export const getBonfireDialogue = (id: BonfireDialogueId): DialogueLine[] => copy(BONFIRE_DIALOGUE[id]);
