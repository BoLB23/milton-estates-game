import type { Page, Route } from "@playwright/test";

export type MockCloudSave = { data: unknown; revision: number; createdAt: string; updatedAt: string };

export async function installCloudSaveApi(page: Page): Promise<Map<string, MockCloudSave>> {
  const saves = new Map<string, MockCloudSave>();
  await page.route("**://localhost:8001/api/v1/**", async (route) => fulfillCloudRequest(route, saves));
  return saves;
}

async function fulfillCloudRequest(route: Route, saves: Map<string, MockCloudSave>): Promise<void> {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const now = "2026-08-06T12:00:00.000Z";
  if (path.endsWith("/me/player")) {
    await route.fulfill({ json: { user_id: "e2e-player", nickname: "Molly", haircut: "short", hair_color: "brown", tshirt_color: "blue", pants_color: "denim", shoe_color: "white" } });
    return;
  }
  if (request.method() === "POST" && (path.endsWith("/games/milton-estates/sessions") || path.startsWith("/api/v1/game-sessions/"))) {
    await route.fulfill({ json: {
      id: "e2e-session", session_id: "e2e-session", user_id: "e2e-player", game_id: "milton-estates",
      game_slug: "milton-estates", started_at: now, last_heartbeat_at: now, ended_at: path.endsWith("/end") ? now : null,
      credited_playtime_seconds: 0,
    } });
    return;
  }
  const match = path.match(/\/games\/milton-estates\/saves(?:\/([^/]+))?$/);
  if (!match) { await route.fulfill({ status: 404, json: { detail: "not found" } }); return; }
  const slot = match[1] ? decodeURIComponent(match[1]) : undefined;
  const serialize = (slotKey: string, save: MockCloudSave) => ({
    id: `e2e-${slotKey}`, slot_key: slotKey, game_version: "2026.08", schema_version: 1, revision: save.revision,
    byte_size: JSON.stringify(save.data).length, created_at: save.createdAt, updated_at: save.updatedAt, data: save.data,
  });
  if (!slot && request.method() === "GET") {
    await route.fulfill({ json: [...saves.entries()].map(([slotKey, save]) => {
      const { data: _data, ...metadata } = serialize(slotKey, save); return metadata;
    }) });
    return;
  }
  if (!slot) { await route.fulfill({ status: 404, json: { detail: "not found" } }); return; }
  if (request.method() === "GET") {
    const save = saves.get(slot);
    await route.fulfill(save ? { json: serialize(slot, save) } : { status: 404, json: { detail: "missing" } });
    return;
  }
  if (request.method() === "PUT") {
    const input = request.postDataJSON() as { data: unknown; expected_revision: number | null };
    const previous = saves.get(slot);
    if ((previous?.revision ?? null) !== input.expected_revision) {
      await route.fulfill({ status: 409, json: { detail: "revision conflict" } }); return;
    }
    const save: MockCloudSave = {
      data: input.data,
      revision: (previous?.revision ?? 0) + 1,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    saves.set(slot, save);
    await route.fulfill({ json: serialize(slot, save) });
    return;
  }
  if (request.method() === "DELETE") { saves.delete(slot); await route.fulfill({ status: 204 }); return; }
  await route.fulfill({ status: 405, json: { detail: "method" } });
}

export async function readCloudData(page: Page): Promise<Record<string, unknown> | undefined> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) => candidate.startsWith("@game-platform/cloud-save/milton-estates/"));
    return key ? (JSON.parse(localStorage.getItem(key)!) as { data: Record<string, unknown> }).data : undefined;
  });
}

export async function launchSeededCloudSave(
  page: Page,
  saves: Map<string, MockCloudSave>,
  configure: (save: Record<string, unknown>) => void,
): Promise<void> {
  await page.goto("/");
  await page.waitForTimeout(550);
  await page.mouse.click(230, 315); // New Game
  await page.waitForTimeout(400);
  await page.keyboard.press("Space");
  await page.waitForTimeout(100);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(1_900);
  const data = await readCloudData(page);
  if (!data) throw new Error("Fresh cloud save did not reach the recovery cache.");
  configure(data);
  saves.set("primary", {
    data,
    revision: 1,
    createdAt: "2026-08-06T12:00:00.000Z",
    updatedAt: "2026-08-06T12:00:00.000Z",
  });
  await page.reload();
  await page.waitForTimeout(550);
  await page.mouse.click(665, 230); // Continue
  await page.waitForTimeout(850);
}
