import type { DialogueLine } from "../../../../../game/types";

export type CreekClubhouseDialogueId =
  | "pitch" | "rope" | "blanket" | "branches" | "supplies_ready" | "construction" | "knock" | "complete" | "shortcut";

const line = (speaker: string, text: string): DialogueLine => ({ speaker, text });
const copy = (lines: readonly DialogueLine[]): DialogueLine[] => lines.map(({ speaker, text }) => ({ speaker, text }));

const DIALOGUE: Readonly<Record<CreekClubhouseDialogueId, readonly DialogueLine[]>> = {
  pitch: [
    line("Andrew", "I found the perfect spot by the fallen log. We can build before Jeremy tells everyone."),
    line("Andrew", "Pick a design, borrow a rope from Billy, a blanket from Jeremy, and find sturdy creek branches."),
    line("You", "A secret clubhouse needs a very un-secret amount of teamwork."),
  ],
  rope: [line("Billy", "Take this rope — return it only if the clubhouse has a snack shelf.")],
  blanket: [line("Jeremy", "This blanket is camouflage. Also it has dinosaurs, which is tactical.")],
  branches: [line("You", "These branches are straight enough for a roof and crooked enough to look cool.")],
  supplies_ready: [line("Andrew", "Everything's here. Floor first, frame second, tarp last — don't let the roof become the floor!")],
  construction: [line("Andrew", "Nice timing! Keep the hammer hits on the bright mark and build in order.")],
  knock: [line("Jeremy", "For security, the knock is tap, tap, pause, tap. I made it up, so it is definitely secure.")],
  complete: [
    line("Andrew", "The tarp worked! Our clubhouse is officially invisible from at least one angle."),
    line("Jeremy", "And officially open. Crawl fast before anyone calls it a shed."),
    line("You", "Creek Clubhouse journal page earned — and the clearing path is now a shortcut home."),
  ],
  shortcut: [line("You", "The little flag points to the quick path back to Wheatfield Drive.")],
};

export function getCreekClubhouseDialogue(id: CreekClubhouseDialogueId): DialogueLine[] { return copy(DIALOGUE[id]); }
