# Milton Estates: Next Steps After the First Playthrough

> This historical graybox plan has been completed and is retained for context. Its successor was [Next-phase handoff: illustrated world and real content browsing](next-phase-handoff-2026-07-13.md).

## Current checkpoint

The first graybox mission is playable end to end: movement, dialogue, quest stages, the creek map, controller pickup, the optional creek token, LocalStorage persistence, and mission completion are implemented. The first real playthrough exposed the most important kind of MVP issue—a route/state soft-lock—before visual production work began.

The creek return has now been widened across the visible trail opening, and old saves using the former `xbox-controller` item ID are normalized to the canonical `xbox_controller` ID. This lets an in-progress playthrough leave the creek and allows Jeremy to recognize the recovered controller.

The project is still a programmatic graybox. The Tiled map contract and game concept are documented, but production maps, external content files, final art, and audio do not exist yet. A Playwright browser regression now covers the complete controller quest and creek save/reload path.

### Trustworthy-graybox milestone status

Implemented in the current worktree:

- Save v2 with v1 migration, semantic quest history, discovered maps, settings, and save timestamps.
- Escape pause/backpack menu with Resume, Quests, Map, Save/Restart, and Settings pages.
- Current-area schematic maps with runtime player position, known landmarks, exits, and stage-aware objectives.
- Autosave status, Save Now, separated two-step mission restart, completion history/summary, and localhost-only playtest diagnostics.
- Wide transition regions and clickable interaction prompts in addition to keyboard input.
- Unit coverage plus three deterministic full-playthrough scenarios: direct route, out-of-order exploration, and creek pickup/reload/return.
- Rendered browser validation of the complete direct quest, creek save reload, both transitions, menu pages, controller handoff, and completion summary.

The next product work begins at **Then: improve navigation and feedback** below; retain the remaining hardening checks in this section as regression gates.

## Implemented milestone contract: trustworthy graybox and player menu

Do this before replacing the placeholder visuals. This pass should leave the demo easy to finish, inspect, pause, save, recover, and hand to another playtester.

1. Add a shared pause/menu scene opened with Escape. It must pause movement and world interactions without breaking an active dialogue or scene transition.
2. Give the menu five focused pages:
   - **Resume** — return to the game and show the current objective.
   - **Quests** — show the active quest, completed quest history, stage/beat checklist, and optional-secret status without revealing undiscovered secrets.
   - **Map** — show a simple illustrated map for the current area, Billy's approximate position, known exits, Jeremy/Andrew landmarks, and the current objective destination when appropriate.
   - **Save** — retain autosave, add a visible `Last saved` status and a `Save now` action, plus `Restart mission` behind a confirmation step. Multiple save slots are out of scope for this pass.
   - **Settings / Controls** — show movement and interaction keys, volume/mute controls, text-size choice, and reduced-motion option. Key rebinding can remain a later demo-ready item.
3. Extend save data with explicit quest-history and discovered-map state. Add an explicit save version and migration tests for every known legacy value.
4. Add a developer/player recovery route in the menu instead of requiring browser developer tools to clear LocalStorage. Never combine `Restart mission` with the ordinary save action.
5. Add transition zones rather than point-sized prompts, with a shared transition helper used by both maps.
6. Add a browser-level happy-path test that completes all five quest stages, crosses both map transitions, opens/closes the menu, saves, reloads once, and finishes with Jeremy.
7. Add focused tests for pausing during dialogue, menu input debouncing, save migration, quest-history recording, map discovery, restart confirmation, and resuming into either map.
8. Run three fresh playthroughs: the direct quest route, deliberately out-of-order exploration, and save/reload from the creek after finding the controller.

Exit criteria: a new save, a legacy in-progress save, and a reload in each map can all finish the mission without manual recovery; Escape always returns control cleanly; the menu accurately reflects quest, map, and save state.

### Menu behavior decisions

