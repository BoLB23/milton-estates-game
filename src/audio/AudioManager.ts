import { EVENT, gameEvents, type AudioCue } from "../game/events";
import { gameStore } from "../game/GameStore";
import type { GameState } from "../game/types";

/**
 * The narrow Phaser SoundManager surface the game owns. Keeping it small
 * makes the procedural layer testable and deliberately supports Web Audio,
 * HTML5 Audio, and Phaser's NoAudio manager.
 */
export interface SoundManagerAdapter {
  mute: boolean;
  volume: number;
  setMute(value: boolean): unknown;
  setVolume(value: number): unknown;
  locked?: boolean;
  once?(event: string, callback: () => void, context?: unknown): unknown;
  off?(event: string, callback: () => void, context?: unknown): unknown;
}

type WebAudioSoundManagerAdapter = SoundManagerAdapter & {
  context: AudioContext;
  /** Phaser's master mute node is upstream of the global volume node. */
  masterMuteNode: AudioNode;
};

type EventEmitterAdapter = {
  once(event: string, callback: () => void, context?: unknown): unknown;
  off?(event: string, callback: () => void, context?: unknown): unknown;
};

/** Semantic state sounds stay testable and independent from the sound backend. */
export function deriveAudioCues(previous: GameState, next: GameState): AudioCue[] {
  const cues: AudioCue[] = [];
  if (previous.inventory.every((stack) => stack.itemId !== "xbox_controller")
    && next.inventory.some((stack) => stack.itemId === "xbox_controller")) {
    cues.push("controllerPickup");
  }
  if (next.secrets.some((secret) => !previous.secrets.includes(secret))) cues.push("tokenPickup");
  if (next.completedQuestIds.some((questId) => !previous.completedQuestIds.includes(questId))) {
    cues.push("questComplete");
  } else if (previous.questStage !== next.questStage) {
    cues.push(next.questStage === "complete" ? "questComplete" : "objectiveUpdate");
  }
  return cues;
}

function isWebAudioManager(manager: SoundManagerAdapter): manager is WebAudioSoundManagerAdapter {
  const candidate = manager as Partial<WebAudioSoundManagerAdapter>;
  return typeof candidate.context === "object" && candidate.context !== null
    && typeof candidate.context.createOscillator === "function"
    && typeof candidate.masterMuteNode?.connect === "function";
}

const CUE_PATTERNS: Readonly<Record<AudioCue, ReadonlyArray<readonly [number, number, number]>>> = {
  menuNavigate: [[430, 0, 0.045]],
  confirm: [[520, 0, 0.06], [690, 0.055, 0.08]],
  back: [[390, 0, 0.05], [285, 0.045, 0.07]],
  dialogueAdvance: [[260, 0, 0.035]],
  interaction: [[460, 0, 0.075]],
  controllerPickup: [[330, 0, 0.12], [495, 0.08, 0.15], [660, 0.16, 0.2]],
  tokenPickup: [[820, 0, 0.08], [1080, 0.07, 0.13]],
  objectiveUpdate: [[392, 0, 0.09], [523, 0.08, 0.13]],
  questComplete: [[330, 0, 0.14], [440, 0.1, 0.15], [550, 0.2, 0.18], [660, 0.31, 0.28]],
  saveConfirmation: [[590, 0, 0.07], [790, 0.09, 0.11]],
};

interface AmbienceProfile {
  filter: BiquadFilterType;
  frequency: number;
  quality: number;
  noiseGain: number;
}

function ambienceProfileForMap(map: GameState["currentMap"]): AmbienceProfile {
  switch (map) {
    case "creek": return { filter: "bandpass", frequency: 950, quality: 0.7, noiseGain: 0.42 };
    case "stonehenge": return { filter: "lowpass", frequency: 1_180, quality: 0.55, noiseGain: 0.12 };
    case "reidenbaugh": return { filter: "lowpass", frequency: 1_700, quality: 0.25, noiseGain: 0.1 };
    case "fruitville_pike": return { filter: "highpass", frequency: 720, quality: 0.45, noiseGain: 0.2 };
    case "bent_creek": return { filter: "bandpass", frequency: 650, quality: 0.85, noiseGain: 0.24 };
    default: return { filter: "lowpass", frequency: 1_450, quality: 0.35, noiseGain: 0.16 };
  }
}

/**
 * Procedural cues use Phaser's single SoundManager-owned AudioContext when
 * Web Audio is available. HTML5 and NoAudio managers intentionally become a
 * no-op: there is no second context, custom unlock listener, or gain stack.
 */
export class ProceduralAudioManager {
  private manager?: SoundManagerAdapter;
  private gameEventsEmitter?: EventEmitterAdapter;
  private ambience?: GainNode;
  private ambienceSources: AudioScheduledSourceNode[] = [];
  private state = gameStore.getState();
  private installed = false;

