# Next Feature Specification: Ryan's Ride (Reidenbaugh First)

Status: implementation-ready plan  
Decision date: 2026-07-18  
Target stack: Phaser 4.2.1, TypeScript, Vite  
Primary release gate: `npm run check:full`

## 1. Outcome

Implement Quest 4, **Catch Ryan**, as one complete vertical slice built on the existing quest, save, map, scene, input, and scrapbook systems.

After the canonical completion of Three-Player Sports Day, Catch Ryan becomes active automatically. Ryan appears in Milton Estates, invites Billy on a bike ride, and lets the player choose a destination. In this release:

- Reidenbaugh is selectable and fully playable.
- Bent Creek is visible in the destination choice but disabled as **Coming later**.
- Choosing Reidenbaugh permanently unlocks the Reidenbaugh road and destination maps.
- Billy automatically mounts a bicycle and follows Ryan through three legs: Milton Estates departure, Reidenbaugh Road, and a destination chase.
- Ryan waits when the player falls behind, and the chase cannot fail or soft-lock.
- Touching Ryan's catch zone finishes the quest.
- Reidenbaugh remains freely accessible afterward.
- Catch Ryan's completed quest card is the scrapbook reward.
- Reidenbaugh-specific follow-up gameplay, including **The Shortcut**, is deferred.

This is an expansion of the current game, not a replacement quest engine or a seamless-world rewrite.

## 2. Product decisions

These decisions are fixed for this release:

| Topic | Decision |
|---|---|
| Destination scope | Reidenbaugh is implemented end to end. Bent Creek is a disabled Coming Later choice. |
| Quest activation | Catch Ryan activates automatically after canonical Quest 3 completion. The player does not start it from the journal first. |
| Declining | Not right now makes no progression change. Ryan remains interactable at the invitation stage. |
| Follow-up content | The ride unlocks Reidenbaugh for later content. Quest 5A/5B are not playable and are not added as implemented quests. |
| Catch action | An Arcade overlap/catch zone completes the chase. A separate precision button press is not required. |
| Bicycle directions | Four-direction presentation for the first release, with left/right sharing a mirrored side animation. |
| Bicycle complexity | Acceleration, deceleration, higher speed, and speed-sensitive steering only. No stamina, tricks, crashes, damage, or vehicle combat. |
| Route navigation | Hand-authored waypoint routes. No unrestricted pathfinding. |
| Save behavior | Reload resumes at a safe start/checkpoint for the current scene and quest leg, not at Ryan's exact sub-waypoint. |
| Bell and particles | Optional polish after the core acceptance suite is green; neither blocks release. |

## 3. Current architecture to preserve

Implementation must extend these existing boundaries rather than bypassing them:

- `src/game/types.ts` owns stable persisted IDs and quest-specific stage unions.
- `src/game/quests/specs.ts` owns deterministic stage rules, objectives, and milestones.
- `src/game/GameStore.ts` owns versioned LocalStorage decoding, migration, normalization, replay isolation, and autosave.
- `src/game/persistence/questState.ts` owns cross-field quest/save invariants.
- `src/content/maps.ts` is the canonical map/art/Tiled/marker registry.
- `src/world/tiledRuntime.ts` resolves stable gameplay objects from Tiled object layers.
- `src/scenes/BaseExplorationScene.ts` owns the playable actor, collision, shared movement, proximity interactions, and HUD location events.
- `src/world/*QuestController.ts` owns transient quest actors and interactions; scenes own map/lifecycle setup.
- `src/scenes/InputRouterScene.ts` and `src/input/actions.ts` are the only cross-device input boundary.
- `src/scenes/UIScene.ts` owns dialogue, objective, toast, hint, and modal input capture.
- `src/scenes/MenuScene.ts` renders the in-game quest journal and regional fold-out map.
- Scene keys equal `MapId` values, which lets MenuScene pause/resume the current world by persisted map ID.
- Existing stable IDs, Quest 1-3 behavior, save migrations, replay isolation, neighborhood/creek transitions, and rendered regressions must remain green.

Do not put quest coordinates directly in scene logic. New route points, transitions, bike racks, and spawn points belong in Tiled object layers and typed route content.

## 4. Scope

### 4.1 In scope

- Catch Ryan quest definition, progression, objectives, milestones, journal card, and canonical automatic activation.
- Save version 6 with a complete version 5 migration.
- Persisted selected destination and deterministic route seed.
- Explicit map access/unlock state, separate from map visitation/discovery.
- A reusable bicycle locomotion mode for Billy.
- Ryan's invitation, accept/decline choice, disabled Bent Creek choice, and callout presentation.
- Ryan's three behavior modes: sprint, cruise, and tease/wait.
- A waypoint-authored neighborhood departure route.
- A separate Reidenbaugh Road scene.
- A separate Reidenbaugh destination scene with several safe chase loops.
- Map transitions and safe reload entry points for every quest leg.
- Reidenbaugh reveal on the regional fold-out and permanent post-quest access.
- Ryan's completion and normal post-quest dialogue.
- Four-direction bicycle presentation for Billy and Ryan.
- Focused unit, content, integration, browser, and manual playtest coverage.

### 4.2 Explicitly out of scope

- Playable Bent Creek route or destination.
- Quest 5A: The Shortcut, Quest 5B: Golf Ball Hunt, or another follow-up quest runtime.
- A generic branching narrative engine.
- Seamless travel across one giant map.
- Freeform pathfinding or navigation meshes.
- Bicycle stamina, tricks, crashes, damage, traffic hazards, combat, or failure states.
- Indoor Reidenbaugh locations.
- Exact private geography, addresses, parcel boundaries, or photorealistic real-world reconstruction.
- Eight-direction bicycle art unless it is supplied without delaying the four-direction release.

