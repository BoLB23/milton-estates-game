import {
  COLLISION_GRID_LAYER,
  COLLISION_GRID_TILE_SIZE,
  type CollisionGridLayerSource,
  type GridCell,
  type WorldPoint,
  type WorldRect,
  CollisionGrid,
  createCollisionGrid,
} from "./tiledRuntime";

export const SOLID_FOOTPRINT_LAYER = "solid-footprints";
export const SPAWN_LAYER = "spawns";
export const TRANSITION_LAYER = "transitions";

export interface MapValidationObject {
  id?: number;
  name?: string;
  type?: string;
  class?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  polygon?: readonly WorldPoint[];
  polyline?: readonly WorldPoint[];
  properties?: readonly { name: string; type?: string; value: unknown }[] | Readonly<Record<string, unknown>>;
}

export interface MapValidationLayer {
  name: string;
  type: string;
  width?: number;
  height?: number;
  data?: readonly number[] | readonly (readonly number[])[];
  objects?: readonly MapValidationObject[];
  x?: number;
  y?: number;
}

/** The finite, orthogonal subset of Tiled JSON accepted by the validators. */
export interface MapValidationDocument {
  mapId?: string;
  worldWidth?: number;
  worldHeight?: number;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  infinite?: boolean;
  orientation?: string;
  layers: readonly MapValidationLayer[];
}

export interface MapCatalogEntry {
  id: string;
  map: MapValidationDocument;
}

export type MapBoundarySide = "north" | "south" | "west" | "east";

export interface BoundaryExitRule {
  objectId: string;
  side?: MapBoundarySide;
}

export interface ReachabilityRule {
  startObjectIds: readonly string[];
  targetObjectIds: readonly string[];
  allowDiagonal?: boolean;
}

export interface ReciprocalTransitionRule {
  fromMapId: string;
  exitId: string;
  toMapId: string;
  destinationSpawnId: string;
  returnExitId: string;
  returnSpawnId: string;
}

export interface MapValidationOptions {
  expectedTileSize?: number;
  expectedWorldWidth?: number;
  expectedWorldHeight?: number;
  requireCollisionGrid?: boolean;
  collisionLayerName?: string;
  requiredLayerNames?: readonly string[];
  requiredObjectIds?: readonly string[];
  anchorTypes?: readonly string[];
  solidFootprintLayerName?: string;
  boundaryExits?: readonly BoundaryExitRule[];
  reachabilityRules?: readonly ReachabilityRule[];
  mapId?: string;
  /** Legacy, preserved maps may omit destination metadata while their geometry remains authoritative. */
  validateTransitions?: boolean;
}

export interface MapValidationIssue {
  code: string;
  path: string;
  message: string;
}

export class MapValidationError extends Error {
  public readonly issues: readonly MapValidationIssue[];

  public constructor(issues: readonly MapValidationIssue[]) {
    const ordered = [...issues].sort((left, right) => {
      const pathOrder = left.path.localeCompare(right.path);
      return pathOrder !== 0 ? pathOrder : left.code.localeCompare(right.code);
    });
    super([
      "Map validation failed:",
      ...ordered.map((issue) => `- ${issue.path} [${issue.code}]: ${issue.message}`),
    ].join("\n"));
    this.name = "MapValidationError";
    this.issues = ordered;
  }
}

const DEFAULT_ANCHOR_TYPES = [
  "spawn",
  "transition",
  "interaction",
  "objective",
  "mushroom",
  "waypoint",
  "qa-probe",
];

