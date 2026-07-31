# Next-phase handoff: illustrated world and real content browsing

Date: 2026-07-13  
Branch: `main`  
Starting point: the commit containing this handoff  
Primary regression: `npm run check:full`

## Why this phase exists

The production-polish checkpoint made the existing game safer and broader without replacing its working quest systems. The latest playthrough confirms that the next phase should not add more procedural detail. It should replace the presentation layer in three focused areas:

1. The world still looks visibly pixelated and much simpler than the generated Chapter 1 cover.
2. The menus do not feel like a real chapter/quest browser, especially from Billy's Backpack.
3. The gameplay and fold-out maps do not reflect the supplied regional reference closely enough.

The Missing Controller state machine, stable IDs, save migrations, replay isolation, input router, audio manager, and regression suite are trustworthy foundations. Preserve them.

## Current verified baseline

- Save v3 migrates v1/v2 and preserves `xbox_controller`.
- Chapter 1 and four quest records are data-driven in `src/content/chapters.ts`.
- Replay is runtime-only and cannot write canonical progress.
- Title, Chapter Scrapbook, Quest Journal, Billy's Backpack, authored maps, audio, keyboard, gamepad, and landscape touch are implemented.
- Final verification is green: 42 unit tests, production build, and four Playwright scenarios.
- Current screenshots are under `docs/checkpoint-*.png`.
- The desired visual quality is best represented by `public/assets/concepts/chapter-1-neighborhood-concept.png`.

## Feedback 1: move from pixel shapes to an illustrated-HD renderer

### Why the game still looks pixelated

The current look is structural, not a missing-polish bug:

- Phaser is configured with `pixelArt: true` and `roundPixels: true`.
- CSS forces `image-rendering: pixelated`.
- The internal canvas is 960 x 540.
- Characters are 32 x 42 single-frame programmatic textures.
- Houses, roads, trees, water, and UI decoration are Phaser `Graphics` primitives.
- The camera zooms these primitives rather than displaying higher-resolution authored art.

Adding more rectangles, circles, or tiny details will not approach the generated cover. The next phase should deliberately change the rendering target from **modern pixel art** to **HD illustrated 2D**.

### Recommended art pipeline

Use a hybrid image-layer/Tiled-object approach:

1. Produce three approved visual targets before generating a large asset batch:
   - one gameplay-frame neighborhood mockup;
   - one Creek Woods gameplay-frame mockup;
   - one chapter/quest menu mockup.
2. Create a shared style sheet covering palette, camera angle, character proportions, line weight, lighting, foliage language, and UI materials.
3. Generate and clean one high-resolution master background per map, deliberately fictionalized from the references.
4. Split each master into WebP image-layer chunks no larger than 2048 or 4096 px per edge.
5. Load the chunks as Tiled image layers. Keep collision, transitions, spawns, interactions, quest regions, and audio zones in Tiled object layers with the existing stable IDs.
6. Add separate foreground layers for tree canopies, tall grass, fences, and creek-bank vegetation so Billy can pass behind scenery.
7. Replace the 32 x 42 figures with cleaned four-direction sprite sheets at roughly 64-96 px character height. Start with Billy; Andrew and Jeremy can remain idle-only initially.
8. After approved assets exist, switch Phaser/CSS away from forced pixel filtering and validate a 1280 x 720 internal presentation size. Do not change world coordinates or quest regions in the same commit.

The generated Chapter 1 cover is a composition/style reference, not a gameplay map. Its full prompt and provenance are in `docs/generated-art-prompt.md`.

### First visual vertical-slice gate

Do not rebuild both maps immediately. Replace only the camera-sized area around Billy's house and Wheatfield Drive first. Approve it when:

- the gameplay frame is recognizably close to the generated cover in detail and softness;
- Billy, the driveway, house, road, lawn, and trees share one scale and lighting system;
- there are no visible programmatic placeholder shapes in the approved frame;
- movement, collision, F4 objective navigation, and the complete quest remain unchanged;
- the frame stays clear beneath the HUD at desktop and landscape-mobile sizes.

## Feedback 2: make menus actual chapter and quest browsers

### Current limitation

There are two related but disconnected experiences:

- `FrontEndScene` can show Chapter 1 and its four quest cards, but Chapter 1 is the only defined chapter and the interaction model does not read like a page/carousel browser.
- Billy's Backpack shows the active Missing Controller checklist only. It cannot browse the chapter registry or inspect other quest records.

This explains the playthrough impression that the menu only shows the current content even though registry metadata exists.

### Required menu behavior

Build one shared selection model used by both the front end and Backpack:

- `selectedChapterId` or mystery-page index;
- `selectedQuestId` within the selected chapter;
- previous/next chapter;
- previous/next quest;
- inspect locked/completed/active entries;
- action selector returning Start, Continue, Replay, or no action with a locked explanation.

The front end should render a horizontally browseable Chapter Scrapbook with visible arrows, page count, focus state, and a selected-page detail panel. The Quest Journal should show a scrollable/card list and a selected-quest detail page. Mouse wheel/pointer, keyboard, gamepad, and touch must all expose the same navigation.

Billy's Backpack should use the registry-backed **Journal** experience rather than a single-quest checklist. It may still open focused on the active quest, but the player must be able to browse every configured Chapter 1 quest and switch to the chapter pages. Add an explicit “Return to title / Chapter Select” action behind confirmation if it exits active gameplay.

Do not invent named future chapters without narrative approval. Undefined pages should still be selectable mystery pages. The selection system and UI tests should nevertheless support defined locked chapters when content is added later.

### Menu acceptance criteria

