import type Phaser from "phaser";
import { isItemId } from "../content/items";
import type { ItemId } from "../game/types";

export const COLLISION_GRID_LAYER = "collision-grid";
export const COLLISION_GRID_TILE_SIZE = 32;

export interface WorldPoint { x: number; y: number; }
export interface WorldRect extends WorldPoint { width: number; height: number; }
export interface GridCell { x: number; y: number; }

export interface TiledProperty {
  name: string;
  type?: string;
  value: unknown;
}

export interface TiledRuntimeObject {
  id?: number;
  name: string;
  type?: string;
  class?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  properties?: readonly TiledProperty[] | Readonly<Record<string, unknown>>;
  polygon?: readonly WorldPoint[];
}

export interface TiledPickup {
  id: string;
  itemId: ItemId;
  quantity: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

interface TiledObjectLayer { objects: TiledRuntimeObject[]; }

export interface CollisionGridLayerSource {
  width: number;
  height: number;
  data: readonly number[] | readonly (readonly number[])[];
  tileWidth?: number;
  tileHeight?: number;
}

export interface CollisionGridOptions {
  tileSize?: number;
}

function flattenGridData(data: CollisionGridLayerSource["data"]): number[] {
  if (data.length === 0) return [];
  const first = data[0];
  if (Array.isArray(first)) {
    const rows = data as readonly (readonly number[])[];
    return rows.flatMap((row) => [...row]);
  }
  return [...(data as readonly number[])];
}

function cellKey(cell: GridCell): string {
  return `${cell.x},${cell.y}`;
}

/**
 * Renderer-independent collision-grid queries. A non-zero tile value is a
 * filled cell and therefore blocks travel; zero and Phaser's -1 empty value
 * are treated as open. Out-of-bounds cells are blocked by definition.
 */
export class CollisionGrid {
  private readonly blocked: Uint8Array;

  public readonly width: number;
  public readonly height: number;
  public readonly tileSize: number;
  public readonly worldWidth: number;
  public readonly worldHeight: number;

  public constructor(source: CollisionGridLayerSource, options: CollisionGridOptions = {}) {
    this.width = source.width;
    this.height = source.height;
    this.tileSize = options.tileSize ?? COLLISION_GRID_TILE_SIZE;
    this.worldWidth = this.width * this.tileSize;
    this.worldHeight = this.height * this.tileSize;

    if (!Number.isInteger(this.width) || this.width <= 0 || !Number.isInteger(this.height) || this.height <= 0) {
      throw new Error(`Invalid collision-grid dimensions: ${this.width}x${this.height}`);
    }
    if (!Number.isInteger(this.tileSize) || this.tileSize <= 0) {
      throw new Error(`Invalid collision-grid tile size: ${this.tileSize}`);
    }
    if (source.tileWidth !== undefined && source.tileWidth !== this.tileSize) {
      throw new Error(`Collision-grid tile width ${source.tileWidth} does not match ${this.tileSize}px contract`);
    }
    if (source.tileHeight !== undefined && source.tileHeight !== this.tileSize) {
      throw new Error(`Collision-grid tile height ${source.tileHeight} does not match ${this.tileSize}px contract`);
    }

    const values = flattenGridData(source.data);
    const expected = this.width * this.height;
    if (values.length !== expected) {
      throw new Error(`Invalid collision-grid data: expected ${expected} cells, received ${values.length}`);
    }
    this.blocked = new Uint8Array(values.map((value) => value > 0 ? 1 : 0));
  }

  public isInsideCell(cell: GridCell): boolean {
    return Number.isInteger(cell.x) && Number.isInteger(cell.y)
      && cell.x >= 0 && cell.x < this.width && cell.y >= 0 && cell.y < this.height;
  }

  /** Filled cells block. Outside the finite map is also blocked. */
  public isBlocked(cell: GridCell): boolean {
    if (!this.isInsideCell(cell)) return true;
    return this.blocked[cell.y * this.width + cell.x] === 1;
  }

  public isWalkable(cell: GridCell): boolean {
    return this.isInsideCell(cell) && !this.isBlocked(cell);
  }

  /** Converts an interior world point to the cell containing it. */
  public pointToCell(point: WorldPoint): GridCell | undefined {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
    if (point.x < 0 || point.y < 0 || point.x >= this.worldWidth || point.y >= this.worldHeight) return undefined;
    return { x: Math.floor(point.x / this.tileSize), y: Math.floor(point.y / this.tileSize) };
  }