function addIssue(
  issues: MapValidationIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isMultiple(value: number, divisor: number): boolean {
  const remainder = Math.abs(value % divisor);
  return remainder < 1e-9 || Math.abs(remainder - divisor) < 1e-9;
}

function normalizedKind(object: MapValidationObject, layerName: string): string {
  const explicit = object.type ?? object.class;
  if (explicit && explicit.trim() !== "") return explicit.trim().toLowerCase();
  if (layerName === SPAWN_LAYER) return "spawn";
  if (layerName === TRANSITION_LAYER) return "transition";
  return "";
}

function isPositiveRectangle(object: MapValidationObject): object is MapValidationObject & { width: number; height: number } {
  return typeof object.width === "number" && typeof object.height === "number"
    && object.width > 0 && object.height > 0;
}

function objectName(object: MapValidationObject): string {
  return typeof object.name === "string" ? object.name : "<unnamed>";
}

function objectPath(layerName: string, index: number, object: MapValidationObject): string {
  return `layers.${layerName}.objects[${index}]${object.name ? `(${object.name})` : ""}`;
}

export function getAuthoredProperty(object: MapValidationObject, propertyName: string): unknown {
  const properties = object.properties;
  if (!properties) return undefined;
  if (Array.isArray(properties)) {
    const list = properties as readonly { name: string; type?: string; value: unknown }[];
    return list.find((property) => property.name === propertyName)?.value;
  }
  const record = properties as Readonly<Record<string, unknown>>;
  return record[propertyName];
}

function firstProperty(object: MapValidationObject, names: readonly string[]): unknown {
  for (const name of names) {
    const value = getAuthoredProperty(object, name);
    if (value !== undefined) return value;
  }
  return undefined;
}

function propertyString(object: MapValidationObject, names: readonly string[]): string | undefined {
  const value = firstProperty(object, names);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function allObjects(map: MapValidationDocument): Array<{ object: MapValidationObject; layerName: string; index: number }> {
  const result: Array<{ object: MapValidationObject; layerName: string; index: number }> = [];
  for (const layer of map.layers) {
    if (layer.type !== "objectgroup") continue;
    for (let index = 0; index < (layer.objects?.length ?? 0); index += 1) {
      const object = layer.objects?.[index];
      if (object) result.push({ object, layerName: layer.name, index });
    }
  }
  return result;
}

function objectByName(
  entries: readonly { object: MapValidationObject; layerName: string; index: number }[],
  name: string,
): MapValidationObject | undefined {
  return entries.find(({ object }) => object.name === name)?.object;
}

function objectWorldBounds(object: MapValidationObject): WorldRect {
  if (isPositiveRectangle(object)) return { x: object.x, y: object.y, width: object.width, height: object.height };
  return { x: object.x, y: object.y, width: 0, height: 0 };
}

function objectGeometryBounds(object: MapValidationObject): WorldRect {
  if (object.polygon && object.polygon.length > 0) {
    const points = object.polygon.map((point) => ({ x: object.x + point.x, y: object.y + point.y }));
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x));
    const maxY = Math.max(...points.map((point) => point.y));
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  return objectWorldBounds(object);
}

function pointIsInsideMap(point: WorldPoint, width: number, height: number): boolean {
  return point.x >= 0 && point.x < width && point.y >= 0 && point.y < height;
}

function objectIsInsideMap(object: MapValidationObject, width: number, height: number): boolean {
  const bounds = objectGeometryBounds(object);
  if (bounds.width === 0 && bounds.height === 0) return pointIsInsideMap(bounds, width, height);
  return bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height;
}

function collisionLayerSource(
  layer: MapValidationLayer,
): CollisionGridLayerSource | undefined {
  if (!layer.data) return undefined;
  return {
    width: layer.width ?? 0,
    height: layer.height ?? 0,
    data: layer.data,
  };
}

function makeGrid(
  layer: MapValidationLayer | undefined,
  tileSize: number,
): CollisionGrid | undefined {
  if (!layer) return undefined;
  const source = collisionLayerSource(layer);
  if (!source) return undefined;
  try {
    return createCollisionGrid(source, { tileSize });
  } catch {
    return undefined;
  }
}

function anchorCells(grid: CollisionGrid, object: MapValidationObject): GridCell[] {
  if (isPositiveRectangle(object)) return grid.cellsIntersecting(objectWorldBounds(object));
  const cell = grid.pointToCell(object);
  return cell ? [cell] : [];
}

function collectObjectGeometryIssues(
  map: MapValidationDocument,
  entries: readonly { object: MapValidationObject; layerName: string; index: number }[],
  issues: MapValidationIssue[],
  tileSize: number,
  grid: CollisionGrid | undefined,
  options: MapValidationOptions,
): void {
  const worldWidth = map.width * tileSize;
  const worldHeight = map.height * tileSize;
  const anchorTypes = new Set((options.anchorTypes ?? DEFAULT_ANCHOR_TYPES).map((type) => type.toLowerCase()));

  for (const { object, layerName, index } of entries) {
    const path = objectPath(layerName, index, object);
    const kind = normalizedKind(object, layerName);
    if (!objectIsInsideMap(object, worldWidth, worldHeight)) {
      addIssue(issues, "out-of-bounds-object", path, `Object ${objectName(object)} lies outside ${worldWidth}x${worldHeight} world bounds`);
    }

    if (isPositiveRectangle(object) && anchorTypes.has(kind)) {
      if (!isMultiple(object.x, tileSize) || !isMultiple(object.y, tileSize)
        || !isMultiple(object.width, tileSize) || !isMultiple(object.height, tileSize)) {
        addIssue(issues, "rectangle-alignment", path, `Rectangle edges must align to the ${tileSize}px collision grid`);
      }
    } else if (anchorTypes.has(kind)) {
      if (!isMultiple(object.x - tileSize / 2, tileSize) || !isMultiple(object.y - tileSize / 2, tileSize)) {
        addIssue(issues, "point-alignment", path, `Point anchor ${objectName(object)} must use a ${tileSize}px cell center`);
      }
    }

    if (grid && anchorTypes.has(kind)) {
      const cells = anchorCells(grid, object);
      if (cells.length === 0 || cells.some((cell) => !grid.isWalkable(cell))) {
        addIssue(issues, "blocked-anchor", path, `Anchor ${objectName(object)} must be placed on empty collision-grid cells`);
      }
    }

    if (kind === "transition" && options.validateTransitions !== false) {
      const destinationMap = propertyString(object, ["destinationMap", "destination_map"]);
      const destinationSpawn = propertyString(object, ["destinationSpawn", "destination_spawn"]);
      if (!destinationMap) addIssue(issues, "missing-transition-property", `${path}.properties.destinationMap`, "Transition must name a destination map");
      if (!destinationSpawn) addIssue(issues, "missing-transition-property", `${path}.properties.destinationSpawn`, "Transition must name a destination spawn");
    }
  }
}

function pointInPolygon(point: WorldPoint, polygon: readonly WorldPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];
    if (!current || !prior) continue;
    const intersects = ((current.y > point.y) !== (prior.y > point.y))
      && point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function orientation(a: WorldPoint, b: WorldPoint, c: WorldPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: WorldPoint, b: WorldPoint, point: WorldPoint): boolean {
  return point.x >= Math.min(a.x, b.x) - 1e-9 && point.x <= Math.max(a.x, b.x) + 1e-9
    && point.y >= Math.min(a.y, b.y) - 1e-9 && point.y <= Math.max(a.y, b.y) + 1e-9
    && Math.abs(orientation(a, b, point)) < 1e-9;
}

function segmentsIntersect(a: WorldPoint, b: WorldPoint, c: WorldPoint, d: WorldPoint): boolean {
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  if (((first > 0 && second < 0) || (first < 0 && second > 0))
    && ((third > 0 && fourth < 0) || (third < 0 && fourth > 0))) return true;
  return (Math.abs(first) < 1e-9 && onSegment(a, b, c))
    || (Math.abs(second) < 1e-9 && onSegment(a, b, d))
    || (Math.abs(third) < 1e-9 && onSegment(c, d, a))
    || (Math.abs(fourth) < 1e-9 && onSegment(c, d, b));
}

function polygonIntersectsRect(polygon: readonly WorldPoint[], rect: WorldRect): boolean {
  if (polygon.length < 3) return false;
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  if (corners.some((corner) => pointInPolygon(corner, polygon))) return true;
  if (polygon.some((point) => point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height)) return true;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (!start || !end) continue;
    for (let corner = 0; corner < corners.length; corner += 1) {
      const edgeStart = corners[corner];
      const edgeEnd = corners[(corner + 1) % corners.length];
      if (edgeStart && edgeEnd && segmentsIntersect(start, end, edgeStart, edgeEnd)) return true;
    }
  }
  return false;
}

