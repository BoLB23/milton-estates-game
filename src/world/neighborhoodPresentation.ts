import type { SportsQuestStage } from "../game/types";

export type SportsMeetupStage = Exclude<SportsQuestStage, "complete">;

export interface SportsMeetupPresentation {
  readonly anchor: "jeremy" | "billy" | "andrew";
  readonly activity: string;
  readonly color: number;
  readonly prop: "skateboard" | "baseball" | "basketball";
}

/** Authored presentation for the three Sports Day stops, independent of Phaser. */
export const SPORTS_MEETUPS: Readonly<Record<SportsMeetupStage, SportsMeetupPresentation>> = {
  meet_jeremy_to_skateboard: { anchor: "jeremy", activity: "SKATEBOARDING", color: 0xc76b52, prop: "skateboard" },
  meet_billy_to_play_baseball: { anchor: "billy", activity: "BACKYARD BASEBALL", color: 0x477da3, prop: "baseball" },
  meet_andrew_to_play_basketball: { anchor: "andrew", activity: "BASKETBALL", color: 0xe6a63d, prop: "basketball" },
};

export function isSportsMeetupStage(stage: string): stage is SportsMeetupStage {
  return stage in SPORTS_MEETUPS;
}
