import { describe, expect, it } from "vitest";

import { canLaunchMinigameReplay, isMinigameUnlocked, selectUnlockedMinigames } from "./minigames";

describe("minigame replay unlocks", () => {
  it("keeps Mickey's replay locked until Mickey has been beaten", () => {
    expect(isMinigameUnlocked("mickey_drag_race", { completedQuestIds: [], secrets: [] })).toBe(false);
    expect(isMinigameUnlocked("mickey_drag_race", {
      completedQuestIds: [],
      secrets: ["mickey_drag_race.beaten"],
    })).toBe(true);
  });

  it("unlocks Don Rossi after the bonfire challenge is completed", () => {
    expect(isMinigameUnlocked("don_rossi", { completedQuestIds: [], secrets: [] })).toBe(false);
    expect(isMinigameUnlocked("don_rossi", {
      completedQuestIds: ["attend_bonfire_at_andrews"],
      secrets: [],
    })).toBe(true);
  });

  it("returns every beaten game for Jeremy's replay collection", () => {
    expect(selectUnlockedMinigames({
      completedQuestIds: ["attend_bonfire_at_andrews"],
      secrets: ["mickey_drag_race.beaten"],
    }).map((game) => game.id)).toEqual(["mickey_drag_race", "don_rossi"]);
  });

  it("does not allow a mini-game replay inside a quest replay", () => {
    expect(canLaunchMinigameReplay({ replayQuestId: null })).toBe(true);
    expect(canLaunchMinigameReplay({ replayQuestId: "missing_controller" })).toBe(false);
    expect(canLaunchMinigameReplay({ replayQuestId: "attend_bonfire_at_andrews" }, false)).toBe(true);
  });
});
