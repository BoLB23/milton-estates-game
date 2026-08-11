import { describe, expect, it } from "vitest";

import { QUEST_BY_ID, type RegistryProgress } from "./chapters";
import { selectDefaultQuestId, selectQuestJournalAction } from "./questJournal";

function progress(overrides: Partial<RegistryProgress> = {}): RegistryProgress {
  return {
    activeChapterId: "chapter_1",
    activeQuestId: "missing_controller",
    completedChapterIds: [],
    completedQuestIds: [],
    ...overrides,
  };
}

describe("quest journal policy", () => {
  it("selects the first available quest after a completed canonical active quest", () => {
    expect(selectDefaultQuestId(progress({ completedQuestIds: ["missing_controller"] })))
      .toBe("andrew_mushroom_hunt");
  });

  it("keeps a canonical in-progress quest selected", () => {
    expect(selectDefaultQuestId(progress({
      activeQuestId: "andrew_mushroom_hunt",
      completedQuestIds: ["missing_controller"],
    }))).toBe("andrew_mushroom_hunt");
  });

  it("keeps the active replay selected and gives it replay precedence", () => {
    const state = progress({
      completedQuestIds: ["missing_controller", "andrew_mushroom_hunt"],
      replayQuestId: "missing_controller",
    });
    expect(selectDefaultQuestId(state)).toBe("missing_controller");
    expect(selectQuestJournalAction(QUEST_BY_ID.missing_controller, state)).toBe("continue-replay");
    expect(selectQuestJournalAction(QUEST_BY_ID.andrew_mushroom_hunt, state)).toBe("locked");
  });

  it("chooses deterministic canonical and first-quest fallbacks", () => {
    expect(selectDefaultQuestId(progress({
      activeQuestId: "catch_ryan",
      completedQuestIds: ["missing_controller", "andrew_mushroom_hunt", "three_player_sports", "catch_ryan", "explore_bent_creek", "attend_bonfire_at_andrews", "creek_clubhouse", "paper_airplane_relay", "bent_creek_caddy_caper", "storm_drain_detectives", "creek_token_hunt", "last_day_of_summer"],
    }))).toBe("catch_ryan");
    expect(selectDefaultQuestId(progress({
      // A malformed legacy row is not normally representable by GameState,
      // but the pure fallback remains deterministic for recovery tooling.
      activeQuestId: "unknown_legacy_quest" as never,
      completedQuestIds: ["missing_controller", "andrew_mushroom_hunt", "three_player_sports", "catch_ryan", "explore_bent_creek", "attend_bonfire_at_andrews", "creek_clubhouse", "paper_airplane_relay", "bent_creek_caddy_caper", "storm_drain_detectives", "creek_token_hunt", "last_day_of_summer"],
    }))).toBe("missing_controller");
  });

  it("maps canonical states to the appropriate row actions", () => {
    expect(selectQuestJournalAction(QUEST_BY_ID.missing_controller, progress())).toBe("continue-quest");
    expect(selectQuestJournalAction(QUEST_BY_ID.andrew_mushroom_hunt, progress({ completedQuestIds: ["missing_controller"] }))).toBe("start-quest");
    expect(selectQuestJournalAction(QUEST_BY_ID.missing_controller, progress({ completedQuestIds: ["missing_controller"] }))).toBe("replay-quest");
    expect(selectQuestJournalAction(QUEST_BY_ID.storm_drain_detectives, progress())).toBe("locked");
  });
});
