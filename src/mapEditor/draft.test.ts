import { describe, expect, it } from "vitest";
import { MapEditorDraft, type TiledMapDocument } from "./draft";

function map(): TiledMapDocument {
  return {
    width: 4, height: 3, tilewidth: 16, tileheight: 16, nextobjectid: 9, customTopLevel: { kept: true },
    layers: [
      { id: 1, name: "collision-grid", type: "tilelayer", width: 4, height: 3, data: [0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0], customLayer: "kept" },
      { id: 2, name: "spawns", type: "objectgroup", objects: [{ id: 7, name: "home", type: "spawn", x: 3, y: 5, properties: [{ name: "note", value: "keep" }] }] },
    ],
  };
}
const collision = (draft: MapEditorDraft) => draft.serialize().layers[0]?.data as number[];

describe("MapEditorDraft", () => {
  it("deep clones its source and exposes immutable snapshots", () => {
    const source = map(); const draft = new MapEditorDraft(source, "v1");
    source.layers[0]?.data?.fill(1);
    expect(collision(draft)).toEqual([0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0]);
    const output = draft.serialize(); output.layers[0]?.data?.fill(1);
    expect(collision(draft)[0]).toBe(0);
    expect(draft.baseRevision).toBe("v1"); expect(draft.dirty).toBe(false);
  });

  it("paints a bounded radius brush and can undo and redo it", () => {
    const draft = new MapEditorDraft(map());
    draft.paintCollision("collision-grid", { x: 16, y: 16 }, true, { radius: 1 });
    expect(collision(draft)).toEqual([1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0]);
    expect(draft.dirty).toBe(true); expect(draft.undo()).toBe(true);
    expect(collision(draft)).toEqual([0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0]);
    expect(draft.redo()).toBe(true); expect(collision(draft)[0]).toBe(1);
  });

  it("fills rectangles inclusively and flood fills only connected matching cells", () => {
    const draft = new MapEditorDraft(map());
    draft.fillCollisionRect("collision-grid", { x: 16, y: 0 }, { x: 32, y: 16 }, true);
    expect(collision(draft)).toEqual([0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0]);
    draft.floodFillCollision("collision-grid", { x: 0, y: 0 }, true);
    expect(collision(draft)).toEqual([1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 0]);
  });

  it("adds, moves, updates, deletes, selects, snaps and restores objects", () => {
    const draft = new MapEditorDraft(map());
    const id = draft.addObject("spawns", { name: "outside", type: "spawn", x: 9, y: 23, custom: { preserved: true } }, 8);
    expect(id).toBe(9); expect(draft.selectedObjectId).toBe(9);
    draft.moveObject(id, { x: 19, y: 31 }, 16);
    draft.updateObject(id, { width: 12, properties: [{ name: "tag", value: "x" }] });
    let object = draft.serialize().layers[1]?.objects?.find((item) => item.id === id);
    expect(object).toMatchObject({ x: 16, y: 32, width: 12, custom: { preserved: true } });
    draft.deleteObject(id); expect(draft.selectedObjectId).toBeNull();
    expect(draft.undo()).toBe(true);
    object = draft.serialize().layers[1]?.objects?.find((item) => item.id === id);
    expect(object?.name).toBe("outside");
    draft.undo(); draft.undo(); draft.undo();
    expect(draft.serialize().layers[1]?.objects).toHaveLength(1);
  });

  it("does not consume history for no-op changes and clears it after save", () => {
    const draft = new MapEditorDraft(map(), "old");
    draft.paintCollision("collision-grid", { x: 16, y: 16 }, true);
    expect(draft.canUndo).toBe(false);
    draft.moveObject(7, { x: 8, y: 8 }); expect(draft.canUndo).toBe(true);
    draft.markSaved("new");
    expect(draft.dirty).toBe(false); expect(draft.baseRevision).toBe("new"); expect(draft.canUndo).toBe(false);
  });

  it("rejects invalid layers and IDs without changing the draft", () => {
    const draft = new MapEditorDraft(map());
    expect(() => draft.paintCollision("missing", { x: 0, y: 0 }, true)).toThrow("Missing tile collision");
    expect(() => draft.moveObject(99, { x: 0, y: 0 })).toThrow("Unknown object 99");
    expect(() => draft.selectObject(99)).toThrow("Unknown object 99");
    expect(draft.dirty).toBe(false);
  });

  it("coalesces a collision stroke into exactly one undo entry", () => {
    const draft = new MapEditorDraft(map());
    draft.beginGesture("paint stroke");
    draft.paintCollision("collision-grid", { x: 0, y: 0 }, true);
    draft.paintCollision("collision-grid", { x: 16, y: 0 }, true);
    draft.paintCollision("collision-grid", { x: 32, y: 0 }, true);

    expect(draft.canUndo).toBe(false);
    expect(draft.commitGesture()).toBe(true);
    expect(draft.undo()).toBe(true);
    expect(collision(draft)).toEqual(map().layers[0]?.data);
    expect(draft.undo()).toBe(false);
  });

  it("coalesces object dragging and preserves snapping at the final position", () => {
    const draft = new MapEditorDraft(map());
    draft.selectObject(7);
    draft.beginGesture("drag object");
    draft.moveObject(7, { x: 12, y: 13 }, 8);
    draft.moveObject(7, { x: 39, y: 34 }, 16);
    expect(draft.commitGesture()).toBe(true);
    expect(draft.serialize().layers[1]?.objects?.[0]).toMatchObject({ x: 32, y: 32 });

    expect(draft.undo()).toBe(true);
    expect(draft.serialize().layers[1]?.objects?.[0]).toMatchObject({ x: 3, y: 5 });
    expect(draft.selectedObjectId).toBe(7);
    expect(draft.undo()).toBe(false);
  });

  it("adds no history for a no-op gesture and restores canceled gestures", () => {
    const draft = new MapEditorDraft(map());
    draft.beginGesture("no-op stroke");
    draft.paintCollision("collision-grid", { x: 16, y: 16 }, true);
    expect(draft.commitGesture()).toBe(false);
    expect(draft.canUndo).toBe(false);

    draft.beginGesture("canceled drag");
    draft.moveObject(7, { x: 48, y: 48 });
    expect(draft.cancelGesture()).toBe(true);
    expect(draft.serialize().layers[1]?.objects?.[0]).toMatchObject({ x: 3, y: 5 });
    expect(draft.canUndo).toBe(false);
    expect(draft.dirty).toBe(false);
  });

  it("finishes an active gesture before undoing", () => {
    const draft = new MapEditorDraft(map());
    draft.beginGesture("stroke");
    draft.paintCollision("collision-grid", { x: 0, y: 0 }, true);
    expect(draft.undo()).toBe(true);
    expect(draft.gestureActive).toBe(false);
    expect(collision(draft)).toEqual(map().layers[0]?.data);
    expect(draft.redo()).toBe(true);
    expect(collision(draft)[0]).toBe(1);
  });
});
