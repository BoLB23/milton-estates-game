import { describe, expect, it } from "vitest";
import { GameStore } from "../game/GameStore";
import type { GameState } from "../game/types";
import { gameStore } from "../game/GameStore";
import { ProceduralAudioManager, deriveAudioCues, type SoundManagerAdapter } from "./AudioManager";

function state(changes: Partial<GameState> = {}): GameState {
  return { ...new GameStore(undefined).getState(), ...changes };
}

describe("deriveAudioCues", () => {
  it("distinguishes the controller and token pickups", () => {
    const previous = state();
    const next = state({ inventory: [{ itemId: "xbox_controller", quantity: 1 }], secrets: ["creek_token"] });
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

  it("keeps the Sports Day completion cue when Catch Ryan activates in the same save", () => {
    const previous = state({ activeQuestId: "three_player_sports", questStage: "meet_andrew_to_play_basketball", completedQuestIds: [] });
    const next = state({ activeQuestId: "catch_ryan", questStage: "invite", completedQuestIds: ["three_player_sports"] });
    expect(deriveAudioCues(previous, next)).toEqual(["questComplete"]);
  });
});

class FakeSoundManager implements SoundManagerAdapter {
  mute = false;
  volume = 1;
  readonly calls: string[] = [];

  setMute(value: boolean): this {
    this.mute = value;
    this.calls.push(`mute:${value}`);
    return this;
  }

  setVolume(value: number): this {
    this.volume = value;
    this.calls.push(`volume:${value}`);
    return this;
  }
}

class FakeGameEvents {
  private destroyListener?: { callback: () => void; context?: unknown };

  once(event: string, callback: () => void, context?: unknown): this {
    if (event === "destroy") this.destroyListener = { callback, context };
    return this;
  }

  off(event: string, callback: () => void, context?: unknown): this {
    if (event === "destroy" && this.destroyListener?.callback === callback && this.destroyListener.context === context) {
      this.destroyListener = undefined;
    }
    return this;
  }

  destroy(): void { this.destroyListener?.callback.call(this.destroyListener.context); }
}

describe("ProceduralAudioManager", () => {
  it("uses Phaser's manager for preference changes and detaches on game destroy", () => {
    const previous = gameStore.getState().settings;
    const sound = new FakeSoundManager();
    const lifecycle = new FakeGameEvents();
    const audio = new ProceduralAudioManager();

    try {
      audio.install(sound, lifecycle);
      expect(sound.calls).toEqual([`mute:${previous.muted}`, `volume:${previous.masterVolume}`]);

      gameStore.updateSettings({ muted: true, masterVolume: 0.5 });
      expect(sound.calls.slice(-2)).toEqual(["mute:true", "volume:0.5"]);

      lifecycle.destroy();
      const callsBeforeDetachedUpdate = sound.calls.length;
      gameStore.updateSettings({ muted: false, masterVolume: 0.25 });
      expect(sound.calls).toHaveLength(callsBeforeDetachedUpdate);
    } finally {
      audio.dispose();
      gameStore.updateSettings(previous);
    }
  });
});
