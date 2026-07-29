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

The game requires a browser with WebGL or WebGL2 support. Canvas is retained only for the long-running automated regression suite.

## Homelab deployment

Merges (and direct pushes) to `main` first run the unit tests and production build, then publish a container image to GitHub Container Registry. Images are tagged with both `latest` and the commit SHA.

The Kubernetes manifests expose the game at [https://games.bolblab.org](https://games.bolblab.org) through the cluster's NGINX ingress controller. ExternalDNS already watches Ingress resources and automatically creates the Cloudflare record from this hostname; no ExternalDNS annotation is needed. TLS uses the cluster's existing Cloudflare DNS-01 `ClusterIssuer`, `bolblab-cf-issuer`.

After making the GHCR package readable by the cluster (public, or via an image-pull secret), deploy a published image with:

```sh
./scripts/deploy.sh ghcr.io/OWNER/milton-estates-game:latest
```

Set `NAMESPACE` to use a different namespace or `ROLLOUT_TIMEOUT` to change the default three-minute rollout wait. Check the rollout and the assigned ingress with:

```sh
./scripts/deploy-status.sh
```

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

- `src/engine/` contains content contracts and validation that authored modules depend on.
- `src/content/chapters/` contains chapter and quest-owned definitions, rules, dialogue, and bindings.
- `src/content/registry.ts` is the explicit composition root for the shipped content catalog.
- `src/scenes/` contains Phaser scene orchestration and map presentation.
- `src/game/` contains shared types, events, and the versioned local save store.
- `docs/` contains the durable concept, architecture and art contracts, provenance, and archived implementation records.

The illustrated presentation is governed by [the art contract](docs/art-direction.md), with a generated fictionalized Chapter 1 cover. Stable interaction and quest IDs remain independent of map artwork. Completed production checkpoints and their historical temporary-art notes are preserved in the [production-polish archive](docs/archive/production-polish-manifest.md).

See [content architecture and authoring](docs/content-architecture.md) before adding a chapter or quest.

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

The Phaser 4 production bundle is expected to be larger than the Phaser 3 baseline (approximately 1,500.39 kB / 399.82 kB gzip versus 1,321.63 kB / 360.44 kB). This warning is accepted for the migration; bundle splitting is deferred to a separate load-time optimization and should be investigated if the final v4 bundle exceeds the observed size by more than 5%.
