import type { PlayerSettings } from "../game/types";

export type TextSize = PlayerSettings["textSize"];

const TEXT_SCALES: Readonly<Record<TextSize, number>> = {
  small: 0.9,
  medium: 1,
  large: 1.125,
};

/**
 * Presentation-only settings. Keeping this pure makes the same accessibility
 * decision available to every Scene without coupling UI code to GameStore.
 */
export interface PresentationPolicy {
  readonly textScale: number;
  readonly reducedMotion: boolean;
  fontSize(baseSize: number): number;
  duration(milliseconds: number): number;
}

export function createPresentationPolicy(settings: Pick<PlayerSettings, "textSize" | "reducedMotion">): PresentationPolicy {
  const textScale = TEXT_SCALES[settings.textSize];
  return {
    textScale,
    reducedMotion: settings.reducedMotion,
    fontSize: (baseSize) => Math.max(1, Math.round(baseSize * textScale)),
    duration: (milliseconds) => settings.reducedMotion ? 0 : milliseconds,
  };
}

export function cycleTextSize(current: TextSize): TextSize {
  const sizes: readonly TextSize[] = ["small", "medium", "large"];
  return sizes[(sizes.indexOf(current) + 1) % sizes.length]!;
}

export function nextVolume(current: number): number {
  return current >= 1 ? 0 : Math.round((current + 0.25) * 100) / 100;
}
