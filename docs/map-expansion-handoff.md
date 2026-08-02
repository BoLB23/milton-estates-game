# Regional map expansion: implementation plan and handoff

Date: 2026-08-01
Status: READY_FOR_IMPLEMENTATION
Baseline branch: `main`
Baseline commit: `6839bef`
Primary gate: `npm run check:full`

## 1. Purpose

Expand Milton Estates into a larger, connected region with deliberate travel,
consistent grid-aligned collision, and visually distinct destinations. Replace
the short neighborhood-like Reidenbaugh route with a journey through affluent
Stonehenge, rebuild Reidenbaugh as an exterior school campus, and add a second
branch through Fruitville Pike to Bent Creek and its golf course.

This document is the authoritative implementation handoff. The coordinating
agent owns it. Subagents must report decisions, paths, test results, and blockers
to the coordinator instead of editing this file concurrently.

## 2. Repository baseline and preservation rules

The local branch was fast-forwarded to `origin/main` at `6839bef`. The standard
gate passed afterward: 24 Vitest files, 105 tests, typecheck, export validation,
asset audit, and the Vite production build.

The following pre-existing local modifications belong to the user and must be
preserved:

- `README.md`
- `index.html`
- `k8s/ingress.yaml`
- `scripts/deploy.sh`
- `src/scenes/InputRouterScene.ts`
- `src/style.css`

Agents must inspect `git status --short --branch` before editing. Do not restore,
overwrite, stash, commit, or reformat those changes. If implementation requires
`InputRouterScene.ts` or `style.css`, the coordinator must first inspect the
user diff and integrate around it deliberately.

Current architecture guidance lives in `docs/content-architecture.md`. Historical
map and quest plans are under `docs/archive/` and are context only; this handoff
supersedes their route and scope decisions.

## 3. Approved decisions

| ID | Decision |
| --- | --- |
| D-001 | Canonical geography is Milton Estates -> Stonehenge -> Reidenbaugh Elementary in one direction, and Milton Estates -> Fruitville Pike -> Bent Creek in the other. |
| D-002 | Stonehenge replaces the legacy Reidenbaugh Road area. Use the persisted/runtime ID `stonehenge`; remove `reidenbaugh_road` after its references are migrated. |
| D-003 | Stonehenge, Reidenbaugh, Fruitville Pike, and Bent Creek unlock together when Reidenbaugh is unlocked through Catch Ryan. |
| D-004 | Bent Creek is fully explorable after unlock. Its staffed gate asks who Billy is visiting. Only `Schwartz` or `Votilla` is accepted. |
| D-005 | Gate answers are trimmed and compared case-insensitively, but no other spelling or fuzzy match is valid. Invalid copy is exactly: `I don’t think so, come back when you have someone real to visit`. |
| D-006 | Reidenbaugh is exterior-only. No school interior is in scope. |
| D-007 | Reidenbaugh must read primarily as a school campus: main building, bus/drop-off loop, parking, playground, courts, athletic fields, bike rack, and paved circulation. |
| D-008 | Billy may use the Fruitville Pike roadway, Bent Creek streets and sidewalks, Bent Creek golf-cart paths, school fields, and paved school paths. |
| D-009 | Houses, trees, fences, hedges, gates, water, school structures, playground equipment, parked vehicles, golf hazards, and all decorative/non-purposeful ground block movement. |
| D-010 | Playtest-revised normal bicycle travel time is 12-18 seconds from Milton departure to the Reidenbaugh entrance and 6-10 seconds from Fruitville's entrance to Bent Creek. The earlier 60-90 / 45-75 second draft required a bicycle slower than walking on the compact production plates. |
| D-011 | Creek Woods remains unchanged in size, art, geometry, quest behavior, and stable IDs. It is a regression target, not a conversion target. |
| D-012 | Broad place names and relationships may be recognizable, but addresses, exact lots, private details, and navigable real-property reconstruction remain prohibited. |
| D-013 | Backward compatibility with existing SaveData v6 saves is not required because there are no real user saves. Still bump the schema version and fail/reset old data intentionally rather than decoding it ambiguously. |
| D-014 | Preserve all local user changes listed in Section 2. |
| D-015 | Retain the existing HD illustrated, warm, fictionalized, top-down visual language. New assets must contain no baked-in characters, labels, prompts, or interaction markers. |

