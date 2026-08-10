import type { DialogueLine } from "../../../../../game/types";
import type { CaddyCaperStage } from "./rules";

export const CADDY_CAPER_DIALOGUE: Readonly<Record<CaddyCaperStage, readonly DialogueLine[]>> = {
  inspect_display: [
    { speaker: "Billy", text: "Mickey knocked Schwartz's shiny trophy onto the cart path. We can get it back before anyone panics." },
    { speaker: "Schwartz", text: "My ceremonial Bent Creek cup is a rather distinctive gold fellow — please observe the display label." },
  ],
  follow_clues: [{ speaker: "Billy", text: "Golf balls point the way. Wait for a gap before crossing a cart lane!" }],
  putt_gates: [{ speaker: "Billy", text: "Three practice gates. Give each ball a clean, straight tap." }],
  sprinklers: [{ speaker: "Billy", text: "The trophy is under that hedge. The sprinkler valves read blue, gold, then green." }],
  chase_trophy: [{ speaker: "Mickey", text: "Catch it if you can, caddy!" }],
  return_trophy: [{ speaker: "Schwartz", text: "You found it! The display is ready for its guest of honor." }],
  complete: [{ speaker: "Schwartz", text: "An honorary visitor badge, Billy. Please use your new cart-path wisdom responsibly." }],
};
