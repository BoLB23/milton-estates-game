#!/usr/bin/env node
/**
 * Static acceptance gate for the authored regional map packages.
 *
 * This intentionally has no Phaser dependency: CI can validate the finite
 * collision grid, stable object contract, transitions, topology, and PNG
 * dimensions before a renderer is started.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const publicRoot = join(root, "public");
const tileSize = 16;
const defaultGridWidth = 90;
const defaultGridHeight = 66;
const expansionIds = ["neighborhood", "stonehenge", "reidenbaugh", "fruitville_pike", "bent_creek"];
const legacyRoadId = ["reidenbaugh", "road"].join("_");
const bicycleTuningSource = readFileSync(join(root, "src", "world", "PlayerLocomotionController.ts"), "utf8");
const bicycleTuningBlock = bicycleTuningSource.match(/REGIONAL_BICYCLE_TUNING[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1];
const regionalBicycleSpeed = Number(bicycleTuningBlock?.match(/\bmaxSpeed:\s*(\d+(?:\.\d+)?)/)?.[1]);

const specs = {
  neighborhood: {
    image: "../milton-estates-new.png",
    imagePath: "assets/maps/milton-estates-new.png",
    gridHeight: 68,
    sourceWidth: 1448,
    sourceHeight: 1086,
    boundary: { exit_stonehenge: "east", exit_fruitville: "west" },
    mustHave: [
      "spawn_home", "spawn_woods", "spawn_stonehenge", "spawn_fruitville", "woods_gate", "exit_stonehenge", "exit_fruitville",
      "ryan_invite", "bike_mount_milton", ...Array.from({ length: 12 }, (_, index) => `ryan_depart_${String(index).padStart(2, "0")}`),
    ],
    transitions: {
      woods_gate: ["creek", "spawn_home"],
      exit_stonehenge: ["stonehenge", "spawn_milton"],
      exit_fruitville: ["fruitville_pike", "spawn_milton"],
    },
  },
  stonehenge: {
    image: "stonehenge-master-v1.png",
    boundary: { exit_milton: "west", exit_reidenbaugh: "north" },
    mustHave: [
      "spawn_milton", "spawn_reidenbaugh", "exit_milton", "exit_reidenbaugh",
      ...Array.from({ length: 13 }, (_, index) => `stonehenge_route_${String(index).padStart(2, "0")}`),
    ],
    transitions: { exit_milton: ["neighborhood", "spawn_stonehenge"], exit_reidenbaugh: ["reidenbaugh", "spawn_stonehenge"] },
  },
  reidenbaugh: {
    image: "reidenbaugh-elementary-master-v1.png",
    boundary: { exit_stonehenge: "west" },
    mustHave: [
      "spawn_stonehenge", "exit_stonehenge", "school_front", "bus_loop", "visitor_parking", "playground", "basketball_court",
      "athletic_field", "bike_rack_reidenbaugh", "ryan_finish", "ryan_post",
      ...["a", "b", "c"].flatMap((route) => Array.from({ length: 7 }, (_, index) => `chase_${route}_${String(index).padStart(2, "0")}`)),
    ],
    transitions: { exit_stonehenge: ["stonehenge", "spawn_reidenbaugh"] },
  },
  fruitville_pike: {
    image: "fruitville-pike-master-v1.png",
    boundary: { exit_milton: "south", exit_bent_creek: "north" },
    mustHave: [
      "spawn_milton", "spawn_bent_creek", "exit_milton", "exit_bent_creek", "crosswalk_north", "crosswalk_south", "bike_shoulder", "fruitville_midpoint",
      ...Array.from({ length: 9 }, (_, index) => `fruitville_route_${String(index).padStart(2, "0")}`),
    ],
    transitions: { exit_milton: ["neighborhood", "spawn_fruitville"], exit_bent_creek: ["bent_creek", "spawn_gate_exterior"] },
  },
  bent_creek: {
    image: "bent-creek-master-v1.png",
    boundary: { exit_fruitville: "west" },
    mustHave: [
      "spawn_gate_exterior", "spawn_fruitville", "exit_fruitville", "gatehouse", "gate_attendant", "gate_entry", "clubhouse", "gate_barrier",
      ...Array.from({ length: 12 }, (_, index) => `golf_cart_path_${String(index).padStart(2, "0")}`),
    ],
    transitions: { exit_fruitville: ["fruitville_pike", "spawn_bent_creek"] },
  },
};

const issues = [];
const loadedMaps = new Map();
const fail = (message) => issues.push(message);
const readJson = (relativePath) => JSON.parse(readFileSync(join(publicRoot, relativePath), "utf8"));
const objectProperty = (object, name) => Array.isArray(object.properties)
  ? object.properties.find((property) => property.name === name)?.value
  : object.properties?.[name];
const objectLayers = (map) => map.layers.filter((layer) => layer.type === "objectgroup");
const allObjects = (map) => objectLayers(map).flatMap((layer) => layer.objects ?? []);
const objectMap = (map) => new Map(allObjects(map).map((object) => [object.name, object]));
const cellKey = (x, y) => `${x},${y}`;
const cells = (object) => {
  if (object.width > 0 && object.height > 0) {
    const startX = Math.floor(object.x / tileSize);
    const startY = Math.floor(object.y / tileSize);
    const endX = Math.ceil((object.x + object.width) / tileSize) - 1;
    const endY = Math.ceil((object.y + object.height) / tileSize) - 1;
    const result = [];
    for (let y = startY; y <= endY; y += 1) for (let x = startX; x <= endX; x += 1) result.push([x, y]);
    return result;
  }
  return [[Math.floor(object.x / tileSize), Math.floor(object.y / tileSize)]];
};
const isInside = (x, y, width, height) => x >= 0 && x < width && y >= 0 && y < height;
const pngSize = (relativePath) => {
  const bytes = readFileSync(join(publicRoot, relativePath));
  if (bytes.readUInt32BE(0) !== 0x89504e47 || bytes.readUInt32BE(4) !== 0x0d0a1a0a) return undefined;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

if (!Number.isFinite(regionalBicycleSpeed) || regionalBicycleSpeed <= 0) {
  fail("timing: could not read a positive REGIONAL_BICYCLE_TUNING.maxSpeed");
}

for (const id of expansionIds) {
  const spec = specs[id];
  const gridWidth = spec.gridWidth ?? defaultGridWidth;
  const gridHeight = spec.gridHeight ?? defaultGridHeight;
  const worldWidth = gridWidth * tileSize;
  const worldHeight = gridHeight * tileSize;
  const tmjPath = `assets/maps/expansion/${id}.tmj`;
  const imagePath = spec.imagePath ?? `assets/maps/expansion/${spec.image}`;
  if (!existsSync(join(publicRoot, tmjPath))) { fail(`${id}: missing TMJ ${tmjPath}`); continue; }
  if (!existsSync(join(publicRoot, imagePath))) fail(`${id}: missing raster ${imagePath}`);
  const map = readJson(tmjPath);
  loadedMaps.set(id, map);
  if (map.orientation !== "orthogonal" || map.infinite !== false) fail(`${id}: map must be finite orthogonal`);
  if (map.width !== gridWidth || map.height !== gridHeight || map.tilewidth !== tileSize || map.tileheight !== tileSize) {
    fail(`${id}: expected ${gridWidth}x${gridHeight} tiles at ${tileSize}px`);
  }
  if (map.worldWidth !== worldWidth || map.worldHeight !== worldHeight) fail(`${id}: authored world bounds drifted`);
  const layerNames = new Set(map.layers.map((layer) => layer.name));
  for (const name of ["ground", "collision-grid", "solid-footprints", "spawns", "transitions", "interactions", "navigation", "qa-probes"]) {
    if (!layerNames.has(name)) fail(`${id}: missing required layer ${name}`);
  }
  const ground = map.layers.find((layer) => layer.name === "ground");
  const sourceWidth = spec.sourceWidth ?? worldWidth;
  const sourceHeight = spec.sourceHeight ?? worldHeight;
  if (ground?.image !== spec.image || ground.imagewidth !== sourceWidth || ground.imageheight !== sourceHeight) fail(`${id}: ground image contract drifted`);
  const image = pngSize(imagePath);
  if (!image || image.width !== sourceWidth || image.height !== sourceHeight) fail(`${id}: raster dimensions drifted`);

  const gridLayer = map.layers.find((layer) => layer.name === "collision-grid");
  const values = gridLayer?.data ?? [];
  if (gridLayer?.width !== gridWidth || gridLayer?.height !== gridHeight || values.length !== gridWidth * gridHeight) fail(`${id}: collision grid dimensions/data length drifted`);
  if (values.some((value) => !Number.isInteger(value) || value < 0)) fail(`${id}: collision cells must be non-negative integer IDs`);
  const walkable = (x, y) => isInside(x, y, gridWidth, gridHeight) && values[y * gridWidth + x] === 0;

  const ids = new Set();
  const names = new Set();
  for (const object of allObjects(map)) {
    if (!Number.isInteger(object.id) || object.id <= 0 || ids.has(object.id)) fail(`${id}: object IDs must be unique positive integers`);
    if (!object.name || names.has(object.name)) fail(`${id}: object names must be unique and non-empty`);
    ids.add(object.id); names.add(object.name);
    if (!Number.isFinite(object.x) || !Number.isFinite(object.y)) fail(`${id}: object ${object.name} has invalid coordinates`);
  }
  for (const name of spec.mustHave) if (!names.has(name)) fail(`${id}: missing stable object ${name}`);

  for (const layer of map.layers.filter((candidate) => ["spawns", "transitions", "interactions", "navigation", "qa-probes"].includes(candidate.name))) {
    for (const object of layer.objects ?? []) {
      const rectangle = object.width > 0 && object.height > 0;
      if (rectangle) {
        if ([object.x, object.y, object.width, object.height].some((value) => value % tileSize !== 0)) fail(`${id}: ${object.name} rectangle is not grid-aligned`);
      }
      for (const [x, y] of cells(object)) if (!walkable(x, y)) fail(`${id}: anchor ${object.name} is blocked at ${x},${y}`);
    }
  }

  const transitionObjects = Object.fromEntries((map.layers.find((layer) => layer.name === "transitions")?.objects ?? []).map((object) => [object.name, object]));
  for (const [name, [destinationMap, destinationSpawn]] of Object.entries(spec.transitions)) {
    const object = transitionObjects[name];
    if (!object) continue;
    if (objectProperty(object, "destinationMap") !== destinationMap || objectProperty(object, "destinationSpawn") !== destinationSpawn) {
      fail(`${id}: transition ${name} has the wrong destination contract`);
    }
  }

  const boundaryCells = new Set();
  const sideOf = (object) => {
    const sides = [];
    if (object.x === 0) sides.push("west");
    if (object.y === 0) sides.push("north");
    if (object.x + object.width === worldWidth) sides.push("east");
    if (object.y + object.height === worldHeight) sides.push("south");
    return sides;
  };
  for (const [name, side] of Object.entries(spec.boundary)) {
    const object = transitionObjects[name];
    if (!object || !sideOf(object).includes(side)) fail(`${id}: exit ${name} is not on the ${side} boundary`);
    for (const [x, y] of cells(object)) {
      boundaryCells.add(cellKey(x, y));
      if (!walkable(x, y)) fail(`${id}: boundary exit ${name} covers blocked cell ${x},${y}`);
    }
  }
  for (let x = 0; x < gridWidth; x += 1) for (const y of [0, gridHeight - 1]) if (walkable(x, y) && !boundaryCells.has(cellKey(x, y))) fail(`${id}: walkable boundary leak at ${x},${y}`);
  for (let y = 1; y < gridHeight - 1; y += 1) for (const x of [0, gridWidth - 1]) if (walkable(x, y) && !boundaryCells.has(cellKey(x, y))) fail(`${id}: walkable boundary leak at ${x},${y}`);

  const spawnObjects = map.layers.find((layer) => layer.name === "spawns")?.objects ?? [];
  const reachable = new Set(spawnObjects.map((object) => cellKey(...cells(object)[0])));
  const queue = spawnObjects.map((object) => cells(object)[0]);
  for (let index = 0; index < queue.length; index += 1) {
    const [x, y] = queue[index];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy; const key = cellKey(nx, ny);
      if (walkable(nx, ny) && !reachable.has(key)) { reachable.add(key); queue.push([nx, ny]); }
    }
  }
  for (const layer of map.layers.filter((candidate) => ["interactions", "navigation", "qa-probes"].includes(candidate.name))) {
    for (const object of layer.objects ?? []) if (!reachable.has(cellKey(...cells(object)[0]))) fail(`${id}: anchor ${object.name} is disconnected`);
  }

  for (const object of map.layers.find((layer) => layer.name === "solid-footprints")?.objects ?? []) {
    const dynamic = objectProperty(object, "dynamic") === true || objectProperty(object, "dynamic") === "true"
      || objectProperty(object, "stateful") === true || objectProperty(object, "stateful") === "true";
    if (dynamic) continue;
    for (const [x, y] of cells(object)) if (walkable(x, y)) fail(`${id}: solid footprint ${object.name} overlaps walkable cell ${x},${y}`);
  }
}

const edges = [];
for (const id of expansionIds) for (const [transitionId, [destinationMap]] of Object.entries(specs[id].transitions)) {
  edges.push({ sourceMapId: id, destinationMapId: destinationMap, transitionId });
}
const edge = (from, transitionId) => edges.find((candidate) => candidate.sourceMapId === from && candidate.transitionId === transitionId);
const reciprocal = [
  ["neighborhood", "exit_stonehenge", "stonehenge", "exit_milton"],
  ["stonehenge", "exit_reidenbaugh", "reidenbaugh", "exit_stonehenge"],
  ["neighborhood", "exit_fruitville", "fruitville_pike", "exit_milton"],
  ["fruitville_pike", "exit_bent_creek", "bent_creek", "exit_fruitville"],
];
for (const [from, exit, to, returnExit] of reciprocal) {
  if (!edge(from, exit) || !edge(to, returnExit)) fail(`topology: missing reciprocal pair ${from}.${exit}`);
  if (edge(from, exit)?.destinationMapId !== to || edge(to, returnExit)?.destinationMapId !== from) fail(`topology: reciprocal pair ${from}.${exit} is wrong`);
}
if (edges.some((candidate) => candidate.sourceMapId === "neighborhood" && candidate.destinationMapId === "reidenbaugh")) fail("topology: direct Milton-to-school bypass remains");
if (edges.some((candidate) => candidate.sourceMapId === "neighborhood" && candidate.destinationMapId === "bent_creek")) fail("topology: direct Milton-to-Bent Creek bypass remains");
if (edges.some((candidate) => candidate.destinationMapId === legacyRoadId || candidate.sourceMapId === legacyRoadId)) fail("topology: legacy road map remains in the expansion graph");

// D-010 timing gate. The route is deliberately measured through authored
// bicycle-clear beats; straight-line map-to-map distances are not accepted.
const timedRoutes = [
  {
    id: "milton_to_reidenbaugh",
    minSeconds: 12,
    maxSeconds: 18,
    segments: [
      ["neighborhood", ["bike_mount_milton", ...Array.from({ length: 12 }, (_, index) => `ryan_depart_${String(index).padStart(2, "0")}`)]],
      ["stonehenge", ["spawn_milton", ...Array.from({ length: 13 }, (_, index) => `stonehenge_route_${String(index).padStart(2, "0")}`)]],
    ],
  },
  {
    id: "milton_to_bent_creek",
    minSeconds: 6,
    maxSeconds: 10,
    segments: [
      ["fruitville_pike", ["spawn_milton", ...Array.from({ length: 9 }, (_, index) => `fruitville_route_${String(index).padStart(2, "0")}`)]],
      ["bent_creek", ["spawn_gate_exterior", "gate_attendant", "gate_entry"]],
    ],
  },
];
const routePoint = (mapId, objectId) => {
  const object = objectMap(loadedMaps.get(mapId)).get(objectId);
  if (!object) { fail(`timing: missing ${mapId}.${objectId}`); return undefined; }
  return { x: object.x + (object.width ?? 0) / 2, y: object.y + (object.height ?? 0) / 2 };
};
const routeDistance = (route) => route.segments.reduce((total, [mapId, pointIds]) => {
  let distance = total;
  let previous;
  for (const pointId of pointIds) {
    const current = routePoint(mapId, pointId);
    if (!current) continue;
    if (previous) distance += Math.hypot(current.x - previous.x, current.y - previous.y);
    previous = current;
  }
  return distance;
}, 0);
for (const route of timedRoutes) {
  const seconds = routeDistance(route) / regionalBicycleSpeed;
  if (seconds < route.minSeconds || seconds > route.maxSeconds) {
    fail(`timing: ${route.id} is ${seconds.toFixed(1)}s, outside ${route.minSeconds}-${route.maxSeconds}s`);
  }
  console.log(`Timed route ${route.id}: ${seconds.toFixed(1)}s target (${route.minSeconds}-${route.maxSeconds}s)`);
}

const bicycleRouteSweeps = [
  ["neighborhood", Array.from({ length: 12 }, (_, index) => `ryan_depart_${String(index).padStart(2, "0")}`)],
  ["stonehenge", ["spawn_milton", ...Array.from({ length: 13 }, (_, index) => `stonehenge_route_${String(index).padStart(2, "0")}`)]],
  ...["a", "b", "c"].map((route) => ["reidenbaugh", Array.from({ length: 7 }, (_, index) => `chase_${route}_${String(index).padStart(2, "0")}`)]),
  ["fruitville_pike", ["spawn_milton", ...Array.from({ length: 9 }, (_, index) => `fruitville_route_${String(index).padStart(2, "0")}`)]],
  ["bent_creek", ["spawn_gate_exterior", "gate_attendant", "gate_entry"]],
  ["bent_creek", Array.from({ length: 12 }, (_, index) => `golf_cart_path_${String(index).padStart(2, "0")}`)],
];
for (const [mapId, pointIds] of bicycleRouteSweeps) {
  const map = loadedMaps.get(mapId);
  const grid = map?.layers.find((layer) => layer.name === "collision-grid")?.data ?? [];
  const walkable = (x, y) => x >= 0 && y >= 0 && x < gridWidth && y < gridHeight && grid[y * gridWidth + x] === 0;
  for (let index = 1; index < pointIds.length; index += 1) {
    const from = routePoint(mapId, pointIds[index - 1]);
    const to = routePoint(mapId, pointIds[index]);
    if (!from || !to) continue;
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 8);
    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps;
      const cellX = Math.floor((from.x + (to.x - from.x) * ratio) / tileSize);
      const cellY = Math.floor((from.y + (to.y - from.y) * ratio) / tileSize);
      // A 3x3 interior-cell sweep represents the normal 96px bicycle
      // clearance. Out-of-bounds neighbors at a transition edge are allowed.
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const neighborX = cellX + dx;
        const neighborY = cellY + dy;
        if (isInside(neighborX, neighborY) && !walkable(neighborX, neighborY)) {
          fail(`route-clearance: ${mapId}.${pointIds[index - 1]} -> ${pointIds[index]} narrows below 96px near ${neighborX},${neighborY}`);
        }
      }
    }
  }
}

const sourceText = readFileSync(join(root, "src", "content", "maps.ts"), "utf8")
  + readFileSync(join(root, "src", "main.ts"), "utf8")
  + readFileSync(join(root, "src", "content", "ryanRideRoutes.ts"), "utf8");
if (sourceText.includes(legacyRoadId)) fail("runtime source still references the superseded road map ID");
for (const stale of ["neighborhood-wheatfield-slice.tmj", "reidenbaugh-road.tmj", "reidenbaugh.tmj", "reidenbaugh-road-master-v1.png"]) {
  if (existsSync(join(publicRoot, "assets", "maps", stale))) fail(`legacy asset remains: ${stale}`);
}

if (issues.length > 0) {
  console.error("Map expansion validation failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log("Static map/topology validators passed (5 expansion maps + Creek Woods preservation).");
}