## 5. Player flow and acceptance behavior

### 5.1 Automatic handoff from Quest 3

1. The player completes Three-Player Sports Day in the canonical playthrough.
2. The store records Quest 3 complete and activates Catch Ryan in one logical persisted transaction.
3. Quest 3's completion feedback still appears even though the active quest is already Catch Ryan. UI/audio must detect newly completed quest IDs rather than relying only on `questStage === "complete"`.
4. Ryan appears at the authored `ryan_invite` location in Milton Estates and calls out with a lightweight world bubble or label.
5. Completing a replay of Quest 3 must not activate Catch Ryan or mutate canonical unlocks.

### 5.2 Invitation

1. The initial objective is: **Talk to Ryan near his house.**
2. Ryan asks, “Hey, want to go for a bike ride?”
3. The modal choices are:
   - **Yes**
   - **Not right now**
4. Not right now closes the interaction without changing the quest stage or save. Ryan stays in place and can be asked again.
5. Yes advances to destination selection and autosaves.

### 5.3 Destination selection

Ryan asks, “Where should we go?” The modal shows:

- **Reidenbaugh** — enabled.
- **Bent Creek — Coming later** — visible but disabled and never persisted.
- **Back** — returns to the invitation state without selecting or unlocking a destination.

Selecting Reidenbaugh atomically:

- saves `selectedDestination: "reidenbaugh"`;
- creates a deterministic route seed;
- unlocks `reidenbaugh_road` and `reidenbaugh`;
- advances the stage to neighborhood departure;
- reveals Reidenbaugh on the fold-out map;
- displays a scrapbook-style map reveal;
- plays Ryan's “Catch me if you can!” dialogue;
- mounts Billy automatically when the dialogue closes.

The destination cannot be changed after selection in this release. Restarting the mission or replaying the completed quest resets the replay/run selection as appropriate.

### 5.4 Neighborhood departure

- Billy starts mounted near `bike_mount_milton`.
- A concise controls note explains that the bike accelerates, moves faster, and turns more gradually than walking.
- Ryan follows the authored `ryan_depart_*` waypoints toward `reidenbaugh_exit`.
- There are no hazards or failure conditions.
- Ryan cruises and waits often enough to teach the handling safely.
- If the player is far behind, Ryan stops at a wait-safe waypoint and calls back.
- Reaching the exit advances the quest and current map before starting Reidenbaugh Road.

### 5.5 Reidenbaugh Road

- The road is a lightweight transition scene, not a seamless extension of Milton Estates.
- It contains readable side streets, sidewalks/crosswalks, fences/trees, parked cars, modest hills, grass shortcuts, and at least two wait-safe intersections.
- Ryan uses authored `road_route_*` waypoints and contextual callouts.
- Ryan never exits the scene while the player is outside the catch-up threshold.
- The final trigger advances the quest to the destination chase and starts the Reidenbaugh scene at its ride entrance.

### 5.6 Reidenbaugh chase

- The objective becomes: **Find and catch Ryan in Reidenbaugh.**
- Ryan chooses between at least three validated waypoint loops using the persisted route seed.
- Loops reconnect, avoid dead ends, and include turns/pauses that allow interception.
- Ryan speeds up when Billy is directly behind, but slows or waits if Billy is far away.
- Touching Ryan's catch zone stops both bicycles and disables further catch callbacks immediately.
- Ryan says, “Okay, okay! You caught me.”
- Completion records the quest, unlocks bicycle access, reveals the completed scrapbook card, and leaves Reidenbaugh unlocked.
- Ryan remounts as a normal post-quest NPC with a short Reidenbaugh-specific line.

### 5.7 Post-quest access

- Milton Estates' Reidenbaugh exit remains active.
- Reidenbaugh Road and Reidenbaugh can be revisited.
- Bicycle access is derived from Catch Ryan completion; no duplicate persisted `bicycleUnlocked` boolean is required.
- Post-quest mount/dismount is available only at authored bike racks/transition points.
- The follow-up adventure is teased only through ambient dialogue or a journal note. No Quest 5 stage, objective, or playable interaction is introduced.

## 6. Stable domain model

Names below are the planned stable persisted IDs. Change them only before implementation begins; never rename them after a save containing them can ship.

### 6.1 IDs and stages

```ts
export type MapId =
  | "neighborhood"
  | "creek"
  | "reidenbaugh_road"
  | "reidenbaugh";

export type QuestId =
  // existing IDs...
  | "catch_ryan";

export type ImplementedQuestId =
  // existing IDs...
  | "catch_ryan";

export type RideDestination = "reidenbaugh";

export type RyanRideStage =
  | "invite"
  | "choose_destination"
  | "depart_neighborhood"
  | "ride_reidenbaugh_road"
  | "chase_reidenbaugh"
  | "complete";

export interface RyanRideQuestState {
  stage: RyanRideStage;
  selectedDestination: RideDestination | null;
  routeSeed: number | null;
}
```

Add `ryanRide: RyanRideQuestState` to `QuestProgress`. Extend `QuestStage`, `StageForQuest`, stage validation, objective lookup, milestone projection, and replay initialization in the same domain checkpoint.

### 6.2 Quest events

Use a deterministic pure transition function with this event vocabulary:

```ts
export type RyanRideQuestEvent =
  | { type: "accepted_ride" }
  | { type: "selected_destination"; destination: "reidenbaugh" }
  | { type: "departed_neighborhood" }
  | { type: "reached_reidenbaugh" }
  | { type: "caught_ryan" };
```

