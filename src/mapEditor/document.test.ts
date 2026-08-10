import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allocateLayerId, allocateObjectId, assertValidMapDocument, cloneMapDocument, findObject, getCollisionMode, getProperty, getSchemaVersion, serializeMapDocument, setCollisionMode, setProperty, validateMapDocument, type MapDocument } from "./document";

function fixture(): MapDocument { return { width: 2, height: 2, tilewidth: 16, tileheight: 16, nextobjectid: 5, nextlayerid: 3, layers: [{ id: 1, name: "collision-grid", type: "tilelayer", width: 2, height: 2, data: [1, 0, 0, 0] }, { id: 2, name: "spawns", type: "objectgroup", objects: [{ id: 1, name: "start", type: "spawn", x: 24, y: 8 }] }] }; }
describe("map editor document", () => {
  it("clones without sharing unknown Tiled fields and serializes deterministically", () => { const map = fixture(); map.custom = { zebra: 1, alpha: 2 }; const copy = cloneMapDocument(map); (copy.custom as { zebra: number }).zebra = 3; expect((map.custom as { zebra: number }).zebra).toBe(1); expect(serializeMapDocument(map).indexOf('"alpha"')).toBeLessThan(serializeMapDocument(map).indexOf('"zebra"')); });
  it("reads/writes Tiled property arrays and collision metadata", () => { const map = fixture(); setProperty(map, "mapId", "test", "string"); setCollisionMode(map, "grid-16"); expect(getProperty(map, "mapId")).toBe("test"); expect(getCollisionMode(map)).toBe("grid-16"); expect(getSchemaVersion(map)).toBe(1); });
  it("finds objects and allocates IDs without collisions", () => { const map = fixture(); expect(findObject(map, "start")?.id).toBe(1); expect(allocateObjectId(map)).toBe(5); expect(allocateLayerId(map)).toBe(3); });
  it("reports malformed grids, duplicate ids/names, bounds, blocked anchors, and transitions", () => { const map = fixture(); map.layers[0]!.data = [1]; map.layers[1]!.objects!.push({ id: 1, name: "start", type: "transition", x: 0, y: 0 }); const codes = validateMapDocument(map).map((issue) => issue.code); expect(codes).toEqual(expect.arrayContaining(["collision-grid-data", "duplicate-object-id", "duplicate-object-name", "blocked-anchor", "missing-transition-property"])); });
  it("requires 16px tiles in grid-16 mode", () => { const map = fixture(); map.tilewidth = 32; expect(validateMapDocument(map)).toContainEqual(expect.objectContaining({ code: "grid-cell-size" })); });
  it("enforces the rectangle collision mode", () => { const map = fixture(); setCollisionMode(map, "rectangles"); expect(() => assertValidMapDocument(map)).toThrow(/missing-collision-rects/); map.layers.push({ id: 3, name: "collision-rects", type: "objectgroup", objects: [] }); expect(validateMapDocument(map)).not.toContainEqual(expect.objectContaining({ code: "missing-collision-rects" })); });
  it("accepts every checked-in map as an editor save source", () => {
    const paths = [
      "assets/maps/expansion/neighborhood.tmj", "assets/maps/expansion/stonehenge.tmj",
      "assets/maps/expansion/reidenbaugh.tmj", "assets/maps/expansion/fruitville_pike.tmj",
      "assets/maps/expansion/bent_creek.tmj", "assets/maps/creek-woods.tmj",
    ];
    for (const path of paths) {
      const document = JSON.parse(readFileSync(resolve(process.cwd(), "public", path), "utf8")) as MapDocument;
      expect(validateMapDocument(document), path).toEqual([]);
    }
  });
});