- Autosave remains authoritative. `Save now` provides reassurance and a timestamp/status; it does not create a second competing save system.
- Pause gameplay physics and interactions while the menu is open. Decide explicitly whether ambient audio ducks or pauses.
- Opening the menu during dialogue should preserve the exact line and return to it. Input used to close the menu must not also advance dialogue or trigger a nearby interaction.
- Quest history should record semantic milestones, not copied UI strings. Display copy can then change without invalidating saves.
- The map should be a readable game aid, not an exact depiction of real properties. Begin with a static schematic plus player/quest markers; fog-of-war and scrolling maps are unnecessary for this pass.
- Restart must require confirmation and explain that current mission progress will be erased. Ordinary Resume, Map, Quest, Settings, and Save actions must never risk progress.

### Additional recommendations for this pass

1. Add a small autosave icon/status so playtesters understand when progress is safe.
2. Add a single source of truth for input actions (`move`, `interact`, `menu`, `back`) before adding more screens.
3. Add a lightweight debug panel enabled only in development builds for map, spawn, quest stage, inventory, and save version. This will shorten later playtest diagnosis.
4. Record a small, bounded set of playtest notes locally—route taken, completion result, confusing landmark, and recovery needed. Do not add analytics or a backend.
5. Add a completion summary that feeds the quest-history page and clearly offers Continue Exploring or Restart Mission.

## Then: improve navigation and feedback

1. Make the side-yard route and creek return read as paths through scenery, not only labels.
2. Show a brief controls card on first launch and keep contextual interaction prompts.
3. Add stronger pickup and quest-completion feedback, including a visible controller inventory indicator.
4. Tune camera framing, collision edges, interaction reach, and movement speed from playtest notes.
5. Refine the new menu and map from playtest feedback rather than adding more pages.

Exit criteria: a first-time player can finish without outside instructions and can always identify the current objective and return route.

## Production pass: move from graybox to authored content

1. Build the neighborhood and creek maps in Tiled using `docs/archive/first-area-plan.md` as the contract.
2. Add a map registry and loader that resolve stable map, spawn, transition, collision, interaction, and quest-region IDs.
3. Move dialogue, quest content, characters, and items into small validated data files while keeping quest transitions deterministic.
4. Replace placeholder characters, homes, vegetation, creek, roads, and props with an original cohesive tileset and sprites.
5. Add ambient summer audio, creek ambience, footsteps, interaction sounds, and simple music with mute/volume controls.

Exit criteria: the authored maps preserve the tested quest IDs and behavior while delivering the intended warm, nostalgic visual identity.

## Demo-ready finish

1. Test common desktop viewport sizes, keyboard layouts, save/reload behavior, and production builds.
2. Add accessibility basics: remappable keys, readable text sizing, reduced-motion-friendly effects, and independent audio controls.
3. Optimize Phaser/Vite loading and split the current large production bundle if startup measurements justify it.
4. Add a title screen, completion screen, credits, and a clear replay flow.
5. Package and publish a private playtest build, collect structured feedback, and only then scope the second mission.

## Recommended next milestone

Take **navigation and feedback polish** as the next bounded pass. Do not begin the Tiled/art conversion until two new players can finish the graybox without outside guidance.

Suggested order:

1. Add a first-launch controls card that disappears after the player moves and interacts once.
2. Improve the visible side-yard trail and creek return-route landmarks.
3. Add a compact inventory indicator for the controller and stronger pickup/completion feedback.
4. Conduct two new-player sessions and record confusion points in a dated playtest note under `docs/playtests/`.
5. Tune camera framing, collision, interaction reach, and movement speed from those observations.
6. Re-run `npm run check:full` and all three playthrough scenarios before starting production maps.

Cost-aware delegation:

- **5.6 Luna:** first-launch controls card, inventory indicator, feedback effects, playtest-note template, and focused tests. Keep each assignment in separate files where possible.
- **5.6 Terra:** navigation/camera/collision tuning that crosses both scenes, integration review, rendered playthroughs, and final acceptance.
- The route-visual work and UI feedback work can run in parallel. Do not let parallel agents edit `BaseExplorationScene.ts` or `UIScene.ts` simultaneously.

After this milestone, proceed to **Production pass: move from graybox to authored content** above.
