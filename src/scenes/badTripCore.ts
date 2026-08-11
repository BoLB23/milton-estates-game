export const BAD_TRIP_PASS_MS = 45_000;

export interface BadTripPlatform { x: number; y: number; width: number; }
export interface BadTripState { x: number; y: number; vx: number; vy: number; grounded: boolean; }

/** Pure platforming step, kept browser-free for reliable game-rule tests. */
export function stepBadTripPlayer(state: BadTripState, input: { left: boolean; right: boolean; jump: boolean }, platforms: readonly BadTripPlatform[], deltaMs: number): BadTripState {
  const dt = Math.min(40, Math.max(0, deltaMs)) / 1000;
  const direction = Number(input.right) - Number(input.left);
  // Acceleration and stopping are deliberately gentler than a hard snap so a
  // single tap doesn't feel twitchy on platforms this narrow.
  let vx = Math.max(-230, Math.min(230, state.vx + direction * 1_050 * dt));
  if (direction === 0) vx *= Math.pow(0.02, dt);
  let vy = state.vy + 1_050 * dt;
  if (input.jump && state.grounded) vy = -430;
  const x = Math.max(18, Math.min(942, state.x + vx * dt));
  let y = state.y + vy * dt;
  let grounded = false;
  for (const platform of platforms) {
    const wasAbove = state.y + 22 <= platform.y;
    const overPlatform = x + 13 > platform.x && x - 13 < platform.x + platform.width;
    if (vy >= 0 && wasAbove && y + 22 >= platform.y && overPlatform) { y = platform.y - 22; vy = 0; grounded = true; }
  }
  return { x, y, vx, vy, grounded };
}

export function badTripDifficulty(elapsedMs: number): { donSpeed: number; drift: number } {
  const tier = Math.floor(Math.max(0, elapsedMs) / 9_000);
  return { donSpeed: 70 + tier * 17, drift: Math.min(55, tier * 10) };
}
