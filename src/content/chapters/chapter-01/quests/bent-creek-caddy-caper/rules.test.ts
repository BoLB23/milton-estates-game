import { describe, expect, it } from "vitest";
import { BENT_CREEK_CADDY_CAPER_MODULE } from "./module";
import { advanceCaddyCaperStage } from "./rules";

describe("Bent Creek Caddy Caper rules", () => {
  it("advances only through its authored recovery sequence", () => {
    let stage = advanceCaddyCaperStage("inspect_display", { type: "display_inspected" });
    stage = advanceCaddyCaperStage(stage, { type: "clues_followed" });
    stage = advanceCaddyCaperStage(stage, { type: "gates_putted" });
    stage = advanceCaddyCaperStage(stage, { type: "sprinklers_set" });
    stage = advanceCaddyCaperStage(stage, { type: "trophy_caught" });
    expect(advanceCaddyCaperStage(stage, { type: "trophy_returned" })).toBe("complete");
    expect(advanceCaddyCaperStage("follow_clues", { type: "trophy_returned" })).toBe("follow_clues");
  });

  it("declares Bent Creek as its only runtime map", () => {
    expect(BENT_CREEK_CADDY_CAPER_MODULE.runtimeMapIds).toEqual(["bent_creek"]);
  });
});
