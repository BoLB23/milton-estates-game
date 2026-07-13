import { describe, expect, it } from "vitest";
import {
  MISSING_CONTROLLER_MILESTONES,
  selectMissingControllerQuestDisplay,
} from "./questHistory";

describe("Missing Controller quest-history display", () => {
  it("marks prior beats complete and the active stage current", () => {
    const display = selectMissingControllerQuestDisplay("search_creek");

    expect(display.status).toBe("active");
    expect(display.checklist.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "missing_controller.started", status: "completed" },
      { id: "missing_controller.andrew_consulted", status: "completed" },
      { id: "missing_controller.creek_clue_found", status: "completed" },
      { id: "missing_controller.controller_recovered", status: "current" },
      { id: "missing_controller.controller_returned", status: "upcoming" },
    ]);
    expect(display.completedHistory).toHaveLength(3);
  });

  it("shows a complete, ordered history after the controller is returned", () => {
    const display = selectMissingControllerQuestDisplay("complete");

    expect(display.status).toBe("completed");
    expect(display.checklist.every((item) => item.status === "completed")).toBe(true);
    expect(display.completedHistory.map((item) => item.id)).toEqual(
      MISSING_CONTROLLER_MILESTONES.map((item) => item.id),
    );
  });

  it("uses recorded semantic milestones without trusting unknown IDs", () => {
    const display = selectMissingControllerQuestDisplay(
      "talk_to_jeremy",
      ["missing_controller.started", "future.unknown"],
    );

    expect(display.completedHistory.map((item) => item.id)).toEqual([
      "missing_controller.started",
    ]);
    expect(display.checklist[0]?.status).toBe("completed");
  });

  it("does not reveal the optional secret until it has been discovered", () => {
    const undiscovered = selectMissingControllerQuestDisplay("complete", [], []);
    const discovered = selectMissingControllerQuestDisplay(
      "search_creek",
      [],
      ["creek_token"],
    );

    expect(undiscovered.discoveries).toEqual([]);
    expect(JSON.stringify(undiscovered)).not.toContain("arcade token");
    expect(discovered.discoveries).toEqual([
      { id: "creek_token", text: "Found an old Milton Estates arcade token." },
    ]);
  });
});
