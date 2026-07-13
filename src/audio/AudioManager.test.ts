import { describe, expect, it } from "vitest";
import { GameStore } from "../game/GameStore";
import type { SaveData } from "../game/types";
import { deriveAudioCues } from "./AudioManager";

function state(changes: Partial<SaveData> = {}): SaveData {
  return { ...new GameStore(undefined).getState(), ...changes };
}

describe("deriveAudioCues", () => {
  it("distinguishes the controller and token pickups", () => {
    const previous = state();
    const next = state({ inventory: ["xbox_controller"], secrets: ["creek_token"] });
    expect(deriveAudioCues(previous, next)).toEqual(["controllerPickup", "tokenPickup"]);
  });

  it("uses the objective cue for ordinary quest progress", () => {
    expect(deriveAudioCues(state(), state({ questStage: "talk_to_andrew" })))
      .toEqual(["objectiveUpdate"]);
  });

  it("uses a distinct completion cue for the final transition", () => {
    const previous = state({ questStage: "return_to_jeremy" });
    expect(deriveAudioCues(previous, state({ questStage: "complete" })))
      .toEqual(["questComplete"]);
  });
});