| Current stage | Event | Next stage | Required side effect |
|---|---|---|---|
| `invite` | `accepted_ride` | `choose_destination` | Autosave; no map unlock yet. |
| `invite` | decline | `invite` | No state mutation. |
| `choose_destination` | Back | `invite` | Clear no data because none was selected. |
| `choose_destination` | `selected_destination(reidenbaugh)` | `depart_neighborhood` | Save destination/seed and unlock both new maps atomically. |
| `depart_neighborhood` | `departed_neighborhood` | `ride_reidenbaugh_road` | Set `currentMap` to `reidenbaugh_road` atomically. |
| `ride_reidenbaugh_road` | `reached_reidenbaugh` | `chase_reidenbaugh` | Set `currentMap` to `reidenbaugh` atomically. |
| `chase_reidenbaugh` | `caught_ryan` | `complete` | Record quest completion exactly once. |
| `complete` | any ride event | `complete` | No-op. |

Do not persist separate copies of facts that are already authoritative:

- `quest3Completed` is derived from `completedQuestIds`.
- `ryanUnlocked` is derived from Quest 3 completion/active Catch Ryan.
- `ryanRideAccepted` is derived from the ride stage.
- `bicycleUnlocked` is derived from Catch Ryan completion.
- `ryanRideCompleted` is derived from the ride stage and completed quest IDs.
- `reidenbaughUnlocked` is selected through the general `unlockedMaps` collection.

### 6.3 Milestones and objective copy

Add stable semantic milestones:

```ts
"catch_ryan.started"
"catch_ryan.destination_selected"
"catch_ryan.neighborhood_departed"
"catch_ryan.reidenbaugh_reached"
"catch_ryan.ryan_caught"
```

Objectives:

| Stage | Objective |
|---|---|
| `invite` | Talk to Ryan near his house. |
| `choose_destination` | Choose where to ride with Ryan. |
| `depart_neighborhood` | Follow Ryan to the Reidenbaugh exit. |
| `ride_reidenbaugh_road` | Keep up with Ryan on the road to Reidenbaugh. |
| `chase_reidenbaugh` | Find and catch Ryan in Reidenbaugh. |
| `complete` | Ryan's ride complete! Reidenbaugh is open to explore. |

The quest registry entry should be an implemented optional side memory with `three_player_sports` as its prerequisite. This preserves the current finale's required-quest logic and avoids making a required quest depend on an optional one.

## 7. Save version 6 and invariants

### 7.1 Save shape

Increase `SaveData.version` from 5 to 6 and add:

```ts
unlockedMaps: MapId[];
questProgress: {
  // existing progress...
  ryanRide: RyanRideQuestState;
};
```

`discoveredMaps` continues to mean visited/discovered. `unlockedMaps` means legally accessible. They must not be conflated:

- New games begin with `neighborhood` and `creek` unlocked.
- Selecting Reidenbaugh unlocks both `reidenbaugh_road` and `reidenbaugh` immediately.
- Entering a map adds it to `discoveredMaps` as today.
- A map may be unlocked but not yet discovered.
- `setCurrentMap` must reject an inaccessible map unless a narrowly scoped migration/repair path is running.

### 7.2 Version 5 migration

The v5-to-v6 migration must:

1. Preserve every existing field, stable item ID, quest completion, mushroom spawn, history record, setting, timestamp, and current map.
2. Add `ryanRide` at `{ stage: "invite", selectedDestination: null, routeSeed: null }`.
3. Set `unlockedMaps` to the unique union of `neighborhood`, `creek`, `currentMap`, and existing `discoveredMaps`.
4. If the canonical save has Three-Player Sports complete and still has `three_player_sports` active, set the active quest to `catch_ryan` so returning players see Ryan automatically.
5. Do not steal focus from another valid active quest merely because Sports Day is complete.
6. Persist the migrated v6 save after successful decode, following the existing migration pattern.

### 7.3 Required invariants

Reject or normalize saves according to these rules:

- `selectedDestination` and `routeSeed` are both null in `invite` and may be null in `choose_destination`.
- From `depart_neighborhood` onward, destination must be `reidenbaugh` and route seed must be finite.
- If Reidenbaugh is selected, both new maps must be in `unlockedMaps`; this is recoverable by adding them.
- If Catch Ryan is in `completedQuestIds`, its stage must be `complete`.
- If the ride stage is `complete`, Catch Ryan must be added to `completedQuestIds` during normalization.
- `currentMap` must be in `unlockedMaps`.
- Ride history cannot be ahead of authoritative ride progress.
- Duplicate map IDs, quest IDs, milestones, or unlock IDs are normalized to stable order.
- Bent Creek must never appear as a selected destination in v6.

### 7.4 Replay rules

- Completed Catch Ryan offers Replay because all implemented quests currently do.
- Replay initializes Catch Ryan at `invite`, clears the replay destination/seed, and starts in Milton Estates.
- Replay unlocks and map changes remain inside `replayState`; they never overwrite canonical save bytes.
- Replaying Quest 3 does not auto-activate Catch Ryan.
- Refreshing during a replay returns to the canonical save, matching existing behavior.

## 8. Choice modal contract

The existing dialogue request supports only linear lines. Add a focused, reusable choice modal rather than encoding choices as fake dialogue.

Recommended contract:

```ts
export interface ChoiceOption {
  id: string;
  label: string;
  enabled?: boolean;
  disabledReason?: string;
}

export interface ChoiceRequest {
  speaker: string;
  prompt: string;
  options: ChoiceOption[];
  onSelect: (optionId: string) => void;
  onCancel?: () => void;
}
```

Add typed `choice` and `choiceCancelled` application events. UIScene owns the modal, focus, text scaling, input capture, and cleanup.

Choice behavior requirements:

