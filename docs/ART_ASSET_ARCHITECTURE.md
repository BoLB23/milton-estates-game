# Art asset architecture

The generated source sheets stay under `public/assets/art/`. Run `npm run process:art` to reproduce the cropped runtime PNGs; all crop coordinates are versioned in `scripts/process-game-art.mjs`.

Runtime NPCs live in `assets/characters/npcs`. Billy, Andrew, Jeremy, Ryan, Mickey, and Schwartz use a 12-frame contract: down (0–2), left (3–5), right (6–8), up (9–11), with `id-idle-direction` and `id-walk-direction` animation names. `CharacterFactory.createNpc()` is the scene-level entry point and owns origin, depth, scale, and idle animation selection. Schwartz uses a smaller visual scale so his tall artwork does not enlarge his gameplay footprint.

The player avatar is composited from deterministic crops in `assets/characters/player/`: `body`, `hair-*`, `shirt`, `pants`, and `shoes`. `PlayerAvatar` is the shared renderer used by both gameplay (single Arcade body + synchronized layers) and the front-end profile preview. Player profile fields (`haircut`, `hairColor`, `tshirtColor`, `pantsColor`, `shoeColor`) stay unchanged; presentation resolves aliases/defaults without reading Billy art.

Vehicle art is registered in `VehicleAssets`; Mickey's sedan currently exposes directional textures (`mickey-car-down`, `-left`, `-right`, `-up`) and existing vehicle mechanics remain unchanged. Creek Clubhouse presentation uses the `clubhouse-frame`, `clubhouse-halfBuilt`, `clubhouse-complete`, and `clubhouse-flag` state assets while `CreekClubhouseController` retains the construction state machine.

To add an NPC, add a normalized sheet crop, register it in `CharacterAssets`, register its animations in `BootScene`, then use `CharacterFactory.createNpc()`. To add a player hairstyle, add a source crop to the processing manifest and register the runtime layer alongside the player asset catalog. Keep all visible player layers on the same 3×4 frame grid; only the gameplay anchor owns an Arcade body.