## 4. Canonical topology

```text
                           REIDENBAUGH ELEMENTARY
                                     ^
                                     |
                                STONEHENGE
                                     ^
                                     |
    BENT CREEK  <----  FRUITVILLE PIKE  <----  MILTON ESTATES
                                                    |
                                                    v
                                               CREEK WOODS
```

The diagram expresses route order, not literal east/west placement on every
camera. The fold-out must nevertheless be north-up and visually communicate the
same relationships without a direct Milton-to-Reidenbaugh or Milton-to-Bent
Creek shortcut.

Required reciprocal transition pairs:

| Source | Exit ID | Destination | Spawn ID |
| --- | --- | --- | --- |
| `neighborhood` | `exit_stonehenge` | `stonehenge` | `spawn_milton` |
| `stonehenge` | `exit_milton` | `neighborhood` | `spawn_stonehenge` |
| `stonehenge` | `exit_reidenbaugh` | `reidenbaugh` | `spawn_stonehenge` |
| `reidenbaugh` | `exit_stonehenge` | `stonehenge` | `spawn_reidenbaugh` |
| `neighborhood` | `exit_fruitville` | `fruitville_pike` | `spawn_milton` |
| `fruitville_pike` | `exit_milton` | `neighborhood` | `spawn_fruitville` |
| `fruitville_pike` | `exit_bent_creek` | `bent_creek` | `spawn_gate_exterior` |
| `bent_creek` | `exit_fruitville` | `fruitville_pike` | `spawn_bent_creek` |
| `neighborhood` | existing Creek exit | `creek` | existing Creek spawn |
| `creek` | existing Milton return | `neighborhood` | existing woods-return spawn |

Names may be adjusted before their first committed use if the Tiled authoring
requires clearer paired names. Once committed, treat them as stable.

## 5. Map scopes and provisional dimensions

Use a true finite orthogonal 32x32 grid for every expanded or new map. Choose
final tile counts by measured path length and composition, but start with these
budgets:

| Map ID | Working tile size | Working pixels | Required identity |
| --- | ---: | ---: | --- |
| `neighborhood` | 96x72 | 3072x2304 | Expanded Milton core, existing quest homes, Creek route, Stonehenge exit, Fruitville exit |
| `stonehenge` | 112x72 | 3584x2304 | Affluent neighborhood, large lots, curved roads, landscaping, readable through-route |
| `reidenbaugh` | 96x80 | 3072x2560 | 70-80% school/civic campus; residential scenery only at the distant edge |
| `fruitville_pike` | 112x48 | 3584x1536 | Main arterial road, wide roadway, shoulders/sidewalks, crosswalks, safe intentional traversal |
| `bent_creek` | 112x80 | 3584x2560 | Staffed gate, affluent streets, wooded buffers, clubhouse edge, golf-cart path network |
| `creek` | unchanged | 2048x1536 | Preserve existing runtime and quest behavior |

Dimensions are not success criteria by themselves. A smaller layout is valid if
timed travel, composition, and route readability pass. A larger empty layout is
not valid. Tune route length with meaningful curves, intersections, landmarks,
Ryan behavior, and campus/gate beats rather than featureless padding.

### Milton Estates

- Preserve the existing Andrew/Billy/Jeremy relationship and all Chapter 1
  quest behavior.
- Keep the established Creek Woods entrance and return leg intact.
- Expand the playable neighborhood beyond the current house row.
- Replace scenic/blocked Stonehenge and Fruitville points with physical exits.
- Keep houses, yards, vegetation, fences, sports fences, water, stones, and
  parked cars blocked except for authored drives, walks, and quest paths.
- Move mushrooms from persisted raw pixel coordinates toward stable authored
  spawn IDs before changing their geometry.

### Stonehenge

- It must feel wealthier than Milton: larger homes, deep setbacks, stone or
  brick entrance markers, mature landscaping, cleaner sidewalks/curbs, larger
  yards, and a more formal street plan.
- The critical route enters from Milton and exits toward Reidenbaugh; it may
  bend through several streets but must remain legible.
- Ryan waypoints must remain entirely inside bicycle-clear corridors.
- Lawns are not general shortcuts. Only marked sidewalks, streets, drives, and
  deliberate paths are walkable.

### Reidenbaugh Elementary

