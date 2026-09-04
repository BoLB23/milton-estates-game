import { Readable } from "node:stream";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error Development middleware is intentionally a Node ESM module.
import { createMapEditorMiddleware } from "../../scripts/map-editor-server.mjs";

describe("map editor development save API", () => {
  let root = "";
  let invoke: (method: string, url: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: Record<string, unknown>; headers: Record<string, string> }>;
  const relativeMap = "maps/test.tmj";

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "milton-map-editor-"));
    await mkdir(join(root, "maps"));
    await writeFile(join(root, relativeMap), `${JSON.stringify(mapDocument("test"), null, 2)}\n`);
    const middleware = createMapEditorMiddleware({
      root,
      mapFiles: { test: relativeMap },
      enabled: true,
      validate: (document: { reject?: boolean }) => document.reject ? "shared validation rejected document" : undefined,
    });
    invoke = (method, url, body, extraHeaders = {}) => new Promise((resolve, reject) => {
      const source = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
      const request = Readable.from(source) as Readable & { method: string; url: string; headers: Record<string, string>; socket: { remoteAddress: string } };
      request.method = method;
      request.url = url;
      request.headers = { host: "127.0.0.1:5173", origin: "http://127.0.0.1:5173", "sec-fetch-site": "same-origin", ...(body === undefined ? {} : { "content-type": "application/json" }), ...extraHeaders };
      request.socket = { remoteAddress: "127.0.0.1" };
      const response = {
        statusCode: 200,
        headers: {} as Record<string, string>,
        setHeader: (name: string, value: string) => { response.headers[name.toLowerCase()] = value; },
        end: (payload = "") => resolve({ status: response.statusCode, body: payload ? JSON.parse(String(payload)) as Record<string, unknown> : {}, headers: response.headers }),
      };
      Promise.resolve(middleware(request, response, () => reject(new Error("Unexpected middleware fallthrough")))).catch(reject);
    });
  });

  afterAll(async () => { await rm(root, { recursive: true, force: true }); });

  it("loads a canonical document and atomically saves the matching revision", async () => {
    const loaded = await invoke("GET", "/__map-editor/maps/test") as { status: number; body: { revision: string; document: ReturnType<typeof mapDocument> }; headers: Record<string, string> };
    expect(loaded.body.document.properties[0]?.value).toBe("test");
    loaded.body.document.custom = "saved";
    const response = await invoke("POST", "/__map-editor/maps/test", { baseRevision: loaded.body.revision, document: loaded.body.document }, { "x-map-editor-token": loaded.headers["x-map-editor-token"]! });
    expect(response.status).toBe(200);
    expect(JSON.parse(await readFile(join(root, relativeMap), "utf8"))).toMatchObject({ custom: "saved" });
  });

  it("rejects stale revisions, mismatched IDs, and injected validation errors without overwriting", async () => {
    const before = await readFile(join(root, relativeMap), "utf8");
    const initial = await invoke("GET", "/__map-editor/maps/test");
    const token = initial.headers["x-map-editor-token"]!;
    expect((await invoke("POST", "/__map-editor/maps/test", { baseRevision: "stale", document: mapDocument("test") }, { "x-map-editor-token": token })).status).toBe(409);
    expect((await invoke("POST", "/__map-editor/maps/test", { baseRevision: "irrelevant", document: mapDocument("other") }, { "x-map-editor-token": token })).status).toBe(422);
    const loaded = await invoke("GET", "/__map-editor/maps/test") as { status: number; body: { revision: string }; headers: Record<string, string> };
    expect((await invoke("POST", "/__map-editor/maps/test", { baseRevision: loaded.body.revision, document: { ...mapDocument("test"), reject: true } }, { "x-map-editor-token": loaded.headers["x-map-editor-token"]! })).status).toBe(422);
    expect(await readFile(join(root, relativeMap), "utf8")).toBe(before);
  });

  it("rejects unsupported collision modes before attempting a save", async () => {
    const loaded = await invoke("GET", "/__map-editor/maps/test") as { status: number; body: { revision: string }; headers: Record<string, string> };
    const document = mapDocument("test");
    document.properties.push({ name: "collisionMode", type: "string", value: "polygons" });
    const response = await invoke("POST", "/__map-editor/maps/test", { baseRevision: loaded.body.revision, document }, { "x-map-editor-token": loaded.headers["x-map-editor-token"]! });
    expect(response.status).toBe(422);
    expect(response.body.error).toMatch(/collisionMode/);
  });

  it("serializes concurrent saves so the same base revision cannot overwrite twice", async () => {
    const loaded = await invoke("GET", "/__map-editor/maps/test") as { status: number; body: { revision: string }; headers: Record<string, string> };
    const first = { ...mapDocument("test"), custom: "concurrent-first" };
    const second = { ...mapDocument("test"), custom: "concurrent-second" };
    const responses = await Promise.all([
      invoke("POST", "/__map-editor/maps/test", { baseRevision: loaded.body.revision, document: first }, { "x-map-editor-token": loaded.headers["x-map-editor-token"]! }),
      invoke("POST", "/__map-editor/maps/test", { baseRevision: loaded.body.revision, document: second }, { "x-map-editor-token": loaded.headers["x-map-editor-token"]! }),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const saved = JSON.parse(await readFile(join(root, relativeMap), "utf8")) as { custom: string };
    expect(["concurrent-first", "concurrent-second"]).toContain(saved.custom);
  });

  it("requires loopback same-origin metadata, JSON, and the per-process handshake token", async () => {
    expect((await invoke("GET", "/__map-editor/maps/test", undefined, { host: "evil.example" })).status).toBe(403);
    const loaded = await invoke("GET", "/__map-editor/maps/test");
    expect((await invoke("POST", "/__map-editor/maps/test", { baseRevision: "stale", document: mapDocument("test") })).status).toBe(403);
    expect((await invoke("POST", "/__map-editor/maps/test", { baseRevision: loaded.body.revision, document: mapDocument("test") }, { "x-map-editor-token": loaded.headers["x-map-editor-token"]!, "content-type": "text/plain" })).status).toBe(415);
    expect((await invoke("POST", "/__map-editor/maps/test", { baseRevision: loaded.body.revision, document: mapDocument("test") }, { "x-map-editor-token": loaded.headers["x-map-editor-token"]!, "sec-fetch-site": "cross-site" })).status).toBe(403);
  });
});

function mapDocument(mapId: string) {
  return {
    type: "map", width: 1, height: 1, tilewidth: 16, tileheight: 16,
    properties: [{ name: "mapId", type: "string", value: mapId }],
    layers: [{ id: 1, name: "collision-grid", type: "tilelayer", width: 1, height: 1, data: [0] }],
    custom: "initial",
  };
}
