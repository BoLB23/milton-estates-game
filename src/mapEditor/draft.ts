/**
 * Renderer-independent editing state for a Tiled-style map.  This intentionally
 * uses structural types: the runtime schema can evolve without making the editor
 * model depend on Phaser or a particular map parser.
 */
export type SnapSize = "none" | 8 | 16;

export interface TiledObject {
  id: number;
  name?: string;
  type?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface TiledLayer {
  id?: number;
  name: string;
  type: string;
  width?: number;
  height?: number;
  data?: number[];
  objects?: TiledObject[];
  [key: string]: unknown;
}

export interface TiledMapDocument {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  nextobjectid?: number;
  [key: string]: unknown;
}

export interface EditorPoint { x: number; y: number; }
export interface BrushOptions { radius?: number; }
export interface DraftSnapshot {
  document: TiledMapDocument;
  baseRevision: string;
  dirty: boolean;
  selectedObjectId: number | null;
  canUndo: boolean;
  canRedo: boolean;
}

interface HistoryEntry { label: string; before: TiledMapDocument; after: TiledMapDocument; selectionBefore: number | null; selectionAfter: number | null; }
interface ActiveGesture { label: string; before: TiledMapDocument; selectionBefore: number | null; }

const clone = <T>(value: T): T => structuredClone(value);
const clampRadius = (radius: number | undefined) => Math.max(0, Math.floor(radius ?? 0));

/** A mutable working document with transactional undo/redo snapshots. */
export class MapEditorDraft {
  private document: TiledMapDocument;
  private original: TiledMapDocument;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private gesture?: ActiveGesture;
  private selected: number | null = null;
  private revision: string;

  public constructor(document: TiledMapDocument, baseRevision = "") {
    this.document = clone(document);
    this.original = clone(document);
    this.revision = baseRevision;
  }

  public get baseRevision(): string { return this.revision; }
  public get selectedObjectId(): number | null { return this.selected; }
  public get dirty(): boolean { return JSON.stringify(this.document) !== JSON.stringify(this.original); }
  public get canUndo(): boolean { return this.undoStack.length > 0; }
  public get canRedo(): boolean { return this.redoStack.length > 0; }
  public get gestureActive(): boolean { return this.gesture !== undefined; }
  public serialize(): TiledMapDocument { return clone(this.document); }
  public snapshot(): DraftSnapshot {
    return { document: this.serialize(), baseRevision: this.revision, dirty: this.dirty, selectedObjectId: this.selected, canUndo: this.canUndo, canRedo: this.canRedo };
  }

  /** Sets the saved baseline after a successful persistence request. */
  public markSaved(revision: string): void {
    this.commitGesture();
    this.original = clone(this.document);
    this.revision = revision;
    this.undoStack = [];
    this.redoStack = [];
  }

  public selectObject(id: number | null): void {
    if (id !== null && !this.findObject(id)) throw new Error(`Unknown object ${id}`);
    this.selected = id;
  }

  /**
   * Coalesces any number of editing calls into one history snapshot. Gestures
   * are intentionally explicit so pointer strokes do not clone the whole map
   * for every sampled position.
   */
  public beginGesture(label: string): void {
    if (this.gesture) throw new Error(`Gesture already active: ${this.gesture.label}`);
    this.gesture = { label, before: clone(this.document), selectionBefore: this.selected };
  }

  /** Commits a gesture if it changed the document or selection. */
  public commitGesture(): boolean {
    const gesture = this.gesture;
    if (!gesture) return false;
    this.gesture = undefined;
    if (JSON.stringify(gesture.before) === JSON.stringify(this.document) && gesture.selectionBefore === this.selected) return false;
    this.undoStack.push({
      label: gesture.label,
      before: gesture.before,
      after: clone(this.document),
      selectionBefore: gesture.selectionBefore,
      selectionAfter: this.selected,
    });
    this.redoStack = [];
    return true;
  }

  /** Restores the exact pre-gesture document without creating history. */
  public cancelGesture(): boolean {
    const gesture = this.gesture;
    if (!gesture) return false;
    this.document = gesture.before;
    this.selected = gesture.selectionBefore;
    this.gesture = undefined;
    return true;
  }

  public undo(): boolean {
    this.commitGesture();
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.document = clone(entry.before);
    this.selected = entry.selectionBefore;
    this.redoStack.push(entry);
    return true;
  }

  public redo(): boolean {
    this.commitGesture();
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.document = clone(entry.after);
    this.selected = entry.selectionAfter;
    this.undoStack.push(entry);
    return true;
  }

  public paintCollision(layerName: string, point: EditorPoint, blocked: boolean, options: BrushOptions = {}): void {
    this.change(blocked ? "block collision" : "unblock collision", () => {
      const layer = this.collisionLayer(layerName);
      const width = layer.width ?? this.document.width;
      const height = layer.height ?? this.document.height;
      const data = layer.data as number[];
      const cellX = Math.floor(point.x / this.document.tilewidth);
      const cellY = Math.floor(point.y / this.document.tileheight);
      const radius = clampRadius(options.radius);
      for (let y = cellY - radius; y <= cellY + radius; y++) for (let x = cellX - radius; x <= cellX + radius; x++) {
        if (x >= 0 && y >= 0 && x < width && y < height) data[y * width + x] = blocked ? 1 : 0;
      }
    });
  }

