import { describe, expect, it } from "vitest";

import { MISSING_CONTROLLER_MODULE } from "./module";
import { advanceMissingControllerStage } from "./rules";

describe("Missing Controller module", () => {
  it("owns its stable catalog metadata and runtime bindings", () => {
    expect(MISSING_CONTROLLER_MODULE).toMatchObject({
      migrationStatus: "native",
      definition: { id: "missing_controller", chapterId: "chapter_1" },
      runtimeMapIds: ["neighborhood", "creek"],
    });
  });

  it("advances through the authored sequence", () => {
    let stage = advanceMissingControllerStage("talk_to_billy", { type: "talked_to_billy" });
    stage = advanceMissingControllerStage(stage, { type: "talked_to_jeremy" });
    stage = advanceMissingControllerStage(stage, { type: "talked_to_andrew" });
    expect(stage).toBe("search_creek");
    stage = advanceMissingControllerStage(stage, { type: "picked_up_controller" });
    stage = advanceMissingControllerStage(stage, { type: "returned_controller" });
    expect(stage).toBe("complete");
  });

  it("ignores out-of-order and repeated events", () => {
    expect(advanceMissingControllerStage("talk_to_billy", { type: "talked_to_jeremy" }))
      .toBe("talk_to_billy");
    expect(advanceMissingControllerStage("talk_to_jeremy", { type: "picked_up_controller" }))
      .toBe("talk_to_jeremy");
    expect(advanceMissingControllerStage("complete", { type: "talked_to_jeremy" })).toBe("complete");
  });
});
