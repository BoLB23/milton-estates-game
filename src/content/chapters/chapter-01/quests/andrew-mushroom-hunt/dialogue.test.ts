import { describe, expect, it } from "vitest";

import { getMushroomDialogue } from "./dialogue";

describe("Andrew Mushroom Hunt dialogue", () => {
  it("preserves the authored request and handoff copy", () => {
    expect(getMushroomDialogue("ask_andrew")).toEqual([
      { speaker: "Billy", text: "Andrew, why do you need ten mushrooms?" },
      {
        speaker: "Andrew",
        text: "I want to make a tiny mushroom garden for the creek critters.",
      },
      {
        speaker: "Andrew",
        text: "Find ten in the Milton backyards and Creek Woods, then share them around.",
      },
      {
        speaker: "Billy",
        text: "All right. Ten mushrooms, three stops, no mushroom left behind.",
      },
    ]);
    expect(getMushroomDialogue("give_andrew")).toHaveLength(3);
  });

  it("returns fresh line objects so callers cannot mutate authored content", () => {
    const first = getMushroomDialogue("found_mushroom");
    const second = getMushroomDialogue("found_mushroom");

    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
    first[0]!.text = "changed";
    expect(second[0]!.text)
      .toBe("A mushroom! Andrew is going to love this little forest treasure.");
  });
});