  public isPointWalkable(point: WorldPoint): boolean {
    const cell = this.pointToCell(point);
    return cell !== undefined && this.isWalkable(cell);
  }

  /** The exact 32px-aligned edges of a cell. */
  public cellBounds(cell: GridCell): WorldRect {
    if (!this.isInsideCell(cell)) throw new Error(`Cell outside collision grid: ${cell.x},${cell.y}`);
    return {
      x: cell.x * this.tileSize,
      y: cell.y * this.tileSize,
      width: this.tileSize,
      height: this.tileSize,
    };
  }

  public cellCenter(cell: GridCell): WorldPoint {
    const bounds = this.cellBounds(cell);
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  }

  public isPointAtCellCenter(point: WorldPoint): boolean {
    return Number.isFinite(point.x) && Number.isFinite(point.y)
      && point.x % this.tileSize === this.tileSize / 2
      && point.y % this.tileSize === this.tileSize / 2
      && this.pointToCell(point) !== undefined;
  }

  /** Returns all cells touched by a positive-area world rectangle. */
  public cellsIntersecting(rect: WorldRect): GridCell[] {
    if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y) || rect.width <= 0 || rect.height <= 0) return [];
    const startX = Math.max(0, Math.floor(rect.x / this.tileSize));
    const startY = Math.max(0, Math.floor(rect.y / this.tileSize));
    const endX = Math.min(this.width - 1, Math.ceil((rect.x + rect.width) / this.tileSize) - 1);
    const endY = Math.min(this.height - 1, Math.ceil((rect.y + rect.height) / this.tileSize) - 1);
    const cells: GridCell[] = [];
    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) cells.push({ x, y });
    }
    return cells;
  }

  /**
   * Tests a one-cell move. Diagonals require both orthogonal side cells to be
   * open, so an Arcade body cannot squeeze through a blocked corner.
   */
  public canTraverse(from: GridCell, to: GridCell): boolean {
    if (!this.isWalkable(from) || !this.isWalkable(to)) return false;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx === 0 && dy === 0) return true;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return false;
    if (dx !== 0 && dy !== 0) {
      return this.isWalkable({ x: from.x + dx, y: from.y })
        && this.isWalkable({ x: from.x, y: from.y + dy });
    }
    return true;
  }

  public canTravel(from: WorldPoint, to: WorldPoint): boolean {
    const start = this.pointToCell(from);
    const end = this.pointToCell(to);
    return start !== undefined && end !== undefined && this.canTraverse(start, end);
  }

  /** Four-way by default; diagonal expansion uses the same corner rule. */
  public floodFill(starts: readonly GridCell[], allowDiagonal = false): ReadonlySet<string> {
    const visited = new Set<string>();
    const queue: GridCell[] = [];
    for (const start of starts) {
      if (!this.isWalkable(start) || visited.has(cellKey(start))) continue;
      visited.add(cellKey(start));
      queue.push(start);
    }
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      if (!current) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          if (!allowDiagonal && dx !== 0 && dy !== 0) continue;
          const next = { x: current.x + dx, y: current.y + dy };
          if (!this.canTraverse(current, next)) continue;
          const key = cellKey(next);
          if (visited.has(key)) continue;
          visited.add(key);
          queue.push(next);
        }
      }
    }
    return visited;
  }
}

export function createCollisionGrid(
  source: CollisionGridLayerSource,
  options: CollisionGridOptions = {},
): CollisionGrid {
  return new CollisionGrid(source, options);
}

export interface ExactPhysicsBoundsTarget {
  setBounds(x: number, y: number, width: number, height: number, left?: boolean, right?: boolean, up?: boolean, down?: boolean): unknown;
}

export interface ExactCameraBoundsTarget {
  setBounds(x: number, y: number, width: number, height: number, centerOn?: boolean): unknown;
}

export interface ExactWorldBoundsTargets {
  physicsWorld?: ExactPhysicsBoundsTarget;
  camera?: ExactCameraBoundsTarget;
}

