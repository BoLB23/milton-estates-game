# Milton Estates

A small, standalone Phaser exploration game about a summer afternoon, three friends, and a missing Xbox controller.

## Build and run

You need a current Node.js installation. Install the project's pinned dependencies once:

```sh
npm install
```

Build the production files without using `npm run`:

```sh
./scripts/build.sh
```

The build is written to `dist/`. To launch the local development server, also without `npm run`:

```sh
./scripts/serve.sh
```

Then open [http://localhost:5173](http://localhost:5173) in your browser. Keep the terminal running while you play, and press `Ctrl+C` to stop it. The server reloads automatically when source files change.

To select a different address or port, set `HOST` and/or `PORT` when starting the server. For example, this listens on all network interfaces at port 8080:

```sh
HOST=0.0.0.0 PORT=8080 ./scripts/serve.sh
```

Controls:

- Move: arrow keys or WASD
- Talk, inspect, and travel: E, Space, or click the interaction prompt
- Open Billy's Backpack: Escape

The front end opens as a childhood scrapbook: Title → Chapter Scrapbook → Quest Journal → Start / Continue / Replay. Completed-quest replay uses a temporary in-memory copy and never overwrites canonical progress.

The Backpack contains the quest history, local map, save/restart controls, and settings.

## MVP gameplay

1. Talk to Jeremy outside the baby-blue house.
2. Ask Andrew outside the white house.
3. Inspect the bent grass in the gap between Billy's house and the neighbor toward Andrew.
4. Enter the creek woods, explore the loop, and search the tall grass.
5. Return the controller to Jeremy. A separate optional secret is hidden in the woods.

Progress is saved automatically in that browser. Use Backpack → Save to save immediately or restart the mission with confirmation.

During development builds, F3 toggles a state panel and F4 moves Billy to the current objective for rapid end-to-end playtesting. These shortcuts are not included in production builds.

## Project shape

- `src/scenes/` contains Phaser scene orchestration and placeholder map presentation.
- `src/content/` contains typed dialogue and pure quest progression.
- `src/game/` contains shared types, events, and the versioned local save store.
- `docs/` contains the durable concept and first-area map contract.

The current production pass uses original programmatic pixel art governed by [the art contract](docs/art-direction.md), with a generated fictionalized Chapter 1 cover. The map contract remains compatible with a later Tiled export while preserving stable interaction and quest IDs. Checkpoint assets, temporary-art notes, and risks are tracked in [the production-polish manifest](docs/production-polish-manifest.md).

## Validation

```sh
./scripts/build.sh
node_modules/.bin/vitest run src
```

Run the complete rendered quest regression, including the creek save/reload path, with:

```sh
./scripts/build.sh
node_modules/.bin/vitest run src
node_modules/.bin/playwright test
```

If Playwright asks for its browser the first time, run `node_modules/.bin/playwright install chromium`, then retry the full validation commands.
