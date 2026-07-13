# Milton Estates

A small, standalone Phaser exploration game about a summer afternoon, three friends, and a missing Xbox controller.

## Quick start

You need a current Node.js installation. From this project folder, run:

```sh
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser. Keep the terminal running while you play. Press `Ctrl+C` in that terminal when you want to stop the game server.

Controls:

- Move: arrow keys or WASD
- Talk, inspect, and travel: E, Space, or click the interaction prompt
- Open Billy's Backpack: Escape

The Backpack contains the quest history, local map, save/restart controls, and settings.

## MVP gameplay

1. Talk to Jeremy outside the baby-blue house.
2. Ask Andrew outside the white house.
3. Inspect the bent grass in the gap between Billy's house and the neighbor toward Andrew.
4. Enter the creek woods, explore the loop, and search the tall grass.
5. Return the controller to Jeremy. A separate optional secret is hidden in the woods.

Progress is saved automatically in that browser. Use Backpack → Save to save immediately or restart the mission with confirmation.

During local development, F3 toggles a state panel and F4/F6 moves Billy to the current objective for rapid end-to-end playtesting. These shortcuts are disabled away from localhost.

## Project shape

- `src/scenes/` contains Phaser scene orchestration and placeholder map presentation.
- `src/content/` contains typed dialogue and pure quest progression.
- `src/game/` contains shared types, events, and the versioned local save store.
- `docs/` contains the durable concept and first-area map contract.

The MVP uses original programmatic placeholder art so gameplay can be tuned before committing to a tileset. The planned production maps remain orthogonal Tiled maps following [the first-area contract](docs/maps/first-area-plan.md); replacing the graybox presentation with Tiled data should preserve stable interaction and quest IDs.

## Validation

```sh
npm run check
```

Run the complete rendered quest regression, including the creek save/reload path, with:

```sh
npm run check:full
```

If Playwright asks for its browser the first time, run `npx playwright install chromium`, then retry `npm run check:full`.
