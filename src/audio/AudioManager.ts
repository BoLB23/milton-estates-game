import { EVENT, gameEvents, type AudioCue } from "../game/events";
import { gameStore } from "../game/GameStore";
import type { SaveData } from "../game/types";

/** Semantic state sounds stay testable and independent from the Web Audio API. */
export function deriveAudioCues(previous: SaveData, next: SaveData): AudioCue[] {
  const cues: AudioCue[] = [];
  if (!previous.inventory.includes("xbox_controller") && next.inventory.includes("xbox_controller")) {
    cues.push("controllerPickup");
  }
  if (next.secrets.some((secret) => !previous.secrets.includes(secret))) cues.push("tokenPickup");
  if (previous.questStage !== next.questStage) {
    cues.push(next.questStage === "complete" ? "questComplete" : "objectiveUpdate");
  }
  return cues;
}

type AudioContextWithWebkit = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

class ProceduralAudioManager {
  private context?: AudioContext;
  private master?: GainNode;
  private ambience?: GainNode;
  private ambienceSources: AudioScheduledSourceNode[] = [];
  private state = gameStore.getState();
  private installed = false;

  install(): void {
    if (this.installed || typeof window === "undefined") return;
    this.installed = true;
    gameEvents.on(EVENT.audioCue, this.handleCue, this);
    gameEvents.on(EVENT.stateChanged, this.handleStateChanged, this);
    window.addEventListener("pointerdown", this.unlock, { once: true, passive: true });
    window.addEventListener("keydown", this.unlock, { once: true });
  }

  private readonly unlock = (): void => {
    try {
      if (!this.context) {
        const Context = window.AudioContext ?? (window as AudioContextWithWebkit).webkitAudioContext;
        if (!Context) return;
        this.context = new Context();
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
        this.applySettings(this.state);
        this.startAmbience(this.state.currentMap);
      }
      void this.context.resume().catch(() => undefined);
    } catch {
      // Audio is enhancement-only: unsupported/restricted environments keep playing.
    }
  };

  private handleStateChanged(next: SaveData): void {
    const previous = this.state;
    this.state = next;
    this.applySettings(next);
    if (previous.currentMap !== next.currentMap) this.startAmbience(next.currentMap);
    for (const cue of deriveAudioCues(previous, next)) this.playCue(cue);
  }

  private handleCue(cue: AudioCue): void {
    this.playCue(cue);
  }

  private applySettings(state: SaveData): void {
    if (!this.context || !this.master) return;
    const volume = state.settings.muted ? 0 : state.settings.masterVolume;
    this.master.gain.setTargetAtTime(volume, this.context.currentTime, 0.025);
  }

  private startAmbience(map: SaveData["currentMap"]): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    for (const source of this.ambienceSources) {
      try { source.stop(now + 0.08); } catch { /* Already stopped. */ }
    }
    this.ambienceSources = [];
    this.ambience?.disconnect();
    const bus = this.context.createGain();
    bus.gain.value = 0.075;
    bus.connect(this.master);
    this.ambience = bus;

    const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    const noise = this.context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = map === "creek" ? "bandpass" : "lowpass";
    filter.frequency.value = map === "creek" ? 950 : 1450;
    filter.Q.value = map === "creek" ? 0.7 : 0.35;
    const noiseGain = this.context.createGain();
    noiseGain.gain.value = map === "creek" ? 0.42 : 0.16;
    noise.connect(filter).connect(noiseGain).connect(bus);
    noise.start();
    this.ambienceSources.push(noise);

    if (map === "neighborhood") {
      const insects = this.context.createOscillator();
      const insectGain = this.context.createGain();
      const lfo = this.context.createOscillator();
      const lfoGain = this.context.createGain();
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
  }

  private playCue(cue: AudioCue): void {
    if (!this.context || !this.master || this.context.state !== "running") return;
    const patterns: Record<AudioCue, ReadonlyArray<readonly [number, number, number]>> = {
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
    try {
      for (const [frequency, delay, duration] of patterns[cue]) {
        this.tone(frequency, delay, duration, cue === "questComplete" ? 0.1 : 0.065);
      }
    } catch {
      // A suspended or closing context must never interrupt game input.
    }
  }

  private tone(frequency: number, delay: number, duration: number, gainValue: number): void {
    if (!this.context || !this.master) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }
}

export const audioManager = new ProceduralAudioManager();