- Pointer, keyboard, standard gamepad, and existing touch controls can select enabled choices.
- Up/down changes choice focus; interact confirms; back invokes the explicit cancel behavior.
- Disabled options remain visible, cannot receive activation, and expose their reason in text.
- Opening a choice captures input using a distinct owner such as `choice`.
- Dialogue and choice panels are mutually exclusive.
- The key press that closes dialogue must not also activate the newly opened choice.
- Scene shutdown/cancel releases capture and restores movement.
- Large text and reduced motion settings apply.
- Decline/back never leaves `BaseExplorationScene.inputLocked` stuck.

Extend the exploration host with a narrow `showChoice` surface. Do not let quest controllers reach into UIScene directly.

## 9. Map and scene topology

```text
Milton Estates (neighborhood)
  └─ reidenbaugh_exit
       ↓
Reidenbaugh Road (reidenbaugh_road)
  └─ reidenbaugh_arrival
       ↓
Reidenbaugh (reidenbaugh)
```

### 9.1 Scene registration

Add:

- `ReidenbaughRoadScene` with key `reidenbaugh_road`.
- `ReidenbaughScene` with key `reidenbaugh`.

Register both in `src/main.ts`. Add both definitions to `MAP_DEFINITIONS`; BootScene will load them through the existing registry loop.

### 9.2 Tiled object rules

All maps retain:

- `stable-gameplay-objects`
- `collision-rects`

Points are used for spawns and waypoints. Rectangles are used for transitions, bike racks, and broad trigger zones. Extend `TiledRuntimeWorld` with a named rectangle accessor so new interaction regions use authored width/height instead of duplicating them in TypeScript.

Required additions to Milton Estates:

- `ryan_invite`
- `bike_mount_milton`
- `reidenbaugh_exit`
- `ryan_depart_00` through the final authored departure waypoint
- one or more explicit wait-safe departure waypoints

Keep `blocked_reidenbaugh` as the pre-unlock scenic/interaction ID if existing tests or copy use it. Once unlocked, the active transition overlays/replaces its interaction; do not rename the legacy ID.

Required Reidenbaugh Road objects:

- `spawn_milton`
- `spawn_reidenbaugh`
- `return_milton`
- `enter_reidenbaugh`
- `road_route_00...NN`
- at least two wait-safe intersection waypoints
- any authored callout/landmark anchors used by route content

Required Reidenbaugh objects:

- `spawn_road`
- `return_road`
- `bike_rack_reidenbaugh`
- `ryan_finish`
- at least three loop families, for example `chase_a_00...NN`, `chase_b_00...NN`, and `chase_c_00...NN`
- post-quest Ryan NPC point

Exact waypoint counts are an art/level-design decision, but every consecutive segment must be line-of-sight safe and wide enough for the bicycle body.

### 9.3 Typed route content

Create a Phaser-independent route definition module that lists waypoint IDs in intentional order and provides behavior metadata:

```ts
interface RyanWaypointSpec {
  objectId: string;
  mode: "sprint" | "cruise" | "tease";
  waitSafe?: boolean;
  callout?: string;
}

interface RyanRouteSpec {
  id: string;
  map: MapId;
  waypoints: readonly RyanWaypointSpec[];
  farDistance: number;
  resumeDistance: number;
}
```

Route validation must fail fast when:

- a route is empty or has fewer than two points;
- a waypoint ID is missing from its map definition/TMJ;
- the catch-up threshold is not greater than the resume threshold;
- a destination loop cannot reconnect;
- duplicate loop IDs or waypoint IDs would make selection ambiguous.

### 9.4 Map art direction

The existing regional fold-out already depicts Reidenbaugh northeast of Milton Estates. Preserve that broad placement.

Reidenbaugh Road should read as a compressed childhood route, approximately 25-40 seconds long for an average first ride. Reidenbaugh should combine residential exploration with a recognizable school/park edge, cul-de-sacs, friends' houses, small hidden connectors, and enough loop topology to support interception.

Suggested runtime assets:

- `public/assets/maps/reidenbaugh-road-master-v1.png`
- `public/assets/maps/reidenbaugh-road.tmj`
- `public/assets/maps/reidenbaugh-master-v1.png`
- `public/assets/maps/reidenbaugh.tmj`
- optional foreground canopy plates where Billy/Ryan pass behind trees

Masters must not bake in Ryan, Billy, labels, objective stars, or catch markers. Runtime actors and UI remain separate.

## 10. Bicycle locomotion

Extract shared locomotion from the direct velocity assignment in BaseExplorationScene. The scene should select a travel mode, while a small controller owns velocity calculations.

### 10.1 Travel modes

```ts
type PlayerTravelMode = "walking" | "bicycle";
```

Walking must preserve the current 190 px/s feel and current animation behavior. Bicycle mode adds:

- smooth acceleration toward target speed;
- smooth braking/deceleration when input is released;
- a higher top speed;
- a speed-sensitive maximum turn rate;
- no instant 180-degree reversal at top speed;
- no acceleration while input/dialogue/menu lock is active;
- a clamped delta so tab resume cannot cause a large simulation jump.

Recommended initial tuning values, subject to playtest:

| Parameter | Starting value |
|---|---:|
| Walking speed | 190 px/s |
| Bike max speed | 330 px/s |
| Bike acceleration | 420 px/s² |
| Bike braking | 600 px/s² |
| Bike coasting drag | 260 px/s² |
| Bike low-speed turn rate | 300°/s |
| Bike high-speed turn rate | 145°/s |
| Maximum update delta | 50 ms |

The implementation should calculate a target heading from normalized input, rotate the current heading toward it at the allowed rate, then apply scalar speed along that heading. Arcade Physics remains responsible for body collision and overlap; do not introduce Matter physics.

### 10.2 Presentation

Required animation keys:

- `billy-bike-idle-down`, `billy-bike-ride-down`
- `billy-bike-idle-side`, `billy-bike-ride-side`
- `billy-bike-idle-up`, `billy-bike-ride-up`
- matching Ryan bicycle keys

