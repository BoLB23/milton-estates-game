import Phaser from "phaser";
import { gameEvents, EVENT, inputCapture } from "../game/events";
import type { MapId } from "../game/types";
import { updateTiledMapMarkerCatalog } from "../content/maps";
import { MapEditorDraft, type SnapSize, type TiledMapDocument, type TiledObject } from "./draft";
import {
  allObjects,
  getCollisionMode,
  getProperty,
  validateMapDocument,
  type MapDocument,
  type TiledLayer,
  type TiledProperty,
} from "./document";
import "./mapEditor.css";

type EditorTool = "select" | "block" | "unblock" | "spawn" | "poi" | "transition" | "waypoint" | "pickup" | "solid";

interface MapResponse {
  revision: string;
  document: MapDocument;
  error?: string;
}

export interface MapEditorControllerOptions {
  scene: Phaser.Scene;
  mapId: MapId;
  onClose: () => void;
  onRestart: () => void;
}

const COLORS: Record<string, number> = {
  spawn: 0x35e890,
  transition: 0x30c7ff,
  waypoint: 0xffd43b,
  pickup: 0xff9b42,
  "solid-footprint": 0xff5f58,
  default: 0xd88cff,
};

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function propertiesOf(value: unknown): TiledProperty[] {
  return Array.isArray(value) ? value.filter((item): item is TiledProperty => Boolean(item && typeof item === "object" && "name" in item)) : [];
}

function withProperty(properties: unknown, name: string, value: string | number | boolean, type: string): TiledProperty[] {
  const next = structuredClone(propertiesOf(properties));
  const existing = next.find((item) => item.name === name);
  if (existing) Object.assign(existing, { value, type });
  else next.push({ name, value, type });
  return next;
}

/** Development-only in-game map authoring controller. */
export class MapEditorController {
  public static async open(options: MapEditorControllerOptions): Promise<MapEditorController> {
    const response = await fetch(`/__map-editor/maps/${encodeURIComponent(options.mapId)}`);
    const payload = await response.json() as MapResponse;
    if (!response.ok) throw new Error(payload.error ?? `Unable to load ${options.mapId}`);
    const token = response.headers.get("X-Map-Editor-Token");
    if (!token) throw new Error("Map editor handshake failed");
    return new MapEditorController(options, payload.document, payload.revision, token);
  }

  private readonly scene: Phaser.Scene;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly panel: HTMLDivElement;
  private readonly draft: MapEditorDraft;
  private readonly mapId: MapId;
  private tool: EditorTool = "select";
  private brushRadius = 0;
  private snap: SnapSize = 8;
  private showGrid = true;
  private panning?: { pointerX: number; pointerY: number; scrollX: number; scrollY: number };
  private draggingObject = false;
  private saving = false;
  private status = "Ready";
  private destroyed = false;

  private constructor(private readonly options: MapEditorControllerOptions, documentData: MapDocument, revision: string, private readonly token: string) {
    this.scene = options.scene;
    this.mapId = options.mapId;
    this.draft = new MapEditorDraft(documentData as TiledMapDocument, revision);
    this.graphics = this.scene.add.graphics().setDepth(20_000);
    this.panel = documentRoot();
    document.body.appendChild(this.panel);
    document.body.classList.add("map-editor-open");
    inputCapture.capture("map-editor", { blockMenuToggle: true });
    this.scene.input.mouse?.disableContextMenu();
    this.bindInput();
    this.renderPanel();
    this.redraw();
  }

  public isOpen(): boolean { return !this.destroyed; }

  public async close(force = false): Promise<boolean> {
    if (this.destroyed) return true;
    if (!force && this.draft.dirty && !window.confirm("Discard unsaved map changes?")) return false;
    this.destroyed = true;
    this.unbindInput();
    this.graphics.destroy();
    this.panel.remove();
    document.body.classList.remove("map-editor-open");
    inputCapture.release("map-editor");
    this.options.onClose();
    return true;
  }

