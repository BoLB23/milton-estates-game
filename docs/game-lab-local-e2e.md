# Game Lab local E2E verification

This guide verifies the optional Game Lab integration without changing Milton's
local save data. Do not clear browser storage during the check.

Milton consumes the released `@bolb23/game-client-sdk@0.1.0` package from
GitHub Packages. For local SDK development, use the sibling-repository
workflow in the Game Lab SDK documentation, then restore the released package
before committing. CI and the production image build need `NODE_AUTH_TOKEN`
with package-read access; no token belongs in the repository.

## Setup

1. Start the Game Lab catalog at `http://localhost:6183` and API at
   `http://localhost:8001/api/v1`.
2. Start Milton on `http://localhost:5183`. The checked-in Vite default remains
   port 5173, so use the project's supported port override, for example:
   `PORT=5183 ./scripts/serve.sh`.
3. In the same browser profile, sign in through the Game Lab catalog at
   `http://localhost:6183`. Do not copy cookies or tokens into Milton.
4. Open `http://localhost:5183/games/milton-estates/` and retain the browser's
   existing Milton LocalStorage entry as a before/after comparison point.

## Verify the connected flow

1. Open Milton and wait for the non-blocking platform identity lookup.
   Confirm the shared player identity is shown where the game exposes its
   platform status. There must be no separate Milton sign-in form.
2. Use **Continue**, **New Game**, or an available quest start to enter an
   actual playable map. Confirm exactly one Game Lab session for
   `milton-estates` starts after play begins—not while on the title or
   scrapbook pages.
3. Leave the game active for about 45 seconds and inspect Game Lab/API session
   activity. Confirm the active session receives one heartbeat around that
   interval and does not create a second session.
4. Return to the title/menu via a supported return or new-run transition, or
   finish the current terminal play flow. Confirm the active session is ended.
   Repeat with a page visibility change/unload and confirm best-effort end
   behavior in the API/network log.

## Verify graceful degradation and saves

1. Stop or make `http://localhost:8001/api/v1` unreachable, then refresh
   Milton. Confirm maps, quests, menus, and saves still work normally; a
   platform failure must not block play or overwrite data.
2. Sign out of Game Lab and refresh Milton. Confirm the small actionable state
   reads: “Sign in through Game Lab, then reopen Milton Estates.” Offline play
   must still work.
3. Compare Milton's LocalStorage entry before and after each connected,
   unauthorized, and unavailable run. Existing saves, settings, progress, and
   Mickey best-time records must remain intact. No Game Lab token should appear
   in LocalStorage, sessionStorage, or application code.

## Production configuration check

For a production build, the Dockerfile supplies
`VITE_BASE_PATH=/games/milton-estates/` and
`VITE_GAME_PLATFORM_API_BASE_URL=https://games.bolblab.org/api/v1`.
Do not commit production secrets or token values.
