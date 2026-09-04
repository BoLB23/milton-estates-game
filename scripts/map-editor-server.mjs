import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const ROUTE_PREFIX = "/__map-editor/maps/";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** The editor may only ever write these checked-in authoring files. */
export const DEFAULT_MAP_FILES = Object.freeze({
  neighborhood: "public/assets/maps/expansion/neighborhood.tmj",
  creek: "public/assets/maps/creek-woods.tmj",
  stonehenge: "public/assets/maps/expansion/stonehenge.tmj",
  reidenbaugh: "public/assets/maps/expansion/reidenbaugh.tmj",
  fruitville_pike: "public/assets/maps/expansion/fruitville_pike.tmj",
  bent_creek: "public/assets/maps/expansion/bent_creek.tmj",
});

function revisionFor(text) {
  return createHash("sha256").update(text).digest("hex");
}

function send(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(body)}\n`);
}

function requestHeaders(request) { return request.headers ?? {}; }

function isLoopbackRequest(request) {
  const address = request.socket?.remoteAddress?.replace(/^::ffff:/, "");
  const rawHost = String(requestHeaders(request).host ?? "");
  const host = rawHost.startsWith("[") ? rawHost.slice(1, rawHost.indexOf("]")) : rawHost.split(":", 1)[0];
  return Boolean(address) && LOOPBACK_HOSTS.has(address) && LOOPBACK_HOSTS.has(host);
}

function sameOriginRequest(request, { requireOrigin = false } = {}) {
  const headers = requestHeaders(request);
  if (headers["sec-fetch-site"] !== "same-origin") return false;
  const origin = headers.origin;
  if (requireOrigin && !origin) return false;
  if (!origin) return true;
  try { return new URL(origin).host === String(headers.host ?? ""); } catch { return false; }
}

function mapIdFromRequestUrl(requestUrl) {
  if (!requestUrl) return undefined;
  const pathname = new URL(requestUrl, "http://map-editor.local").pathname;
  if (!pathname.startsWith(ROUTE_PREFIX)) return undefined;
  const encoded = pathname.slice(ROUTE_PREFIX.length);
  if (!encoded || encoded.includes("/")) return undefined;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

function propertyValue(document, name) {
  if (!Array.isArray(document.properties)) return undefined;
  const property = document.properties.find((candidate) => candidate && candidate.name === name);
  return property && typeof property.value === "string" ? property.value : undefined;
}

function propertyEntry(document, name) {
  if (!Array.isArray(document.properties)) return undefined;
  return document.properties.find((candidate) => candidate && candidate.name === name);
}

/**
 * This intentionally checks only transport-level invariants.  The shared map
 * validator can be injected by the editor integration without making Vite's
 * config depend on browser TypeScript modules.
 */
export function validateMapDocument(document, expectedMapId) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return "document must be a JSON object";
  }
  if (document.type !== "map" || !Array.isArray(document.layers)) {
    return "document must be a Tiled map with a layers array";
  }
  const declaredMapId = typeof document.mapId === "string" ? document.mapId : propertyValue(document, "mapId");
  if (declaredMapId !== undefined && declaredMapId !== expectedMapId) {
    return `document mapId ${JSON.stringify(declaredMapId)} does not match ${JSON.stringify(expectedMapId)}`;
  }
  if (!Number.isInteger(document.width) || document.width <= 0 || !Number.isInteger(document.height) || document.height <= 0
    || !Number.isFinite(document.tilewidth) || document.tilewidth <= 0 || !Number.isFinite(document.tileheight) || document.tileheight <= 0) {
    return "document dimensions and tile dimensions must be positive";
  }
  const collisionModeProperty = propertyEntry(document, "collisionMode");
  if (collisionModeProperty && collisionModeProperty.value !== "grid-16" && collisionModeProperty.value !== "rectangles") {
    return "collisionMode must be exactly \"grid-16\" or \"rectangles\"";
  }
  const collisionMode = collisionModeProperty?.value
    ?? (document.layers.some((layer) => layer?.name === "collision-rects") ? "rectangles" : "grid-16");
  if (collisionMode === "grid-16") {
    if (document.tilewidth !== 16 || document.tileheight !== 16) return "grid-16 maps must use 16px tiles";
    const collision = document.layers.find((layer) => layer?.name === "collision-grid");
    if (!collision || collision.type !== "tilelayer" || collision.width !== document.width || collision.height !== document.height
      || !Array.isArray(collision.data) || collision.data.length !== document.width * document.height
      || collision.data.some((cell) => !Number.isInteger(cell) || cell < 0)) {
      return "collision-grid must contain one non-negative integer per 16px map cell";
    }
  } else if (collisionMode === "rectangles" && !document.layers.some((layer) => layer?.name === "collision-rects" && layer.type === "objectgroup")) {
    return "rectangle maps require a collision-rects object layer";
  }
  const layerIds = new Set();
  const objectIds = new Set();
  const objectNames = new Set();
  const worldWidth = document.width * document.tilewidth;
  const worldHeight = document.height * document.tileheight;
  for (const layer of document.layers) {
    if (!layer || !Number.isInteger(layer.id) || layerIds.has(layer.id)) return "layer IDs must be unique integers";
    layerIds.add(layer.id);
    for (const object of layer.objects ?? []) {
      if (!Number.isInteger(object.id) || objectIds.has(object.id)) return "object IDs must be unique integers";
      objectIds.add(object.id);
      if (object.name) {
        if (objectNames.has(object.name)) return `duplicate object name ${JSON.stringify(object.name)}`;
        objectNames.add(object.name);
      }
      if (!Number.isFinite(object.x) || !Number.isFinite(object.y) || object.x < 0 || object.y < 0
        || object.x + (object.width ?? 0) > worldWidth || object.y + (object.height ?? 0) > worldHeight) {
        return `object ${JSON.stringify(object.name ?? object.id)} lies outside map bounds`;
      }
      const kind = object.type || object.class || (layer.name === "transitions" ? "transition" : "");
      if (kind === "transition" && (!propertyValue(object, "destinationMap") || !propertyValue(object, "destinationSpawn"))) {
        return `transition ${JSON.stringify(object.name ?? object.id)} requires destinationMap and destinationSpawn`;
      }
    }
  }
  return undefined;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("request body exceeds 5 MiB");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("request body must be valid JSON");
    error.statusCode = 400;
    throw error;
  }
}

export function createMapEditorMiddleware({ root = process.cwd(), mapFiles = DEFAULT_MAP_FILES, validate = () => undefined, enabled = false } = {}) {
  const token = randomBytes(32).toString("base64url");
  const resolvedFiles = new Map(Object.entries(mapFiles).map(([mapId, relativePath]) => [mapId, path.resolve(root, relativePath)]));
  const saveQueues = new Map();

  async function withMapSaveLock(filename, operation) {
    const predecessor = saveQueues.get(filename) ?? Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const tail = predecessor.then(() => gate);
    saveQueues.set(filename, tail);
    await predecessor;
    try {
      return await operation();
    } finally {
      release();
      if (saveQueues.get(filename) === tail) saveQueues.delete(filename);
    }
  }

  return async function mapEditorMiddleware(request, response, next) {
    if (!enabled) return next();
    const mapId = mapIdFromRequestUrl(request.url);
    if (!mapId) return next();
    if (!isLoopbackRequest(request) || !sameOriginRequest(request, { requireOrigin: request.method === "POST" })) return send(response, 403, { error: "Map editor is limited to same-origin loopback requests" });
    const filename = resolvedFiles.get(mapId);
    if (!filename) return send(response, 404, { error: "Unknown map ID" });

    try {
      if (request.method === "GET") {
        const source = await readFile(filename, "utf8");
        response.setHeader("X-Map-Editor-Token", token);
        return send(response, 200, { revision: revisionFor(source), document: JSON.parse(source) });
      }
      if (request.method !== "POST") {
        response.setHeader("Allow", "GET, POST");
        return send(response, 405, { error: "Method not allowed" });
      }

      if (requestHeaders(request)["x-map-editor-token"] !== token) return send(response, 403, { error: "Invalid map editor token" });
      if (String(requestHeaders(request)["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase() !== "application/json") {
        return send(response, 415, { error: "Content-Type must be application/json" });
      }

      const payload = await readJsonBody(request);
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.baseRevision !== "string" || !("document" in payload)) {
        return send(response, 400, { error: "Body must contain baseRevision and document" });
      }
      const validationError = validateMapDocument(payload.document, mapId) ?? validate(payload.document, mapId);
      if (validationError) return send(response, 422, { error: validationError });

      const result = await withMapSaveLock(filename, async () => {
        const current = await readFile(filename, "utf8");
        const currentRevision = revisionFor(current);
        if (payload.baseRevision !== currentRevision) {
          return { status: 409, body: { error: "Map changed on disk", revision: currentRevision, document: JSON.parse(current) } };
        }

        const serialized = `${JSON.stringify(payload.document, null, 2)}\n`;
        const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${randomBytes(8).toString("hex")}.tmp`);
        try {
          await mkdir(path.dirname(filename), { recursive: true });
          await writeFile(temporary, serialized, "utf8");
          await rename(temporary, filename);
        } catch (error) {
          await unlink(temporary).catch(() => undefined);
          throw error;
        }
        return { status: 200, body: { revision: revisionFor(serialized), document: payload.document } };
      });
      return send(response, result.status, result.body);
    } catch (error) {
      const status = typeof error?.statusCode === "number" ? error.statusCode : 500;
      return send(response, status, { error: error instanceof Error ? error.message : "Unable to process map editor request" });
    }
  };
}

/** A Vite dev-server-only plugin. configureServer is never invoked by preview/build. */
export function mapEditorServerPlugin(options) {
  return {
    name: "milton-estates-map-editor-server",
    configureServer(server) {
      if (options?.enabled !== true && process.env.MILTON_MAP_EDITOR !== "1") return;
      server.middlewares.use(createMapEditorMiddleware({ root: server.config.root, ...options, enabled: true }));
    },
  };
}
