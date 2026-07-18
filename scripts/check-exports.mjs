#!/usr/bin/env node
/**
 * A deliberately conservative, dependency-free export check.
 *
 * TypeScript already catches unused local declarations. This script adds a
 * useful guard for named exports that have no reference anywhere in the
 * application or test suite. It intentionally does not attempt to interpret
 * framework reflection, re-exports, or dynamic imports; those remain a code
 * review concern rather than a source of false-positive CI failures.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const sourceRoots = ["src", "tests"];
const sourceFiles = [];

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  for (const entry of entries) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) await collectTypeScriptFiles(child);
    else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) sourceFiles.push(child);
  }
}

for (const directory of sourceRoots) await collectTypeScriptFiles(directory);

const files = await Promise.all(sourceFiles.map(async (file) => ({
  file,
  text: await readFile(join(root, file), "utf8"),
})));
const corpus = files.map(({ text }) => text).join("\n");
const declaration = /(?:^|\n)export\s+(?:declare\s+)?(?:abstract\s+)?(?:class|function|const|let|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
const unused = [];

for (const { file, text } of files) {
  for (const match of text.matchAll(declaration)) {
    const name = match[1];
    if (!name) continue;
    const occurrences = corpus.match(new RegExp(`\\b${name}\\b`, "g"))?.length ?? 0;
    if (occurrences === 1) unused.push(`${relative(root, join(root, file))}: ${name}`);
  }
}

if (unused.length > 0) {
  console.error("Named exports with no source or test references:");
  for (const item of unused) console.error(`  ${item}`);
  process.exitCode = 1;
} else {
  console.log(`Export reference check passed (${sourceFiles.length} TypeScript files scanned).`);
}