Left-facing presentation mirrors the side frames. Global animations are created once in BootScene. Check for existing keys before creating if test/restart paths can invoke registration twice.

Bike and walking bodies may use different sizes/offsets. Switching mode must update the Arcade body immediately and reset velocity. Post-quest mount/dismount is allowed only in authored bike-rack regions; it is disabled during the active ride.

### 10.3 Optional polish

Only after core ride tests pass:

- Add semantic `bikeBell` input and audio cue with keyboard/gamepad/touch coverage.
- Add low-cost dust/grass particles off-road, disabled under reduced motion.

Do not add either feature if it destabilizes input focus, touch layout, audio unlock, or performance.

## 11. Ryan route controller

Implement Ryan's movement as a reusable route follower with a small pure decision core and a Phaser adapter.

### 11.1 States

- **Sprint**: Ryan creates playful distance for a bounded interval.
- **Cruise**: Ryan moves near Billy's practical top speed.
- **Tease**: Ryan slows, circles a route feature, or pauses at a safe waypoint.
- **Waiting**: an override entered when Billy is too far behind.
- **Stopped**: transition/caught state; velocity and callbacks are disabled.

### 11.2 Catch-up rules

Initial tuning targets:

- Enter waiting only at a `waitSafe` waypoint when player distance exceeds roughly 420-500 px.
- Resume when distance falls below roughly 220-280 px.
- While waiting, Ryan faces Billy, emits one throttled callout, and does not repeatedly spam dialogue/toasts.
- Ryan cannot cross a map exit until Billy is within the resume threshold.
- Waiting has no timeout or quest failure.

### 11.3 Destination chase rules

- Choose a starting loop deterministically from `routeSeed`.
- Do not choose the same loop twice in a row when alternatives exist.
- Switch loops only at authored connector points.
- Increase speed modestly when Billy is directly behind and close.
- Reduce speed or wait when Billy is far away.
- Never teleport Ryan during visible gameplay.
- On catch, atomically latch `caught = true`, stop movement, remove/disable overlap, and advance the quest once.

Inject RNG/route choice into the pure core so unit tests are deterministic. Phaser timers and sprites belong only in the adapter/controller.

## 12. Dialogue and presentation content

Add typed Catch Ryan dialogue in `src/content/dialogue.ts` or a focused `src/content/ryanRideDialogue.ts` module if the original file becomes unwieldy.

Minimum authored content:

- invitation and decline response;
- destination prompt;
- Bent Creek Coming Later explanation;
- Reidenbaugh confirmation;
- “Catch me if you can!” departure line;
- at least four route callouts selected without immediate repetition;
- caught dialogue;
- normal post-quest Reidenbaugh dialogue;
- locked Reidenbaugh route dialogue before selection;
- a short future-adventure tease with no objective change.

Callouts should use lightweight world text/toasts and must never pause the chase. Full dialogue panels are reserved for invitation, selection lead-in, departure, and completion.

The map reveal should look like a scrapbook sticker/arrow reveal rather than a generic region-unlocked toast. It must honor reduced motion and large text.

## 13. Scene behavior and reload recovery

Every scene must derive its safe setup from persisted quest state, not only transient scene data.

| Persisted state | Reload behavior |
|---|---|
| `invite`, neighborhood | Billy spawns at the normal home spawn; Ryan waits at `ryan_invite`. |
| `choose_destination`, neighborhood | Ryan waits; interacting reopens the destination choice. |
| `depart_neighborhood`, neighborhood | Billy and Ryan respawn at their ride-start positions, mounted; departure restarts safely. |
| `ride_reidenbaugh_road`, road | Billy and Ryan respawn at `spawn_milton`; the road leg restarts safely. |
| `chase_reidenbaugh`, Reidenbaugh | Billy respawns at `spawn_road`; Ryan starts the deterministic chase from its seeded entry loop. |
| `complete`, any unlocked map | Normal exploration setup; Ryan uses post-quest dialogue and bike racks are active. |

Scene transitions must be idempotent. Re-entering a transition callback or receiving an overlap for two consecutive physics frames must not advance twice, launch two scenes, or corrupt the active map.

MenuScene must be able to pause/resume both new scene keys. Dialogue/choice capture, menu capture, and scene shutdown must never leave stale owners in `inputCapture`.

## 14. Implementation work packages for subagents

The coordinator should assign packages by ID. A subagent owns only the listed files unless the coordinator explicitly expands scope. Agents must not commit unrelated existing worktree changes.

### RR-00 — Baseline and contract lock

Owner: integration coordinator  
Dependencies: none  
Parallel: no

Tasks:

1. Record `git status --short --branch` without cleaning unrelated changes.
2. Run `npm run test` and `npm run build`; record any pre-existing failures.
3. Confirm the stable names in Sections 6 and 9 before code begins.
4. Create a short shared handoff note listing exact file ownership for active agents.

Done when the baseline is known and no two active agents own the same file.

### RR-01 — Quest domain, save v6, and replay

Owner files:

- `src/game/types.ts`
- `src/game/quests/specs.ts`
- `src/game/persistence/questState.ts`
- `src/game/GameStore.ts`
- `src/content/quest.ts`
- `src/content/chapters.ts`
- corresponding unit tests in `src/game/` and `src/content/`

Dependencies: RR-00  
Parallel: may run beside RR-03 and RR-04

Deliverables:

- All stable types, stages, events, milestones, objectives, and registry metadata.
- `unlockedMaps` and save v6.
- Complete v5 migration and invalid-save coverage.
- Atomic destination selection/unlock store action.
- Atomic ride stage/map checkpoint actions.
- Canonical Sports Day completion handoff to Catch Ryan.
- Replay initialization and isolation for Catch Ryan.
- Primitive selectors such as `isMapUnlocked`, `isBicycleUnlocked`, and ride-stage checks.

