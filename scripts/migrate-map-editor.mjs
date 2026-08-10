#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const regionalMaps = ["neighborhood", "stonehenge", "reidenbaugh", "fruitville_pike", "bent_creek"];
const tileSize = 16;

// These are the exits authored in the current illustrated-map layout. The
// Creek woods gate is an interior transition; the other regional transitions
// own the finite-map boundary cells they touch.
const boundaryExits = {
  neighborhood: { exit_stonehenge: "east", exit_fruitville: "west" },
  stonehenge: { exit_milton: "west", exit_reidenbaugh: "north" },
  reidenbaugh: { exit_stonehenge: "west" },
  fruitville_pike: { exit_milton: "south", exit_bent_creek: "north" },
  bent_creek: { exit_fruitville: "west" },
};

function property(name, type, value) { return { name, type, value }; }

function setProperty(properties, name, type, value) {
  const next = Array.isArray(properties) ? properties : [];
  const existing = next.find((candidate) => candidate.name === name);
  if (existing) Object.assign(existing, { type, value });
  else next.push(property(name, type, value));
  return next;
}

function configureArtwork(layer, worldWidth, worldHeight) {
  const imageWidth = layer.imagewidth ?? worldWidth;
  const imageHeight = layer.imageheight ?? worldHeight;
  layer.properties = setProperty(layer.properties, "role", "string", layer.name === "ground" ? "master" : "foreground");
  layer.properties = setProperty(layer.properties, "depth", "int", layer.name === "ground" ? 10 : 55);
  layer.properties = setProperty(layer.properties, "displayX", "float", layer.x ?? layer.offsetx ?? 0);
  layer.properties = setProperty(layer.properties, "displayY", "float", layer.y ?? layer.offsety ?? 0);
  layer.properties = setProperty(layer.properties, "displayWidth", "float", worldWidth);
  layer.properties = setProperty(layer.properties, "displayHeight", "float", worldHeight);
  layer.properties = setProperty(layer.properties, "cropX", "float", 0);
  layer.properties = setProperty(layer.properties, "cropY", "float", 0);
  layer.properties = setProperty(layer.properties, "cropWidth", "float", imageWidth);
  layer.properties = setProperty(layer.properties, "cropHeight", "float", imageHeight);
}

function getProperty(object, name) {
  return Array.isArray(object.properties)
    ? object.properties.find((candidate) => candidate.name === name)?.value
    : object.properties?.[name];
}

function objectCells(object, width, height) {
  const startX = Math.max(0, Math.floor(object.x / tileSize));
  const startY = Math.max(0, Math.floor(object.y / tileSize));
  const endX = Math.min(width - 1, Math.ceil((object.x + object.width) / tileSize) - 1);
  const endY = Math.min(height - 1, Math.ceil((object.y + object.height) / tileSize) - 1);
  const cells = [];
  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) cells.push([x, y]);
  }
  return cells;
}

function alignTransition(object, side, worldWidth, worldHeight) {
  object.x = Math.floor(object.x / tileSize) * tileSize;
  object.y = Math.floor(object.y / tileSize) * tileSize;
  object.width = Math.ceil(object.width / tileSize) * tileSize;
  object.height = Math.ceil(object.height / tileSize) * tileSize;
  if (side === "west") object.x = 0;
  if (side === "east") object.x = worldWidth - object.width;
  if (side === "north") object.y = 0;
  if (side === "south") object.y = worldHeight - object.height;
}

function repairCollisionContract(document, id) {
  const collision = document.layers.find((layer) => layer.name === "collision-grid");
  const transitionLayer = document.layers.find((layer) => layer.name === "transitions");
  const footprintLayer = document.layers.find((layer) => layer.name === "solid-footprints");
  if (!collision || !Array.isArray(collision.data) || !transitionLayer || !footprintLayer) {
    throw new Error(`${id}: cannot repair collision contract without collision, transition, and footprint layers`);
  }

  const worldWidth = document.width * tileSize;
  const worldHeight = document.height * tileSize;
  const index = (x, y) => y * document.width + x;
  const setCell = (x, y, value) => {
    if (x >= 0 && x < document.width && y >= 0 && y < document.height) collision.data[index(x, y)] = value;
  };

  for (const object of transitionLayer.objects ?? []) alignTransition(object, boundaryExits[id]?.[object.name], worldWidth, worldHeight);
  for (const object of footprintLayer.objects ?? []) {
    const dynamic = getProperty(object, "dynamic") === true || getProperty(object, "dynamic") === "true"
      || getProperty(object, "stateful") === true || getProperty(object, "stateful") === "true";
    if (dynamic) continue;
    for (const [x, y] of objectCells(object, document.width, document.height)) setCell(x, y, 1);
  }

  const explicitBoundaryCells = new Set();
  for (const object of transitionLayer.objects ?? []) {
    if (!boundaryExits[id]?.[object.name]) continue;
    for (const [x, y] of objectCells(object, document.width, document.height)) {
      explicitBoundaryCells.add(`${x},${y}`);
      setCell(x, y, 0);
    }
  }
  for (let x = 0; x < document.width; x += 1) {
    for (const y of [0, document.height - 1]) {
      if (!explicitBoundaryCells.has(`${x},${y}`)) setCell(x, y, 1);
    }
  }
  for (let y = 1; y < document.height - 1; y += 1) {
    for (const x of [0, document.width - 1]) {
      if (!explicitBoundaryCells.has(`${x},${y}`)) setCell(x, y, 1);
    }
  }
}