function footprintCells(grid: CollisionGrid, object: MapValidationObject): GridCell[] {
  if (object.polygon && object.polygon.length >= 3) {
    const polygon = object.polygon.map((point) => ({ x: object.x + point.x, y: object.y + point.y }));
    const minX = Math.min(...polygon.map((point) => point.x));
    const minY = Math.min(...polygon.map((point) => point.y));
    const maxX = Math.max(...polygon.map((point) => point.x));
    const maxY = Math.max(...polygon.map((point) => point.y));
    return grid.cellsIntersecting({ x: minX, y: minY, width: maxX - minX, height: maxY - minY })
      .filter((cell) => polygonIntersectsRect(polygon, grid.cellBounds(cell)));
  }
  return isPositiveRectangle(object) ? grid.cellsIntersecting(objectWorldBounds(object)) : [];
}

function collectSolidFootprintIssues(
  map: MapValidationDocument,
  grid: CollisionGrid | undefined,
  issues: MapValidationIssue[],
  options: MapValidationOptions,
): void {
  if (!grid) return;
  const layerName = options.solidFootprintLayerName ?? SOLID_FOOTPRINT_LAYER;
  for (const layer of map.layers) {
    if (layer.name !== layerName || layer.type !== "objectgroup") continue;
    for (let index = 0; index < (layer.objects?.length ?? 0); index += 1) {
      const object = layer.objects?.[index];
      if (!object) continue;
      const path = objectPath(layer.name, index, object);
      const cells = footprintCells(grid, object);
      if (cells.length === 0) {
        addIssue(issues, "invalid-footprint", path, `Solid footprint ${objectName(object)} needs a rectangle or polygon with area`);
        continue;
      }
      const dynamic = getAuthoredProperty(object, "dynamic") === true
        || getAuthoredProperty(object, "dynamic") === "true"
        || getAuthoredProperty(object, "stateful") === true
        || getAuthoredProperty(object, "stateful") === "true";
      if (dynamic) continue;
      for (const cell of cells) {
        if (grid.isWalkable(cell)) {
          addIssue(issues, "walkable-solid-overlap", path, `Solid footprint ${objectName(object)} overlaps legal cell ${cell.x},${cell.y}`);
        }
      }
    }
  }
}

function boundaryCells(grid: CollisionGrid): GridCell[] {
  const cells: GridCell[] = [];
  for (let x = 0; x < grid.width; x += 1) {
    cells.push({ x, y: 0 });
    if (grid.height > 1) cells.push({ x, y: grid.height - 1 });
  }
  for (let y = 1; y < grid.height - 1; y += 1) {
    cells.push({ x: 0, y });
    if (grid.width > 1) cells.push({ x: grid.width - 1, y });
  }
  return cells;
}

function exitSides(rect: WorldRect, width: number, height: number): MapBoundarySide[] {
  const sides: MapBoundarySide[] = [];
  if (rect.y === 0) sides.push("north");
  if (rect.y + rect.height === height) sides.push("south");
  if (rect.x === 0) sides.push("west");
  if (rect.x + rect.width === width) sides.push("east");
  return sides;
}

