# Arena Strike — Phase 2

## Phase 2 outcome

Arena Strike becomes a more replayable single-player first-person shooter while keeping the Phase 1 match format: one human player versus one AI bot in a five-minute indoor arena match. The release adds meaningful player choice, stronger bot behavior, armor, settings, ADS, and clearer combat feedback without expanding into multiplayer or additional game modes.

## Phase 2 scope

Phase 2 contains only the approved Must-do work. Should-do improvements and explicitly excluded work are documented in `GAME_SPECIFICATION.md` and are not release requirements for this phase.

## Planned implementation by module

### 1. Phase 2 Foundation and Data

- [x] Define typed weapon configuration data for all Phase 2 weapons.
- [x] Define typed difficulty presets for Easy, Normal, and Hard.
- [x] Preserve the Phase 1 match flow and timer override while adding the new configuration paths.
- [x] Add a Phase 2 regression checklist for maps, weapons, difficulty, pickups, settings, and complete matches.

### 2. Bot Difficulty

- [x] Add Easy, Normal, and Hard bot difficulty presets.
- [x] Tune reaction time, aim accuracy, fire cadence, detection range, movement speed, and decision timing per difficulty.
- [x] Keep difficulty changes fair and data-driven rather than relying on hidden damage or health advantages.
- [x] Display the selected difficulty in the match setup and HUD where appropriate.
- [x] Verify that all difficulties can complete a full five-minute match without invalid states.

### 3. Bot Navigation and Tactical Behavior

- [ ] Add reliable navigation support for the implemented arena.
- [x] Add line-of-sight validation for pursuit, attack, and search behavior.
- [x] Improve cover-aware movement and tactical positioning.
- [x] Improve hearing, last-known-position search, and combat decision behavior.
- [x] Improve obstacle, stuck, and route-recovery handling.
- [ ] Author and validate patrol routes, cover positions, and safe respawn points for the implemented arena.

### 4. Weapon System

- [x] Add two additional weapons with clearly different combat roles.
- [x] Define damage, fire rate, magazine size, reserve ammunition, reload time, range, spread, and recoil for every weapon.
- [x] Add weapon switching through number keys and mouse wheel input.
- [x] Track magazine and reserve ammunition independently for each weapon.
- [x] Add equipped-weapon state and weapon information to the HUD.
- [x] Balance weapon damage and availability against all three bot difficulties.

#### Aim Down Sights

- [x] Add hold-to-ADS with right mouse button for all three weapons.
- [x] Define weapon-specific ADS zoom values in typed weapon configuration.
- [x] Synchronize camera FOV, first-person weapon positioning, and crosshair ADS presentation.
- [x] Preserve left-click firing while RMB is held through independent mouse-button input handling.
- [x] Cancel ADS safely during reload, weapon switching, pointer unlock, death, and match end.

### 5. Armor Pickup

- [x] Add a temporary armor pickup that can appear during a match.
- [x] Define armor capacity, pickup duration or lifetime, and damage-absorption rules.
- [x] Display current armor clearly in the HUD.
- [x] Add pickup availability, collection, expiration, and respawn behavior where applicable.
- [x] Add distinct audio and visual feedback for armor pickup and armor damage.
- [x] Ensure armor does not create unfair spawn or scoring behavior.

### 6. Settings

- [x] Add mouse-sensitivity control with safe minimum and maximum bounds.
- [x] Add audio volume and mute controls.
- [x] Add graphics-quality presets appropriate for the browser renderer.
- [x] Add essential control options required for the Phase 2 systems.
- [x] Apply settings immediately and show the active values in the settings UI.
- [x] Ensure settings do not break pointer lock, input, rendering, or audio initialization.

### 7. Animation and Combat Feedback

- [x] Improve weapon fire, reload, and weapon-switch presentation.
- [x] Improve bot movement, firing, damage, and death readability.
- [x] Keep animations synchronized with firing, reload completion, switching, and damage events.
- [x] Add clear feedback for armor hits, armor depletion, and weapon changes.
- [x] Preserve reduced-motion behavior for existing and new effects.

### 8. Verification, Balance, and Release Readiness

- [ ] Run strict TypeScript type checking.
- [ ] Run the production build and preview build.
- [ ] Test the implemented arena across Easy, Normal, and Hard difficulties.
- [ ] Test every weapon, weapon switch path, reload state, armor state, respawn, and match result.
- [ ] Test pointer lock, settings changes, audio, resize behavior, and runtime error recovery.
- [ ] Check browser performance and memory behavior during complete matches.
- [ ] Fix regressions before declaring Phase 2 complete.

## Phase 2 match rules

- One human player versus one AI bot.
- Five-minute (300-second) round.
- Easy, Normal, and Hard bot difficulty presets.
- One implemented arena.
- Three total weapons, including the Phase 1 rifle.
- Weapon switching during a match.
- Temporary armor pickup.
- One kill for each confirmed elimination.
- Short-delay respawns at safe points for both combatants.
- More kills at timeout wins; equal scores produce a draw.

## Phase 2 scope boundary

Phase 2 does not include multiplayer, teams, additional game modes, persistent progression, simultaneous bots, a second arena or map selection, more than three total weapons, or a complete high-fidelity art replacement. These decisions keep the release focused on replayability and reliable single-player combat.

## Verification commands

The project must continue to pass:

```text
npm run typecheck
npm run build
npm run dev
npm run preview
```

Phase 2 is complete when the player can configure difficulty and settings, use the full weapon set with ADS, interact with armor, complete a stable five-minute match in the implemented arena, and receive the correct result.