  install(manager: SoundManagerAdapter, gameEventsEmitter?: EventEmitterAdapter): void {
    if (this.installed) return;
    this.installed = true;
    this.manager = manager;
    this.gameEventsEmitter = gameEventsEmitter;
    this.state = gameStore.getState();
    gameEvents.on(EVENT.audioCue, this.handleCue, this);
    gameEvents.on(EVENT.stateChanged, this.handleStateChanged, this);
    manager.once?.("unlocked", this.handleUnlocked, this);
    gameEventsEmitter?.once("destroy", this.dispose, this);
    this.applySettings(this.state);
    this.startAmbience(this.state.currentMap);
  }

  dispose(): void {
    if (!this.installed) return;
    gameEvents.off(EVENT.audioCue, this.handleCue, this);
    gameEvents.off(EVENT.stateChanged, this.handleStateChanged, this);
    this.manager?.off?.("unlocked", this.handleUnlocked, this);
    this.gameEventsEmitter?.off?.("destroy", this.dispose, this);
    this.stopAmbience();
    this.manager = undefined;
    this.gameEventsEmitter = undefined;
    this.installed = false;
  }

  private readonly handleUnlocked = (): void => {
    this.startAmbience(this.state.currentMap);
  };

  private handleStateChanged(next: GameState): void {
    const previous = this.state;
    this.state = next;
    this.applySettings(next);
    if (previous.currentMap !== next.currentMap) this.startAmbience(next.currentMap);
    // This remains a state-change adapter until quest actions publish typed
    // domain events. Explicit UI/world cue events are already direct.
    for (const cue of deriveAudioCues(previous, next)) this.playCue(cue);
  }

  private handleCue(cue: AudioCue): void {
    this.playCue(cue);
  }

  private applySettings(state: GameState): void {
    if (!this.manager) return;
    this.manager.setMute(state.settings.muted);
    this.manager.setVolume(state.settings.masterVolume);
  }

  private getWebAudioManager(): WebAudioSoundManagerAdapter | undefined {
    return this.manager && isWebAudioManager(this.manager) ? this.manager : undefined;
  }

  private startAmbience(map: GameState["currentMap"]): void {
    const manager = this.getWebAudioManager();
    if (!manager || manager.locked || manager.context.state !== "running") return;
    this.stopAmbience();

    try {
      const context = manager.context;
      const bus = context.createGain();
      bus.gain.value = 0.075;
      // Connect before Phaser's master mute/volume chain, so settings apply to
      // procedural ambience exactly as they do to loaded Phaser sounds.
      bus.connect(manager.masterMuteNode);
      this.ambience = bus;

      const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = context.createBiquadFilter();
      const profile = ambienceProfileForMap(map);
      filter.type = profile.filter;
      filter.frequency.value = profile.frequency;
      filter.Q.value = profile.quality;
      const noiseGain = context.createGain();
      noiseGain.gain.value = profile.noiseGain;
      noise.connect(filter).connect(noiseGain).connect(bus);
      noise.start();
      this.ambienceSources.push(noise);

      if (map === "neighborhood") {
        const insects = context.createOscillator();
        const insectGain = context.createGain();
        const lfo = context.createOscillator();
        const lfoGain = context.createGain();
        insects.type = "triangle";
        insects.frequency.value = 2850;
        insectGain.gain.value = 0.008;
        lfo.frequency.value = 0.18;
        lfoGain.gain.value = 0.007;
        lfo.connect(lfoGain).connect(insectGain.gain);
        insects.connect(insectGain).connect(bus);
        insects.start();
        lfo.start();
        this.ambienceSources.push(insects, lfo);
      }
    } catch {
      // Audio is enhancement-only; a closing Phaser context must not affect play.
      this.stopAmbience();
    }
  }

  private stopAmbience(): void {
    for (const source of this.ambienceSources) {
      try { source.stop(); } catch { /* Already stopped or closing. */ }
    }
    this.ambienceSources = [];
    try { this.ambience?.disconnect(); } catch { /* Already disconnected. */ }
    this.ambience = undefined;
  }

  private playCue(cue: AudioCue): void {
    const manager = this.getWebAudioManager();
    if (!manager || manager.locked || manager.context.state !== "running") return;
    try {
      for (const [frequency, delay, duration] of CUE_PATTERNS[cue]) {
        this.tone(manager, frequency, delay, duration, cue === "questComplete" ? 0.1 : 0.065);
      }
    } catch {
      // A suspended or closing context must never interrupt game input.
    }
  }

  private tone(
    manager: WebAudioSoundManagerAdapter,
    frequency: number,
    delay: number,
    duration: number,
    gainValue: number,
  ): void {
    const { context } = manager;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(manager.masterMuteNode);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }
}

export const audioManager = new ProceduralAudioManager();