function collectBoundaryIssues(
  map: MapValidationDocument,
  grid: CollisionGrid | undefined,
  entries: readonly { object: MapValidationObject; layerName: string; index: number }[],
  issues: MapValidationIssue[],
  tileSize: number,
  options: MapValidationOptions,
): void {
  if (!grid) return;
  const width = map.width * tileSize;
  const height = map.height * tileSize;
  const transitions = entries.filter(({ object, layerName }) => normalizedKind(object, layerName) === "transition");
  const rules: BoundaryExitRule[] = options.boundaryExits
    ? [...options.boundaryExits]
    : transitions
      .filter(({ object }) => exitSides(objectWorldBounds(object), width, height).length > 0)
      .map(({ object }) => ({ objectId: objectName(object) }));
  const explicit = new Set<string>();
  const boundary = new Set(boundaryCells(grid).map((cell) => `${cell.x},${cell.y}`));

  for (const rule of rules) {
    const entry = entries.find(({ object }) => object.name === rule.objectId);
    if (!entry) {
      addIssue(issues, "missing-boundary-exit", `boundaryExits.${rule.objectId}`, `Boundary exit object ${rule.objectId} does not exist`);
      continue;
    }
    const rect = objectWorldBounds(entry.object);
    const sides = exitSides(rect, width, height);
    if (sides.length === 0) {
      addIssue(issues, "non-boundary-exit", `boundaryExits.${rule.objectId}`, `Exit ${rule.objectId} must touch a map boundary`);
    }
    if (rule.side && !sides.includes(rule.side)) {
      addIssue(issues, "wrong-boundary-side", `boundaryExits.${rule.objectId}`, `Exit ${rule.objectId} does not touch the ${rule.side} boundary`);
    }
    for (const cell of grid.cellsIntersecting(rect)) {
      explicit.add(`${cell.x},${cell.y}`);
      if (!grid.isWalkable(cell)) {
        addIssue(issues, "blocked-boundary-exit", `boundaryExits.${rule.objectId}`, `Exit ${rule.objectId} covers blocked cell ${cell.x},${cell.y}`);
      }
    }
  }

  for (const cell of boundaryCells(grid)) {
    if (grid.isWalkable(cell) && !explicit.has(`${cell.x},${cell.y}`)) {
      addIssue(issues, "boundary-leak", `collision-grid[${cell.x},${cell.y}]`, "Walkable map boundary cell is not covered by an explicit exit");
    }
  }

  const starts = entries
    .filter(({ object, layerName }) => normalizedKind(object, layerName) === "spawn")
    .map(({ object }) => cellForObject(grid, object))
    .filter((cell): cell is GridCell => cell !== undefined);
  if (starts.length > 0) {
    const reachable = grid.floodFill(starts);
    for (const key of explicit) {
      if (boundary.has(key) && !reachable.has(key)) {
        addIssue(issues, "unreachable-boundary-exit", `collision-grid[${key}]`, "Explicit boundary exit is not reachable from any authored spawn");
      }
    }
  }
}

function cellForObject(grid: CollisionGrid, object: MapValidationObject): GridCell | undefined {
  if (isPositiveRectangle(object)) return grid.cellsIntersecting(objectWorldBounds(object))[0];
  return grid.pointToCell(object);
}

export function floodFillWalkable(
  grid: CollisionGrid,
  starts: readonly GridCell[],
  allowDiagonal = false,
): ReadonlySet<string> {
  return grid.floodFill(starts, allowDiagonal);
}

export function isGridReachable(
  grid: CollisionGrid,
  start: GridCell,
  target: GridCell,
  allowDiagonal = false,
): boolean {
  return grid.floodFill([start], allowDiagonal).has(`${target.x},${target.y}`);
}

export function collectReachabilityIssues(
  grid: CollisionGrid,
  starts: readonly GridCell[],
  targets: readonly { id: string; cell: GridCell }[],
  allowDiagonal = false,
): MapValidationIssue[] {
  const reachable = grid.floodFill(starts, allowDiagonal);
  return targets
    .filter(({ cell }) => !reachable.has(`${cell.x},${cell.y}`))
    .map(({ id, cell }) => ({
      code: "unreachable-anchor",
      path: id,
      message: `Anchor ${id} at ${cell.x},${cell.y} is not reachable from the supplied starts`,
    }));
}

export function validateReachability(
  grid: CollisionGrid,
  starts: readonly GridCell[],
  targets: readonly { id: string; cell: GridCell }[],
  allowDiagonal = false,
): void {
  const issues = collectReachabilityIssues(grid, starts, targets, allowDiagonal);
  if (issues.length > 0) throw new MapValidationError(issues);
}

