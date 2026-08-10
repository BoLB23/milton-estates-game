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

Merges (and direct pushes) to `main` run the unit, map, build, deployment-manifest, and browser regression checks before publishing a container image to GitHub Container Registry. Images are tagged with both `latest` and `sha-<full 40-character commit SHA>`.

The Kubernetes manifests expose the game at [https://games.bolblab.org/games/milton-estates/](https://games.bolblab.org/games/milton-estates/) through the existing in-cluster Cloudflare Tunnel. The deployment script structurally preserves the shared `cloudflare/cloudflared` ConfigMap, adds or refreshes this game's path-specific route before the catalog host route and terminal 404 rule, validates the result with `cloudflared`, and rolls the two connector pods so the local configuration takes effect. ExternalDNS publishes the hostname as a proxied CNAME to that tunnel. Cloudflare terminates public TLS and tunnels plain HTTP to the game's ClusterIP Service; NGINX strips the public game prefix before resolving the static bundle, and cert-manager separately provisions the certificate declared by the NGINX Ingress.

The deploy command requires Bash, `kubectl`, `curl`, `jq`, Ruby with its standard Psych YAML library, `cloudflared`, a current Kubernetes context that can apply the four resources in `k8s/`, update the shared Cloudflare ConfigMap, and restart the `cloudflare/cloudflared` Deployment, plus a GHCR package the cluster can read. It does not require a Cloudflare API token because this connector is locally configured in Kubernetes.

Before the first release, complete the Game Lab side of the integration: publish
`@bolb23/game-client-sdk@0.1.0` (the SDK workflow uses the `sdk-v0.1.0` tag), set
`MILTON_ESTATES_ORIGIN=https://games.bolblab.org`,
`MILTON_ESTATES_LAUNCH_URL=https://games.bolblab.org/games/milton-estates/`,
`MILTON_ESTATES_ENABLED=true`, and
`MILTON_ESTATES_CLOUD_SAVES_ENABLED=true`, then seed the four leaderboard
definitions documented in [the integration contract](docs/game-lab-integration-contract.md)
with leaderboard support enabled. The origin must remain host-only for
credentialed SDK cookies; only the launch URL includes the game path.

After making both the GHCR image and the released `@bolb23/game-client-sdk` package readable to their consumers, deploy the image for the exact commit. Mutable tags such as `latest` are intentionally rejected:

```sh
./scripts/deploy.sh ghcr.io/bolb23/milton-estates-game:sha-0123456789abcdef0123456789abcdef01234567
```

An image digest (`ghcr.io/bolb23/milton-estates-game@sha256:<64 hex characters>`) is also accepted. References to other registries, owners, or repositories are rejected; the known GitHub owner casing is normalized to the canonical lowercase OCI path. Full-SHA tags use `imagePullPolicy: Always` so a republished CI tag cannot reuse a stale node cache, while digest-pinned images retain `IfNotPresent`. The namespace and public hostname are deliberately fixed to the values in `k8s/`; `NAMESPACE` and `GAME_HOSTNAME` overrides are not supported. Set `ROLLOUT_TIMEOUT` to change the default three-minute rollout wait.

Validate the exact local rendering without Cloudflare credentials or cluster access:

```sh
./scripts/deploy.sh --dry-run ghcr.io/bolb23/milton-estates-game:sha-0123456789abcdef0123456789abcdef01234567
```

The script preflights manifests, the existing local tunnel structure, the exact tunnel update and connector restart, cluster authorization/admission, and connectivity before writes. It applies the requested image and a unique rollout annotation together, so a deploy produces one game Deployment revision and rerunning the same immutable image still restarts the pod. The shared ConfigMap update carries the resource version read during preflight, so a concurrent route edit causes a safe conflict instead of being overwritten. If connector activation or the public health check fails after that update, the script conditionally restores the prior ConfigMap and reloads the connectors; if safe automatic recovery is blocked by another concurrent edit, it preserves and prints the mode-600 recovery-file paths. Success requires `https://games.bolblab.org/games/milton-estates/healthz` to return exactly HTTP 200 with body `ok`; redirects are rejected and every attempt has a connection and transfer timeout. Check the workload, image, Service, and labeled Ingress with:

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

During development builds, F2 overlays authored collision and map anchors, F3 toggles a state panel, F4 moves Billy to the current objective, and F6 shows camera-correct collision inspection data for rapid map playtesting. These shortcuts are not included in production builds.

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
