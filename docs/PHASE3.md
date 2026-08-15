# Open FPS — Phase 3

## Phase 3 outcome

Open FPS supports two selectable single-player arenas: the existing Training Yard and a new Foundry arena with a meaningfully different indoor combat layout. The player chooses a map and bot difficulty before starting a match. Shared game systems load once, while the selected arena's module and assets load only when that map is selected.

Phase 3 preserves the existing one-player-versus-one-bot, five-minute match format. It does not add multiplayer, additional game modes, more weapons, or persistent progression.

## Architecture requirements

- [ ] Load shared engine, HUD, player, weapon, bot, audio, settings, and match systems once at application startup.
- [ ] Keep map-selection metadata lightweight: ID, display name, description, availability, and optional thumbnail only.
- [ ] Dynamically import the selected map builder; do not statically import every map builder from the startup path.
- [ ] Load GLB models, textures, materials, and other heavy assets only for the selected map.
- [ ] Construct only one arena in the active Babylon scene.
- [ ] Dispose the current scene and its map resources before constructing a match on a different selected map.
- [ ] Keep player, combat, bot, weapon, audio, settings, and match systems map-agnostic.
- [ ] Require every map to satisfy the shared `ArenaBuildResult` contract.
- [ ] Show a loading state while the selected map module and its assets are loading.

## Module checklist

### 1. Game configuration (`src/game/config/gameConfig.ts`)

- [x] Confirm `ArenaMapId` includes `training-yard` and `foundry`.
- [x] Mark both maps as available when Foundry is complete.
- [x] Keep map display names, descriptions, and availability in typed definitions.
- [x] Keep `DEFAULT_ARENA_MAP_ID` as a single configurable default.
- [x] Preserve typed `MatchConfiguration` with selected map and bot difficulty.

### 2. Map registry and shared arena contracts (`src/game/arena/`)

- [x] Create `mapRegistry.ts` as the only shared entry point for map construction.
- [x] Define a typed dynamic-import function for each implemented map builder.
- [x] Ensure the registry exposes lightweight map metadata without importing map assets.
- [x] Keep `ArenaBuildResult` sufficient for all shared gameplay systems.
- [x] Define and enforce shared validation for spawn, patrol, navigation, and cover data.
- [x] Confirm validation errors identify the selected map and invalid data clearly.

### 3. Training Yard migration (`src/game/arena/trainingYard/`)

- [x] Move the existing Training Yard builder into its own map module.
- [x] Preserve current geometry, collision, environment, spawn points, cover, and bot route behavior.
- [x] Move Training Yard-specific asset references and helpers into the map module.
- [x] Verify Training Yard is dynamically imported rather than constructed from a startup import.
- [ ] Complete a gameplay regression pass to ensure the refactor causes no behavior change.

### 4. Foundry arena (`src/game/arena/foundry/`)

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

### 5. Scene composition and application lifecycle (`src/game/createScene.ts`, `src/game/GameApplication.ts`)

- [x] Resolve the selected map through `mapRegistry.ts` before constructing the arena.
- [x] Await selected map-module loading before creating map-dependent systems.
- [x] Keep loading/error handling clear if a selected map or its assets fail to load.
- [x] Create the scene only after the selected map is available.
- [x] Dispose the previous map scene and resources before starting a match on another map.
- [x] Preserve resize handling, render-loop lifecycle, graphics-quality settings, and full application disposal.

### 6. Match flow and map selection (`src/game/match/MatchManager.ts`, `src/main.ts`, `index.html`)

- [x] Add a pre-match map selector alongside the existing bot-difficulty selector.
- [x] Populate the selector from map configuration/registry metadata.
- [x] Disable or label unavailable maps until their builder is complete.
- [x] Pass the selected map ID into `MatchConfiguration` when starting a match.
- [x] Display the selected map name in the pre-match UI and/or match HUD.
- [x] Return to pre-match selection on restart so players can change map and difficulty.
- [x] Reset HUD, score, timer, pickup, and match state correctly after a map change.
- [x] Keep pointer lock and start-match behavior reliable during map loading.

### 7. Bot and combat integration (`src/game/bot/`, `src/game/combat/`, `src/game/player/`, `src/game/weapon/`)

- [ ] Verify the bot uses the selected map's patrol, navigation, and cover points.
- [ ] Verify line-of-sight, pursuit, search, tactical movement, and stuck recovery on both maps.
- [ ] Verify player and bot safe-respawn selection on both maps.
- [ ] Verify health/ammunition/armor pickups have valid, reachable placements on both maps.
- [ ] Verify all three weapons work against map geometry, cover, impacts, and collision on both maps.
- [ ] Verify bot visibility, projectile/hitscan blocking, and decals/effects do not appear through cover.

### 8. UI, loading, and accessibility (`index.html`, `src/main.ts`, `src/styles.css`)

- [ ] Add visible feedback while the selected map is loading.
- [ ] Make map selection keyboard accessible and provide an accessible label/description.
- [ ] Preserve responsive and reduced-motion behavior for the updated start screen.
- [ ] Ensure loading, unavailable-map, and asset-load failure messages are clear and actionable.
- [ ] Add small accessibility fixes needed by the new controls and map-loading feedback.

### 9. Developer test controls (optional after core completion)

- [ ] Add development-only controls for choosing maps quickly.
- [ ] Add development-only controls for bot difficulty, weapon selection, and pickup testing.
- [ ] Keep all developer controls excluded from the production player experience.

### 10. Verification and regression

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Verify only the selected map module/assets load for a first-time map selection.
- [ ] Verify unselected map assets are neither downloaded nor constructed in the active scene.
- [ ] Verify switching maps disposes the previous arena completely.
- [ ] Test start, restart, map selection, difficulty selection, timer completion, score handling, player win, bot win, and draw on both maps.
- [ ] Test player movement, collision, jumping, crouching, pointer lock, weapon switching, ADS, reloads, armor, pickups, deaths, and respawns on both maps.
- [ ] Test bot patrol, pursuit, navigation, cover usage, firing, recovery, and respawn safety on both maps.
- [ ] Test Performance, Balanced, and High graphics presets on both maps.
- [ ] Test common desktop viewport sizes and reduced-motion behavior.
- [ ] Complete at least one full five-minute production-style match on each map and difficulty level.
- [ ] Record results and remaining manual/browser-specific limitations in `docs/PHASE3_REGRESSION_CHECKLIST.md`.

## Explicitly deferred

- Online multiplayer, matchmaking, servers, anti-cheat, teams, and network prediction.
- Additional game modes, a third map, more than three total weapons, or multiple simultaneous bots.
- Persistent settings, match history, progression, unlocks, and leaderboards.
- Full high-fidelity asset replacement, extensive realistic animation, or broad art/audio rework.
- Mobile or touch controls.
- Production publishing until the two-map gameplay experience is stable.

## Phase 3 completion criteria

Phase 3 is complete when Training Yard and Foundry can each be selected before a match; only the selected map's module and assets load; all shared systems work without map-specific changes; both maps pass full-match gameplay and regression checks; and type checking plus the production build pass.