Required tests:

- Every valid and invalid ride transition.
- Decline causes no store write/state change.
- Destination selection persists destination, seed, and both unlocks.
- v5 migration preserves all old state.
- migrated Sports-complete save activates Catch Ryan only under the stated condition.
- corrupted selected destination/seed/unlocks normalize or reject correctly.
- Catch Ryan replay never changes canonical serialized storage.
- Quest 3 replay never activates Catch Ryan.

Handoff: provide the new state shape, public store methods, and exact migration fixtures to downstream agents.

### RR-02 — Choice modal and modal input safety

Owner files:

- `src/game/events.ts`
- `src/scenes/UIScene.ts`
- focused UI/event tests; add a new presentation module if useful

Dependencies: RR-01 type contract  
Parallel: may run beside RR-05

Deliverables:

- Typed choice request/cancel events.
- Scrapbook-styled accessible choice panel.
- Enabled/disabled option handling.
- Pointer, keyboard, gamepad, and touch-action compatibility through semantic input.
- Correct input capture, large text, reduced motion, and shutdown cleanup.
- Completion feedback based on newly completed quest IDs so Quest 3 still celebrates during automatic Quest 4 activation.

Required tests:

- Disabled Bent Creek cannot activate.
- Back/cancel releases input capture.
- The dialogue-closing press cannot confirm the first choice.
- Menu open/close preserves an active choice.
- Large text fits all invitation/destination options.
- Destroy/shutdown leaves no modal capture owner.

Handoff: expose only the typed event contract; world controllers must not access UIScene internals.

### RR-03 — Bicycle locomotion core

Owner files:

- new `src/world/PlayerLocomotionController.ts` or equivalent
- new focused unit test file

Dependencies: RR-00  
Parallel: yes

Deliverables:

- Pure walking/bicycle velocity and heading calculations.
- Delta clamping, acceleration, braking, coasting, speed cap, and turn-rate behavior.
- Mode switch/reset API.
- No direct BaseExplorationScene edit in this package.

Required tests:

- Walking output matches existing normalized 190 px/s movement.
- Bicycle reaches but never exceeds max speed.
- Releasing input decelerates smoothly.
- High-speed reversal turns over time rather than flipping instantly.
- Input lock brakes/stops safely.
- A very large delta is clamped.
- Results are frame-rate tolerant across representative 30/60/120 fps update sequences.

Handoff: document the update method, tunables, and expected sprite/body integration.

### RR-04 — Ryan route decision core

Owner files:

- new `src/world/ryanRide/` route decision modules
- new pure unit tests

Dependencies: RR-00  
Parallel: yes

Deliverables:

- Sprint/cruise/tease/waiting/stopped state machine.
- Distance hysteresis using far/resume thresholds.
- Seeded destination loop selection with no immediate repeat.
- One-shot catch latch.
- No Phaser Scene or sprite ownership yet.

Required tests:

- Ryan waits only at safe points.
- Ryan remains waiting while the player is beyond the resume threshold.
- Callouts are throttled.
- Exit cannot trigger while the player is far behind.
- Same seed produces the same loop order.
- Catch can complete only once.

Handoff: provide a small adapter-facing API and deterministic fixtures.

### RR-05 — Reidenbaugh maps, route content, and assets

Owner files:

- `src/content/maps.ts`
- new typed Ryan route content module and tests
- `public/assets/maps/reidenbaugh-road*`
- `public/assets/maps/reidenbaugh*`
- Milton Estates TMJ additions only after coordinating ownership of that file
- map/content validation tests

Dependencies: RR-01 MapId contract  
Parallel: may run beside RR-02

Deliverables:

- Both map definitions and regional fold-out bounds.
- Two illustrated master plates and any foreground layers.
- Stable object layers, collision rectangles, spawns, transitions, bike racks, and route points.
- Milton Estates Ryan/exit/departure points.
- Three validated destination loops.
- Asset audit compliance and no baked-in actors/labels.

Required tests:

- Map definition dimensions/layers/paths are valid.
- Every `authoredObjectId` exists exactly once.
- Every route waypoint resolves.
- Collision rectangles are positive.
- Route/destination asset URLs respect Vite base paths.
- Regional projection places Reidenbaugh in the northeast portion of the fold-out.

Handoff: include screenshots of both plates with waypoint/collision debug overlays and a list of deliberate grass shortcuts.

### RR-06 — Shared exploration integration

Owner files:

- `src/scenes/BaseExplorationScene.ts`
- `src/world/contracts.ts`
- `src/world/tiledRuntime.ts`
- focused tests for Tiled rectangle access/integration

Dependencies: RR-02, RR-03, RR-05  
Parallel: no other agent may edit BaseExplorationScene

Deliverables:

- Locomotion controller integration with walking as regression-safe default.
- Travel-mode switching and bicycle body/animation presentation hooks.
- `showChoice` host surface with correct lock lifetime.
- Named Tiled rectangle accessor.
- A protected/current player position surface needed by route adapters without exposing the full scene.
- Existing mushroom, proximity, F4, dialogue, location event, and cleanup behavior preserved.

Required tests/checks:

- Existing direct movement behavior remains unchanged while walking.
- Choice cancel and scene shutdown restore movement.
- Named transition rectangles use authored dimensions.
- Menu pause produces no movement/acceleration.
- Scene restart clears mode/controller references.

Handoff: document subclass hooks for `update(time, delta)`, travel mode, and route-host access.

### RR-07 — Ryan invitation and Milton departure

Owner files:

- `src/world/NeighborhoodQuestController.ts`
- `src/scenes/NeighborhoodScene.ts`
- Catch Ryan dialogue content
- a new focused Ryan neighborhood presentation/controller module if needed

