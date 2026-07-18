#!/usr/bin/env node
/**
 * Keeps Vite's public directory limited to assets that the shipped game loads.
 *
 * Public files are copied verbatim into dist, so an unreferenced file increases
 * every production download. Tiled .tmj files are deliberately retained as
 * authored map source until the map-loader migration consumes them directly.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const publicRoot = join(root, "public");
const assetRoot = join(publicRoot, "assets");
const runtimeRoots = ["src", "index.html"];
const retainedSourceAssets = new Set([
  "assets/maps/creek-woods.tmj",
  "assets/maps/neighborhood-wheatfield-slice.tmj",
]);

async function collectFiles(directory) {
  const info = await stat(directory);
  if (!info.isDirectory()) return [directory];
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => collectFiles(join(directory, entry.name))));
  return nested.flat();
}

const runtimeFiles = (await Promise.all(runtimeRoots.map((entry) => collectFiles(join(root, entry))))).flat();
const runtimeText = await Promise.all(runtimeFiles
  .filter((file) => /\.(?:[cm]?[jt]sx?|html)$/.test(file))
  .map(async (file) => ({ file, text: await readFile(file, "utf8") })));

const referenced = new Set();
const missing = new Set();
const rootAbsoluteUrls = [];
const quotedAssetPath = /(["'`])((?:\/)?assets\/[A-Za-z0-9_./-]+)\1/g;

for (const { file, text } of runtimeText) {
  for (const match of text.matchAll(quotedAssetPath)) {
    const assetPath = match[2];
    if (!assetPath) continue;
    const normalized = assetPath.replace(/^\//, "");
    referenced.add(normalized);
    if (assetPath.startsWith("/")) rootAbsoluteUrls.push(`${relative(root, file)}: ${assetPath}`);
  }
}

for (const asset of referenced) {
  try {
    await stat(join(publicRoot, asset));
  } catch {
    missing.add(asset);
  }
}

const shippedAssets = (await collectFiles(assetRoot)).map((file) => relative(publicRoot, file));
const unreferenced = shippedAssets.filter((asset) => !referenced.has(asset) && !retainedSourceAssets.has(asset));

if (rootAbsoluteUrls.length > 0) {
  console.error("Root-absolute asset URLs bypass Vite's deployment base:");
  for (const item of rootAbsoluteUrls) console.error(`  ${item}`);
}
if (missing.size > 0) {
  console.error("Runtime asset references missing from public:");
  for (const asset of missing) console.error(`  ${asset}`);
}
if (unreferenced.length > 0) {
  console.error("Assets copied to dist without a runtime reference:");
  for (const asset of unreferenced) console.error(`  ${asset}`);
}

if (rootAbsoluteUrls.length || missing.size || unreferenced.length) {
  process.exitCode = 1;
} else {
  console.log(`Asset audit passed (${referenced.size} runtime assets; ${retainedSourceAssets.size} retained map-source files).`);
}