- The school must dominate the opening view and overall map area.
- Required exterior elements: main school building, recognizable front entry,
  bus/drop-off loop, staff/visitor parking, bike rack, fenced playground,
  basketball or hard court, athletic field, paved perimeter walks, and service
  side.
- Houses may appear only along a distant edge and must not determine the route
  structure.
- Walkable areas: paved paths, bus/drop loop or roadway where authored, fields,
  courts, and deliberate play-area routes.
- Block school walls, fences, equipment footprints, trees, vehicles, service
  areas, and decorative landscaping.
- Re-author the Ryan chase as campus loops rather than residential cul-de-sacs.

### Fruitville Pike

- It must read as a main road, not another subdivision street: wider pavement,
  center markings, shoulders, crossings, signs, and more open roadside scale.
- Billy may use the roadway. Author a clear safe route and do not add unavoidable
  vehicle hazards or fail states.
- Moving traffic is optional polish and must not precede reliable collision and
  navigation. Static or distant ambient vehicles are sufficient for the first
  complete implementation.
- The route must connect Milton to the Bent Creek gate with no direct bypass.

### Bent Creek

- It must feel distinct from Stonehenge: gated, wooded, planned, golf-oriented,
  with a gatehouse, entrance landscaping, affluent streets, clubhouse cues,
  and golf-course views.
- Walkable areas include streets, sidewalks, and authored golf-cart paths.
- Fairways are decorative/non-walkable unless a particular path crosses them.
  Greens, bunkers, water, maintenance areas, fences, hedges, and private yards
  are blocked.
- The player arrives outside the staffed gate. A valid visitor name opens entry
  for that interaction; invalid input leaves Billy outside and allows another
  attempt.

## 6. Bent Creek gate interaction contract

Required interaction sequence:

1. Billy approaches the exterior gatehouse interaction region.
2. The attendant asks: `Who are you here to visit?`
3. A focused text-entry modal opens. World movement and other interactions are
   captured until submission or cancellation.
4. Normalize by trimming surrounding whitespace and comparing lowercase text.
5. `Schwartz` or `Votilla` is valid. No abbreviation, fuzzy spelling, surname
   extension, or other household is valid.
6. On valid input, the attendant acknowledges Billy, opens the gate visually,
   disables the closed-gate collider, and activates/uses the transition into
   Bent Creek.
7. On invalid input, display exactly: `I don’t think so, come back when you have
   someone real to visit` and keep the gate closed.
8. Invalid attempts do not mutate quest progress, discovery, or unlock state.
9. Cancellation closes the modal, restores input, and makes no state change.
10. Re-entry may ask again; no permanent gate credential needs to be saved.

Implement this as a reusable typed text-entry request rather than hard-coding DOM
or keyboard listeners in `BentCreekScene`. The UI owns the modal and input
capture; the scene owns validation and gate state. Requirements:

- visible focus and typed text;
- Enter/confirm submits;
- Escape/back cancels;
- Backspace/delete editing;
- a short maximum length such as 24 characters;
- keyboard and pointer support;
- touch should invoke a usable on-screen keyboard if the current DOM/input
  architecture permits it;
- cleanup on scene shutdown, pause, or modal replacement;
- no keypress may leak through and immediately trigger a second world action.

## 7. Grid, rendering, and collision contract

### Coordinate rules

- Orthogonal, finite, north-up maps.
- Tile size: 32x32 pixels.
- Northwest origin `(0, 0)`; positive X east/right, positive Y south/down.
- Map pixel dimensions equal tile counts multiplied by 32.
- Transition rectangle edges and collision-cell edges align to the 32px grid.
- Points should use cell centers. Curved-road visual/object details may use an
  8px sub-grid when they do not define collision boundaries.
- Camera and physics bounds must exactly match the TMJ world dimensions.

### Artwork

- Runtime art must use native dimensions; never correct alignment with
  non-uniform `setDisplaySize` stretching.
- Large illustrated plates should be split into exact-position image chunks,
  normally no larger than 2048px per edge.
- Chunks must align to the world grid and cover the declared world without gaps
  or overlap seams.
- Use separate foreground chunks for canopies or objects Billy can pass behind.
- Foreground art never supplies collision implicitly.
- New cache keys follow the namespacing guidance in
  `docs/content-architecture.md`.