/** Reads the finite tilemap dimensions without relying on camera or canvas size. */
export function getExactWorldBounds(tilemap: Phaser.Tilemaps.Tilemap): WorldRect {
  const candidate = tilemap as unknown as {
    widthInPixels?: number;
    heightInPixels?: number;
    width: number;
    height: number;
    tileWidth: number;
    tileHeight: number;
  };
  const width = candidate.widthInPixels ?? candidate.width * candidate.tileWidth;
  const height = candidate.heightInPixels ?? candidate.height * candidate.tileHeight;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid finite tilemap bounds: ${width}x${height}`);
  }
  return { x: 0, y: 0, width, height };
}

export function applyExactWorldBounds(bounds: WorldRect, targets: ExactWorldBoundsTargets): void {
  targets.physicsWorld?.setBounds(bounds.x, bounds.y, bounds.width, bounds.height, true, true, true, true);
  targets.camera?.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
}

type CollisionLayer = Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer;

export interface CollisionGridMountContext extends ExactWorldBoundsTargets {
  colliderTarget?: unknown;
  addCollider?: (target: unknown, layer: CollisionLayer) => unknown;
  /** Optional transparent tileset supplied by the scene for a data-only grid. */
  tilesets?: readonly Phaser.Tilemaps.Tileset[];
}

export interface CollisionGridMountOptions extends CollisionGridOptions {
  layerName?: string;
  hideLayer?: boolean;
}

export interface MountedCollisionGrid {
  readonly grid: CollisionGrid;
  readonly layer: CollisionLayer;
  readonly bounds: WorldRect;
  readonly collider?: unknown;
  destroy(): void;
}

function readCollisionGridFromTilemap(
  tilemap: Phaser.Tilemaps.Tilemap,
  layerName: string,
  tileSize: number,
): CollisionGrid {
  const tilemapWithLayer = tilemap as unknown as { getLayer?: (layer?: string | number) => unknown };
  if (typeof tilemapWithLayer.getLayer === "function" && !tilemapWithLayer.getLayer(layerName)) {
    throw new Error(`Missing authored collision-grid tile layer: ${layerName}`);
  }
  const data: number[] = [];
  for (let y = 0; y < tilemap.height; y += 1) {
    for (let x = 0; x < tilemap.width; x += 1) {
      const tile = tilemap.getTileAt(x, y, true, layerName);
      data.push(tile?.index ?? -1);
    }
  }
  return createCollisionGrid({
    width: tilemap.width,
    height: tilemap.height,
    data,
    tileWidth: tilemap.tileWidth,
    tileHeight: tilemap.tileHeight,
  }, { tileSize });
}

/**
 * Creates the hidden collision layer, marks all non-empty tiles collidable,
 * and optionally wires an Arcade collider and exact world bounds. The caller
 * owns the target body and can omit it when only query support is needed.
 */
export function mountCollisionGridLayer(
  tilemap: Phaser.Tilemaps.Tilemap,
  context: CollisionGridMountContext = {},
  options: CollisionGridMountOptions = {},
): MountedCollisionGrid {
  const layerName = options.layerName ?? COLLISION_GRID_LAYER;
  const tileSize = options.tileSize ?? COLLISION_GRID_TILE_SIZE;
  const grid = readCollisionGridFromTilemap(tilemap, layerName, tileSize);
  const layer = tilemap.createLayer(layerName, context.tilesets ? [...context.tilesets] : [], 0, 0);
  if (!layer) throw new Error(`Unable to create authored collision-grid layer: ${layerName}`);
  layer.setCollisionByExclusion([-1, 0], true, true);
  if (options.hideLayer ?? true) layer.setVisible(false);

  const bounds = getExactWorldBounds(tilemap);
  applyExactWorldBounds(bounds, context);
  const collider = context.addCollider && context.colliderTarget !== undefined
    ? context.addCollider(context.colliderTarget, layer)
    : undefined;

  return {
    grid,
    layer,
    bounds,
    collider,
    destroy: () => {
      const destroyableCollider = collider as { destroy?: () => void } | undefined;
      destroyableCollider?.destroy?.();
      layer.destroy();
    },
  };
}

/**
 * A small, renderer-independent view of the authored Tiled object layers.
 * The illustrated PNG plates still render separately; this only supplies the
 * gameplay positions and collision rectangles that were authored in the TMJ.
 */
export class TiledRuntimeWorld {
  private readonly objects: Map<string, TiledRuntimeObject>;

  public constructor(
    public readonly tilemap: Phaser.Tilemaps.Tilemap,
    objectLayer = "stable-gameplay-objects",
    colliderLayer = "collision-rects",
  ) {
    const objects = this.hasObjectLayer(objectLayer)
      ? this.objectsInLayer(objectLayer)
      : this.objectsInLayers(["spawns", "transitions", "interactions", "navigation", "qa-probes", "solid-footprints"]);
    this.objects = new Map(objects.map((object) => [object.name, object]));
    if (this.objects.size !== objects.length) throw new Error(`Duplicate Tiled object names in ${objectLayer} or the expansion gameplay layers`);
    this.colliderLayer = colliderLayer;
  }

  private readonly colliderLayer: string;

  public get worldBounds(): WorldRect { return getExactWorldBounds(this.tilemap); }

  public getWorldBounds(): WorldRect { return this.worldBounds; }

  public point(name: string): WorldPoint {
    const object = this.objects.get(name);
    if (!object) throw new Error(`Missing authored Tiled object: ${name}`);
    return { x: object.x, y: object.y };
  }

  /** Returns a stable authored object for property/type-aware consumers. */
  public object(name: string): TiledRuntimeObject {
    const object = this.objects.get(name);
    if (!object) throw new Error(`Missing authored Tiled object: ${name}`);
    return { ...object };
  }

  /** Read-only snapshot used by the development geometry overlay and QA. */
  public debugObjects(): readonly TiledRuntimeObject[] {
    return [...this.objects.values()].map((object) => ({ ...object }));
  }

  public property(name: string, propertyName: string): unknown {
    return this.propertyFromObject(this.object(name), propertyName);
  }

  private propertyFromObject(object: TiledRuntimeObject, propertyName: string): unknown {
    const properties = object.properties;
    if (!properties) return undefined;
    if (Array.isArray(properties)) {
      const list = properties as readonly TiledProperty[];
      return list.find((property) => property.name === propertyName)?.value;
    }
    const record = properties as Readonly<Record<string, unknown>>;
    return record[propertyName];
  }

  /** Resolves a named stable object as an authored rectangular interaction zone. */
  public rectangle(name: string): WorldRect {
    const object = this.objects.get(name);
    if (!object) throw new Error(`Missing authored Tiled object: ${name}`);
    if (typeof object.width !== "number" || typeof object.height !== "number" || object.width <= 0 || object.height <= 0) {
      throw new Error(`Invalid authored rectangle: ${name}`);
    }
    return { x: object.x, y: object.y, width: object.width, height: object.height };
  }

  public rectangles(): readonly WorldRect[] {
    const objects = this.hasObjectLayer(this.colliderLayer)
      ? this.objectsInLayer(this.colliderLayer)
      : this.objectsInLayer("solid-footprints");
    return objects.map(({ x, y, width, height, name }) => {
      if (typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) {
        throw new Error(`Invalid authored collider: ${name}`);
      }
      return { x, y, width, height };
    });
  }

  /** Parses one-time item pickups from the authored interactions layer. */
  public pickups(): readonly TiledPickup[] {
    return [...this.objects.values()]
      .filter((object) => object.type === "pickup" || object.class === "pickup")
      .map((object) => {
        const itemId = this.propertyFromObject(object, "itemId");
        const quantityValue = this.propertyFromObject(object, "quantity") ?? 1;
        if (!isItemId(itemId) || typeof quantityValue !== "number" || !Number.isInteger(quantityValue) || quantityValue <= 0) {
          throw new Error(`Invalid authored pickup: ${object.name}`);
        }
        return {
          id: object.name,
          itemId,
          quantity: quantityValue,
          x: object.x,
          y: object.y,
          width: object.width,
          height: object.height,
        };
      });
  }

  /** Returns named, property-bearing solid footprints for dynamic blockers. */
  public solidFootprints(): readonly TiledRuntimeObject[] {
    if (!this.hasObjectLayer("solid-footprints")) return [];
    return this.objectsInLayer("solid-footprints").map((object) => ({ ...object }));
  }

  public has(name: string): boolean { return this.objects.has(name); }

  public collisionGrid(options: CollisionGridOptions & { layerName?: string } = {}): CollisionGrid {
    return readCollisionGridFromTilemap(
      this.tilemap,
      options.layerName ?? COLLISION_GRID_LAYER,
      options.tileSize ?? COLLISION_GRID_TILE_SIZE,
    );
  }

  public mountCollisionGrid(
    context: CollisionGridMountContext = {},
    options: CollisionGridMountOptions = {},
  ): MountedCollisionGrid {
    return mountCollisionGridLayer(this.tilemap, context, options);
  }

  private objectsInLayer(name: string): TiledRuntimeObject[] {
    const layer = this.tilemap.getObjectLayer(name) as unknown as TiledObjectLayer | null;
    if (!layer) throw new Error(`Missing authored Tiled object layer: ${name}`);
    return layer.objects;
  }

  private objectsInLayers(names: readonly string[]): TiledRuntimeObject[] {
    return names.flatMap((name) => this.hasObjectLayer(name) ? this.objectsInLayer(name) : []);
  }

  private hasObjectLayer(name: string): boolean {
    return Boolean(this.tilemap.getObjectLayer(name));
  }
}
