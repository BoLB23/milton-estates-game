import Phaser from "phaser";
import { EVENT, gameEvents, type InputActionEvent } from "../game/events";
import { inputState } from "./InputRouterScene";
import type { DialogueLine, Interactable } from "../game/types";

interface RegionInteraction extends Interactable {
  width: number;
  height: number;
  isAvailable?: () => boolean;
}

export abstract class BaseExplorationScene extends Phaser.Scene {
  protected player!: Phaser.Physics.Arcade.Sprite;
  protected obstacles!: Phaser.Physics.Arcade.StaticGroup;
  protected interactables: Interactable[] = [];
  private regionInteractables: RegionInteraction[] = [];
  protected inputLocked = false;
  private interactionBlockedUntil = 0;
  private lastHint = "";
  private nearbyInteractable?: Interactable;
  private playerFacing: "up" | "down" | "left" | "right" = "down";

  protected initializeWorld(spawn: { x: number; y: number }): void {
    this.obstacles = this.physics.add.staticGroup();
    this.player = this.physics.add.sprite(spawn.x, spawn.y, "billy").setName("player");
    this.player
      .setDepth(50)
      .setScale(0.18)
      .setCollideWorldBounds(true)
      .setSize(110, 95)
      .setOffset(145, 275);
    this.physics.add.collider(this.player, this.obstacles);
    this.input.keyboard?.on("keydown-F4", this.debugTeleportToObjective, this);
    this.input.keyboard?.on("keydown-F6", this.debugTeleportToObjective, this);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(1.25);
    gameEvents.on(EVENT.interactRequested, this.handleRequestedInteraction, this);
    gameEvents.on(EVENT.inputAction, this.handleInputAction, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown-F4", this.debugTeleportToObjective, this);
      this.input.keyboard?.off("keydown-F6", this.debugTeleportToObjective, this);
      gameEvents.off(EVENT.interactRequested, this.handleRequestedInteraction, this);
      gameEvents.off(EVENT.inputAction, this.handleInputAction, this);
    });
  }

  update(): void {
    const movement = inputState.movement();
    this.player.setVelocity(
      this.inputLocked ? 0 : movement.x * 190,
      this.inputLocked ? 0 : movement.y * 190,
    );
    this.updatePlayerPresentation(movement);

    const nearby = this.closestInteractable(62);
    this.nearbyInteractable = nearby;
    const hint = nearby ? `E / Space — ${nearby.label}` : "";
    if (hint !== this.lastHint) {
      gameEvents.emit(EVENT.hint, hint);
      this.lastHint = hint;
    }

  }

  protected addObstacle(x: number, y: number, width: number, height: number): void {
    const zone = this.add.zone(x + width / 2, y + height / 2, width, height);
    this.physics.add.existing(zone, true);
    this.obstacles.add(zone);
  }

  protected registerInteraction(interactable: Interactable): void {
    this.interactables.push(interactable);
  }

  protected registerRegionInteraction(interactable: RegionInteraction): void {
    this.regionInteractables.push(interactable);
  }

  protected showDialogue(lines: DialogueLine[], onComplete?: () => void): void {
    gameEvents.emit(EVENT.audioCue, "interaction");
    this.inputLocked = true;
    this.player.setVelocity(0, 0);
    gameEvents.emit(EVENT.dialogue, {
      lines,
      onComplete: () => {
        this.inputLocked = false;
        // The UI closes dialogue on keydown. Block world interaction briefly so
        // that same physical press cannot reopen a nearby one-line dialogue.
        this.interactionBlockedUntil = this.time.now + 180;
        onComplete?.();
      },
    });
  }

  protected addLabel(x: number, y: number, text: string, color = "#173d32"): void {
    this.add.text(x, y, text, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "15px",
      fontStyle: "bold",
      color,
      backgroundColor: "#fff9d8cc",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(20);
  }

  protected getDebugObjectivePosition(): { x: number; y: number } | undefined {
    return undefined;
  }

  private updatePlayerPresentation(movement: { x: number; y: number }): void {
    const moving = !this.inputLocked && (movement.x !== 0 || movement.y !== 0);
    if (moving) {
      if (Math.abs(movement.x) > Math.abs(movement.y)) {
        this.playerFacing = movement.x < 0 ? "left" : "right";
      } else {
        this.playerFacing = movement.y < 0 ? "up" : "down";
      }
    }

    const presentationFacing = this.playerFacing === "left" || this.playerFacing === "right"
      ? "side"
      : this.playerFacing;
    // The authored side-facing frames look right by default, so left movement
    // is the mirrored case. Keeping this here makes player intent and visual
    // direction share a single source of truth.
    this.player.setFlipX(this.playerFacing === "left");
    this.player.anims.play(
      moving ? `billy-walk-${presentationFacing}` : `billy-idle-${presentationFacing}`,
      true,
    );
  }

  private debugTeleportToObjective(): void {
    if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
    const target = this.getDebugObjectivePosition();
    if (!target) return;
    this.player.setPosition(target.x, target.y).setVelocity(0, 0);
    // Sprite-sheet scaling changes the Arcade body's source dimensions. Reset
    // it explicitly after a debug relocation so the next collision/interact
    // frame cannot use the previous map position.
    (this.player.body as Phaser.Physics.Arcade.Body).reset(target.x, target.y);
    // The normal update loop refreshes this on the next frame. Do it now as
    // well so a debug teleport can be inspected/interacted with immediately.
    this.nearbyInteractable = this.closestInteractable(62);
    gameEvents.emit(EVENT.hint, this.nearbyInteractable ? `E / Space — ${this.nearbyInteractable.label}` : "");
    gameEvents.emit(EVENT.toast, "Playtest: moved to the current objective.");
  }

  private handleRequestedInteraction(): void {
    if (this.sys.isPaused() || this.inputLocked || this.time.now < this.interactionBlockedUntil) return;
    this.nearbyInteractable?.interact();
  }

  private handleInputAction(event: InputActionEvent): void {
    if (event.action !== "interact" || !event.pressed) return;
    this.handleRequestedInteraction();
  }

  private closestInteractable(maxDistance: number): Interactable | undefined {
    let closest: Interactable | undefined;
    let distance = maxDistance;
    for (const candidate of this.interactables) {
      const next = Phaser.Math.Distance.Between(this.player.x, this.player.y, candidate.x, candidate.y);
      if (next < distance) {
        closest = candidate;
        distance = next;
      }
    }
    for (const candidate of this.regionInteractables) {
      if (candidate.isAvailable && !candidate.isAvailable()) continue;
      const nearestX = Phaser.Math.Clamp(
        this.player.x,
        candidate.x - candidate.width / 2,
        candidate.x + candidate.width / 2,
      );
      const nearestY = Phaser.Math.Clamp(
        this.player.y,
        candidate.y - candidate.height / 2,
        candidate.y + candidate.height / 2,
      );
      const next = Phaser.Math.Distance.Between(this.player.x, this.player.y, nearestX, nearestY);
      if (next < distance) {
        closest = candidate;
        distance = next;
      }
    }
    return closest;
  }
}