### Tiled layers

Expanded/new TMJs should use this common contract:

| Layer | Responsibility |
| --- | --- |
| `ground` / image chunks | Non-colliding illustrated ground and base scenery |
| `foreground` | Optional occluding art above actors |
| `collision-grid` | Hidden tile layer; filled cells are blocked, empty cells are legal travel |
| `solid-footprints` | Optional typed rectangles/polygons for fine blockers and gate state |
| `spawns` | Stable player/NPC spawn points |
| `transitions` | Rectangles with destination map and destination spawn properties |
| `interactions` | Gatehouse, NPC, landmark, and other interaction anchors |
| `navigation` | Ryan/NPC waypoint points or polylines |
| `qa-probes` | Representative legal/blocked test points; development-only |

The collision grid is the authoritative allow/deny boundary. Decorative art does
not become walkable merely because no object rectangle covers it. Use dynamic
fine blockers only when runtime state changes, such as opening the Bent Creek
gate.

### Clearance

- Main bicycle routes should normally provide at least 96px clear width.
- Narrow walking-only paths may be 64px where the walking body is proven safe.
- Bicycle turns, transition approaches, and spawn regions need enough clearance
  for the larger bicycle body and Arcade separation.
- Diagonal movement must not squeeze through blocked cell corners.

## 8. Runtime and content architecture changes

### Map domain

Target `MapId`:

```ts
type MapId =
  | "neighborhood"
  | "creek"
  | "stonehenge"
  | "reidenbaugh"
  | "fruitville_pike"
  | "bent_creek";
```

Remove `reidenbaugh_road` after updating every scene, route, menu, audio, store,
validator, test, and asset reference. Do not leave a hidden direct transition.

Split map definitions into per-map modules if needed to avoid one high-conflict
registry file. The central registry remains the sole composition point.

### Save and unlock behavior

- Bump SaveData to version 7.
- Existing v6 preservation is not required. Decode it explicitly as obsolete
  and initialize a valid v7 state, or provide a minimal reset migration; do not
  reinterpret `reidenbaugh_road` as another map accidentally.
- New games still begin with Milton and Creek available.
- Selecting/unlocking Reidenbaugh atomically unlocks `stonehenge`,
  `reidenbaugh`, `fruitville_pike`, and `bent_creek`.
- Discovery remains visit-based and separate from unlock state.
- `currentMap` must always be a valid unlocked MapId.
- Gate admission is transient and does not belong in SaveData.

### Catch Ryan

Replace the road stage with Stonehenge:

```ts
type RyanRideStage =
  | "invite"
  | "choose_destination"
  | "depart_neighborhood"
  | "ride_stonehenge"
  | "chase_reidenbaugh"
  | "complete";
```

The route is Milton departure -> Stonehenge ride -> Reidenbaugh campus chase.
Re-author route points and validate every segment against the collision grid.
Keep Ryan's wait/catch-up behavior and no-failure design. Add a Stonehenge
milestone only if it materially improves history; do not duplicate facts merely
because another map exists.

### Generic map mounting

Reduce the repeated scene setup by adding a shared map-mounting path that:

1. loads/resolves the map definition;
2. creates its TMJ runtime;
3. installs exact camera/physics bounds;
4. draws image/foreground chunks;
5. creates the hidden collision layer and Arcade collider;
6. selects a named spawn;
7. mounts authored transitions and common cleanup.

Map scenes should retain only map-specific actors, gate logic, quest bindings,
and special presentation.

### Loading strategy

The current BootScene eagerly loads every map and full plate. Do not multiply
that strategy across five large maps. Load shared/bootstrap assets at boot and
load map-local TMJ/art on demand before scene entry, with a transition/loading
state that cannot accept duplicate input.

## 9. Phased implementation plan

Statuses used in agent reports: `TODO`, `IN_PROGRESS`, `BLOCKED`,
`READY_FOR_INTEGRATION`, `DONE`.

### Phase 0: coordinator preflight

Owner: root Luna Max coordinator.

- Read this document completely.
- Inspect `git status` and preserve the six local user changes.
- Re-run or confirm `npm run check` at the synchronized baseline.
- Create a task/ownership ledger in the coordinator's working notes.
- Confirm no subagent will edit this handoff or shared hot files concurrently.

