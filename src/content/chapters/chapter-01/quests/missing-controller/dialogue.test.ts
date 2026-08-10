import { describe, expect, it } from "vitest";

import { getBillyDialogue, getJeremyDialogue } from "./dialogue";

describe("Missing Controller dialogue", () => {
  it("has Billy welcome the player, explain repeat visits, and assign the first quest", () => {
    const lines = getBillyDialogue("talk_to_billy");
    expect(lines.map(({ speaker }) => speaker)).toEqual(["Billy", "Billy", "Billy", "Billy"]);
    expect(lines.map(({ text }) => text).join(" ")).toMatch(/Come back.*another neighborhood quest/i);
    expect(lines.map(({ text }) => text).join(" ")).toMatch(/missing Xbox controller/i);
  });

  it("returns defensive copies and treats the player as distinct from Billy", () => {
    const first = getBillyDialogue("talk_to_billy");
    first[0]!.text = "changed";
    expect(getBillyDialogue("talk_to_billy")[0]!.text).not.toBe("changed");
    expect(getJeremyDialogue("talk_to_jeremy").some(({ speaker }) => speaker === "You")).toBe(true);
  });
});
