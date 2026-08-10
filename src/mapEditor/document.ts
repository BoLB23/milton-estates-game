/** Phaser-independent, lossless-enough representation of the Tiled JSON we edit. */
export const MAP_DOCUMENT_SCHEMA_VERSION = 1;
export const COLLISION_GRID_LAYER = "collision-grid";
export const COLLISION_RECTS_LAYER = "collision-rects";

export type CollisionMode = "grid-16" | "rectangles";
export type TiledPropertyValue = string | number | boolean | null;
export interface TiledProperty { name: string; type?: string; value: TiledPropertyValue; [key: string]: unknown; }
export interface TiledPoint { x: number; y: number; [key: string]: unknown; }
export interface TiledObject {
  id: number; name?: string; type?: string; class?: string; x: number; y: number;
  width?: number; height?: number; properties?: TiledProperty[] | Record<string, unknown>;
  polygon?: TiledPoint[]; polyline?: TiledPoint[]; [key: string]: unknown;
}
export interface TiledLayer {
  id: number; name: string; type: string; x?: number; y?: number; width?: number; height?: number;
  data?: number[] | number[][]; objects?: TiledObject[]; properties?: TiledProperty[] | Record<string, unknown>;
  layers?: TiledLayer[]; [key: string]: unknown;
}
export interface MapDocument {
  width: number; height: number; tilewidth: number; tileheight: number; layers: TiledLayer[];
  properties?: TiledProperty[] | Record<string, unknown>; nextobjectid?: number; nextlayerid?: number;
  [key: string]: unknown;
}
export interface MapValidationIssue { code: string; path: string; message: string; }
export class MapDocumentValidationError extends Error {
  public constructor(public readonly issues: readonly MapValidationIssue[]) {
    super(`Map document validation failed:\n${issues.map((issue) => `- ${issue.path} [${issue.code}]: ${issue.message}`).join("\n")}`);
    this.name = "MapDocumentValidationError";
  }
}
export interface ValidateMapDocumentOptions { collisionMode?: CollisionMode; requireTransitionProperties?: boolean; }

export function cloneMapDocument<T extends MapDocument>(document: T): T { return JSON.parse(JSON.stringify(document)) as T; }
export function getProperty(source: Pick<TiledObject | TiledLayer | MapDocument, "properties">, name: string): unknown {
  const properties = source.properties;
  if (Array.isArray(properties)) return properties.find((property) => property.name === name)?.value;
  return properties?.[name];
}
export function setProperty<T extends Pick<TiledObject | TiledLayer | MapDocument, "properties">>(source: T, name: string, value: TiledPropertyValue, type?: string): T {
  if (!Array.isArray(source.properties)) source.properties = [];
  const property = source.properties.find((entry) => entry.name === name);
  if (property) { property.value = value; if (type !== undefined) property.type = type; }
  else source.properties.push({ name, value, ...(type === undefined ? {} : { type }) });
  return source;
}
export function getCollisionMode(document: MapDocument): CollisionMode {
  const explicit = getProperty(document, "collisionMode");
  if (explicit === "grid-16" || explicit === "rectangles") return explicit;
  return findLayer(document, COLLISION_RECTS_LAYER) ? "rectangles" : "grid-16";
}
export function setCollisionMode(document: MapDocument, mode: CollisionMode): MapDocument {
  setProperty(document, "schemaVersion", MAP_DOCUMENT_SCHEMA_VERSION, "int");
  setProperty(document, "collisionMode", mode, "string");
  return document;
}
export function getSchemaVersion(document: MapDocument): number | undefined {
  const value = getProperty(document, "schemaVersion"); return typeof value === "number" ? value : undefined;
}
export function findLayer(document: MapDocument, name: string): TiledLayer | undefined { return document.layers.find((layer) => layer.name === name); }
export function findObject(document: MapDocument, name: string): TiledObject | undefined {
  for (const layer of document.layers) { const object = layer.objects?.find((entry) => entry.name === name); if (object) return object; }
  return undefined;
}
export function allObjects(document: MapDocument): Array<{ layer: TiledLayer; object: TiledObject; index: number }> {
  return document.layers.flatMap((layer) => (layer.objects ?? []).map((object, index) => ({ layer, object, index })));
}
export function allocateObjectId(document: MapDocument): number {
  const used = new Set(allObjects(document).map(({ object }) => object.id));
  let next = Math.max(1, document.nextobjectid ?? 1); while (used.has(next)) next += 1;
  document.nextobjectid = next + 1; return next;
}
export function allocateLayerId(document: MapDocument): number {
  const used = new Set(document.layers.map((layer) => layer.id));
  let next = Math.max(1, document.nextlayerid ?? 1); while (used.has(next)) next += 1;
  document.nextlayerid = next + 1; return next;
}
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortKeys(item)]));
  return value;
}
/** Stable output prevents editor saves from producing incidental formatting diffs. */
export function serializeMapDocument(document: MapDocument): string { return `${JSON.stringify(sortKeys(document), null, 2)}\n`; }

