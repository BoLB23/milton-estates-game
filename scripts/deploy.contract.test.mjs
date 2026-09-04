import { readFile, mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";

const deploy = await readFile(new URL("./deploy.sh", import.meta.url), "utf8");
const workflow = await readFile(new URL("../.github/workflows/build-image.yml", import.meta.url), "utf8");

async function exerciseRollback(current, present = true, replaceFails = false, expectedTemplate = current.spec.template) {
  const dir = await mkdtemp(join(tmpdir(), "milton-rollback-"));
  const currentPath = join(dir, "current.json");
  const previousPath = join(dir, "previous.json");
  const expectedPath = join(dir, "expected.json");
  const rollbackPath = join(dir, "rollback.json");
  const restoredPath = join(dir, "restored.json");
  const stub = join(dir, "kubectl");
  await writeFile(currentPath, JSON.stringify(current));
  const previousTemplate = structuredClone(current.spec.template);
  previousTemplate.spec.containers[0].image = "previous";
  await writeFile(previousPath, JSON.stringify({ metadata: { resourceVersion: "old", uid: "uid" }, spec: { template: previousTemplate } }));
  await writeFile(expectedPath, JSON.stringify({ spec: { template: expectedTemplate } }));
  await writeFile(stub, ["#!/bin/sh", `if [ "$1" = replace ]; then ${replaceFails ? "exit 1" : `cp "$(printf '%s\\n' "$@" | tail -1)" "${restoredPath}"`}; fi`, `case "$*" in *get*) cat "${currentPath}";; esac`, "exit 0", ""].join("\n"));
  await chmod(stub, 0o700);
  const start = deploy.indexOf("restore_workload() {");
  const end = deploy.indexOf("\nrestore_release()", start);
  const fn = deploy.slice(start, end);
  const script = [fn, `kubectl() { "${stub}" "$@"; }`, `workload_applied=true`, `workload_was_present=${present}`, "namespace=games", "deployment=milton-estates-game", "rollout_timeout=1s", `previous_workload_object="${previousPath}"`, `current_workload_object="${join(dir, "inspected.json")}"`, `rollback_workload_object="${rollbackPath}"`, `expected_workload_projection=$(jq -cS '.spec.template' "${expectedPath}")`, "restore_workload", ""].join("\n");
  const result = await new Promise((resolve) => { const child = spawn("bash", ["-c", script]); let stderr = ""; let stdout = ""; child.stderr.on("data", (x) => { stderr += x; }); child.stdout.on("data", (x) => { stdout += x; }); child.on("close", (code) => resolve({ code, stderr, stdout })); });
  const restored = await readFile(restoredPath, "utf8").catch(() => null);
  await rm(dir, { recursive: true, force: true });
  return { ...result, restored: restored && JSON.parse(restored) };
}

test("deployment rollback owns and restores the workload revision", () => {
  assert.match(deploy, /workload_was_present=false/);
  assert.match(deploy, /workload_capture_error/);
  assert.match(deploy, /changed concurrently; refusing to overwrite/);
  assert.match(deploy, /\.metadata\.resourceVersion = \$current\[0\]\.metadata\.resourceVersion/);
  assert.match(deploy, /retaining the game Deployment for manual recovery/);
  assert.match(deploy, /rollout status[\s\\\n]+.*deployment\/\$\{deployment\}/);
  assert.match(deploy, /First release failed; retaining the game Deployment/);
  assert.match(deploy, /restore_release/);
});

const ownedTemplate = { metadata: { labels: { app: "game" }, annotations: { "games.bolblab.org/deploy-id": "nonce" } }, spec: { containers: [{ name: "game", image: "new", imagePullPolicy: "Always", ports: [], readinessProbe: {}, livenessProbe: {}, resources: {}, securityContext: {}, volumeMounts: [] }], volumes: [] } };

test("executes workload rollback with the live resource version", async () => {
  const result = await exerciseRollback({ metadata: { resourceVersion: "live", uid: "uid" }, spec: { template: ownedTemplate } });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.restored.metadata.resourceVersion, "live");
});

test("executes the concurrent workload guard", async () => {
  const changed = structuredClone(ownedTemplate);
  changed.spec.containers[0].image = "other";
  const result = await exerciseRollback({ metadata: { resourceVersion: "live", uid: "uid" }, spec: { template: changed } }, true, false, ownedTemplate);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /changed concurrently/);
  assert.equal(result.restored, null);
});

test("reports replacement failure during rollback", async () => {
  const result = await exerciseRollback({ metadata: { resourceVersion: "live", uid: "uid" }, spec: { template: ownedTemplate } }, true, true);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Could not restore the previous game Deployment/);
});

test("first release retains the workload for manual recovery", async () => {
  const result = await exerciseRollback({ metadata: { resourceVersion: "live", uid: "uid" }, spec: { template: ownedTemplate } }, false);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /retaining the game Deployment for manual recovery/);
  assert.equal(result.restored, null);
});

test("CI validates pull requests and scopes package write access to publishing", () => {
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /packages: read/);
  assert.match(workflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /image:[\s\S]*?permissions:\n      contents: read\n      packages: write/);
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(workflow, /target: runtime/);
  const imageJob = workflow.slice(workflow.indexOf("\n  image:"));
  assert.doesNotMatch(imageJob, /npm_token|NODE_AUTH_TOKEN/);
  const actionRefs = [...workflow.matchAll(/^\s*- uses: ([^\s@]+)@([^\s#]+)(?:\s+#.*)?$/gm)];
  assert.ok(actionRefs.length > 0);
  for (const [, action, ref] of actionRefs) {
    assert.match(ref, /^[0-9a-f]{40}$/, `${action} must be pinned to a full commit SHA`);
  }
});
