# Content architecture and authoring

Milton Estates uses an explicit, registry-composed content model. Authored chapter
and quest files are vertical slices; reusable Phaser and persistence behavior
belongs in the engine or shared game layers.

## Ownership

- `src/content/registry.ts` is the only global content composition root.
- `src/content/chapters/<chapter>/chapter.ts` owns chapter metadata and quest order.
- `src/content/chapters/<chapter>/quests/<quest>/` owns that quest's definition,
  rules, dialogue, tests, asset manifest, and map-specific runtime bindings.
- `src/engine/content/` owns module contracts and cross-module validation.
- Map scenes own geometry and travel. Quest bindings own transient actors,
  interactions, objective anchors, and quest-specific cleanup.

Stable persisted IDs use `snake_case`. Source folders use `kebab-case`. Existing
persisted IDs must never be renamed as part of a file move.

## Asset scopes

Give each asset the narrowest scope that genuinely owns it:

```text
public/assets/
  shared/
  chapters/
    chapter-01/
      shared/
      maps/
      quests/
```

Global assets are used across chapters. Chapter-shared assets are used by
multiple quests in one chapter. Quest assets are private to one quest. Do not
copy the same file into multiple scopes.

Phaser caches are global, so new cache keys must be namespaced, for example:

- `shared.character.billy`
- `ch01.map.creek.master`
- `ch01.quest.catch-ryan.route`

## Adding a quest

1. Create the quest folder and its `definition.ts`, `rules.ts`, `module.ts`, and
   colocated tests.
2. Add dialogue, assets, or runtime bindings only when the quest needs them.
3. Register the module once in its chapter's `chapter.ts`.
4. Use existing map IDs and stable authored-object IDs; add new map contracts
   explicitly when required.
5. Run `npm run check`. For changes affecting rendered flow, also run
   `npm run test:e2e`.

The registry rejects duplicate chapter IDs, quest IDs, Phaser asset keys,
unknown prerequisites, prerequisite cycles, invalid runtime maps, and
root-absolute asset paths.

## Migration status

Missing Controller, Andrew's Mushroom Hunt, and Three-Player Sports are native
quest modules. Catch Ryan and future catalog placeholders use explicit `legacy`
adapters until their rules, dialogue, persistence codec, and runtime bindings
move into their own folders. Compatibility exports keep current scene and save
behavior stable during this migration.
