# Arena Strike — Phase 2

## Phase 2 outcome

Phase 2 is complete. Arena Strike is now a more replayable single-player first-person shooter while preserving the Phase 1 match format: one human player versus one AI bot in a five-minute indoor arena match.

The release adds three distinct weapons, weapon switching, weapon-specific ADS, Easy/Normal/Hard bot difficulty, stronger navigation and tactical behavior, temporary armor, configurable settings, improved combat feedback, and release-readiness fixes without expanding into multiplayer or additional game modes.

## Completed implementation by module

### 1. Foundation and data

- [x] Define typed configuration for all three weapons.
- [x] Define typed Easy, Normal, and Hard bot difficulty presets.
- [x] Preserve the Phase 1 match lifecycle and development-only `?matchSeconds=` override.
- [x] Add the Phase 2 regression checklist.

Primary implementation: `src/game/config/gameConfig.ts`, `src/game/match/MatchManager.ts`, and `src/main.ts`.

### 2. Bot difficulty and behavior

- [x] Add data-driven Easy, Normal, and Hard difficulty presets.
- [x] Include the selected bot difficulty in the Phase 2 HUD.
- [x] Tune reaction time, accuracy, fire cadence, detection range, movement speed, and decision timing.
- [x] Keep difficulty fair without hidden health or damage advantages.
- [x] Add line-of-sight validation for pursuit, attack, and search behavior.
- [x] Add cover-aware movement, tactical positioning, hearing, last-known-position search, and combat decisions.
- [x] Add obstacle, stuck, route-recovery, patrol, navigation, and safe-respawn handling.

Primary implementation: `src/game/bot/BotAI.ts`, `src/game/arena/createArena.ts`, and `src/game/arena/arenaTypes.ts`.

The Training Yard now provides validated patrol points, navigation points, cover positions, player respawns, bot respawns, and protected spawn behavior.

### 3. Weapon system and ADS

- [x] Add the Scattergun and Marksman Rifle alongside the Assault Rifle.
- [x] Define damage, fire rate, magazine size, reserve ammunition, reload time, range, spread, recoil, and combat role for every weapon.
- [x] Add number-key and mouse-wheel weapon switching.
- [x] Track magazine and reserve ammunition independently for each weapon.
- [x] Add weapon state and ammunition information to the HUD.
- [x] Include equipped-weapon and reserve-ammunition information in the Phase 2 HUD.
- [x] Add hold-to-ADS with right mouse button for all three weapons.
- [x] Apply weapon-specific ADS FOV, first-person weapon positioning, and crosshair presentation.
- [x] Cancel ADS safely during reload, weapon switching, pointer unlock, death, and match end.

Primary implementation: `src/game/config/gameConfig.ts` and `src/game/weapon/WeaponSystem.ts`.

ADS field-of-view values are 0.64 radians for the Assault Rifle, 0.73 for the Scattergun, and 0.43 for the Marksman Rifle.

### 4. Armor and combat feedback

- [x] Add a temporary armor pickup with fair spawn selection.
- [x] Define 75 armor capacity, 60% damage absorption, 24-second duration, pickup lifetime, and respawn timing.
- [x] Display armor amount and active duration in the HUD.
- [x] Add armor pickup, armor damage, armor depletion, and expiration feedback.
- [x] Include armor status in the Phase 2 HUD and add distinct audio feedback for armor and pickups.
- [x] Improve weapon fire, reload, switching, bot movement, damage, death, and pickup feedback.
- [x] Preserve reduced-motion behavior.

Primary implementation: `src/game/combat/CombatSystem.ts`, `src/game/weapon/WeaponSystem.ts`, `src/game/audio/AudioSystem.ts`, and `src/styles.css`.

### 5. Settings and platform behavior

- [x] Add bounded mouse-sensitivity control.
- [x] Add master-volume and mute controls.
- [x] Add Performance, Balanced, and High graphics presets.
- [x] Apply settings immediately and reflect active values in the UI.
- [x] Preserve pointer lock, input, rendering, audio initialization, and resize behavior.

Primary implementation: `src/game/settings/SettingsManager.ts`, `src/game/player/PlayerController.ts`, `src/game/GameApplication.ts`, and `vite.config.ts`.

### 6. Verification and release readiness

- [x] Run strict TypeScript type checking.
- [x] Run the production build and preview build.
- [x] Test the Training Yard across Easy, Normal, and Hard full-match lifecycles.
- [x] Verify start, restart, timer completion, draw, bot-win, score, respawn, HUD reset, and difficulty reset behavior.
- [x] Verify settings, audio mute state, graphics presets, resize handling, armor deployment, and runtime retry behavior.
- [x] Fix the development shadow-shader loading regression.
- [x] Fix the pointer-lock rejection/runtime-overlay regression.
- [x] Record verification outcomes in `docs/PHASE2_REGRESSION_CHECKLIST.md`.

The final verification pass completed five-minute production matches on Hard, Normal, and Easy. The regression checklist records the browser-specific pointer-lock limitation and the remaining manual interaction coverage where applicable.

## Match rules implemented

- One human player versus one AI bot.
- Five-minute (300-second) round.
- Easy, Normal, and Hard bot difficulty presets.
- One implemented Training Yard arena.
- Three total weapons, including the Phase 1 Assault Rifle.
- Weapon switching during a match.
- Hold-to-ADS on every player weapon.
- Temporary armor pickup.
- One kill for each confirmed elimination.
- Short-delay respawns at safe points for both combatants.
- More kills at timeout wins.
- Equal scores produce a draw.
- Match can be restarted from the result screen.

## Scope boundary

Phase 2 does not include online multiplayer, teams, additional game modes, persistent progression, simultaneous bots, a second arena, map selection, more than three total weapons, or a complete high-fidelity art replacement.

These remain intentionally deferred to keep the release focused on reliable single-player combat in one arena.

## Verification commands

The project defines these commands in `package.json`:

```text
npm run typecheck
npm run build
npm run dev
npm run preview
```

All release-readiness commands pass. Phase 2 is complete: the player can configure difficulty and settings, use the full weapon set with ADS, interact with armor, complete a stable five-minute match in the implemented arena, and receive the correct result.
