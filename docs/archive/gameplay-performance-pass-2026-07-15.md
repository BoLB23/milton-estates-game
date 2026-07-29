# Gameplay and performance pass — 2026-07-15

## Player-reported symptoms

- Movement and camera follow felt sluggish or visually unstable.
- Illustrated map art, legacy collision geometry, and gameplay anchors did not always describe the same space.
- Billy could spawn and walk in the painted creek south of the lower bridge.
- The controller could be seen and interacted with before the missing-controller quest reached `search_creek`, producing dialogue that told the player to keep following the creek even while the controller was visible.
- A physical E press could open dialogue and immediately consume its first line because the world and UI scenes handled the same synchronous input event.

## Fixed in this pass

- The creek south spawn/return moved from the retired centerline onto the painted trail east of the creek.
- Creek water collision now follows four illustrated sections and leaves both painted bridges traversable.
- The controller sprite, prompt, and tracks prompt only appear during the correct `search_creek` stage. Early exploration no longer exposes a quest item the player is not allowed to collect.
- Keyboard world interaction is deferred until all listeners finish the opening input event, so E opens dialogue without skipping it.
- Hidden procedural neighborhood and creek maps are no longer rendered underneath the full illustrated master plates.
- Per-frame interaction availability uses primitive store selectors instead of repeatedly deep-copying the entire save.
- Camera follow is more responsive and both the game renderer and camera use rounded pixels to reduce subpixel shimmer while moving.
- Tiled handoff coordinates, runtime anchors, unit coverage, and the keyboard-driven Playwright path were updated together.

## Validation

- `npm run check`: 53 unit tests and production build pass.
- `npm run test:e2e`: all four rendered scenarios pass, including a keyboard-specific controller regression and the creek save/reload path.
- Manual browser pass confirmed the south creek entrance is on the painted trail, the controller is in its grass clearing, and the first E press displays the first controller dialogue line.

## Follow-up observations

- The master plates are 16:9 images displayed in older fixed world dimensions (`2300 × 1500` and `2048 × 1536`). Changing those world contracts would require a coordinated save migration for persisted mushroom positions and a full re-authoring of every anchor. The current pass keeps compatibility and aligns gameplay within that contract; a later art-source pass should export masters at the exact runtime aspect ratios to remove all non-uniform scaling.
- Creek bank collision is intentionally a low-cost Arcade approximation. If future quests require free movement along the water edge, replace the rectangular sections with authored Tiled collision polygons.
- The retired procedural drawing helpers remain in the scene source as reference but are no longer executed. They can be removed once the illustrated/Tiled art pipeline is treated as final.
- The production bundle still reports the existing Phaser chunk-size warning. Runtime scene work was prioritized here; framework-level code splitting remains a separate load-time optimization.
