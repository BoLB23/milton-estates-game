import type Phaser from "phaser";
import type { ChoiceRequest } from "../game/events";
import type { DialogueLine, Interactable } from "../game/types";
import type { WorldPoint } from "./tiledRuntime";

/** An interaction that is available anywhere inside an authored rectangular area. */
export interface RegionInteraction extends Interactable {
  width: number;
  height: number;
}

/**
 * The deliberately small surface that quest presentation controllers need from
 * an exploration scene. Controllers never own a Scene lifecycle or map setup.
 */
export interface ExplorationInteractionHost {
  readonly world: Phaser.Scene;
  registerInteraction(interactable: Interactable): void;
  unregisterInteraction(id: string): void;
  registerRegionInteraction(interactable: RegionInteraction): void;
  unregisterRegionInteraction(id: string): void;
  showDialogue(lines: DialogueLine[], onComplete?: () => void): void;
  showChoice(request: ChoiceRequest): void;
  addLabel(x: number, y: number, text: string, color?: string): Phaser.GameObjects.Text;
  /** Resolves a named gameplay point from the loaded TMJ object layer. */
  objectPoint(name: string): WorldPoint;
}
