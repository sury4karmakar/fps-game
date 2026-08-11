# Arena Strike — Phase 2

## Phase 2 outcome

Arena Strike becomes a more replayable single-player first-person shooter while keeping the Phase 1 match format: one human player versus one AI bot in a five-minute indoor arena match. The release adds meaningful player choice, stronger bot behavior, a second arena, and clearer combat feedback without expanding into multiplayer or additional game modes.

## Phase 2 scope

Phase 2 contains only the approved Must-do work. Should-do improvements and explicitly excluded work are documented in `GAME_SPECIFICATION.md` and are not release requirements for this phase.

## Planned implementation by module

### 1. Phase 2 Foundation and Data

- [x] Define typed weapon configuration data for all Phase 2 weapons.
- [x] Define typed difficulty presets for Easy, Normal, and Hard.
- [x] Define typed map metadata and map-selection state.
- [x] Preserve the Phase 1 match flow and timer override while adding the new configuration paths.
- [x] Add a Phase 2 regression checklist for maps, weapons, difficulty, pickups, settings, and complete matches.

### 2. Bot Difficulty

- [x] Add Easy, Normal, and Hard bot difficulty presets.
- [x] Tune reaction time, aim accuracy, fire cadence, detection range, movement speed, and decision timing per difficulty.
- [x] Keep difficulty changes fair and data-driven rather than relying on hidden damage or health advantages.
- [x] Display the selected difficulty in the match setup and HUD where appropriate.
- [x] Verify that all difficulties can complete a full five-minute match without invalid states.

### 3. Bot Navigation and Tactical Behavior

- [ ] Add reliable navigation support for both arenas.
- [x] Add line-of-sight validation for pursuit, attack, and search behavior.
- [x] Improve cover-aware movement and tactical positioning.
- [x] Improve hearing, last-known-position search, and combat decision behavior.
- [x] Improve obstacle, stuck, and route-recovery handling.
- [ ] Author and validate map-specific patrol routes, cover positions, and safe respawn points.

### 4. Weapon System

- [x] Add two additional weapons with clearly different combat roles.
- [x] Define damage, fire rate, magazine size, reserve ammunition, reload time, range, spread, and recoil for every weapon.
- [x] Add weapon switching through number keys and mouse wheel input.
- [x] Track magazine and reserve ammunition independently for each weapon.
- [x] Add equipped-weapon state and weapon information to the HUD.
- [x] Balance weapon damage and availability against all three bot difficulties.

### 5. Second Arena

- [ ] Design and build one new indoor arena with a meaningfully different layout from the Phase 1 arena.
- [ ] Add floor, walls, cover, platforms or ramps, lighting, collision meshes, and environment setup.
- [ ] Add player and bot spawn points with safe-spawn validation.
- [ ] Add bot patrol and navigation waypoints specific to the new arena.
- [ ] Add map selection before a match begins.
- [ ] Verify visibility, collision, spawn safety, performance, and full-match play on both arenas.

### 6. Armor Pickup

- [x] Add a temporary armor pickup that can appear during a match.
- [x] Define armor capacity, pickup duration or lifetime, and damage-absorption rules.
- [x] Display current armor clearly in the HUD.
- [x] Add pickup availability, collection, expiration, and respawn behavior where applicable.
- [x] Add distinct audio and visual feedback for armor pickup and armor damage.
- [x] Ensure armor does not create unfair spawn or scoring behavior.

### 7. Settings

- [x] Add mouse-sensitivity control with safe minimum and maximum bounds.
- [x] Add audio volume and mute controls.
- [x] Add graphics-quality presets appropriate for the browser renderer.
- [x] Add essential control options required for the Phase 2 systems.
- [x] Apply settings immediately and show the active values in the settings UI.
- [x] Ensure settings do not break pointer lock, input, rendering, or audio initialization.

### 8. Animation and Combat Feedback

- [x] Improve weapon fire, reload, and weapon-switch presentation.
- [x] Improve bot movement, firing, damage, and death readability.
- [x] Keep animations synchronized with firing, reload completion, switching, and damage events.
- [x] Add clear feedback for armor hits, armor depletion, and weapon changes.
- [x] Preserve reduced-motion behavior for existing and new effects.

### 9. Verification, Balance, and Release Readiness

- [ ] Run strict TypeScript type checking.
- [ ] Run the production build and preview build.
- [ ] Test both maps across Easy, Normal, and Hard difficulties.
- [ ] Test every weapon, weapon switch path, reload state, armor state, respawn, and match result.
- [ ] Test pointer lock, settings changes, audio, resize behavior, and runtime error recovery.
- [ ] Check browser performance and memory behavior during complete matches.
- [ ] Fix regressions before declaring Phase 2 complete.

## Phase 2 match rules

- One human player versus one AI bot.
- Five-minute (300-second) round.
- Easy, Normal, and Hard bot difficulty presets.
- Two selectable arenas.
- Three total weapons, including the Phase 1 rifle.
- Weapon switching during a match.
- Temporary armor pickup.
- One kill for each confirmed elimination.
- Short-delay respawns at safe points for both combatants.
- More kills at timeout wins; equal scores produce a draw.

## Phase 2 scope boundary

Phase 2 does not include multiplayer, teams, additional game modes, persistent progression, simultaneous bots, more than two arenas, more than three total weapons, or a complete high-fidelity art replacement. These decisions keep the release focused on replayability and reliable single-player combat.

## Verification commands

The project must continue to pass:

```text
npm run typecheck
npm run build
npm run dev
npm run preview
```

Phase 2 is complete when the player can configure a map and difficulty, use the full weapon set, interact with armor, complete a stable five-minute match, and receive the correct result across both arenas.
