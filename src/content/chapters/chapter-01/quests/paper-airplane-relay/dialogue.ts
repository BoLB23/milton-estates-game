import type { DialogueLine } from "../../../../../game/types";
import type { PaperAirplaneAdvisor, PaperAirplaneMaterial } from "./rules";

export const PAPER_AIRPLANE_ADVICE: Readonly<Record<PaperAirplaneAdvisor, DialogueLine[]>> = {
  ryan: [
    { speaker: "Ryan", text: "A good plane has a sharp nose. Mine is going all the way to Milton!" },
    { speaker: "Ryan", text: "Get everybody's ideas, then meet me by the playground." },
  ],
  billy: [
    { speaker: "Billy", text: "Use a clean sheet. Creases remember every mistake." },
    { speaker: "Billy", text: "And make both wings match, or it will turn into a paper boomerang." },
  ],
  andrew: [
    { speaker: "Andrew", text: "A stiff card wing gives it glide. Put a message inside so the flight counts." },
    { speaker: "Andrew", text: "If it lands by the court, look for the painted symbols." },
  ],
};

export const PAPER_AIRPLANE_MATERIAL_COPY: Readonly<Record<PaperAirplaneMaterial, DialogueLine[]>> = {
  clean_sheet: [{ speaker: "You", text: "A clean sheet — no old homework lines. Perfect." }],
  card_wing: [{ speaker: "You", text: "A stiff card wing. Ryan was right about the glide." }],
  message_strip: [{ speaker: "You", text: "A narrow message strip, already marked with tiny symbols." }],
};

export const PAPER_AIRPLANE_LAUNCH: DialogueLine[] = [
  { speaker: "Ryan", text: "Three, two, one — relay launch! Stay under it when the gusts pull it sideways." },
];

export const PAPER_AIRPLANE_DECODED: DialogueLine[] = [
  { speaker: "You", text: "The court symbols say: “ANDREW — MEET US BY THE STONEHENGE SHORTCUT.”" },
  { speaker: "Ryan", text: "That counts! Deliver it to Andrew and tell him the route is real." },
];