function collectMapDataIssues(
  map: MapValidationDocument,
  options: MapValidationOptions = {},
): MapValidationIssue[] {
  const issues: MapValidationIssue[] = [];
  const tileSize = options.expectedTileSize ?? COLLISION_GRID_TILE_SIZE;
  const mapLabel = options.mapId ?? map.mapId ?? "map";
  const pathPrefix = `maps.${mapLabel}`;
  const collisionLayerName = options.collisionLayerName ?? COLLISION_GRID_LAYER;
  const requireCollisionGrid = options.requireCollisionGrid ?? true;

  if (!Number.isInteger(map.width) || map.width <= 0) addIssue(issues, "map-dimensions", `${pathPrefix}.width`, "Map width must be a positive tile count");
  if (!Number.isInteger(map.height) || map.height <= 0) addIssue(issues, "map-dimensions", `${pathPrefix}.height`, "Map height must be a positive tile count");
  if (map.orientation !== "orthogonal") addIssue(issues, "orientation", `${pathPrefix}.orientation`, "Map orientation must be orthogonal");
  if (map.infinite !== false) addIssue(issues, "finite-map", `${pathPrefix}.infinite`, "Map must be finite (infinite: false)");
  if (map.tilewidth !== tileSize || map.tileheight !== tileSize) {
    addIssue(issues, "tile-size", `${pathPrefix}.tilewidth`, `Map tile size must be ${tileSize}x${tileSize}px`);
  }
  const worldWidth = map.width * tileSize;
  const worldHeight = map.height * tileSize;
  const declaredWorldWidth = options.expectedWorldWidth ?? map.worldWidth;
  const declaredWorldHeight = options.expectedWorldHeight ?? map.worldHeight;
  if (declaredWorldWidth !== undefined && declaredWorldWidth !== worldWidth) {
    addIssue(issues, "world-bounds", `${pathPrefix}.worldWidth`, `Declared world width ${declaredWorldWidth} must equal ${worldWidth}px`);
  }
  if (declaredWorldHeight !== undefined && declaredWorldHeight !== worldHeight) {
    addIssue(issues, "world-bounds", `${pathPrefix}.worldHeight`, `Declared world height ${declaredWorldHeight} must equal ${worldHeight}px`);
  }
  if (!Array.isArray(map.layers)) {
    addIssue(issues, "layers", `${pathPrefix}.layers`, "Map must contain an array of layers");
    return issues;
  }

  const layerNames = new Set<string>();
  for (const layer of map.layers) {
    if (layerNames.has(layer.name)) addIssue(issues, "duplicate-layer", `${pathPrefix}.layers.${layer.name}`, "Layer name must be unique");
    layerNames.add(layer.name);
  }
  const requiredLayers = [...(options.requiredLayerNames ?? []), ...(requireCollisionGrid ? [collisionLayerName] : [])];
  for (const layerName of new Set(requiredLayers)) {
    const matches = map.layers.filter((layer) => layer.name === layerName);
    if (matches.length === 0) addIssue(issues, "missing-layer", `${pathPrefix}.layers.${layerName}`, `Required layer ${layerName} is missing`);
    else if (matches.length > 1) addIssue(issues, "duplicate-layer", `${pathPrefix}.layers.${layerName}`, `Required layer ${layerName} must occur exactly once`);
  }

  const collisionMatches = map.layers.filter((layer) => layer.name === collisionLayerName);
  const collision = collisionMatches.length === 1 ? collisionMatches[0] : undefined;
  if (collision && collision.type !== "tilelayer") addIssue(issues, "collision-layer-type", `${pathPrefix}.layers.${collisionLayerName}`, "Collision grid must be a tilelayer");
  if (collision && (collision.width !== map.width || collision.height !== map.height)) {
    addIssue(issues, "collision-layer-size", `${pathPrefix}.layers.${collisionLayerName}`, "Collision grid dimensions must match the finite map tile dimensions");
  }
  if (collision && ((collision.x ?? 0) !== 0 || (collision.y ?? 0) !== 0)) {
    addIssue(issues, "collision-layer-offset", `${pathPrefix}.layers.${collisionLayerName}`, "Collision grid layer offset must be zero");
  }
  if (collision && !collision.data) addIssue(issues, "collision-layer-data", `${pathPrefix}.layers.${collisionLayerName}.data`, "Collision grid must contain finite tile data");
  if (collision?.data) {
    const values = Array.isArray(collision.data[0])
      ? (collision.data as readonly (readonly number[])[]).flatMap((row) => [...row])
      : [...(collision.data as readonly number[])];
    const expected = map.width * map.height;
    if (values.length !== expected) addIssue(issues, "collision-layer-data", `${pathPrefix}.layers.${collisionLayerName}.data`, `Collision grid must contain exactly ${expected} cells`);
    values.forEach((value, index) => {
      if (!Number.isInteger(value) || value < -1) addIssue(issues, "collision-cell-value", `${pathPrefix}.layers.${collisionLayerName}.data[${index}]`, "Collision cell values must be integer tile IDs (0/−1 empty or positive filled)");
    });
  }

  const entries = allObjects(map);
  const ids = new Set<number>();
  const names = new Set<string>();
  for (const { object, layerName, index } of entries) {
    const path = objectPath(layerName, index, object);
    const objectId = object.id;
    if (typeof objectId !== "number" || !Number.isInteger(objectId) || objectId <= 0) addIssue(issues, "stable-object-id", `${path}.id`, "Every authored object needs a positive numeric Tiled ID");
    else if (ids.has(objectId)) addIssue(issues, "duplicate-object-id", `${path}.id`, `Tiled object ID ${objectId} is duplicated`);
    else ids.add(objectId);
    if (!object.name || object.name.trim() === "") addIssue(issues, "stable-object-name", `${path}.name`, "Every gameplay object needs a non-empty stable name");
    else if (names.has(object.name)) addIssue(issues, "duplicate-object-name", `${path}.name`, `Stable object name ${object.name} is duplicated`);
    else names.add(object.name);
    if (!isFiniteNumber(object.x) || !isFiniteNumber(object.y)) addIssue(issues, "object-coordinate", path, `Object ${objectName(object)} must have finite x/y coordinates`);
    if (object.width !== undefined && (!isFiniteNumber(object.width) || object.width < 0)) addIssue(issues, "object-size", `${path}.width`, "Object width must be a non-negative finite number");
    if (object.height !== undefined && (!isFiniteNumber(object.height) || object.height < 0)) addIssue(issues, "object-size", `${path}.height`, "Object height must be a non-negative finite number");
  }
  for (const requiredId of options.requiredObjectIds ?? []) {
    if (!names.has(requiredId)) addIssue(issues, "missing-object", `${pathPrefix}.objects.${requiredId}`, `Required stable object ${requiredId} is missing`);
  }

  const grid = makeGrid(collision, tileSize);
  collectObjectGeometryIssues(map, entries, issues, tileSize, grid, options);
  collectSolidFootprintIssues(map, grid, issues, options);
  collectBoundaryIssues(map, grid, entries, issues, tileSize, options);

  for (const rule of options.reachabilityRules ?? []) {
    if (!grid) continue;
    const starts = rule.startObjectIds
      .map((id) => objectByName(entries, id))
      .map((object) => object && cellForObject(grid, object))
      .filter((cell): cell is GridCell => cell !== undefined);
    const targets = rule.targetObjectIds.map((id) => {
      const object = objectByName(entries, id);
      const cell = object ? cellForObject(grid, object) : undefined;
      return { id, cell };
    });
    for (const target of targets) {
      if (!target.cell) {
        addIssue(issues, "missing-reachability-anchor", `${pathPrefix}.objects.${target.id}`, `Reachability target ${target.id} is missing or outside the collision grid`);
        continue;
      }
      const unreachable = collectReachabilityIssues(grid, starts, [{ id: target.id, cell: target.cell }], rule.allowDiagonal ?? false);
      issues.push(...unreachable.map((issue) => ({ ...issue, path: `${pathPrefix}.${issue.path}` })));
    }
  }
  return issues.map((issue) => issue.path.startsWith(`${pathPrefix}.`)
    ? issue
    : { ...issue, path: `${pathPrefix}.${issue.path}` });
}

