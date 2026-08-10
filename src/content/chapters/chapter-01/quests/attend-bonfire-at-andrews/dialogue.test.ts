import { describe, expect, it } from "vitest";
import { getBonfireDialogue } from "./dialogue";

describe("bonfire dialogue", () => {
  it("keeps Schwartz distinct and avoids naming the puff", () => {
    const welcome = getBonfireDialogue("schwartz_welcome");
    const initiation = getBonfireDialogue("initiation");
    const text = [...welcome, ...initiation].map((line) => line.text).join(" ");
    expect(welcome[0]?.speaker).toBe("Schwartz");
    expect(text).toMatch(/Andrew's having a bonfire/i);
    expect(text).toMatch(/Take a puff/i);
    expect(text).not.toMatch(/cannabis/i);
    expect(initiation.map((line) => line.speaker)).toEqual(expect.arrayContaining(["Andrew", "Billy", "Jeremy", "Ryan", "Schwartz"]));
  });
});
