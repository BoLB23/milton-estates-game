# First Area Map Plan

## Purpose and scope

This plan defines the graybox geography for Billy's first mission. It translates the remembered character of the neighborhood into a compact, readable play space rather than reproducing real parcels. Street names and broad relationships may be recognizable, but lot shapes, spacing, house details, and all addresses are fictionalized.

The first area uses two connected, finite, orthogonal Tiled maps:

1. `wheatfield_neighborhood.tmx` — homes, Wheatfield Drive, the creek edge, and the trail entrance.
2. `creek_woods.tmx` — the creek-side search loop and the mission objective.

This split keeps the neighborhood legible and inexpensive to iterate while allowing the woods to feel larger than the residential block.

## Coordinate and orientation convention

- Orthogonal grid, 32 x 32 pixel tiles.
- Tile coordinates begin at `(0, 0)` in the northwest (top-left).
- Positive X points east (right); positive Y points south (down).
- North is always the top of the map. Do not rotate north between maps.
- Positions in design notes are tile coordinates unless suffixed with `px`.
- All rectangular object coordinates use the object's northwest corner.
- Map edges remain blocked unless an explicit transition object says otherwise.

## Map 1: Wheatfield neighborhood

### Graybox dimensions

- Working size: 80 x 56 tiles (2560 x 1792 px).
- Wheatfield Drive runs generally east-west across the northern half, with a gentle visual bend made from stepped orthogonal tiles.
- Fruitville Pike is represented only as a blocked scenic road continuing south; it is not a traversable real-world junction.
- The creek enters behind Billy's house and continues north, roughly parallel to Wheatfield Drive.

### Layout

```text
                                  N
                                  ^
        [Bent Creek scenic]       |             [Reidenbaugh scenic, NE]
                 <---- blocked ---+--- blocked / / / / / / / / / / --->

   ~ ~ ~ ~ ~ creek continues north ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
   ~                         trees / visual screen                         ~
   ~                                                                     ~
   ~        ORANGE              regular              GREEN        RED    ~
   ~        Andrew               neighbor              Billy      Jeremy ~
   ~       [house]               [house]              [house]     [house]~
   ~          v                     v                    v           v     ~
   ~      front yard           front yard           front yard  front yd ~
   ~========================= WHEATFIELD DRIVE ==========================~
   ~          ^                                          ^               ~
   ~          |                                          |               ~
   ~   first house in sequence                    third house in sequence~
   ~                                                                     ~
   ~                 trail entry gap                                    ~
   ~             (between Andrew-side neighbor and Billy)                ~
   ~                       |                                             ~
   ~                       +---- path bends behind Billy ----+            ~
   ~                                                        |            ~
   ~                                            creek entry + ~ ~ ~      ~
   ~                                                       ~             ~
   ~                   lawns / fictional back-lot shapes  ~              ~
   ~                                                                    ~
   +---------------- scenic road south: Fruitville Pike ----------------+
                                X blocked
                                |
                         [Stonehenge east ->] (sign/scenic blocker)
```

The three colored homes are ordered west-to-east along Wheatfield Drive: Andrew (orange) first, Billy (green) second, and Jeremy (red) third. A normal, non-mission neighbor sits between Andrew and Billy. All homes face Wheatfield Drive; the triangle points in the source sketch are treated as house-facing direction, not building footprint.

The trail begins in the side-yard gap between Billy and the ordinary neighbor on Andrew's side. It bends behind Billy's fictionalized lot, meets the creek, and leads to the woods transition.

### Suggested landmark placement

Exact coordinates may shift during graybox tuning; keep landmark IDs stable.

| Stable ID | Approx. tile position | Purpose |
| --- | ---: | --- |
| `home_andrew` | `(18, 18)` | Orange-coded mission landmark; first house west-to-east. |
| `home_neighbor_west` | `(31, 18)` | Establishes the required ordinary neighbor and creates the trail-entry gap. |
| `home_billy` | `(43, 18)` | Green-coded player start/home; creek passes behind its fictional lot. |
| `home_jeremy` | `(58, 18)` | Red-coded mission landmark; third house west-to-east. |
| `road_wheatfield` | `(8, 27)` to `(70, 32)` | Main orientation spine and safe introductory traversal. |
| `trail_entry_billy_west` | `(39, 22)` | Gap between Billy and the neighbor toward Andrew. |
| `creek_neighborhood` | `(47, 8)` to `(50, 43)` | Enters behind Billy, then runs north parallel to the street. |
| `woods_gate` | `(47, 9)` | Transition into the creek-woods map after the trail approach. |
| `sign_bent_creek` | `(5, 28)` | Westward scenic reference and boundary feedback. |
| `sign_stonehenge` | `(73, 31)` | Eastward scenic reference and boundary feedback. |
| `sign_reidenbaugh` | `(68, 7)` | Northeast scenic reference and boundary feedback. |
| `sign_fruitville` | `(39, 51)` | Southward scenic reference and boundary feedback. |

