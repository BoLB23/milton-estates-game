import { describe, expect, it } from "vitest";
import { SPORTS_MEETUPS, isSportsMeetupStage } from "./neighborhoodPresentation";

describe("Sports Day meetup presentation", () => {
  it("keeps every playable stage mapped to exactly one authored stop", () => {
    expect(Object.keys(SPORTS_MEETUPS)).toEqual([
      "meet_jeremy_to_skateboard",
      "meet_billy_to_play_baseball",
      "meet_andrew_to_play_basketball",
    ]);
    expect(SPORTS_MEETUPS.meet_billy_to_play_baseball).toMatchObject({ anchor: "billy", prop: "baseball" });
  });

  it("does not try to render a meetup after the quest completes", () => {
    expect(isSportsMeetupStage("complete")).toBe(false);
    expect(isSportsMeetupStage("meet_andrew_to_play_basketball")).toBe(true);
  });
});
