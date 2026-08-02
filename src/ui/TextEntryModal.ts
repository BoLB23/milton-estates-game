import Phaser from "phaser";

import {
  EVENT,
  gameEvents,
  type InputActionEvent,
  type TextEntryRequest,
} from "../game/events";
import {
  TextEntrySession,
  textEntryCursorPrefix,
  type TextEntrySessionOptions,
} from "./textEntry";
import type { InputCapture } from "../game/events";

const MODAL_DEPTH = 1_100;
const UI_FONT = '"Courier New", monospace';
const INK = 0x172735;
const PAPER = 0xfff5d6;
const GOLD = 0xf4d37b;
const MUTED = "#536575";

export interface TextEntryModalOptions {
  capture?: InputCapture;
  owner?: string;
  depth?: number;
  /** Native text input is created lazily on pointer focus for touch keyboards. */
  useDomInput?: boolean;
  /** Runs after input capture is released and before submit/cancel callbacks. */
  onResolve?: () => void;
}

/**
 * Phaser-owned presentation adapter for a TextEntryRequest.
 *
 * The editing state lives in TextEntrySession, so map/UI integration can test
 * the contract without constructing a browser canvas. Keyboard capture is
 * installed in the window capture phase while this modal is active; this
 * prevents InputRouterScene from emitting the same key as a world action.
 */
export class TextEntryModal extends Phaser.GameObjects.Container {
  public readonly session: TextEntrySession;

  private readonly ownerScene: Phaser.Scene;
  private readonly useDomInput: boolean;
  private cleaned = false;
  private destroyed = false;
  private focused = true;
  private readonly inputWidth: number;
  private inputCard!: Phaser.GameObjects.Rectangle;
  private valueText!: Phaser.GameObjects.Text;
  private caretMeasureText!: Phaser.GameObjects.Text;
  private placeholderText!: Phaser.GameObjects.Text;
  private caret!: Phaser.GameObjects.Rectangle;
  private countText!: Phaser.GameObjects.Text;
  private domInput?: HTMLInputElement;

  public constructor(scene: Phaser.Scene, request: TextEntryRequest, options: TextEntryModalOptions = {}) {
    const viewportWidth = scene.scale.gameSize.width || 960;
    const viewportHeight = scene.scale.gameSize.height || 540;
    super(scene, viewportWidth / 2, viewportHeight / 2);

    this.ownerScene = scene;
    this.useDomInput = options.useDomInput ?? true;
    const sessionOptions: TextEntrySessionOptions = {
      capture: options.capture,
      owner: options.owner,
      onResolve: options.onResolve,
    };
    this.session = new TextEntrySession(request, sessionOptions);
    this.inputWidth = Math.min(620, Math.max(500, viewportWidth - 100));

    scene.add.existing(this);
    this.setDepth(options.depth ?? MODAL_DEPTH);
    this.build(request.prompt, viewportWidth, viewportHeight);
    this.bind();
    if (this.session.isActive) this.refresh();
  }

  /** Convenience constructor for coordinator code that mounts one active modal. */
  public static mount(scene: Phaser.Scene, request: TextEntryRequest, options: TextEntryModalOptions = {}): TextEntryModal {
    return new TextEntryModal(scene, request, options);
  }

  public get isOpen(): boolean { return this.session.isActive; }

  /** Gives a pointer/touch user a native text target without changing index.html. */
  public focusTextInput(): void {
    if (!this.session.isActive) return;
    this.focused = true;
    this.refresh();

    const input = this.ensureDomInput();
    if (!input) return;
    this.syncDomInput();
    input.focus({ preventScroll: true });
    this.setDomSelection();
  }

  /** Handles non-keyboard confirm/back actions from the shared input router. */
  public handleInputAction = (event: InputActionEvent): void => {
    if (!this.session.isActive || !event.pressed || event.source === "keyboard") return;
    if (event.action === "interact") this.submit();
    else if (event.action === "back" || event.action === "menu") this.cancel();
  };

  public submit(): boolean {
    if (!this.session.isActive) return false;
    try {
      return this.session.submit();
    } finally {
      if (!this.session.isActive) this.destroy();
    }
  }

  public cancel(): boolean {
    if (!this.session.isActive) return false;
    try {
      return this.session.cancel();
    } finally {
      if (!this.session.isActive) this.destroy();
    }
  }

