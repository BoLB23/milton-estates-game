/** A Phaser-independent movement core. Scenes apply its velocity to Arcade bodies. */
export type PlayerTravelMode = "walking" | "bicycle";

export interface MovementInput {
  readonly x: number;
  readonly y: number;
}

export interface LocomotionState {
  readonly velocityX: number;
  readonly velocityY: number;
  /** Radians, with 0 pointing right. Kept for bicycle sprite presentation. */
  readonly heading: number;
  readonly speed: number;
  /** The simulation delta actually used after tab-resume protection. */
  readonly deltaMs: number;
}

export interface BicycleLocomotionTuning {
  readonly maxSpeed: number;
  readonly acceleration: number;
  readonly braking: number;
  readonly coastingDrag: number;
  readonly lowSpeedTurnRate: number;
  readonly highSpeedTurnRate: number;
  readonly maximumDeltaMs: number;
}

export const WALKING_SPEED = 190;

export const DEFAULT_BICYCLE_TUNING: BicycleLocomotionTuning = {
  maxSpeed: 330,
  acceleration: 420,
  braking: 600,
  coastingDrag: 260,
  lowSpeedTurnRate: 300,
  highSpeedTurnRate: 145,
  maximumDeltaMs: 50,
};

/**
 * Regional bikes remain faster than walking. The original 32px/s draft met a
 * paper timing target but felt broken in play (walking was 190px/s and Ryan
 * rode at 220–300px/s), so the compact maps use a responsive touring pace.
 */
export const REGIONAL_BICYCLE_TUNING: BicycleLocomotionTuning = {
  maxSpeed: 220,
  acceleration: 330,
  braking: 480,
  coastingDrag: 180,
  lowSpeedTurnRate: 300,
  highSpeedTurnRate: 145,
  maximumDeltaMs: 50,
};

const TAU = Math.PI * 2;
const DEGREES_TO_RADIANS = Math.PI / 180;

function normalized(input: MovementInput): MovementInput {
  const length = Math.hypot(input.x, input.y);
  return length > 1 ? { x: input.x / length, y: input.y / length } : input;
}

function wrapAngle(angle: number): number {
  return ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

function turnTowards(current: number, target: number, maxTurn: number): number {
  const difference = wrapAngle(target - current);
  if (Math.abs(difference) <= maxTurn) return target;
  return current + Math.sign(difference) * maxTurn;
}

/**
 * Owns scalar speed and heading for walking/bicycle movement. `update` is
 * deliberately deterministic and has no Phaser, scene, or input-router ties.
 */
export class PlayerLocomotionController {
  private mode: PlayerTravelMode = "walking";
  private speed = 0;
  private heading = Math.PI / 2;

  public constructor(private readonly bicycle: BicycleLocomotionTuning = DEFAULT_BICYCLE_TUNING) {}

  public getMode(): PlayerTravelMode { return this.mode; }

  public setMode(mode: PlayerTravelMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.resetVelocity();
  }

  /** Use after teleports, sprite/body changes, and scene restarts. */
  public resetVelocity(heading = this.heading): void {
    this.speed = 0;
    this.heading = heading;
  }

  public update(input: MovementInput, deltaMs: number, inputLocked = false): LocomotionState {
    const delta = Math.max(0, Math.min(deltaMs, this.bicycle.maximumDeltaMs)) / 1000;
    if (inputLocked) {
      this.resetVelocity();
      return this.state(0, 0, 0);
    }

    const direction = normalized(input);
    if (this.mode === "walking") {
      const moving = direction.x !== 0 || direction.y !== 0;
      if (moving) this.heading = Math.atan2(direction.y, direction.x);
      this.speed = moving ? WALKING_SPEED : 0;
      return this.state(direction.x * WALKING_SPEED, direction.y * WALKING_SPEED, delta);
    }

    const moving = direction.x !== 0 || direction.y !== 0;
    if (moving) {
      const targetHeading = Math.atan2(direction.y, direction.x);
      const turnDifference = Math.abs(wrapAngle(targetHeading - this.heading));
      if (this.speed === 0) {
        // At rest, facing the requested direction is responsive; at speed,
        // turn-rate limiting prevents an instant 180-degree reversal.
        this.heading = targetHeading;
      } else {
        const speedRatio = this.speed / this.bicycle.maxSpeed;
        const degreesPerSecond = this.bicycle.lowSpeedTurnRate
          + (this.bicycle.highSpeedTurnRate - this.bicycle.lowSpeedTurnRate) * speedRatio;
        this.heading = turnTowards(this.heading, targetHeading, degreesPerSecond * DEGREES_TO_RADIANS * delta);
      }
      // Opposite input is an intentional brake before the bicycle completes
      // its turn. This makes the configured braking rate meaningful and keeps
      // a 180-degree reversal from accelerating through the maneuver.
      if (this.speed > 0 && turnDifference > Math.PI / 2) {
        this.speed = Math.max(0, this.speed - this.bicycle.braking * delta);
      } else {
        this.speed = Math.min(this.bicycle.maxSpeed, this.speed + this.bicycle.acceleration * delta);
      }
    } else {
      this.speed = Math.max(0, this.speed - this.bicycle.coastingDrag * delta);
    }

    return this.state(Math.cos(this.heading) * this.speed, Math.sin(this.heading) * this.speed, delta);
  }

  private state(velocityX: number, velocityY: number, delta: number): LocomotionState {
    return {
      velocityX,
      velocityY,
      heading: this.heading,
      speed: this.speed,
      deltaMs: delta * 1000,
    };
  }
}