Exit gate: clean understanding of repository state and exclusive ownership.

### Phase 1: shared foundation

Run up to three Luna subagents in parallel with disjoint ownership:

1. Map runtime/validation agent
   - `src/world/tiledRuntime.ts`
   - new grid/topology validator and focused tests
   - collision tile mounting support
   - no scene/store edits
2. Domain/persistence agent
   - `src/game/types.ts`
   - `src/game/GameStore.ts`
   - persistence/invariant tests
   - MapId, v7, unlock set, Catch Ryan stage changes
3. Text-entry UI agent
   - typed request/events and UI implementation
   - focused modal/input tests
   - must inspect and preserve local `InputRouterScene.ts` and `style.css` changes;
     coordinator integrates any overlap

Coordinator owns `src/content/maps.ts`, scene abstraction, `src/main.ts`, and
cross-agent integration. Do not let multiple agents edit a central registry or
`BaseExplorationScene.ts` simultaneously.

Exit gate: a small test fixture or one converted map proves collision-grid,
transition, spawn, text-entry, and cleanup behavior.

### Phase 2: Milton conversion and expansion

This is the vertical slice for the new contract.

- Convert/enlarge Milton to the true grid without changing Chapter 1 outcomes.
- Preserve quest NPC and interaction identities.
- Re-author mushrooms through stable candidate IDs and repair test fixtures.
- Add Stonehenge and Fruitville exits, initially targeting test fixture scenes
  if destination maps are not ready.
- Verify art, collision, camera, walking, bicycle, save/reload, Creek transition,
  and all existing quests.

Exit gate: the complete current playthrough remains green and Billy cannot leave
legal Milton routes.

### Phase 3: parallel destination map production

After the map contract is frozen, use three Luna subagents:

1. Stonehenge package
   - TMJ, art chunks, foregrounds, collision, spawns, transitions, Ryan route,
     per-map tests
2. Reidenbaugh package
   - school-dominant TMJ/art, campus collision, chase loops, per-map tests
3. Fruitville Pike package
   - arterial-road TMJ/art, Milton/Bent transitions, route and collision tests

Each package owns a disjoint directory under `public/assets/chapters/chapter-01/maps/`
or the final asset scope selected by the coordinator. Agents should avoid shared
TypeScript; they deliver a manifest for coordinator registration.

Use the image-generation skill/tool for new illustrated raster assets when
available. The coordinator must visually inspect generated masters before they
become runtime assets. Generated art is a starting point, not authority for
collision or layout.

Exit gate: all three maps independently pass static geometry/reachability checks
and visual review.

### Phase 4: Bent Creek and gate

Use one map/art agent and one interaction QA agent while the coordinator handles
scene integration.

- Build gated entrance, guard station, affluent streets, clubhouse/golf cues,
  and golf-cart paths.
- Mount the text-entry contract from Section 6.
- Implement closed/open gate collider and visual state.
- Test both accepted surnames, case/whitespace normalization, every invalid
  response class, cancellation, retry, shutdown cleanup, and re-entry.

Exit gate: the gate cannot be bypassed physically or through input leakage, and
valid entry never leaves a stale collider or modal.

### Phase 5: quest, regional map, loading, and audio integration

- Complete the Catch Ryan Stonehenge route and Reidenbaugh campus chase.
- Update fold-out geography, discovery, exits, player area, and objectives.
- Add map-specific ambience selection without rewriting the audio system.
- Finalize on-demand map asset loading and transition feedback.
- Remove all legacy `reidenbaugh_road` code/assets only after `rg` proves no
  required reference remains and the asset audit accepts the new manifest.

Exit gate: both complete regional branches work forward/backward and after
reload, while existing quests and menus remain functional.

### Phase 6: hardening and independent QA

Use a fresh Luna QA subagent that did not author the shared runtime.

- Run all static validators and flood-fill checks.
- Run the full automated suite.
- Perform collision-overlay and wall-hugging tests.
- Time both travel routes on bicycle.
- Test keyboard, pointer, gamepad, and landscape touch where relevant.
- Capture QA evidence under `docs/assets/map-expansion/qa/`.
- Return production bugs to their owning agent; QA should not silently redesign
  the runtime while testing it.

Exit gate: Section 11 is satisfied with recorded evidence.

## 10. Agent coordination rules

