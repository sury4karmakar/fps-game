# Open FPS — Phase 3

## Phase 3 outcome

Phase 3 is complete. Open FPS now supports two selectable single-player arenas: the existing Training Yard and a new Foundry arena with a meaningfully different indoor combat layout. The player chooses a map and bot difficulty before starting a match, while only the selected arena's module and assets load for that match.

The release preserves the existing one-player-versus-one-bot, five-minute match format. It adds map selection and a second arena without adding multiplayer, additional game modes, more weapons, or persistent progression.

## Completed implementation by module

### 1. Game configuration

- [x] Confirm `ArenaMapId` includes `training-yard` and `foundry`.
- [x] Mark both maps as available when Foundry is complete.
- [x] Keep map display names, descriptions, and availability in typed definitions.
- [x] Keep `DEFAULT_ARENA_MAP_ID` as a single configurable default.
- [x] Preserve typed `MatchConfiguration` with selected map and bot difficulty.

Primary implementation: `src/game/config/gameConfig.ts`.

The typed map definitions provide the menu metadata and availability state, while `MatchConfiguration` carries the selected map and bot difficulty through match creation.

### 2. Map registry and shared arena contracts

- [x] Create `mapRegistry.ts` as the only shared entry point for map construction.
- [x] Define a typed dynamic-import function for each implemented map builder.
- [x] Ensure the registry exposes lightweight map metadata without importing map assets.
- [x] Keep `ArenaBuildResult` sufficient for all shared gameplay systems.
- [x] Define and enforce shared validation for spawn, patrol, navigation, and cover data.
- [x] Confirm validation errors identify the selected map and invalid data clearly.

Primary implementation: `src/game/arena/mapRegistry.ts` and `src/game/arena/arenaTypes.ts`.

The registry separates lightweight map metadata from map construction. Shared arena validation ensures every map provides valid spawn, patrol, navigation, and cover data before gameplay systems use it.

### 3. Training Yard migration

- [x] Move the existing Training Yard builder into its own map module.
- [x] Preserve current geometry, collision, environment, spawn points, cover, and bot route behavior.
- [x] Move Training Yard-specific asset references and helpers into the map module.
- [x] Verify Training Yard is dynamically imported rather than constructed from a startup import.

Primary implementation: `src/game/arena/trainingYard/createTrainingYard.ts`, `src/game/arena/trainingYard/createTrainingYardEnvironment.ts`, and `src/game/arena/trainingYard/assets.ts`.

Training Yard retains its established playable layout and behavior, but now owns its arena construction, environment, and asset references in a dynamically loaded map module.

### 4. Foundry arena

- [x] Design a clearly different indoor industrial layout from Training Yard.
- [x] Build floor, boundary walls, ceilings where appropriate, and collision-ready geometry.
- [x] Add distinct combat spaces, cover objects, sightlines, and at least one elevation or ramp route.
- [x] Create Foundry-specific environment, lighting, fog, and shadow configuration.
- [x] Add Foundry-owned GLB asset references/loading helpers when production assets are introduced.
- [x] Add safe player spawn points and bot spawn points.
- [x] Add patrol points, navigation points, and cover points for bot behavior.
- [x] Validate every Foundry point against the shared arena contract.
- [x] Tune spawn safety so respawning combatants are not immediately exposed.
- [x] Verify collision boundaries prevent leaving the playable space.

Primary implementation: `src/game/arena/foundry/createFoundry.ts`, `src/game/arena/foundry/createFoundryEnvironment.ts`, and `src/game/arena/foundry/assets.ts`.

Foundry adds a distinct industrial indoor arena with collision-ready geometry, cover, varied sightlines, an elevated route, map-specific lighting and environment settings, and validated data for spawns and bot navigation.

### 5. Scene composition and application lifecycle

- [x] Resolve the selected map through `mapRegistry.ts` before constructing the arena.
- [x] Await selected map-module loading before creating map-dependent systems.
- [x] Keep loading/error handling clear if a selected map or its assets fail to load.
- [x] Create the scene only after the selected map is available.
- [x] Dispose the previous map scene and resources before starting a match on another map.
- [x] Preserve resize handling, render-loop lifecycle, graphics-quality settings, and full application disposal.

Primary implementation: `src/game/createScene.ts` and `src/game/GameApplication.ts`.

Scene composition resolves and loads the selected map before constructing map-dependent systems. `GameApplication` disposes the prior scene and all scene-bound systems during a map change while preserving the engine, canvas, render loop, HUD controls, resize behavior, and graphics-quality settings.

### 6. Match flow and map selection

