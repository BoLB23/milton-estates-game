import type Phaser from "phaser";

export interface WorldPoint { x: number; y: number; }
export interface WorldRect extends WorldPoint { width: number; height: number; }

interface TiledObject extends WorldRect { name: string; }
interface TiledObjectLayer { objects: TiledObject[]; }

/**
 * A small, renderer-independent view of the authored Tiled object layers.
 * The illustrated PNG plates still render separately; this only supplies the
 * gameplay positions and collision rectangles that were authored in the TMJ.
 */
export class TiledRuntimeWorld {
  private readonly objects: Map<string, TiledObject>;

  public constructor(
    public readonly tilemap: Phaser.Tilemaps.Tilemap,
    objectLayer = "stable-gameplay-objects",
    colliderLayer = "collision-rects",
  ) {
    const objects = this.objectsInLayer(objectLayer);
    this.objects = new Map(objects.map((object) => [object.name, object]));
    if (this.objects.size !== objects.length) throw new Error(`Duplicate Tiled object names in ${objectLayer}`);
    this.colliderLayer = colliderLayer;
  }

  private readonly colliderLayer: string;

  public point(name: string): WorldPoint {
    const object = this.objects.get(name);
    if (!object) throw new Error(`Missing authored Tiled object: ${name}`);
    return { x: object.x, y: object.y };
  }

  /** Resolves a named stable object as an authored rectangular interaction zone. */
  public rectangle(name: string): WorldRect {
    const object = this.objects.get(name);
    if (!object) throw new Error(`Missing authored Tiled object: ${name}`);
    if (object.width <= 0 || object.height <= 0) throw new Error(`Invalid authored rectangle: ${name}`);
    return { x: object.x, y: object.y, width: object.width, height: object.height };
  }

  public rectangles(): readonly WorldRect[] {
    return this.objectsInLayer(this.colliderLayer).map(({ x, y, width, height, name }) => {
      if (width <= 0 || height <= 0) throw new Error(`Invalid authored collider: ${name}`);
      return { x, y, width, height };
    });
  }

  public has(name: string): boolean { return this.objects.has(name); }

  private objectsInLayer(name: string): TiledObject[] {
    const layer = this.tilemap.getObjectLayer(name) as unknown as TiledObjectLayer | null;
    if (!layer) throw new Error(`Missing authored Tiled object layer: ${name}`);
    return layer.objects;
  }
}
