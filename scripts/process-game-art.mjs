#!/usr/bin/env node
/**
 * Deterministically crops production runtime art from the supplied generated
 * source sheets. `sips` is included with macOS, so this does not introduce a
 * native npm dependency. Coordinates are [x, y, width, height].
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const art = join(root, "public/assets/art");
const out = join(root, "public/assets");
const crops = [
  // four-character sheet: 3 animation poses × 4 directions, 128×256 cells
  ...["billy", "andrew", "jeremy", "ryan"].map((id, index) => ({ id: `characters/npcs/${id}.png`, source: "four_character_rpg_sprite_sheet.png", rect: [index * 384, 0, 384, 1024] })),
  // The source twin bands are 3×4, but their 512×1536 dimensions do not match
  // the shared 128×256 NPC frame contract used at runtime.
  { id: "characters/npcs/mickey.png", source: "twin_character_rpg_sprite_sheet.png", rect: [0, 0, 512, 1536], outputSize: [384, 1024] },
  { id: "characters/npcs/schwartz.png", source: "twin_character_rpg_sprite_sheet.png", rect: [512, 0, 512, 1536], outputSize: [384, 1024] },
  // Player base is a 3-pose × 4-direction layer used by PlayerAvatar.
  { id: "characters/player/body.png", source: "chibi_rpg_character_sprite_atlas.png", rect: [0, 0, 384, 420] },
  { id: "characters/player/shirt.png", source: "chibi_rpg_character_sprite_atlas.png", rect: [0, 420, 384, 420] },
  { id: "characters/player/pants.png", source: "chibi_rpg_character_sprite_atlas.png", rect: [320, 420, 384, 420] },
  { id: "characters/player/shoes.png", source: "chibi_rpg_character_sprite_atlas.png", rect: [640, 420, 384, 420] },
  { id: "characters/player/hair-classic.png", source: "chibi_rpg_character_sprite_atlas.png", rect: [0, 660, 384, 420] },
  { id: "characters/player/hair-shaggy.png", source: "chibi_rpg_character_sprite_atlas.png", rect: [320, 660, 384, 420] },
  { id: "characters/player/hair-bowl.png", source: "chibi_rpg_character_sprite_atlas.png", rect: [640, 660, 384, 420] },
  { id: "characters/player/hair-long.png", source: "chibi_rpg_character_sprite_atlas.png", rect: [80, 1080, 384, 420] },
  { id: "characters/player/hair-curly.png", source: "chibi_rpg_character_sprite_atlas.png", rect: [600, 1080, 384, 420] },
  { id: "vehicles/mickey-car-down.png", source: "gray_sedan_sprite_sheet_collection.png", rect: [0, 0, 341, 307] },
  { id: "vehicles/mickey-car-left.png", source: "gray_sedan_sprite_sheet_collection.png", rect: [0, 307, 341, 307] },
  { id: "vehicles/mickey-car-right.png", source: "gray_sedan_sprite_sheet_collection.png", rect: [341, 307, 341, 307] },
  { id: "vehicles/mickey-car-up.png", source: "gray_sedan_sprite_sheet_collection.png", rect: [0, 921, 341, 307] },
  { id: "creek-clubhouse/clubhouse-frame.png", source: "creek_clubhouse_building_kit_spritesheet.png", rect: [0, 0, 430, 490] },
  { id: "creek-clubhouse/clubhouse-half-built.png", source: "creek_clubhouse_building_kit_spritesheet.png", rect: [420, 0, 400, 500] },
  { id: "creek-clubhouse/clubhouse-complete.png", source: "creek_clubhouse_building_kit_spritesheet.png", rect: [805, 0, 430, 510] },
  { id: "creek-clubhouse/props/flag.png", source: "creek_clubhouse_building_kit_spritesheet.png", rect: [0, 470, 190, 230] },
];

rmSync(join(out, "characters/npcs"), { recursive: true, force: true });
for (const crop of crops) {
  const destination = join(out, crop.id);
  mkdirSync(dirname(destination), { recursive: true });
  const [x, y, width, height] = crop.rect;
  // `sips` treats a zero crop offset as unspecified and center-crops instead.
  // A one-pixel source inset preserves explicit top/left anchored crops.
  execFileSync("sips", [
    "-c", String(height), String(width),
    "--cropOffset", String(Math.max(1, y)), String(Math.max(1, x)),
    join(art, crop.source), "--out", destination,
  ], { stdio: "inherit" });
  if (crop.outputSize) {
    const [outputWidth, outputHeight] = crop.outputSize;
    execFileSync("sips", ["-z", String(outputHeight), String(outputWidth), destination], { stdio: "inherit" });
  }
}
// Generated collection art is not registered to a uniform grid. Normalize
// every character frame and isolate vehicle/clubhouse objects after the broad
// source crops above; the cleanup pass also removes disconnected cell bleed.
const swiftModuleCache = "/tmp/milton-estates-swift-module-cache";
mkdirSync(swiftModuleCache, { recursive: true });
execFileSync("swift", [join(root, "scripts/normalize-character-art.swift"), root], {
  stdio: "inherit",
  env: { ...process.env, CLANG_MODULE_CACHE_PATH: swiftModuleCache },
});
console.log(`Processed ${crops.length} runtime art assets.`);