  /** Releases all external ownership/listeners while leaving destruction to the caller. */
  public cleanup(): void {
    if (this.cleaned) return;
    this.cleaned = true;
    gameEvents.off(EVENT.inputAction, this.handleInputAction, this);
    if (typeof window !== "undefined") window.removeEventListener("keydown", this.handleWindowKeyDown, true);
    this.ownerScene.events.off(Phaser.Scenes.Events.PAUSE, this.handleScenePause, this);
    this.ownerScene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);
    this.ownerScene.events.off(Phaser.Scenes.Events.DESTROY, this.handleSceneShutdown, this);
    this.removeDomInput();
    this.session.cleanup();
  }

  public destroy(fromScene?: boolean): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cleanup();
    super.destroy(fromScene);
  }

  private build(prompt: string, viewportWidth: number, viewportHeight: number): void {
    const width = 700;
    const height = 276;
    const left = -width / 2;
    const top = -height / 2;

    const backdrop = this.ownerScene.add
      .rectangle(0, 0, viewportWidth, viewportHeight, 0x07131c, 0.62)
      .setInteractive();
    const shadow = this.ownerScene.add.rectangle(7, 8, width, height, 0x07131c, 0.62);
    const paper = this.ownerScene.add
      .rectangle(0, 0, width, height, PAPER, 0.99)
      .setStrokeStyle(4, INK, 1);
    const tape = this.ownerScene.add.rectangle(0, top + 2, 84, 14, 0xf2cf79, 0.78).setAngle(-1);
    const heading = this.ownerScene.add.text(left + 34, top + 27, "FIELD NOTE  •  RESPONSE", {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color: "#914833",
      fontStyle: "bold",
    });
    const promptText = this.ownerScene.add.text(left + 34, top + 59, prompt, {
      fontFamily: UI_FONT,
      fontSize: "19px",
      color: "#172735",
      fontStyle: "bold",
      wordWrap: { width: width - 68 },
    });

    const fieldY = top + 145;
    this.inputCard = this.ownerScene.add
      .rectangle(0, fieldY, this.inputWidth, 58, PAPER, 1)
      .setInteractive({ useHandCursor: true });
    this.valueText = this.ownerScene.add.text(-this.inputWidth / 2 + 20, fieldY, "", {
      fontFamily: UI_FONT,
      fontSize: "20px",
      color: "#172735",
      fontStyle: "bold",
    }).setOrigin(0, 0.5);
    this.caretMeasureText = this.ownerScene.add.text(-this.inputWidth / 2 + 20, fieldY, "", {
      fontFamily: UI_FONT,
      fontSize: "20px",
      color: "#172735",
      fontStyle: "bold",
    }).setOrigin(0, 0.5).setVisible(false);
    this.placeholderText = this.ownerScene.add.text(-this.inputWidth / 2 + 20, fieldY, "TYPE HERE", {
      fontFamily: UI_FONT,
      fontSize: "20px",
      color: MUTED,
      fontStyle: "bold",
    }).setOrigin(0, 0.5);
    this.caret = this.ownerScene.add.rectangle(-this.inputWidth / 2 + 20, fieldY, 3, 28, GOLD, 1);
    this.countText = this.ownerScene.add.text(this.inputWidth / 2 - 18, fieldY + 1, "", {
      fontFamily: UI_FONT,
      fontSize: "11px",
      color: MUTED,
      fontStyle: "bold",
    }).setOrigin(1, 0.5);

    const cancelButton = this.ownerScene.add
      .rectangle(left + 136, top + 224, 180, 38, 0xe2d4b6, 1)
      .setStrokeStyle(2, INK, 0.8)
      .setInteractive({ useHandCursor: true });
    const cancelLabel = this.ownerScene.add.text(left + 136, top + 224, "CANCEL", {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color: "#172735",
      fontStyle: "bold",
    }).setOrigin(0.5);
    const confirmButton = this.ownerScene.add
      .rectangle(left + width - 136, top + 224, 180, 38, 0xe8f3c7, 1)
      .setStrokeStyle(2, INK, 0.8)
      .setInteractive({ useHandCursor: true });
    const confirmLabel = this.ownerScene.add.text(left + width - 136, top + 224, "CONFIRM", {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color: "#172735",
      fontStyle: "bold",
    }).setOrigin(0.5);
    const footer = this.ownerScene.add.text(0, top + 257, `ENTER CONFIRM  •  ESC BACK  •  MAX ${this.session.maxLength}`, {
      fontFamily: UI_FONT,
      fontSize: "11px",
      color: MUTED,
      fontStyle: "bold",
    }).setOrigin(0.5);

    this.add([
      backdrop,
      shadow,
      paper,
      tape,
      heading,
      promptText,
      this.inputCard,
      this.valueText,
      this.caretMeasureText,
      this.placeholderText,
      this.caret,
      this.countText,
      cancelButton,
      cancelLabel,
      confirmButton,
      confirmLabel,
      footer,
    ]);

    this.inputCard.on("pointerdown", this.focusTextInput, this);
    cancelButton.on("pointerdown", this.cancel, this);
    confirmButton.on("pointerdown", this.submit, this);
  }

  private bind(): void {
    gameEvents.on(EVENT.inputAction, this.handleInputAction, this);
    if (typeof window !== "undefined") window.addEventListener("keydown", this.handleWindowKeyDown, true);
    this.ownerScene.events.on(Phaser.Scenes.Events.PAUSE, this.handleScenePause, this);
    this.ownerScene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);
    this.ownerScene.events.once(Phaser.Scenes.Events.DESTROY, this.handleSceneShutdown, this);
  }

  private readonly handleWindowKeyDown = (event: KeyboardEvent): void => {
    if (!this.session.isActive) return;

    const domFocused = this.isDomInputFocused();
    const isSubmit = event.code === "Enter" || event.code === "NumpadEnter";
    const isCancel = event.code === "Escape";

    // Stop the shared router from translating this key into a world/menu
    // action. A focused native input still receives its default text editing.
    event.stopImmediatePropagation();
    if (domFocused && !isSubmit && !isCancel) return;

    event.preventDefault();
    if ((isSubmit || isCancel) && event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (isSubmit) this.submit();
    else if (isCancel) this.cancel();
    else if (event.code === "Backspace") this.session.backspace();
    else if (event.code === "Delete") this.session.deleteForward();
    else if (event.code === "ArrowLeft") this.session.moveCursor(-1);
    else if (event.code === "ArrowRight") this.session.moveCursor(1);
    else if (event.code === "Home") this.session.setValue(this.session.value, 0);
    else if (event.code === "End") this.session.moveCursorToEnd();
    else if (event.key.length === 1) this.session.insert(event.key);

    if (this.session.isActive) this.refresh();
  };

  private readonly handleDomInput = (): void => {
    const input = this.domInput;
    if (!this.session.isActive || !input) return;
    const cursor = input.selectionStart === null
      ? undefined
      : utf16OffsetToCodePointOffset(input.value, input.selectionStart);
    this.session.setValue(input.value, cursor);
    this.refresh();
  };

  private readonly handleDomSelection = (): void => {
    const input = this.domInput;
    if (!this.session.isActive || !input || input.selectionStart === null) return;
    this.session.setValue(input.value, utf16OffsetToCodePointOffset(input.value, input.selectionStart));
    this.refresh();
  };

  private readonly handleScenePause = (): void => {
    if (this.session.isActive) this.cancel();
  };

  private readonly handleSceneShutdown = (): void => {
    this.cleanup();
  };

  private refresh(): void {
    const value = this.session.value;
    this.valueText.setText(value).setColor(value ? "#172735" : MUTED);
    this.placeholderText.setVisible(value.length === 0);
    this.countText.setText(`${Array.from(value).length}/${this.session.maxLength}`);
    this.inputCard.setStrokeStyle(3, this.focused ? GOLD : INK, 1);
    this.caretMeasureText.setText(textEntryCursorPrefix(value, this.session.cursor));
    this.caret
      .setPosition(this.valueText.x + this.caretMeasureText.width + 2, this.valueText.y)
      .setVisible(this.session.isActive && this.focused);
    this.syncDomInput();
  }

  private ensureDomInput(): HTMLInputElement | undefined {
    if (!this.useDomInput || typeof document === "undefined" || !document.body) return undefined;
    if (this.domInput) return this.domInput;

    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.maxLength = this.session.maxLength;
    input.setAttribute("aria-label", "Text entry");
    input.style.position = "fixed";
    input.style.left = "0";
    input.style.top = "0";
    input.style.width = "1px";
    input.style.height = "1px";
    input.style.opacity = "0.01";
    input.style.fontSize = "16px";
    input.style.pointerEvents = "none";
    input.addEventListener("input", this.handleDomInput);
    input.addEventListener("select", this.handleDomSelection);
    document.body.appendChild(input);
    this.domInput = input;
    return input;
  }

  private syncDomInput(): void {
    const input = this.domInput;
    if (!input) return;
    if (input.value !== this.session.value) input.value = this.session.value;
    input.maxLength = this.session.maxLength;
    this.setDomSelection();
  }

  private setDomSelection(): void {
    const input = this.domInput;
    if (!input || typeof input.setSelectionRange !== "function") return;
    const offset = codePointOffsetToUtf16Offset(this.session.value, this.session.cursor);
    try {
      input.setSelectionRange(offset, offset);
    } catch {
      // Some mobile browsers reject selection changes before the input is focused.
    }
  }

  private isDomInputFocused(): boolean {
    return this.domInput !== undefined
      && typeof document !== "undefined"
      && document.activeElement === this.domInput;
  }

  private removeDomInput(): void {
    const input = this.domInput;
    if (!input) return;
    input.removeEventListener("input", this.handleDomInput);
    input.removeEventListener("select", this.handleDomSelection);
    input.remove();
    this.domInput = undefined;
  }
}

function utf16OffsetToCodePointOffset(value: string, offset: number): number {
  return Array.from(value.slice(0, Math.max(0, offset))).length;
}

function codePointOffsetToUtf16Offset(value: string, offset: number): number {
  return Array.from(value).slice(0, Math.max(0, offset)).join("").length;
}