function pointInBounds(object: TiledObject, width: number, height: number): boolean {
  const right = object.x + (object.width ?? 0); const bottom = object.y + (object.height ?? 0);
  return object.x >= 0 && object.y >= 0 && object.x < width && object.y < height && right <= width && bottom <= height;
}
function kind(object: TiledObject, layer: TiledLayer): string { return (object.type || object.class || (layer.name === "spawns" ? "spawn" : layer.name === "transitions" ? "transition" : "")).toLowerCase(); }
function blockedAt(layer: TiledLayer, object: TiledObject, tileWidth: number, tileHeight: number): boolean {
  if (!layer.data || !layer.width || !layer.height || !Array.isArray(layer.data) || Array.isArray(layer.data[0])) return false;
  const cellX = Math.floor(object.x / tileWidth); const cellY = Math.floor(object.y / tileHeight);
  return layer.data[cellY * layer.width + cellX] !== 0;
}
export function validateMapDocument(document: MapDocument, options: ValidateMapDocumentOptions = {}): MapValidationIssue[] {
  const issues: MapValidationIssue[] = []; const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const mode = options.collisionMode ?? getCollisionMode(document); const pixelWidth = document.width * document.tilewidth; const pixelHeight = document.height * document.tileheight;
  if (!Number.isInteger(document.width) || document.width <= 0 || !Number.isInteger(document.height) || document.height <= 0) add("map-dimensions", "document", "width and height must be positive integers");
  if (!Number.isFinite(document.tilewidth) || document.tilewidth <= 0 || !Number.isFinite(document.tileheight) || document.tileheight <= 0) add("tile-dimensions", "document", "tile dimensions must be positive");
  const layerIds = new Set<number>(); const objectIds = new Set<number>(); const names = new Set<string>();
  for (const [layerIndex, layer] of document.layers.entries()) {
    const path = `layers[${layerIndex}](${layer.name})`;
    if (layerIds.has(layer.id)) add("duplicate-layer-id", path, `Layer id ${layer.id} is already used`); layerIds.add(layer.id);
    if (layer.type === "tilelayer" && layer.name === COLLISION_GRID_LAYER) {
      if (layer.width !== document.width || layer.height !== document.height) add("collision-grid-dimensions", path, "Collision grid dimensions must match the map");
      if (!Array.isArray(layer.data) || Array.isArray(layer.data[0]) || layer.data.length !== document.width * document.height) add("collision-grid-data", path, "Collision grid data must contain width × height cells");
      else if ((layer.data as number[]).some((cell) => !Number.isInteger(cell) || cell < 0)) add("collision-grid-data", path, "Collision grid cells must be non-negative integer tile ids");
    }
    for (const [index, object] of (layer.objects ?? []).entries()) {
      const objectPath = `${path}.objects[${index}]${object.name ? `(${object.name})` : ""}`;
      if (objectIds.has(object.id)) add("duplicate-object-id", objectPath, `Object id ${object.id} is already used`); objectIds.add(object.id);
      if (object.name) { if (names.has(object.name)) add("duplicate-object-name", objectPath, `Object name ${object.name} is already used`); names.add(object.name); }
      if (!Number.isFinite(object.x) || !Number.isFinite(object.y) || !pointInBounds(object, pixelWidth, pixelHeight)) add("out-of-bounds-object", objectPath, "Object must be inside map bounds");
      const objectKind = kind(object, layer);
      if (objectKind === "transition" && options.requireTransitionProperties !== false && (!getProperty(object, "destinationMap") || !getProperty(object, "destinationSpawn"))) add("missing-transition-property", objectPath, "Transition requires destinationMap and destinationSpawn properties");
    }
  }
  if (mode === "grid-16") {
    if (document.tilewidth !== 16 || document.tileheight !== 16) add("grid-cell-size", "document", "grid-16 maps must use 16px tiles");
    const collision = findLayer(document, COLLISION_GRID_LAYER);
    if (!collision) add("missing-collision-grid", "layers", "grid-16 maps require collision-grid");
    else for (const { layer, object, index } of allObjects(document)) if (["spawn", "transition", "interaction", "waypoint", "qa-probe"].includes(kind(object, layer)) && blockedAt(collision, object, document.tilewidth, document.tileheight)) add("blocked-anchor", `layers(${layer.name}).objects[${index}]`, `Anchor ${object.name ?? object.id} is blocked`);
  } else {
    const rects = findLayer(document, COLLISION_RECTS_LAYER);
    if (!rects || rects.type !== "objectgroup") add("missing-collision-rects", "layers", "rectangle maps require collision-rects object layer");
  }
  return issues;
}
export function assertValidMapDocument(document: MapDocument, options?: ValidateMapDocumentOptions): void { const issues = validateMapDocument(document, options); if (issues.length) throw new MapDocumentValidationError(issues); }
