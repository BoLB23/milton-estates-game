import Phaser from "phaser";
import type { RyanRouteSpec } from "../../content/ryanRideRoutes";
import { DEFAULT_RYAN_RIDE_TUNING, createRyanRideDecisionState, decideRyanRide, type RyanRideDecisionState } from "./decisionCore";

export interface RouteFollowerHost {
  readonly time: { now: number };
  objectPoint(id: string): { x: number; y: number };
  playerPosition(): { x: number; y: number };
  addCallout(text: string): void;
}

/** Phaser adapter around the pure catch-up core. It never owns persisted state. */
export class RyanRouteFollower {
  private index = 0;
  private decision: RyanRideDecisionState = createRyanRideDecisionState();
  private finished = false;

  public constructor(
    private readonly host: RouteFollowerHost,
    private readonly actor: Phaser.Physics.Arcade.Sprite,
    private readonly route: RyanRouteSpec,
    private readonly onFinished: () => void,
  ) {}

  public update(): void {
    if (this.finished) return;
    const waypoint = this.route.waypoints[this.index]!;
    const target = this.host.objectPoint(waypoint.objectId);
    const player = this.host.playerPosition();
    const playerDistance = Phaser.Math.Distance.Between(this.actor.x, this.actor.y, player.x, player.y);
    const targetDistance = Phaser.Math.Distance.Between(this.actor.x, this.actor.y, target.x, target.y);
    const next = decideRyanRide(this.decision, {
      distanceToPlayer: playerDistance,
      atWaitSafeWaypoint: targetDistance < 26 && waypoint.waitSafe === true,
      attemptingExit: this.index === this.route.waypoints.length - 1 && targetDistance < 30,
      nowMs: this.host.time.now,
      routeMode: waypoint.mode,
    }, { ...DEFAULT_RYAN_RIDE_TUNING, farDistance: this.route.farDistance, resumeDistance: this.route.resumeDistance });
    this.decision = next.state;
    if (next.emitWaitCallout && waypoint.callout) this.host.addCallout(waypoint.callout);
    if (!next.shouldMove) {
      this.actor.setVelocity(0, 0);
      return;
    }
    // Ryan should lead without vanishing. These values bracket Billy's 220px/s
    // regional top speed and let the authored catch-up waits feel occasional.
    const speed = waypoint.mode === "sprint" ? 250 : waypoint.mode === "tease" ? 225 : 205;
    const angle = Phaser.Math.Angle.Between(this.actor.x, this.actor.y, target.x, target.y);
    this.actor.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.actor.setFlipX(Math.cos(angle) < 0);
    if (targetDistance >= 28) return;
    this.actor.setVelocity(0, 0);
    if (this.index < this.route.waypoints.length - 1) {
      this.index += 1;
      return;
    }
    if (next.canExit) {
      this.finished = true;
      this.onFinished();
    }
  }

  /** Current authored target, used by the development playthrough shortcut. */
  public getCurrentTarget(): { x: number; y: number } {
    return this.host.objectPoint(this.route.waypoints[this.index]!.objectId);
  }

  /** Complete the authored route for the development-only F4 playtest hook. */
  public completeForDebug(): void {
    if (this.finished) return;
    this.finished = true;
    const finalWaypoint = this.route.waypoints[this.route.waypoints.length - 1]!;
    const target = this.host.objectPoint(finalWaypoint.objectId);
    this.actor.setPosition(target.x, target.y).setVelocity(0, 0);
    this.onFinished();
  }

  public stop(): void {
    this.finished = true;
    // Phaser tears down Arcade bodies before a Scene's shutdown listeners.
    // Route followers are stopped from those listeners, so never call a
    // sprite body method after the actor has already been destroyed.
    if (this.actor.active && this.actor.body) this.actor.setVelocity(0, 0);
  }
}