export function collectMapValidationIssues(
  map: MapValidationDocument,
  options: MapValidationOptions = {},
): readonly MapValidationIssue[] {
  return collectMapDataIssues(map, options).sort((left, right) => {
    const pathOrder = left.path.localeCompare(right.path);
    return pathOrder !== 0 ? pathOrder : left.code.localeCompare(right.code);
  });
}

export function validateMapData(
  map: MapValidationDocument,
  options: MapValidationOptions = {},
): void {
  const issues = collectMapValidationIssues(map, options);
  if (issues.length > 0) throw new MapValidationError(issues);
}

function entriesForCatalog(entry: MapCatalogEntry): Array<{ object: MapValidationObject; layerName: string; index: number }> {
  return allObjects(entry.map);
}

function transitionEntries(entry: MapCatalogEntry): Array<{ object: MapValidationObject; layerName: string; index: number }> {
  return entriesForCatalog(entry).filter(({ object, layerName }) => normalizedKind(object, layerName) === "transition");
}

function spawnEntries(entry: MapCatalogEntry): Array<{ object: MapValidationObject; layerName: string; index: number }> {
  return entriesForCatalog(entry).filter(({ object, layerName }) => normalizedKind(object, layerName) === "spawn");
}

function findCatalogEntry(entries: readonly MapCatalogEntry[], id: string): MapCatalogEntry | undefined {
  return entries.find((entry) => entry.id === id);
}

function collectTransitionSpawnIssues(
  maps: readonly MapCatalogEntry[],
): MapValidationIssue[] {
  const issues: MapValidationIssue[] = [];
  for (const source of maps) {
    for (const { object } of transitionEntries(source)) {
      const transitionId = objectName(object);
      const destinationMap = propertyString(object, ["destinationMap", "destination_map"]);
      const destinationSpawn = propertyString(object, ["destinationSpawn", "destination_spawn"]);
      if (!destinationMap || !destinationSpawn) continue;
      const destination = findCatalogEntry(maps, destinationMap);
      if (!destination) {
        addIssue(issues, "unknown-destination-map", `${source.id}.${transitionId}.properties.destinationMap`, `Transition points to unknown map ${destinationMap}`);
        continue;
      }
      if (!spawnEntries(destination).some(({ object: spawn }) => spawn.name === destinationSpawn)) {
        addIssue(issues, "unknown-destination-spawn", `${source.id}.${transitionId}.properties.destinationSpawn`, `Destination map ${destinationMap} has no spawn named ${destinationSpawn}`);
      }
    }
  }
  return issues;
}