Luna Max is appropriate for the coordinator and every implementation subagent.
No different reasoning model is required. Quality here depends more on strict
ownership and staged integration than on mixing models. The only specialized
capability is image generation for raster assets; invoke that tool/skill rather
than asking a coding model to synthesize binary images by hand.

Maximum useful concurrency is one coordinator plus three subagents.

Hot files with exactly one active owner:

- `docs/map-expansion-handoff.md`
- `src/game/types.ts`
- `src/game/GameStore.ts`
- `src/content/maps.ts` or its replacement central registry
- `src/world/tiledRuntime.ts`
- `src/scenes/BaseExplorationScene.ts`
- `src/scenes/MenuScene.ts`
- `src/scenes/UIScene.ts`
- `src/scenes/InputRouterScene.ts`
- `src/main.ts`
- `src/style.css`
- each individual TMJ and its master/foreground art

Every subagent task must specify:

- exact owned paths;
- prohibited paths;
- required interfaces supplied by the coordinator;
- tests to run;
- expected final report: files changed, decisions made, tests, remaining risks,
  and registry/handoff data the coordinator must apply.

Do not assign two agents the same map or central file. Subagents may spawn their
own agents only for read-only inspection or wholly disjoint asset/test work.

## 11. Acceptance matrix

### Static geometry and data

- Every expanded/new TMJ is finite, orthogonal, north-up, and 32x32.
- Map tile dimensions multiplied by 32 equal declared runtime dimensions.
- Art chunks use native declared dimensions and lie inside world bounds.
- Required layers exist exactly once.
- Stable authored names are unique within their required scope.
- Every spawn, transition, interaction, objective, mushroom, and waypoint is
  inside map bounds and on legal walkable space.
- Every reciprocal transition resolves to an existing destination spawn.
- No legal walkable cell overlaps a static solid footprint.
- Flood-fill proves all required anchors are reachable.
- Flood-fill proves map boundaries are unreachable except at explicit exits.
- Topology proves every Milton-to-Reidenbaugh path traverses Stonehenge.
- Topology proves every Milton-to-Bent-Creek path traverses Fruitville Pike.
- Ryan route sweeps remain inside bicycle-clear cells.
- No direct or legacy Reidenbaugh Road bypass exists.

### Runtime collision

- Walking and bicycle bodies stop at representative houses, trees, fences,
  hedges, gates, water, parked vehicles, school structures, playground
  equipment, bunkers, greens, and course hazards.
- Diagonal input cannot squeeze through corners.
- Streets, sidewalks, paved paths, fields, courts, and approved golf-cart paths
  remain traversable in both directions.
- Transitions fire once and land on safe, cleared spawns.
- Camera and physics bounds match each map exactly.
- Foreground canopies do not conceal critical collision edges or exits.

### Gate

- `Schwartz`, `schwartz`, and whitespace-padded equivalents pass.
- `Votilla`, `votilla`, and whitespace-padded equivalents pass.
- Empty, partial, misspelled, and unrelated answers fail with the exact approved
  line.
- The closed gate cannot be walked or ridden through.
- Invalid input does not mutate save state.
- Valid input opens/disables the blocker and enters Bent Creek reliably.
- Cancel, pause, shutdown, and retry release input capture correctly.

### Player flow

- Milton -> Stonehenge -> Reidenbaugh works during Catch Ryan and post-quest.
- Milton -> Fruitville Pike -> gate -> Bent Creek works after the Reidenbaugh
  unlock transaction.
- Both branches work in reverse.
- Normal bicycle traversal meets the approved 60-90s and 45-75s windows.
- Reidenbaugh reads as a school campus in its first camera frame.
- Stonehenge and Bent Creek read as different kinds of affluent neighborhoods.
- Fruitville Pike reads as a main road.
- Save/reload works immediately before and after every transition under v7.

### Regression and release

- Missing Controller remains completable.
- Creek Woods remains visually and behaviorally unchanged.
- Mushroom Hunt, Sports Day, Catch Ryan, replay isolation, pause/resume,
  controller pickup, Creek reload, menus, and fold-out map remain functional.
- Canvas E2E and WebGL smoke tests pass.
- Subpath asset loading and the asset audit pass.

Final command gate:

```sh
npm run test
npm run build
npm run test:e2e
npm run check:full
git diff --check
git status --short --branch
```