Color belongs to navigation/UI accents and authored metadata, not permanently recolored house art. Use `landmark_color = "orange"`, `"green"`, or `"red"` so art can be replaced without changing mission logic.

## Map 2: Creek woods

### Graybox dimensions

- Working size: 64 x 64 tiles (2048 x 2048 px).
- The primary creek runs south-to-north through the central third of the map.
- A loop trail crosses the creek twice and provides a short outward path plus a distinct return route.
- Dense vegetation and shallow banks form readable boundaries; invisible walls are a last resort.

### Layout

```text
                                  N
                                  ^
                dense trees / blocked scenic continuation
        +---------------------------------------------------+
        |  fallen log landmark          ~ ~ ~ creek ~ ~ ~   |
        |          +--------------------bridge B----+        |
        |          |                                |        |
        |          |      search pocket             |        |
        |          |       [X controller]            |        |
        |          |                                |        |
        |       west loop       ~ ~ ~ ~ ~       east loop    |
        |          |            ~       ~           |        |
        |          +--------- bridge A -------------+        |
        |                         |                           |
        |                   creek-side trail                  |
        |                         |                           |
        |                 [return to neighborhood]            |
        +---------------------------------------------------+
                dense trees / blocked Fruitville direction
```

### Suggested landmark placement

| Stable ID | Approx. tile position | Purpose |
| --- | ---: | --- |
| `spawn_from_neighborhood` | `(31, 57)` | Arrival and return transition. |
| `creek_main` | `(29, 3)` to `(35, 61)` | Consistent north-south environmental spine. |
| `crossing_bridge_a` | `(31, 40)` | First safe crossing and tutorial landmark. |
| `crossing_bridge_b` | `(31, 15)` | Completes the loop and changes the return silhouette. |
| `landmark_fallen_log` | `(17, 12)` | Memorable orientation cue visible near the north loop. |
| `search_controller` | `(22, 25)` | Xbox controller quest target in a small search pocket. |
| `loop_rejoin` | `(31, 49)` | Rejoins the entrance trail without backtracking exactly. |

## First mission traversal and quest beats

1. Billy starts near his green-coded home. The camera framing shows Wheatfield Drive and at least one neighboring colored landmark.
2. Jeremy, outside his red-coded home, reports his missing Xbox controller and says he suspects Andrew.
3. Billy walks past the ordinary neighbor to Andrew's orange-coded home. Andrew gives a teasing clue that points back toward the yards and creek.
4. Small inspectable clues around the three homes reinforce the route without requiring pixel hunting.
5. Scenic exits communicate the larger world—Bent Creek west, Stonehenge east, Reidenbaugh northeast, and Fruitville Pike south—but remain closed in this mission.
6. The actionable route is the gap between Billy's house and the neighbor toward Andrew.
7. The side-yard trail bends behind Billy's house, reveals the creek, and transitions into `creek_woods.tmx`.
8. The player follows the creek-side trail, uses bridge A, and searches the tall-grass pocket near the fallen-log region.
9. Interacting with the Xbox controller updates the objective to return it to Jeremy.
10. The loop continues over bridge B and rejoins the entrance route, offering new scenery without a long retrace.
11. Billy returns through the transition and gives the controller to Jeremy outside Jeremy's home. A final exchange among Billy, Jeremy, and Andrew completes the mission.

The controller should be visible only after the player enters the search pocket or receives a strong environmental cue; it should not be hidden by pixel hunting.

## Transitions and blockers

### Active transitions

- `to_creek_woods`: neighborhood trail endpoint to `creek_woods.tmx` at `spawn_from_neighborhood`.
- `to_wheatfield_neighborhood`: woods entrance to `wheatfield_neighborhood.tmx` at `woods_gate_return`.

Transitions use authored destination IDs, never raw filenames or tile coordinates in gameplay code. A map-loading registry resolves IDs to files and spawn objects.

### Mission blockers

- West toward Bent Creek: road work barricade plus sign; keep distant greenery visible.
- East toward Stonehenge: temporary neighborhood event barrier or readable construction fence.
- Northeast toward Reidenbaugh: tree line and a distant directional sign; no false traversable opening.
- South toward Fruitville Pike: traffic/safety barrier at the scenic road approach.
- Creek north beyond the playable woods: dense brush, deeper water, and fallen limbs.

Each blocker should explain itself visually and expose a `blocked_reason` property for optional feedback. Do not use arbitrary invisible collision across an apparently open route.

## Tiled layer contract

Both maps use the same ordered layer names and responsibilities. New maps should follow this contract so rendering, collision, navigation, and mission systems remain generic.

### Tile layers (back to front)