  public fillCollisionRect(layerName: string, first: EditorPoint, second: EditorPoint, blocked: boolean): void {
    this.change(blocked ? "fill blocked rectangle" : "fill unblocked rectangle", () => {
      const layer = this.collisionLayer(layerName);
      const width = layer.width ?? this.document.width;
      const height = layer.height ?? this.document.height;
      const data = layer.data as number[];
      const ax = Math.floor(first.x / this.document.tilewidth), bx = Math.floor(second.x / this.document.tilewidth);
      const ay = Math.floor(first.y / this.document.tileheight), by = Math.floor(second.y / this.document.tileheight);
      for (let y = Math.max(0, Math.min(ay, by)); y <= Math.min(height - 1, Math.max(ay, by)); y++) for (let x = Math.max(0, Math.min(ax, bx)); x <= Math.min(width - 1, Math.max(ax, bx)); x++) data[y * width + x] = blocked ? 1 : 0;
    });
  }

  public floodFillCollision(layerName: string, point: EditorPoint, blocked: boolean): void {
    this.change(blocked ? "flood block collision" : "flood unblock collision", () => {
      const layer = this.collisionLayer(layerName);
      const width = layer.width ?? this.document.width, height = layer.height ?? this.document.height;
      const data = layer.data as number[];
      const startX = Math.floor(point.x / this.document.tilewidth), startY = Math.floor(point.y / this.document.tileheight);
      if (startX < 0 || startY < 0 || startX >= width || startY >= height) return;
      const replacement = blocked ? 1 : 0, source = data[startY * width + startX];
      if (source === replacement) return;
      const pending: Array<[number, number]> = [[startX, startY]];
      while (pending.length) {
        const [x, y] = pending.pop() as [number, number];
        const index = y * width + x;
        if (data[index] !== source) continue;
        data[index] = replacement;
        if (x > 0) pending.push([x - 1, y]); if (x + 1 < width) pending.push([x + 1, y]);
        if (y > 0) pending.push([x, y - 1]); if (y + 1 < height) pending.push([x, y + 1]);
      }
    });
  }

  public addObject(layerName: string, object: Omit<TiledObject, "id"> & Partial<Pick<TiledObject, "id">>, snap: SnapSize = "none"): number {
    let id = 0;
    this.change("add object", () => {
      const layer = this.objectLayer(layerName);
      id = object.id ?? this.nextObjectId();
      if (this.findObject(id)) throw new Error(`Object id ${id} already exists`);
      const position = object as { x: number; y: number };
      layer.objects?.push({ ...clone(object), id, ...this.snapPosition(position, snap) });
      this.document.nextobjectid = Math.max(this.document.nextobjectid ?? 1, id + 1);
      this.selected = id;
    });
    return id;
  }

  public moveObject(id: number, point: EditorPoint, snap: SnapSize = "none"): void {
    this.change("move object", () => {
      const found = this.requireObject(id);
      Object.assign(found.object, this.snapPosition(point, snap));
      this.selected = id;
    });
  }

  public updateObject(id: number, patch: Partial<Omit<TiledObject, "id">>): void {
    this.change("update object", () => { Object.assign(this.requireObject(id).object, clone(patch)); this.selected = id; });
  }

  public updateLayer(name: string, patch: Partial<Omit<TiledLayer, "name" | "id">>): void {
    this.change("update layer", () => {
      const layer = this.document.layers.find((candidate) => candidate.name === name);
      if (!layer) throw new Error(`Missing layer ${name}`);
      Object.assign(layer, clone(patch));
    });
  }

  public deleteObject(id: number): void {
    this.change("delete object", () => {
      const found = this.requireObject(id);
      found.layer.objects?.splice(found.index, 1);
      if (this.selected === id) this.selected = null;
    });
  }

  private change(label: string, mutate: () => void): void {
    if (this.gesture) {
      mutate();
      return;
    }
    const before = clone(this.document), selectionBefore = this.selected;
    mutate();
    if (JSON.stringify(before) === JSON.stringify(this.document) && selectionBefore === this.selected) return;
    this.undoStack.push({ label, before, after: clone(this.document), selectionBefore, selectionAfter: this.selected });
    this.redoStack = [];
  }

  private collisionLayer(name: string): TiledLayer {
    const layer = this.document.layers.find((candidate) => candidate.name === name && candidate.type === "tilelayer");
    if (!layer?.data) throw new Error(`Missing tile collision layer ${name}`);
    return layer;
  }
  private objectLayer(name: string): TiledLayer {
    const layer = this.document.layers.find((candidate) => candidate.name === name && candidate.type === "objectgroup");
    if (!layer) throw new Error(`Missing object layer ${name}`);
    layer.objects ??= [];
    return layer;
  }
  private findObject(id: number): { layer: TiledLayer; object: TiledObject; index: number } | undefined {
    for (const layer of this.document.layers) {
      const index = layer.objects?.findIndex((object) => object.id === id) ?? -1;
      if (index >= 0) return { layer, object: layer.objects?.[index] as TiledObject, index };
    }
    return undefined;
  }
  private requireObject(id: number): { layer: TiledLayer; object: TiledObject; index: number } {
    const found = this.findObject(id); if (!found) throw new Error(`Unknown object ${id}`); return found;
  }
  private nextObjectId(): number {
    let id = Math.max(1, this.document.nextobjectid ?? 1); while (this.findObject(id)) id++; return id;
  }
  private snapPosition(point: EditorPoint, snap: SnapSize): EditorPoint {
    if (snap === "none") return { x: point.x, y: point.y };
    return { x: Math.round(point.x / snap) * snap, y: Math.round(point.y / snap) * snap };
  }
}
