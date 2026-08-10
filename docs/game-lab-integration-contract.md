# Game Lab integration contract

Milton Estates retains its existing browser-local save model. `GameStore` owns
the versioned LocalStorage save and the Game Lab client must never read, write,
replace, or migrate that save. Platform identity and sessions are optional
telemetry around play; gameplay continues if Game Lab is unavailable.

## Platform configuration

The platform client is configured with `VITE_GAME_PLATFORM_API_BASE_URL`.
Its development fallback is `http://localhost:8001/api/v1`; a production build
falls back to `https://games.bolblab.org/api/v1`. Hosting should set that same
production value explicitly. Authentication is the SDK's browser
credentialed-cookie flow only. Milton does not accept, persist, or forward
platform tokens.

The repository uses the released `@bolb23/game-client-sdk@0.1.0` package from
GitHub Packages. `.npmrc` reads `NODE_AUTH_TOKEN` without storing a token in
the repository; CI and the production image build must provide that read-only
package credential. For active SDK development, temporarily replace the
version with the documented sibling `file:../../game-lab/packages/game-client-sdk`
dependency and restore the released package before committing. Do not copy SDK
source or add an absolute path. The isolated integration composition root creates the client with
`createGamePlatformClient({ apiBaseUrl })`, maps SDK `userId` to the adapter's
`id`, and retains SDK session handles only inside the adapter facade.

The platform catalog must register `milton-estates` as playable with cloud
saves and leaderboard support enabled before the deployed game can use those
SDK endpoints. The corresponding leaderboard definitions must exist for the
keys below; the game remains playable if the platform is unavailable, but
submissions will otherwise be rejected by the platform.

## Leaderboards

Completed runs submit through the platform adapter, then display the top three
times belonging to other players. All boards rank lower times first and keep
each player's best time.

| Key | Event | Valid range |
| --- | --- | --- |
| `milton-estates.mushroom-hunt.fastest-completion-ms` | Mushroom Hunt acceptance through final handoff to Andrew | positive integer milliseconds |
| `milton-estates.chase-ryan.fastest-catch-ms` | Ryan begins the Reidenbaugh chase through the successful catch | positive integer milliseconds |
| `milton-estates.mickey-drag-race.fastest-win-ms` | A winning Mickey race | integer 1–60,000 milliseconds |
| `milton-estates.bad-trip.longest-survival-ms` | A completed Don Rossi survival run | positive integer milliseconds, inverse-encoded for ascending rank |

Mickey's local save record remains separate from the submitted board: only a
winning race run is submitted. Platform failures are absorbed at the adapter
boundary and never interrupt local gameplay.