Dependencies: RR-01, RR-02, RR-04, RR-05, RR-06  
Parallel: may run beside RR-08 only if file ownership remains disjoint

Deliverables:

- Ryan spawn/callout only after Quest 3 canonical completion/Catch Ryan activation.
- Invitation choices and decline retry.
- Destination choice with disabled Bent Creek.
- Map reveal and departure dialogue.
- Automatic mount and Ryan Phaser route adapter for the neighborhood leg.
- Locked/unlocked Reidenbaugh exit behavior.
- Transition latch and persisted road checkpoint.
- F4 target coverage for every neighborhood ride stage.

Required tests/manual checks:

- Ryan never appears early.
- Declining repeatedly never blocks acceptance.
- Bent Creek cannot alter save state.
- Reload at invitation, choice, and departure stages is safe.
- Ryan waits if Billy does not move.
- Existing blocked routes, three prior quests, woods entrance, and mushrooms still work.

### RR-08 — Reidenbaugh Road scene

Owner files:

- new `src/scenes/ReidenbaughRoadScene.ts`
- new road quest/route controller module and focused tests

Dependencies: RR-01, RR-04, RR-05, RR-06  
Parallel: yes, with RR-07 and RR-09 if shared registration files are reserved for the coordinator

Deliverables:

- Road map/layers/collision/spawn setup.
- Mounted Billy and Ryan route adapter.
- Sprint/cruise/tease/wait/callout behavior.
- Safe arrival transition that cannot fire while Billy is far behind.
- Reload-safe restart at `spawn_milton`.
- Post-quest traversal behavior in both directions.
- F4 target for the next route checkpoint/arrival.

Required tests/manual checks:

- Ryan cannot leave Billy behind across the scene boundary.
- Repeated arrival overlap starts Reidenbaugh once.
- Reload starts a valid route leg.
- Return travel after quest completion works.
- All route lines avoid collisions at bicycle width.

### RR-09 — Reidenbaugh chase and completion

Owner files:

- new `src/scenes/ReidenbaughScene.ts`
- new destination chase controller/presentation modules and tests

Dependencies: RR-01, RR-04, RR-05, RR-06  
Parallel: yes, with RR-07 and RR-08

Deliverables:

- Reidenbaugh map/layers/collision/spawn setup.
- Seeded loop chase with safe connector changes.
- Arcade catch overlap with a one-shot latch.
- Stop/dialogue/completion flow.
- Post-quest Ryan NPC and bike rack behavior.
- Free return route after completion.
- Reload-safe deterministic chase restart.
- F4 target for Ryan during the chase.

Required tests/manual checks:

- Each loop is catchable without collision clipping.
- Ryan slows/waits when Billy is far away.
- Touching Ryan completes once even across several overlap frames.
- Quest completion persists, unlocks bicycle access, and survives reload.
- Ryan no longer runs chase AI after completion.

### RR-10 — Registration, map reveal, audio, and reward presentation

Owner files:

- `src/main.ts`
- `src/scenes/BootScene.ts`
- `src/scenes/MenuScene.ts`
- `src/audio/AudioManager.ts`
- character/bicycle runtime assets and related tests

Dependencies: RR-02, RR-05, RR-07, RR-08, RR-09  
Parallel: no; integration checkpoint

Deliverables:

- Register both new scenes.
- Load Ryan/Billy bicycle assets and create global animations once.
- Show locked, newly unlocked, current, and discovered Reidenbaugh states on the fold-out.
- Add scrapbook reveal presentation and completed quest card behavior.
- Add Ryan/bicycle-relevant semantic audio cues without creating another AudioContext.
- Ensure MenuScene pauses/resumes both new current-map scene keys.
- Update help copy only for controls that actually ship.

Required tests:

- `deriveAudioCues` detects Quest 3 completion during automatic Quest 4 activation.
- Map cover/reveal selectors distinguish unlocked from discovered.
- New assets pass `npm run check:assets` and `npm run check:exports`.
- Completed Catch Ryan journal action offers isolated Replay.

### RR-11 — Browser regression and hardening

Owner files:

- `tests/e2e/full-playthrough.spec.ts` or a dedicated `tests/e2e/ryans-ride.spec.ts`
- test helpers only; production fixes return to the owning package/coordinator

Dependencies: RR-10  
Parallel: no

Automated scenarios:

1. Complete Quest 3, verify Catch Ryan auto-activates, decline, then accept.
2. Verify Bent Creek is disabled and save remains unchanged.
3. Select Reidenbaugh, reload before departure, and resume mounted.
4. Fall behind in Milton Estates and verify Ryan waits.
5. Enter the road, reload, finish the route, and reach Reidenbaugh.
6. Fall behind on the road and verify Ryan cannot transition alone.
7. Catch Ryan by overlap and verify exact-once completion.
8. Reload after completion and freely traverse Reidenbaugh/road/neighborhood.
9. Replay Catch Ryan and prove canonical LocalStorage remains byte-for-byte unchanged.
10. Run the existing controller, mushroom, sports, pause/dialogue, creek reload, replay, portrait, Canvas, and WebGL smoke coverage.

Manual playtests:

- Keyboard direct route.
- Standard gamepad, including choice focus and chase catch.
- Landscape touch, including destination choice and menu pause.
- Large text and reduced motion.
- Intentional no-input fall-behind in every ride leg.
- Attempt every map exit before unlock, during the ride, and after completion.
- Save/reload at every stage listed in Section 13.

Final commands:

```sh
npm run test
npm run build
npm run test:e2e
npm run check:full
git diff --check
git status --short --branch
```

## 15. Recommended execution waves

Use the waves below to reduce merge conflicts. With three small implementation agents plus one coordinator, this keeps productive work parallel without sharing files.