- A pointer user can browse every visible chapter/mystery page and all four Chapter 1 quest records.
- Keyboard and gamepad users see a stable focus ring and can navigate the same content without pointer coordinates.
- The Backpack opens on the active quest but can browse non-active, locked, optional, finale, and completed records.
- Locked cards explain prerequisites and implementation status separately.
- Completed Missing Controller shows Replay, and replay still leaves LocalStorage byte-for-byte canonical.
- Adding a registry quest changes the menu through data only.

## Feedback 3: rebuild both gameplay geography and the fold-out map from the reference

### Current mismatch

The current gameplay neighborhood is essentially a decorated east-west house row. The current fold-out map is also centered on three houses. The supplied regional reference communicates a much larger north-up structure:

- Milton Estates in the center;
- Bent Creek and golf-course scenery to the west;
- Stonehenge and open fields to the east;
- Reidenbaugh Elementary to the northeast;
- Fruitville Pike as the major north-south edge/spine;
- curved residential roads rather than one mostly horizontal street.

The game should remain fictionalized and must not reproduce addresses, parcel boundaries, or private details. It should preserve these broad spatial relationships and road rhythms.

### Recommended map work

Treat the supplied annotated aerial as a regional composition reference and create two distinct artifacts:

1. **Gameplay neighborhood plate:** a compressed playable Wheatfield Drive area with a genuine curve, deep setbacks, uneven lot shapes, the three-home order, a believable west-side creek entrance, and distant regional edge views.
2. **Backpack regional fold-out:** a north-up kid-drawn overview showing Milton Estates, Bent Creek, Stonehenge, Reidenbaugh, Fruitville Pike, fields, school/golf silhouettes, known exits, player area, and objective direction. It should not simply mirror the current camera rectangle.

Build the fold-out map from a dedicated regional data definition rather than `MAP_DEFINITIONS[currentMap].markers` alone. Suggested additions:

- regional nodes/areas with normalized positions;
- road and creek polylines;
- accessible, known-but-locked, and mysterious area states;
- player-area marker rather than exact private-lot coordinates;
- quest objective overlay resolved separately from base geography.

### Map acceptance criteria

- A side-by-side review clearly preserves the reference's relative area placement and major road/field rhythm.
- The three homes remain Andrew white, Billy blue/garage/broad drive, Jeremy baby-blue/red shutters in order.
- The gameplay camera never needs large text to explain geography.
- The fold-out map shows all five named regional areas and distinguishes accessible from scenic/locked routes.
- Existing `neighborhood`, `creek`, spawn, transition, interaction, quest-region, controller, and token IDs remain unchanged.
- All direct, out-of-order, replay, and creek save/reload tests remain green.

## Recommended execution order

### Phase A — approve the visual target

- Generate neighborhood-frame, creek-frame, menu, and regional-map mockups.
- Compare them against the current screenshots and supplied references.
- Choose HD illustrated 2D explicitly before changing renderer flags.
- Exit gate: written approval of all four targets.

### Phase B — rendering vertical slice

- Add Tiled image-layer loading and stable object-layer validation.
- Implement the Billy-house/Wheatfield camera-sized slice.
- Add the first cleaned Billy movement sheet.
- Re-run the complete quest even though only one area is visually replaced.

### Phase C — full neighborhood and creek replacement

- Finish the neighborhood master plate and foreground layers.
- Finish Creek Woods with authored water/vegetation overlays and readable return path.
- Preserve all stable object IDs and test coordinates or update debug targets from object IDs.

### Phase D — chapter/quest browser rebuild

- Extract pure chapter/quest selection state and selectors.
- Rebuild FrontEnd scrapbook/journal around the shared model.
- Reuse it in Billy's Backpack.
- Add pointer, keyboard, gamepad, and touch navigation tests.

### Phase E — regional fold-out map

- Add regional geography data.
- Render the reference-informed kid map.
- Overlay discovered areas, current area, exits, and quest directions.

### Phase F — final hardening

- Desktop and physical landscape-touch QA.
- Gamepad held-repeat and focus recovery.
- Asset memory/loading measurements and compression.
- `npm run check:full`, fresh direct/out-of-order/creek-reload runs, and updated screenshots.

## Likely files and boundaries

- Preserve: `src/content/quest.ts`, dialogue progression, stable IDs, save migrations, replay isolation.
- Replace/refactor presentation: `NeighborhoodScene.ts`, `CreekScene.ts`, `FrontEndScene.ts`, `MenuScene.ts`, `UIScene.ts`.
- Add: `public/assets/maps/`, `public/assets/characters/`, `.tmx/.tsx` sources, map loader/validator, regional map definition, shared menu-selection model and tests.
- Renderer flags: `src/main.ts` and `src/style.css`, only after the HD vertical slice is ready.
- Current generated cover and prompt: `public/assets/concepts/` and `docs/generated-art-prompt.md`.

## Verification and handoff discipline

At every major stage run:

```sh
npm run test
npm run build
npm run test:e2e
```

Before merging or handing off, run:

```sh
npm run check:full
git diff --check
git status --short --branch
```

Capture side-by-side screenshots for the approved mockup, gameplay neighborhood, creek, chapter browser, quest browser, Backpack Journal, regional map, and portrait overlay. Update `docs/archive/production-polish-manifest.md` with temporary assets and remaining risks.

## Explicit non-goals

- Do not rewrite the Missing Controller state machine.
- Do not create a generic narrative engine.
- Do not reproduce private addresses or exact lots.
- Do not generate a large inconsistent tile batch before the four target mockups are approved.
- Do not add ten Chapter 1 quests merely to exercise the menu.
- Do not combine the HD-renderer change, save migration, and quest logic changes in one checkpoint.