The Vite large-chunk warning is pre-existing. Do not treat it as introduced by
this work, but do not materially worsen startup memory by eager-loading every
new map.

## 12. Handoff/report template

The coordinator should maintain this information in working notes and fold final
facts back into this document at checkpoints:

```md
### Package: <name>

- Status: TODO | IN_PROGRESS | BLOCKED | READY_FOR_INTEGRATION | DONE
- Owner: <agent>
- Owned paths: <exact paths>
- Base commit: <sha>
- Dependencies: <package/interface IDs>
- Decisions: <D-IDs or new proposal>
- Files changed: <paths>
- Stable IDs added/changed: <IDs>
- Tests run: <commands and results>
- Visual evidence: <paths>
- Risks/blockers: <items>
- Coordinator actions: <registry changes, integration steps>
- Next pickup action: <one concrete action>
```

## 13. Immediate first actions

1. Create a coordinator plan with Phase 1 in progress.
2. Read the applicable Phaser tilemap, Arcade Physics, scenes, loading, camera,
   and input skills before editing those systems.
3. Inspect the six user-modified files and assign exclusive ownership.
4. Spawn three Phase 1 subagents with the exact boundaries from Section 9.
5. In parallel, have the coordinator define the per-map module interface,
   transition schema, and Milton vertical-slice integration plan.
6. Integrate Phase 1 only after each subagent returns focused green tests.
7. Do not generate final map art until the 32px contract and Milton proof are
   running.

## Appendix A: copy-paste implementation prompt

```text
You are the Luna Max coordinating implementation agent for the Milton Estates
regional map expansion in /Users/bolb/Documents/milton-estates-game.

Your authoritative specification is:
  docs/map-expansion-handoff.md

Read that file completely before taking action, then read:
  docs/content-architecture.md
  README.md
and all applicable SKILL.md files for Phaser tilemaps, Arcade Physics, scenes,
asset loading, cameras, scaling, and input before editing those areas.

Implement the entire handoff through its final acceptance gate. You may use up
to three Luna subagents concurrently. Use Luna Max for the coordinator and Luna
subagents throughout; no model swap is required. Use the image-generation
skill/tool for raster map assets when needed.

Non-negotiable repository safety:
- Start by running git status --short --branch.
- Preserve the existing user modifications in README.md, index.html,
  k8s/ingress.yaml, scripts/deploy.sh, src/scenes/InputRouterScene.ts, and
  src/style.css.
- Do not restore, overwrite, stash, commit, or reformat those user changes.
- The synchronized baseline is main/origin-main commit 6839bef and npm run check
  passed with 105 tests.
- Do not push, publish, deploy, or create a PR unless explicitly asked.

Coordination requirements:
- Keep docs/map-expansion-handoff.md coordinator-owned. Subagents report to you;
  they do not edit it concurrently.
- Give every subagent exact owned and prohibited paths, required interfaces,
  tests, and report format.
- Never let two agents edit a hot file or the same TMJ/art package concurrently.
- Use one coordinator plus at most three subagents.
- Work phase by phase. Integrate and test each wave before starting dependents.
- Preserve Creek Woods as-is and keep existing quests/replay behavior green.

Begin with Phase 0 and Phase 1. Use three disjoint subagents for:
1) tiled runtime/collision-grid/validators,
2) MapId-v7-unlock-Catch Ryan persistence changes, and
3) reusable text-entry UI/input capture for the Bent Creek gate.
The coordinator owns map registry structure, shared scene mounting, main scene
registration, conflict resolution, and the handoff.

Continue autonomously through Milton expansion; Stonehenge, Reidenbaugh school,
Fruitville Pike, and Bent Creek map packages; the staffed gate; quest and
regional-map integration; independent QA; and every acceptance criterion in the
handoff. Do not stop at scaffolding or placeholders while safe in-scope work
remains. If a genuine product decision is missing, record the exact blocker and
ask one concise question; otherwise follow the approved decisions in the
handoff.

At every checkpoint report:
- outcome first;
- files changed;
- tests and visual verification;
- handoff/status updates;
- remaining risks and next phase.

Completion requires npm run check:full, git diff --check, the static map and
topology validators, rendered collision/traversal coverage, the two timed route
targets, and a final review that all original user changes remain preserved.
```
