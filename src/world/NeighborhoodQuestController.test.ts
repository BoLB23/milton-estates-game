import { describe, expect, it } from "vitest";

import { createBillyQuestChoices, selectBillyInteractionMode } from "./NeighborhoodQuestController";

describe("Billy's single neighborhood interaction", () => {
  it("opens the journal before the first quest starts", () => {
    expect(selectBillyInteractionMode("missing_controller", "talk_to_billy", false))
      .toBe("quest_journal");
  });

  it("prioritizes an available quest handoff at Billy's location", () => {
    expect(selectBillyInteractionMode("andrew_mushroom_hunt", "place_mushroom_at_billy", true))
      .toBe("quest_action");
    expect(selectBillyInteractionMode("three_player_sports", "meet_billy_to_play_baseball", true))
      .toBe("quest_action");
  });

  it("offers both the immediate quest action and quest management", () => {
    expect(createBillyQuestChoices("Place a mushroom at Billy's house")).toEqual([
      { id: "quest_action", label: "Place a mushroom at Billy's house" },
      { id: "quest_journal", label: "Open quest journal" },
      { id: "back", label: "Not right now" },
    ]);
  });

  it("opens the dedicated journal when Billy has no immediate quest action", () => {
    expect(selectBillyInteractionMode("andrew_mushroom_hunt", "search_mushrooms", false))
      .toBe("quest_journal");
    expect(selectBillyInteractionMode("missing_controller", "talk_to_jeremy", false))
      .toBe("quest_journal");
  });
});