function migrateRegional(id) {
  const path = resolve(root, "public", "assets", "maps", "expansion", `${id}.tmj`);
  const document = JSON.parse(readFileSync(path, "utf8"));
  if (document.tilewidth === 32 && document.tileheight === 32) {
    const oldWidth = document.width;
    const oldHeight = document.height;
    const collision = document.layers.find((layer) => layer.name === "collision-grid");
    if (!collision || collision.data?.length !== oldWidth * oldHeight) {
      throw new Error(`${id}: collision-grid is missing or malformed`);
    }
    const expanded = new Array(oldWidth * 2 * oldHeight * 2);
    for (let y = 0; y < oldHeight; y += 1) {
      for (let x = 0; x < oldWidth; x += 1) {
        const value = collision.data[y * oldWidth + x];
        const outputWidth = oldWidth * 2;
        const outputX = x * 2;
        const outputY = y * 2;
        expanded[outputY * outputWidth + outputX] = value;
        expanded[outputY * outputWidth + outputX + 1] = value;
        expanded[(outputY + 1) * outputWidth + outputX] = value;
        expanded[(outputY + 1) * outputWidth + outputX + 1] = value;
      }
    }
    document.width = oldWidth * 2;
    document.height = oldHeight * 2;
    document.tilewidth = 16;
    document.tileheight = 16;
    collision.width = document.width;
    collision.height = document.height;
    collision.data = expanded;
    for (const tileset of document.tilesets ?? []) {
      tileset.tilewidth = 16;
      tileset.tileheight = 16;
      tileset.columns = document.width;
      tileset.tilecount = document.width * document.height;
    }
  }
  document.worldWidth = document.width * document.tilewidth;
  document.worldHeight = document.height * document.tileheight;
  document.properties = setProperty(document.properties, "schemaVersion", "int", 1);
  document.properties = setProperty(document.properties, "collisionMode", "string", "grid-16");
  document.properties = setProperty(document.properties, "tileContract", "string", "16px-grid");
  repairCollisionContract(document, id);
  for (const layer of document.layers.filter((candidate) => candidate.type === "imagelayer")) {
    configureArtwork(layer, document.worldWidth, document.worldHeight);
  }
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
}

function migrateCreek() {
  const path = resolve(root, "public", "assets", "maps", "creek-woods.tmj");
  const document = JSON.parse(readFileSync(path, "utf8"));
  document.properties = setProperty(document.properties, "schemaVersion", "int", 1);
  document.properties = setProperty(document.properties, "collisionMode", "string", "rectangles");
  const nextLayerId = () => Math.max(0, ...document.layers.map((layer) => layer.id ?? 0)) + 1;
  const ensureObjectLayer = (name) => {
    if (document.layers.some((layer) => layer.name === name)) return;
    document.layers.push({ id: nextLayerId(), name, type: "objectgroup", draworder: "topdown", opacity: 1, visible: true, x: 0, y: 0, objects: [] });
  };
  const returnObject = document.layers
    .flatMap((layer) => layer.objects ?? [])
    .find((object) => object.name === "return_neighborhood");
  if (returnObject) {
    returnObject.properties = setProperty(returnObject.properties, "destinationMap", "string", "neighborhood");
    returnObject.properties = setProperty(returnObject.properties, "destinationSpawn", "string", "spawn_woods");
  }
  const master = document.layers.find((candidate) => candidate.type === "imagelayer" && candidate.name === "creek-illustrated-master");
  if (master) {
    configureArtwork(master, document.width * document.tilewidth, document.height * document.tileheight);
    master.properties = setProperty(master.properties, "role", "string", "master");
    master.properties = setProperty(master.properties, "depth", "int", 10);
  }
  if (!document.layers.some((candidate) => candidate.type === "imagelayer" && candidate.name === "creek-foreground-canopy")) {
    const canopy = {
      id: nextLayerId(), name: "creek-foreground-canopy", type: "imagelayer", image: "creek-foreground-canopy-v1.png",
      imagewidth: 1672, imageheight: 941, opacity: 1, visible: true, x: 0, y: 0,
    };
    configureArtwork(canopy, document.width * document.tilewidth, document.height * document.tileheight);
    document.layers.push(canopy);
  }
  for (const name of ["spawns", "transitions", "interactions", "navigation", "solid-footprints"]) ensureObjectLayer(name);
  document.nextlayerid = nextLayerId();
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
}

for (const id of regionalMaps) migrateRegional(id);
migrateCreek();
console.log("Map editor schema applied (five 16px regional grids + Creek rectangles).");
