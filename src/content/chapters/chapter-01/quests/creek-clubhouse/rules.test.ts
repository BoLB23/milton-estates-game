import { describe, expect, it } from "vitest";
import { CREEK_CLUBHOUSE_MODULE } from "./module";
import { advanceCreekClubhouseStage, hasAllClubhouseSupplies } from "./rules";

describe("Creek Clubhouse rules", () => {
  it("owns a native quest module with both required map bindings", () => {
    expect(CREEK_CLUBHOUSE_MODULE.runtimeMapIds).toEqual(["neighborhood", "creek"]);
    expect(CREEK_CLUBHOUSE_MODULE.stages).toContain("secret_knock");
  });

  it("only advances in its authored order", () => {
    let stage = advanceCreekClubhouseStage("talk_to_andrew", { type: "talked_to_andrew" });
    stage = advanceCreekClubhouseStage(stage, { type: "design_chosen", design: "hidden_den" });
    stage = advanceCreekClubhouseStage(stage, { type: "supplies_collected" });
    stage = advanceCreekClubhouseStage(stage, { type: "construction_finished" });
    expect(advanceCreekClubhouseStage(stage, { type: "knock_matched" })).toBe("complete");
    expect(advanceCreekClubhouseStage("collect_supplies", { type: "knock_matched" })).toBe("collect_supplies");
  });

  it("requires all distinct supply types", () => {
    expect(hasAllClubhouseSupplies(["rope", "blanket"])).toBe(false);
    expect(hasAllClubhouseSupplies(["rope", "blanket", "branches"])).toBe(true);
  });
});