| Layer | Contract |
| --- | --- |
| `ground_base` | Required. Base grass, soil, asphalt, or water bed; no transparency holes. |
| `ground_detail` | Optional non-colliding markings, lawn variation, path edges, and shallow-water detail. |
| `structures` | Buildings, bridges, fences, curbs, and large authored features. Visual tiles do not define collision implicitly. |
| `vegetation_low` | Ground plants and low scenery drawn below actors. |
| `vegetation_high` | Tree canopies and foreground scenery drawn above actors where supported. |
| `debug_region_colors` | Development-only landmark tinting; hidden in release builds. |

### Object layers

| Layer | Object types and responsibility |
| --- | --- |
| `collision` | Polygons/rectangles of type `solid`, `water`, or `soft_blocker`. One authoritative collision source. |
| `transitions` | Rectangles of type `map_transition`, each with destination properties. |
| `spawns` | Points of type `player_spawn` or `npc_spawn`; stable IDs are referenced by missions. |
| `interactions` | Objects of type `interactable`, including the controller and inspectable landmarks. |
| `quest_regions` | Rectangles/polygons of type `quest_trigger`; mission progression references their IDs. |
| `navigation` | Points/polylines of type `nav_anchor` or `patrol_path`; optional for the first graybox. |
| `camera` | Rectangles of type `camera_bounds` or `camera_focus`; no quest logic. |
| `audio` | Regions/points of type `ambient_zone` or `audio_emitter`. |
| `scenic_labels` | Points of type `world_hint` for Bent Creek, Stonehenge, Reidenbaugh, and Fruitville Pike feedback. |

Do not encode gameplay behavior in layer ordering, tile GIDs, tile palette position, or object display color.

## Stable object properties

All gameplay-relevant Tiled objects have a unique, stable string `id` property in addition to Tiled's internal numeric object ID. The string ID survives re-export and object reordering.

### Common properties

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Unique stable identifier, lower snake case. |
| `enabled` | bool | no | Defaults to `true`; permits data-driven mission variants. |
| `tags` | string | no | Comma-separated discovery tags; never used as the sole quest identity. |

### `map_transition`

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `destination_map` | string | yes | Registry ID such as `creek_woods`, not a path. |
| `destination_spawn` | string | yes | Stable spawn ID in the destination map. |
| `required_flag` | string | no | Mission flag gating entry. Empty means always available. |
| `facing_on_arrival` | string | no | One of `north`, `east`, `south`, `west`. |

### `quest_trigger` and `interactable`

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `quest_event` | string | yes | Semantic event such as `entered_woods` or `found_controller`. |
| `interaction_prompt` | string | for interactables | Localization key, not display prose. |
| `once` | bool | no | Defaults to `false`; mission state owns persistence. |
| `landmark_color` | string | no | Navigation accent: `orange`, `green`, or `red`. |

### Blockers and scenic hints

| Property | Type | Required | Meaning |
| --- | --- | --- | --- |
| `blocked_reason` | string | for `soft_blocker` | Localization key explaining the closed route. |
| `destination_hint` | string | for `world_hint` | Stable place key such as `bent_creek`. |
| `unlock_flag` | string | no | Future mission flag that can remove or replace a blocker. |

Validate exported maps in CI or a preflight script: required layers exist, stable IDs are unique, transition destinations resolve, and gameplay objects contain their required typed properties.

## Tileset boundaries

- Prefer small thematic tilesets (`terrain`, `roads`, `buildings`, `vegetation`, `props`) over one unbounded atlas.
- Collision is authored in the `collision` object layer, not embedded inconsistently across tilesets.
- Decorative variants may change freely; mission objects and stable IDs must not depend on a particular tile.
- Reserve tile animation for visual effects. Animation completion must not advance quests.
- Keep source tileset files external (`.tsx`) and shared by both maps.

## Explicit assumptions to verify in playtesting

- The map is an evocative fictionalization, not a navigable reproduction of real homes or parcel boundaries; no house numbers are included.
- Andrew, Billy, and Jeremy's houses face Wheatfield Drive and appear in the confirmed west-to-east order: orange, green, red, with an ordinary neighbor between Andrew and Billy.
- "Toward Andrew" means the trail-entry gap is on Billy's west/Andrew-facing side.
- The creek's playable neighborhood segment is placed behind Billy and runs north approximately parallel to Wheatfield Drive; exact hydrology is intentionally altered.
- The initial target is a desktop-browser demo with keyboard controls. The data and input boundary should permit later gamepad support, but map scope does not depend on it.
- "Xbox controller" remains the explicit mission item. Any later public distribution should review trademark presentation and avoid copied branded art.
- Colored house labels are navigation metadata and graybox accents, not a requirement that final houses be literally painted those colors.
- Scenic directions communicate a larger world but are not traversable during this mission.
- Suggested dimensions and coordinates are starting points. Change them after movement-speed and camera-scale playtests without renaming stable object IDs.