function collectReciprocalTransitionIssues(
  maps: readonly MapCatalogEntry[],
  rules: readonly ReciprocalTransitionRule[],
): MapValidationIssue[] {
  const issues: MapValidationIssue[] = [];
  for (const rule of rules) {
    const source = findCatalogEntry(maps, rule.fromMapId);
    const destination = findCatalogEntry(maps, rule.toMapId);
    if (!source) {
      addIssue(issues, "missing-map", `reciprocal.${rule.fromMapId}`, `Source map ${rule.fromMapId} is missing`);
      continue;
    }
    if (!destination) {
      addIssue(issues, "missing-map", `reciprocal.${rule.toMapId}`, `Destination map ${rule.toMapId} is missing`);
      continue;
    }
    const exit = transitionEntries(source).find(({ object }) => object.name === rule.exitId)?.object;
    const returnExit = transitionEntries(destination).find(({ object }) => object.name === rule.returnExitId)?.object;
    if (!exit) addIssue(issues, "missing-transition", `${rule.fromMapId}.${rule.exitId}`, `Reciprocal source exit ${rule.exitId} is missing`);
    if (!returnExit) addIssue(issues, "missing-transition", `${rule.toMapId}.${rule.returnExitId}`, `Reciprocal return exit ${rule.returnExitId} is missing`);
    if (!exit || !returnExit) continue;

    const exitDestination = propertyString(exit, ["destinationMap", "destination_map"]);
    const exitSpawn = propertyString(exit, ["destinationSpawn", "destination_spawn"]);
    if (exitDestination !== rule.toMapId) addIssue(issues, "transition-target-mismatch", `${rule.fromMapId}.${rule.exitId}`, `Exit must target ${rule.toMapId}, received ${exitDestination ?? "<missing>"}`);
    if (exitSpawn !== rule.destinationSpawnId) addIssue(issues, "transition-spawn-mismatch", `${rule.fromMapId}.${rule.exitId}`, `Exit must land at spawn ${rule.destinationSpawnId}, received ${exitSpawn ?? "<missing>"}`);

    const returnDestination = propertyString(returnExit, ["destinationMap", "destination_map"]);
    const returnSpawn = propertyString(returnExit, ["destinationSpawn", "destination_spawn"]);
    if (returnDestination !== rule.fromMapId) addIssue(issues, "transition-target-mismatch", `${rule.toMapId}.${rule.returnExitId}`, `Return exit must target ${rule.fromMapId}, received ${returnDestination ?? "<missing>"}`);
    if (returnSpawn !== rule.returnSpawnId) addIssue(issues, "transition-spawn-mismatch", `${rule.toMapId}.${rule.returnExitId}`, `Return exit must land at spawn ${rule.returnSpawnId}, received ${returnSpawn ?? "<missing>"}`);
  }
  return issues;
}

export function collectTransitionValidationIssues(
  maps: readonly MapCatalogEntry[],
  reciprocalRules: readonly ReciprocalTransitionRule[] = [],
): readonly MapValidationIssue[] {
  return [
    ...collectTransitionSpawnIssues(maps),
    ...collectReciprocalTransitionIssues(maps, reciprocalRules),
  ].sort((left, right) => {
    const pathOrder = left.path.localeCompare(right.path);
    return pathOrder !== 0 ? pathOrder : left.code.localeCompare(right.code);
  });
}

export function validateReciprocalTransitions(
  maps: readonly MapCatalogEntry[],
  reciprocalRules: readonly ReciprocalTransitionRule[],
): void {
  const issues = collectTransitionValidationIssues(maps, reciprocalRules);
  if (issues.length > 0) throw new MapValidationError(issues);
}

export interface MapTopologyEdge {
  sourceMapId: string;
  destinationMapId: string;
  transitionId: string;
  destinationSpawnId?: string;
}

export interface MapTopologyGraph {
  mapIds: readonly string[];
  edges: readonly MapTopologyEdge[];
}

export interface TopologyRouteRule {
  fromMapId: string;
  toMapId: string;
  viaMapIds: readonly string[];
}

export interface MapTopologyOptions {
  requiredRoutes?: readonly TopologyRouteRule[];
  forbiddenMapIds?: readonly string[];
}

export function buildMapTopologyGraph(maps: readonly MapCatalogEntry[]): MapTopologyGraph {
  const edges: MapTopologyEdge[] = [];
  for (const entry of maps) {
    for (const { object } of transitionEntries(entry)) {
      const destination = propertyString(object, ["destinationMap", "destination_map"]);
      if (!destination) continue;
      edges.push({
        sourceMapId: entry.id,
        destinationMapId: destination,
        transitionId: objectName(object),
        destinationSpawnId: propertyString(object, ["destinationSpawn", "destination_spawn"]),
      });
    }
  }
  return { mapIds: maps.map((entry) => entry.id), edges };
}

function reachableMapIds(
  graph: MapTopologyGraph,
  starts: readonly string[],
  excluded: ReadonlySet<string> = new Set(),
): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (excluded.has(edge.sourceMapId) || excluded.has(edge.destinationMapId)) continue;
    const destinations = adjacency.get(edge.sourceMapId) ?? [];
    destinations.push(edge.destinationMapId);
    adjacency.set(edge.sourceMapId, destinations);
  }
  const visited = new Set<string>();
  const queue = starts.filter((start) => !excluded.has(start));
  for (const start of queue) visited.add(start);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current) continue;
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return visited;
}