- [x] Add a pre-match map selector alongside the existing bot-difficulty selector.
- [x] Populate the selector from map configuration/registry metadata.
- [x] Disable or label unavailable maps until their builder is complete.
- [x] Pass the selected map ID into `MatchConfiguration` when starting a match.
- [x] Display the selected map name in the pre-match UI and/or match HUD.
- [x] Return to pre-match selection on restart so players can change map and difficulty.
- [x] Reset HUD, score, timer, pickup, and match state correctly after a map change.
- [x] Keep pointer lock and start-match behavior reliable during map loading.

Primary implementation: `src/game/match/MatchManager.ts`, `src/main.ts`, and `index.html`.

Players select an available map and bot difficulty before a match. Restart returns to this selection flow, allowing both settings to change before a newly loaded match begins.

### 7. Bot and combat integration

- [x] Verify the bot uses the selected map's patrol, navigation, and cover points.
- [x] Verify line-of-sight, pursuit, search, tactical movement, and stuck recovery on both maps.
- [x] Verify player and bot safe-respawn selection on both maps.
- [x] Verify health/ammunition/armor pickups have valid, reachable placements on both maps.
- [x] Verify all three weapons work against map geometry, cover, impacts, and collision on both maps.
- [x] Verify bot visibility, projectile/hitscan blocking, and decals/effects do not appear through cover.

Primary implementation: `src/game/bot/BotAI.ts`, `src/game/combat/CombatSystem.ts`, `src/game/player/PlayerController.ts`, and `src/game/weapon/WeaponSystem.ts`.

Shared combat and AI systems consume the selected arena's validated points without map-specific system changes. Both maps support safe respawns, reachable pickups, navigation and cover behavior, weapon impacts, and occluded combat effects.

### 8. UI, loading, and accessibility

- [x] Add visible feedback while the selected map is loading.
- [x] Make map selection keyboard accessible and provide an accessible label/description.
- [x] Preserve responsive and reduced-motion behavior for the updated start screen.
- [x] Ensure loading, unavailable-map, and asset-load failure messages are clear and actionable.
- [x] Add small accessibility fixes needed by the new controls and map-loading feedback.

Primary implementation: `index.html`, `src/main.ts`, and `src/styles.css`.

The pre-match interface provides accessible map selection and clear loading and failure feedback while retaining the existing responsive and reduced-motion behavior.

### 10. Verification and regression

- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.
- [x] Verify only the selected map module/assets load for a first-time map selection.
- [x] Verify unselected map assets are neither downloaded nor constructed in the active scene.
- [x] Verify switching maps disposes the previous arena completely.
- [x] Test start, restart, map selection, difficulty selection, timer completion, score handling, player win, bot win, and draw on both maps.
- [x] Test player movement, collision, jumping, crouching, pointer lock, weapon switching, ADS, reloads, armor, pickups, deaths, and respawns on both maps.
- [x] Test bot patrol, pursuit, navigation, cover usage, firing, recovery, and respawn safety on both maps.
- [x] Test Performance, Balanced, and High graphics presets on both maps.
- [x] Test common desktop viewport sizes and reduced-motion behavior.
- [x] Complete at least one full five-minute production-style match on each map and difficulty level.

The release verification covers dynamic loading, scene replacement, match flow, player and bot behavior, combat, settings, accessibility, and full-match lifecycles for Training Yard and Foundry.

## Match rules implemented

- One human player versus one AI bot.
- Five-minute (300-second) round.
- Training Yard and Foundry selectable before a match.
- Easy, Normal, and Hard bot difficulty presets.
- Three total weapons with switching and hold-to-ADS.
- Temporary armor and health/ammunition pickups.
- One kill for each confirmed elimination.
- Short-delay respawns at safe points for both combatants.
- More kills at timeout wins.
- Equal scores produce a draw.
- Match restart returns to map and difficulty selection.

## Scope boundary

Phase 3 does not include online multiplayer, matchmaking, servers, anti-cheat, teams, network prediction, additional game modes, a third map, more than three total weapons, multiple simultaneous bots, persistent settings, match history, progression, unlocks, leaderboards, high-fidelity asset replacement, extensive realistic animation, broad art/audio rework, or mobile/touch controls.

These remain intentionally deferred to keep the release focused on a stable two-map single-player experience.

## Verification commands

The project defines these commands in `package.json`:

```text
npm run typecheck
npm run build
npm run dev
npm run preview
```

All release-readiness commands pass. Phase 3 is complete: players can select either Training Yard or Foundry before a match, the selected map loads without constructing the other arena, shared gameplay systems operate on both maps, and the full five-minute match flow produces the correct result.
