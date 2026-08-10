import { describe, expect, it } from "vitest";
import { ATTEND_BONFIRE_AT_ANDREWS_DEFINITION } from "./definition";
import {
  advanceBonfireQuestStage,
  BONFIRE_QUEST_MILESTONES,
  BONFIRE_QUEST_STAGES,
} from "./rules";

describe("Attend Bonfire at Andrew's rules", () => {
  it("keeps the Schwartz invitation and initiation stages in order", () => {
    expect(BONFIRE_QUEST_STAGES).toEqual(["talk_to_schwartz", "attend_bonfire", "survive_bad_trip", "complete"]);
    expect(advanceBonfireQuestStage("talk_to_schwartz", { type: "arrived_at_andrews" })).toBe("talk_to_schwartz");
    expect(advanceBonfireQuestStage("talk_to_schwartz", { type: "accepted_schwartz_invitation" })).toBe("attend_bonfire");
    expect(advanceBonfireQuestStage("attend_bonfire", { type: "arrived_at_andrews" })).toBe("survive_bad_trip");
    expect(advanceBonfireQuestStage("survive_bad_trip", { type: "survived_bad_trip" })).toBe("complete");
  });

  it("is a gated Bent Creek follow-up with stable milestones", () => {
    expect(ATTEND_BONFIRE_AT_ANDREWS_DEFINITION.prerequisiteQuestIds).toEqual(["explore_bent_creek"]);
    expect(BONFIRE_QUEST_MILESTONES).toContain("attend_bonfire_at_andrews.bad_trip_survived");
  });
});