function orderedRouteExists(graph: MapTopologyGraph, rule: TopologyRouteRule): boolean {
  let frontier = new Set([rule.fromMapId]);
  for (const checkpoint of [...rule.viaMapIds, rule.toMapId]) {
    frontier = new Set([...frontier].filter((mapId) => mapId === checkpoint || reachableMapIds(graph, [mapId]).has(checkpoint)));
    if (frontier.size === 0) return false;
    frontier = new Set([checkpoint]);
  }
  return true;
}

export function collectMapTopologyIssues(
  graph: MapTopologyGraph,
  options: MapTopologyOptions = {},
): readonly MapValidationIssue[] {
  const issues: MapValidationIssue[] = [];
  const mapIds = new Set(graph.mapIds);
  if (mapIds.size !== graph.mapIds.length) addIssue(issues, "duplicate-map-id", "topology.mapIds", "Map IDs must be unique");
  for (const edge of graph.edges) {
    if (!mapIds.has(edge.sourceMapId)) addIssue(issues, "unknown-map-edge", `topology.${edge.transitionId}`, `Transition source map ${edge.sourceMapId} is not registered`);
    if (!mapIds.has(edge.destinationMapId)) addIssue(issues, "unknown-map-edge", `topology.${edge.transitionId}`, `Transition destination map ${edge.destinationMapId} is not registered`);
  }
  for (const forbidden of options.forbiddenMapIds ?? []) {
    if (mapIds.has(forbidden)) addIssue(issues, "forbidden-map", `topology.${forbidden}`, `Forbidden legacy map ${forbidden} remains registered`);
    if (graph.edges.some((edge) => edge.sourceMapId === forbidden || edge.destinationMapId === forbidden)) {
      addIssue(issues, "forbidden-map-edge", `topology.${forbidden}`, `A transition still references forbidden legacy map ${forbidden}`);
    }
  }
  for (const rule of options.requiredRoutes ?? []) {
    const checkpoints = [rule.fromMapId, ...rule.viaMapIds, rule.toMapId];
    for (const mapId of checkpoints) {
      if (!mapIds.has(mapId)) addIssue(issues, "missing-topology-node", `topology.routes.${rule.fromMapId}->${rule.toMapId}`, `Required topology map ${mapId} is not registered`);
    }
    if (!orderedRouteExists(graph, rule)) {
      addIssue(issues, "missing-required-route", `topology.routes.${rule.fromMapId}->${rule.toMapId}`, `No route exists through ${rule.viaMapIds.join(" -> ") || "the required topology"}`);
    }
    const excluded = new Set(rule.viaMapIds);
    if (reachableMapIds(graph, [rule.fromMapId], excluded).has(rule.toMapId)) {
      addIssue(issues, "shortcut-route", `topology.routes.${rule.fromMapId}->${rule.toMapId}`, `A route reaches ${rule.toMapId} without traversing ${rule.viaMapIds.join(" -> ")}`);
    }
  }
  return issues.sort((left, right) => {
    const pathOrder = left.path.localeCompare(right.path);
    return pathOrder !== 0 ? pathOrder : left.code.localeCompare(right.code);
  });
}

export function validateMapTopology(
  graph: MapTopologyGraph,
  options: MapTopologyOptions = {},
): void {
  const issues = collectMapTopologyIssues(graph, options);
  if (issues.length > 0) throw new MapValidationError(issues);
}

export interface MapCatalogValidationOptions {
  mapOptions?: MapValidationOptions;
  mapOptionsById?: Readonly<Record<string, MapValidationOptions>>;
  reciprocalTransitions?: readonly ReciprocalTransitionRule[];
  topology?: MapTopologyOptions;
}

export function collectMapCatalogValidationIssues(
  maps: readonly MapCatalogEntry[],
  options: MapCatalogValidationOptions = {},
): readonly MapValidationIssue[] {
  const issues: MapValidationIssue[] = [];
  const mapIds = new Set<string>();
  for (const entry of maps) {
    if (!entry.id || mapIds.has(entry.id)) addIssue(issues, "duplicate-map-id", `maps.${entry.id || "<empty>"}`, `Map catalog ID ${entry.id || "<empty>"} must be non-empty and unique`);
    mapIds.add(entry.id);
    const mapOptions = {
      ...options.mapOptions,
      ...options.mapOptionsById?.[entry.id],
      mapId: entry.id,
    };
    issues.push(...collectMapDataIssues(entry.map, mapOptions));
  }
  issues.push(...collectTransitionValidationIssues(maps, options.reciprocalTransitions));
  if (options.topology) issues.push(...collectMapTopologyIssues(buildMapTopologyGraph(maps), options.topology));
  return issues.sort((left, right) => {
    const pathOrder = left.path.localeCompare(right.path);
    return pathOrder !== 0 ? pathOrder : left.code.localeCompare(right.code);
  });
}

export function validateMapCatalog(
  maps: readonly MapCatalogEntry[],
  options: MapCatalogValidationOptions = {},
): void {
  const issues = collectMapCatalogValidationIssues(maps, options);
  if (issues.length > 0) throw new MapValidationError(issues);
}