| Wave | Parallel packages | Merge gate |
|---|---|---|
| 0 | RR-00 | Stable IDs and baseline locked. |
| 1 | RR-01, RR-03, RR-04 | Domain tests, locomotion tests, and Ryan decision tests green. |
| 2 | RR-02, RR-05 | Choice UI and map/content validation green. |
| 3 | RR-06 | Shared BaseExplorationScene integration green; prior quests manually smoke-tested. |
| 4 | RR-07, RR-08, RR-09 | Each scene leg works independently with persisted fixtures. |
| 5 | RR-10 | End-to-end assets, scene registration, map UI, audio, and rewards integrated. |
| 6 | RR-11 | Full suite and all manual gates green. |

The coordinator owns cross-package merge fixes. Do not ask two agents to edit any of these hot files simultaneously:

- `src/game/types.ts`
- `src/game/GameStore.ts`
- `src/content/maps.ts`
- `src/scenes/BaseExplorationScene.ts`
- `src/scenes/UIScene.ts`
- `src/scenes/MenuScene.ts`
- `src/main.ts`
- either existing TMJ file

## 16. Integration checkpoints

### Checkpoint A — persisted invitation

- v5 migration works.
- Quest 3 canonical completion activates Catch Ryan.
- Ryan appears and decline/retry works.
- No new map scene is required yet.

### Checkpoint B — bicycle playground

- Reidenbaugh selection persists and reveals the map.
- Billy mounts and rides safely in Milton Estates.
- Walking regressions remain green.

### Checkpoint C — road vertical slice

- Neighborhood departure and Reidenbaugh Road work end to end.
- Ryan wait behavior prevents loss and exit races.
- Reload in either scene is safe.

### Checkpoint D — destination completion

- Reidenbaugh chase is catchable and deterministic enough to test.
- Completion, free access, post-quest Ryan, and bicycle racks work.

### Checkpoint E — release candidate

- Full regressions, replay isolation, all devices, map reveal, reward, audio, and asset audits pass.
- Updated screenshots document invitation, neighborhood ride, road, chase, fold-out reveal, and completed journal card.

## 17. Definition of done

The feature is complete only when all statements below are true:

- Ryan appears only after canonical Quest 3 completion.
- Catch Ryan activates automatically without journal selection.
- Quest 3 completion feedback is still visible/audible.
- Declining leaves Ryan available indefinitely.
- Bent Creek is visible as Coming Later and cannot alter persisted state.
- Choosing Reidenbaugh permanently unlocks the road and destination.
- Destination, route seed, quest stage, unlocked maps, and current map survive reload.
- Billy mounts automatically and the bicycle clearly accelerates, moves faster, and turns more gradually than walking.
- Walking movement remains unchanged outside bicycle mode.
- Ryan traverses Milton Estates and Reidenbaugh Road through authored waypoints.
- Ryan waits safely whenever the player falls too far behind.
- Ryan cannot transition to the next map without the player.
- Reidenbaugh uses at least three validated chase loops and cannot soft-lock Ryan.
- Touching Ryan's catch zone completes the quest exactly once.
- Completion persists and grants bicycle access derived from quest completion.
- Reidenbaugh remains freely accessible after completion.
- Ryan becomes a normal post-quest destination NPC.
- The completed Catch Ryan card functions as the scrapbook reward.
- No playable follow-up quest is accidentally exposed.
- Catch Ryan replay is isolated from canonical LocalStorage.
- All previous quests, saves, maps, menus, input modes, audio behavior, Canvas regressions, and WebGL smoke tests remain green.
- `npm run check:full` and `git diff --check` pass.

## 18. Risk register and guardrails

| Risk | Guardrail |
|---|---|
| Automatic activation hides Quest 3 completion | Detect completion by completed-ID delta and test the exact transaction. |
| Save schema rejects old players | Implement v5 migration first and use existing authoritative-progress patterns. |
| Redundant flags drift apart | Derive unlock/completion facts where possible; persist only ride progress and general map access. |
| Parallel agents collide in core files | Follow package ownership and execution waves exactly. |
| Ryan exits while Billy is behind | Gate exit at a wait-safe waypoint using distance hysteresis and a transition latch. |
| Chase becomes impossible | Use authored loops, wait/tease windows, catch overlap, and no failure timer. |
| Bicycle clips illustrated scenery | Validate every segment with the bicycle body and preserve generous route widths. |
| Reload depends on transient scene data | Reconstruct each leg from stage, current map, destination, and seed. |
| Choice input double-fires | Keep dialogue/choice mutually exclusive and cover the closing-press case. |
| Menu pauses wrong scene | Keep scene keys identical to the expanded MapId union and test both new maps. |
| Replay leaks unlocks | Route every store mutation through replay-aware GameStore methods and compare canonical bytes. |
| Art scope doubles | Ship Reidenbaugh only; keep Bent Creek disabled and asset-free. |
| Optional polish delays core | Bell and particles begin only after the full core ride is green. |

## 19. Subagent handoff template

Use this wrapper when assigning any package:

```text
Implement package RR-XX from docs/archive/next-feature-ryans-ride-spec.md.

Read the package, its dependency sections, and the stable contracts in Sections 6-13 before editing. Own only the listed files. Preserve unrelated dirty-worktree changes and do not rename persisted IDs. Run the package's focused tests plus npm run typecheck. Report:

1. files changed;
2. public interfaces added/changed;
3. tests run and results;
4. assumptions or deviations;
5. exact integration notes for the next package.

Do not expand into Bent Creek, Quest 5, pathfinding, or bicycle tricks.
```

The coordinator should reject a handoff that changes an unowned hot file without prior agreement, lacks focused tests, or introduces a second source of truth for ride progression.
