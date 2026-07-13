# Production polish checkpoint manifest

## Checkpoint 1 — baseline

- Green baseline: 28 unit tests, production build, and two complete Playwright regressions.
- Existing risk: Phaser remains in a single Vite chunk above the default 500 kB warning threshold.

## Checkpoint 2 — chapters, quests, save, replay

- Added Chapter 1 registry, locked future-memory cards, data-driven finale rules, save v3, v1/v2 migrations, and runtime-only replay isolation.
- Green gate: 34 unit tests, production build, and two complete Playwright regressions.
- Replay is deliberately memory-only. Refreshing during replay returns to canonical progress.

## Checkpoint 3 — scrapbook front end

- Added title, confirmed New Game, Chapter Scrapbook, Quest Journal, settings, Start/Continue/Replay routing, and mysterious future pages.
- Billy's Backpack remains the in-game pause menu.
- Screenshots: `checkpoint-3-title.png`, `checkpoint-3-chapters.png`, `checkpoint-3-quests.png`.
- Temporary art: scrapbook photos and cover thumbnails are code-authored compositions pending final cleaned pixel-art replacements.
- Generated concept promoted to a real scrapbook cover asset: `public/assets/concepts/chapter-1-neighborhood-concept.png`. It was generated with the built-in image tool from the supplied references, then constrained to the documented fictionalized palette/composition brief. It is presentation art only; collision/gameplay geometry remains authored code.
- Remaining risk: front-end controls are pointer/keyboard-page based until the shared action router checkpoint.

## Checkpoint 4 — maps

- Replaced both visual grayboxes with cohesive authored pixel-shape maps while freezing runtime dimensions, interactions, transition regions, pickup locations, and debug targets.
- Neighborhood includes distinct Andrew/Billy/Jeremy homes, curved road/curbs, driveways, landscaping, mature trees, props, and scenic blocked edges.
- Creek includes irregular animated water, layered banks/vegetation, loop trails, bridges, clearings, and readable controller/token pockets.
- Added shallow map-variant registry for quest-specific overlays, time of day, and ambience.
- Screenshots: `checkpoint-4-neighborhood.png`, `checkpoint-4-creek.png`.
- Remaining temporary asset: map art is code-authored rather than exported Tiled data. Stable content boundaries make a later Tiled conversion possible without changing quest IDs.

## Checkpoint 5 — HUD and Billy's Backpack

- Restyled HUD/dialogue/objective/save feedback as field notes and added controls guidance, controller indicator, objective update, pickup, completion, and save feedback.
- Restyled Billy's Backpack without changing its pause role; upgraded Map into an illustrated fold-out with roads, home icons, creek trail, player, exits, and objectives.
- Green gate: 36 unit tests, production build, and both Playwright regressions.

## Checkpoint 6 — audio

- Added original procedural Web Audio ambience for neighborhood and creek plus semantic UI/game cues.
- No soundtrack or external/copyrighted audio assets are used.
- Audio unlocks on first gesture, fails safe where Web Audio is unavailable, and applies persisted mute/master volume live.
- Green gate: 39 unit tests, production build, and both Playwright regressions.

## Checkpoint 7 — devices and hardening

- Added one semantic action router for keyboard, standard gamepad, and touch; world movement/interact plus front-end/Backpack navigation consume the same actions.
- Added visible keyboard/gamepad focus, landscape touch d-pad/actions, and a portrait orientation blocker.
- Added rendered replay isolation and portrait coverage.
- Final gate: 42 unit tests, production build, and four Playwright scenarios covering the full quest/reload, pause/restart safety, replay isolation, and portrait behavior.
- Screenshot: `checkpoint-7-portrait.png`.

## Remaining risks and intentional temporary work

- The maps are authored programmatically rather than exported from Tiled. Stable IDs, variants, and map contracts are documented for a future conversion.
- Character sprites are polished single-frame silhouettes; the documented four-frame walk cycles remain future asset work.
- Touch controls are CSS/DOM controls and are validated structurally plus through the shared action router; a physical-device pass is still recommended before public release.
- Gamepad menu movement is edge-triggered; the stick must recenter between selections.
- Phaser remains in one Vite chunk above the default 500 kB warning threshold.
- The Chapter 1 cover is generated presentation art; prompt/provenance is documented in `generated-art-prompt.md`.