  private bindInput(): void {
    this.scene.input.on("pointerdown", this.handlePointerDown);
    this.scene.input.on("pointermove", this.handlePointerMove);
    this.scene.input.on("pointerup", this.handlePointerUp);
    this.scene.input.on("wheel", this.handleWheel);
    window.addEventListener("keydown", this.handleKeyDown, true);
    window.addEventListener("pointerup", this.handleWindowPointerUp, true);
    window.addEventListener("pointercancel", this.handleWindowPointerCancel, true);
    window.addEventListener("blur", this.handleWindowBlur);
  }

  private unbindInput(): void {
    this.scene.input.off("pointerdown", this.handlePointerDown);
    this.scene.input.off("pointermove", this.handlePointerMove);
    this.scene.input.off("pointerup", this.handlePointerUp);
    this.scene.input.off("wheel", this.handleWheel);
    window.removeEventListener("keydown", this.handleKeyDown, true);
    window.removeEventListener("pointerup", this.handleWindowPointerUp, true);
    window.removeEventListener("pointercancel", this.handleWindowPointerCancel, true);
    window.removeEventListener("blur", this.handleWindowBlur);
  }

  private handlePointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
      const camera = this.scene.cameras.main;
      this.panning = { pointerX: pointer.x, pointerY: pointer.y, scrollX: camera.scrollX, scrollY: camera.scrollY };
      return;
    }
    if (!pointer.leftButtonDown()) return;
    // Recover safely if a prior release was lost (for example, focus changed
    // between the canvas and developer tools) before opening a new gesture.
    if (this.draft.gestureActive) this.finishGesture(true);
    const point = this.worldPoint(pointer);
    if (this.tool === "block" || this.tool === "unblock") {
      if (getCollisionMode(this.document()) === "grid-16") {
        this.draft.beginGesture(this.tool === "block" ? "block collision stroke" : "unblock collision stroke");
        this.draft.paintCollision("collision-grid", point, this.tool === "block", { radius: this.brushRadius });
        this.afterEdit(false);
      }
      return;
    }
    if (this.tool === "select") {
      const hit = this.hitObject(point.x, point.y);
      this.draft.selectObject(hit?.id ?? null);
      this.draggingObject = Boolean(hit);
      if (hit) this.draft.beginGesture("move object");
      this.renderPanel();
      this.redraw();
      return;
    }
    this.addObjectAt(point.x, point.y);
  };

  private handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (this.panning) {
      const camera = this.scene.cameras.main;
      camera.setScroll(
        this.panning.scrollX - (pointer.x - this.panning.pointerX) / camera.zoom,
        this.panning.scrollY - (pointer.y - this.panning.pointerY) / camera.zoom,
      );
      return;
    }
    if (!pointer.leftButtonDown()) return;
    const point = this.worldPoint(pointer);
    if ((this.tool === "block" || this.tool === "unblock") && getCollisionMode(this.document()) === "grid-16") {
      this.draft.paintCollision("collision-grid", point, this.tool === "block", { radius: this.brushRadius });
      this.afterEdit(false);
    } else if (this.tool === "select" && this.draggingObject && this.draft.selectedObjectId !== null) {
      this.draft.moveObject(this.draft.selectedObjectId, point, this.snap);
      this.afterEdit(false);
    }
  };

  private handlePointerUp = (): void => { this.finishGesture(true); };

  private handleWindowPointerUp = (): void => { this.finishGesture(true); };
  private handleWindowPointerCancel = (): void => { this.finishGesture(false); };
  private handleWindowBlur = (): void => { this.finishGesture(false); };

  private finishGesture(commit: boolean): void {
    const wasActive = this.draft.gestureActive;
    this.panning = undefined;
    this.draggingObject = false;
    if (!wasActive) return;
    if (commit) this.draft.commitGesture(); else this.draft.cancelGesture();
    this.afterEdit();
  }

  private handleWheel = (_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, deltaY: number): void => {
    const camera = this.scene.cameras.main;
    camera.setZoom(Phaser.Math.Clamp(camera.zoom * (deltaY > 0 ? 0.9 : 1.1), 0.45, 3.5));
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    const typing = target?.matches("input, textarea, select");
    if ((event.metaKey || event.ctrlKey) && event.code === "KeyS") { event.preventDefault(); void this.save(); return; }
    if ((event.metaKey || event.ctrlKey) && event.code === "KeyZ") {
      event.preventDefault();
      if (event.shiftKey) this.draft.redo(); else this.draft.undo();
      this.afterEdit();
      return;
    }
    if (typing) return;
    const shortcuts: Partial<Record<string, EditorTool>> = {
      KeyV: "select", KeyB: "block", KeyU: "unblock", KeyS: "spawn", KeyP: "poi", KeyR: "transition",
    };
    if (shortcuts[event.code]) { event.preventDefault(); this.setTool(shortcuts[event.code]!); }
    if (event.code === "BracketLeft") { this.brushRadius = Math.max(0, this.brushRadius - 1); this.renderPanel(); }
    if (event.code === "BracketRight") { this.brushRadius = Math.min(8, this.brushRadius + 1); this.renderPanel(); }
    if (event.code === "KeyG") { this.showGrid = !this.showGrid; this.redraw(); this.renderPanel(); }
    if (event.code === "Delete" && this.draft.selectedObjectId !== null) {
      this.draft.deleteObject(this.draft.selectedObjectId); this.afterEdit();
    }
    if (event.code === "Escape" || event.code === "F7") { event.preventDefault(); void this.close(); }
  };

  private worldPoint(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    const result = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return { x: result.x, y: result.y };
  }

  private document(): MapDocument { return this.draft.serialize() as MapDocument; }

  private hitObject(x: number, y: number): TiledObject | undefined {
    let best: { object: TiledObject; distance: number } | undefined;
    for (const { object } of allObjects(this.document())) {
      const width = object.width ?? 0;
      const height = object.height ?? 0;
      const inside = width > 0 && height > 0 && x >= object.x && x <= object.x + width && y >= object.y && y <= object.y + height;
      const distance = inside ? 0 : Math.hypot(x - object.x, y - object.y);
      if (distance <= 18 / this.scene.cameras.main.zoom && (!best || distance < best.distance)) best = { object, distance };
    }
    return best?.object as TiledObject | undefined;
  }

  private addObjectAt(x: number, y: number): void {
    const number = this.document().nextobjectid ?? 1;
    const specs: Record<Exclude<EditorTool, "select" | "block" | "unblock">, { layer: string; type: string; prefix: string; rectangle?: boolean; properties?: TiledProperty[] }> = {
      spawn: { layer: "spawns", type: "spawn", prefix: "spawn" },
      poi: { layer: "interactions", type: "landmark", prefix: "poi", properties: [{ name: "markerKind", type: "string", value: "landmark" }, { name: "markerLabel", type: "string", value: "New point of interest" }] },
      transition: { layer: "transitions", type: "transition", prefix: "exit", rectangle: true, properties: [{ name: "destinationMap", type: "string", value: this.mapId }, { name: "destinationSpawn", type: "string", value: "spawn_home" }] },
      waypoint: { layer: "navigation", type: "waypoint", prefix: "waypoint" },
      pickup: { layer: "interactions", type: "pickup", prefix: "pickup", properties: [{ name: "itemId", type: "string", value: "field_token" }, { name: "quantity", type: "int", value: 1 }] },
      solid: { layer: getCollisionMode(this.document()) === "rectangles" ? "collision-rects" : "solid-footprints", type: "solid-footprint", prefix: "solid", rectangle: true },
    };
    const spec = specs[this.tool as keyof typeof specs];
    if (!spec) return;
    this.draft.addObject(spec.layer, {
      name: `${spec.prefix}_${number}`,
      type: spec.type,
      x,
      y,
      ...(spec.rectangle ? { width: 64, height: 64 } : {}),
      properties: spec.properties ?? [],
    }, this.snap);
    this.tool = "select";
    this.afterEdit();
  }

  private afterEdit(refreshPanel = true): void {
    if (refreshPanel) this.status = this.validationLabel();
    this.redraw();
    if (refreshPanel) this.renderPanel();
  }

  private validationLabel(): string {
    const issues = validateMapDocument(this.document(), { requireTransitionProperties: true });
    return issues.length ? `${issues.length} validation issue${issues.length === 1 ? "" : "s"}` : "Valid map";
  }

  private redraw(): void {
    const document = this.document();
    const graphics = this.graphics;
    graphics.clear();
    const collision = document.layers.find((layer) => layer.name === "collision-grid");
    if (collision?.data && !Array.isArray(collision.data[0])) {
      const data = collision.data as number[];
      graphics.fillStyle(0xff315f, 0.2);
      for (let y = 0; y < document.height; y += 1) for (let x = 0; x < document.width; x += 1) {
        if ((data[y * document.width + x] ?? 0) > 0) graphics.fillRect(x * document.tilewidth, y * document.tileheight, document.tilewidth, document.tileheight);
      }
      if (this.showGrid) {
        graphics.lineStyle(1, 0x65f5e7, 0.18);
        for (let x = 0; x <= document.width; x += 1) graphics.lineBetween(x * document.tilewidth, 0, x * document.tilewidth, document.height * document.tileheight);
        for (let y = 0; y <= document.height; y += 1) graphics.lineBetween(0, y * document.tileheight, document.width * document.tilewidth, y * document.tileheight);
      }
    }
    graphics.lineStyle(3, 0xffffff, 0.8).strokeRect(0, 0, document.width * document.tilewidth, document.height * document.tileheight);
    for (const { object } of allObjects(document)) {
      const type = object.type || object.class || "default";
      const color = COLORS[type] ?? COLORS.default ?? 0xd88cff;
      const selected = object.id === this.draft.selectedObjectId;
      graphics.lineStyle(selected ? 4 : 2, selected ? 0xffffff : color, 0.95);
      graphics.fillStyle(color, selected ? 0.28 : 0.12);
      if ((object.width ?? 0) > 0 && (object.height ?? 0) > 0) {
        graphics.fillRect(object.x, object.y, object.width!, object.height!);
        graphics.strokeRect(object.x, object.y, object.width!, object.height!);
      } else {
        graphics.fillCircle(object.x, object.y, selected ? 8 : 5);
        graphics.strokeCircle(object.x, object.y, selected ? 13 : 9);
      }
    }
  }

  private setTool(tool: EditorTool): void { this.tool = tool; this.status = `${tool} tool`; this.renderPanel(); }

  private renderPanel(): void {
    const document = this.document();
    const selected = allObjects(document).find(({ object }) => object.id === this.draft.selectedObjectId);
    const issues = validateMapDocument(document, { requireTransitionProperties: true });
    const collisionMode = getCollisionMode(document);
    const artworkLayers = document.layers.filter((layer) => layer.type === "imagelayer");
    const toolButtons = (["select", "block", "unblock", "spawn", "poi", "transition", "waypoint", "pickup", "solid"] as EditorTool[])
      .filter((tool) => collisionMode === "grid-16" || !["block", "unblock"].includes(tool))
      .map((tool) => `<button type="button" data-editor-tool="${tool}" class="${tool === this.tool ? "active" : ""}">${tool}</button>`).join("");
    this.panel.innerHTML = `
      <header><div><strong>MAP EDITOR</strong><span>${escapeHtml(this.mapId)} · ${collisionMode}</span></div><button type="button" data-editor-close aria-label="Close editor">×</button></header>
      <div class="map-editor-actions"><button type="button" data-editor-save ${this.saving || !this.draft.dirty ? "disabled" : ""}>${this.saving ? "Saving…" : "Save"}</button><button type="button" data-editor-undo ${!this.draft.canUndo ? "disabled" : ""}>Undo</button><button type="button" data-editor-redo ${!this.draft.canRedo ? "disabled" : ""}>Redo</button><button type="button" data-editor-playtest>Playtest</button></div>
      <section><h2>Tools</h2><div class="map-editor-tools">${toolButtons}</div><div class="map-editor-row"><label>Snap <select data-editor-snap><option value="none" ${this.snap === "none" ? "selected" : ""}>Free</option><option value="8" ${this.snap === 8 ? "selected" : ""}>8 px</option><option value="16" ${this.snap === 16 ? "selected" : ""}>16 px</option></select></label><label>Brush <input data-editor-brush type="number" min="0" max="8" value="${this.brushRadius}"></label><label><input data-editor-grid type="checkbox" ${this.showGrid ? "checked" : ""}> Grid</label></div></section>
      ${selected ? this.selectedMarkup(selected.layer.name, selected.object) : `<section><h2>Selection</h2><p>Choose Select, then click or drag a point or area.</p></section>`}
      ${artworkLayers.map((layer) => this.artworkMarkup(layer)).join("")}
      <footer class="${issues.length ? "invalid" : "valid"}"><strong>${issues.length ? `${issues.length} issue${issues.length === 1 ? "" : "s"}` : "Map valid"}</strong><span>${escapeHtml(this.status)}</span>${issues.slice(0, 4).map((issue) => `<small>${escapeHtml(issue.message)}</small>`).join("")}</footer>`;
    this.bindPanel();
  }

  private selectedMarkup(layerName: string, object: TiledObject): string {
    return `<section><h2>Selected · ${escapeHtml(layerName)}</h2>
      <div class="map-editor-form">
        <label>Name<input data-object-field="name" value="${escapeHtml(object.name)}"></label><label>Type<input data-object-field="type" value="${escapeHtml(object.type)}"></label>
        <label>X<input data-object-number="x" type="number" step="1" value="${object.x}"></label><label>Y<input data-object-number="y" type="number" step="1" value="${object.y}"></label>
        <label>Width<input data-object-number="width" type="number" min="0" value="${object.width ?? 0}"></label><label>Height<input data-object-number="height" type="number" min="0" value="${object.height ?? 0}"></label>
      </div><label>Properties JSON<textarea data-object-properties rows="5">${escapeHtml(JSON.stringify(object.properties ?? [], null, 2))}</textarea></label><button type="button" class="danger" data-object-delete>Delete object</button></section>`;
  }

  private artworkMarkup(layer: TiledLayer): string {
    const value = (name: string, fallback: number) => Number(getProperty(layer, name) ?? fallback);
    return `<section><h2>Artwork alignment · ${escapeHtml(layer.name)}</h2><div class="map-editor-form">
      <label>X<input data-art-layer="${escapeHtml(layer.name)}" data-art-field="displayX" type="number" value="${value("displayX", layer.x ?? 0)}"></label><label>Y<input data-art-layer="${escapeHtml(layer.name)}" data-art-field="displayY" type="number" value="${value("displayY", layer.y ?? 0)}"></label>
      <label>Width<input data-art-layer="${escapeHtml(layer.name)}" data-art-field="displayWidth" type="number" min="1" value="${value("displayWidth", 1)}"></label><label>Height<input data-art-layer="${escapeHtml(layer.name)}" data-art-field="displayHeight" type="number" min="1" value="${value("displayHeight", 1)}"></label>
      <label>Crop X<input data-art-layer="${escapeHtml(layer.name)}" data-art-field="cropX" type="number" min="0" value="${value("cropX", 0)}"></label><label>Crop Y<input data-art-layer="${escapeHtml(layer.name)}" data-art-field="cropY" type="number" min="0" value="${value("cropY", 0)}"></label>
      <label>Crop W<input data-art-layer="${escapeHtml(layer.name)}" data-art-field="cropWidth" type="number" min="1" value="${value("cropWidth", Number(layer.imagewidth ?? 1))}"></label><label>Crop H<input data-art-layer="${escapeHtml(layer.name)}" data-art-field="cropHeight" type="number" min="1" value="${value("cropHeight", Number(layer.imageheight ?? 1))}"></label>
    </div></section>`;
  }

  private bindPanel(): void {
    this.panel.querySelector<HTMLElement>("[data-editor-close]")?.addEventListener("click", () => void this.close());
    this.panel.querySelector<HTMLElement>("[data-editor-save]")?.addEventListener("click", () => void this.save());
    this.panel.querySelector<HTMLElement>("[data-editor-playtest]")?.addEventListener("click", () => void this.playtest());
    this.panel.querySelector<HTMLElement>("[data-editor-undo]")?.addEventListener("click", () => { this.draft.undo(); this.afterEdit(); });
    this.panel.querySelector<HTMLElement>("[data-editor-redo]")?.addEventListener("click", () => { this.draft.redo(); this.afterEdit(); });
    this.panel.querySelectorAll<HTMLElement>("[data-editor-tool]").forEach((button) => button.addEventListener("click", () => this.setTool(button.dataset.editorTool as EditorTool)));
    this.panel.querySelector<HTMLSelectElement>("[data-editor-snap]")?.addEventListener("change", (event) => { const value = (event.target as HTMLSelectElement).value; this.snap = value === "none" ? "none" : Number(value) as 8 | 16; });
    this.panel.querySelector<HTMLInputElement>("[data-editor-brush]")?.addEventListener("change", (event) => { this.brushRadius = Phaser.Math.Clamp(Number((event.target as HTMLInputElement).value), 0, 8); });
    this.panel.querySelector<HTMLInputElement>("[data-editor-grid]")?.addEventListener("change", (event) => { this.showGrid = (event.target as HTMLInputElement).checked; this.redraw(); });
    this.panel.querySelectorAll<HTMLInputElement>("[data-object-field]").forEach((input) => input.addEventListener("change", () => { if (this.draft.selectedObjectId === null) return; this.draft.updateObject(this.draft.selectedObjectId, { [input.dataset.objectField!]: input.value }); this.afterEdit(); }));
    this.panel.querySelectorAll<HTMLInputElement>("[data-object-number]").forEach((input) => input.addEventListener("change", () => { if (this.draft.selectedObjectId === null) return; this.draft.updateObject(this.draft.selectedObjectId, { [input.dataset.objectNumber!]: Number(input.value) }); this.afterEdit(); }));
    this.panel.querySelector<HTMLTextAreaElement>("[data-object-properties]")?.addEventListener("change", (event) => {
      if (this.draft.selectedObjectId === null) return;
      try { this.draft.updateObject(this.draft.selectedObjectId, { properties: JSON.parse((event.target as HTMLTextAreaElement).value) }); this.afterEdit(); }
      catch { this.status = "Properties must be valid JSON"; this.renderPanel(); }
    });
    this.panel.querySelector<HTMLElement>("[data-object-delete]")?.addEventListener("click", () => { if (this.draft.selectedObjectId !== null) { this.draft.deleteObject(this.draft.selectedObjectId); this.afterEdit(); } });
    this.panel.querySelectorAll<HTMLInputElement>("[data-art-field]").forEach((input) => input.addEventListener("change", () => this.updateArtwork(input.dataset.artLayer!, input.dataset.artField!, Number(input.value))));
  }

  private updateArtwork(layerName: string, name: string, value: number): void {
    const layer = this.document().layers.find((candidate) => candidate.name === layerName && candidate.type === "imagelayer");
    if (!layer) return;
    this.draft.updateLayer(layer.name, { properties: withProperty(layer.properties, name, value, "float") });
    this.status = "Artwork transform saved in draft; Playtest applies it";
    this.afterEdit();
  }

  private async save(): Promise<void> {
    if (this.saving) return;
    const document = this.document();
    const issues = validateMapDocument(document, { requireTransitionProperties: true });
    if (issues.length) { this.status = "Fix validation issues before saving"; this.renderPanel(); return; }
    this.saving = true; this.status = "Saving atomically…"; this.renderPanel();
    try {
      const response = await fetch(`/__map-editor/maps/${encodeURIComponent(this.mapId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Map-Editor-Token": this.token },
        body: JSON.stringify({ baseRevision: this.draft.baseRevision, document }),
      });
      const payload = await response.json() as MapResponse;
      if (response.status === 409) throw new Error("Map changed on disk. Close and reopen the editor before saving.");
      if (!response.ok) throw new Error(payload.error ?? "Save failed");
      this.draft.markSaved(payload.revision);
      updateTiledMapMarkerCatalog(this.mapId, payload.document);
      this.status = "Saved";
      gameEvents.emit(EVENT.toast, `Saved ${this.mapId} map.`);
    } catch (error) {
      this.status = error instanceof Error ? error.message : "Save failed";
    } finally {
      this.saving = false; this.renderPanel();
    }
  }

  private async playtest(): Promise<void> {
    if (this.draft.dirty) await this.save();
    if (this.draft.dirty) return;
    await this.close(true);
    this.options.onRestart();
  }
}

function documentRoot(): HTMLDivElement {
  const panel = document.createElement("div");
  panel.className = "map-editor-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Developer map editor");
  return panel;
}
