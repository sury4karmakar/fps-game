# Open FPS — Training Ground Module 1: Entry and Showcase

## Module 1 outcome

The Entry and Showcase section is the lightweight Training Ground initial load and orientation hub. Entering Training Ground constructs only this small map; Shooting Range and Movement Training modules and their assets remain unloaded. A gallery presents the game's current bots, weapons, armor, and representative objects while keeping display items separate from gameplay pickups and combat targets.

## Planned implementation by module

### 1. Entry spawn and navigation hub

- [x] Move the Training Ground initial player spawn to the blueprint's entry section.
- [x] Face the player toward the showcase and the top-screen training navigation.
- [x] Add persistent top-screen buttons for Shooting Range and Movement Training.
- [x] Disable section buttons while a requested module is loading and show a clear loading/error state.
- [x] Add a visible exit control that returns to the pre-match/start flow without starting a match result.
- [x] Keep navigation open enough that the player cannot spawn inside or behind gallery geometry.

Primary implementation: `src/game/arena/trainingGround/createTrainingGround.ts` and the Training Ground lifecycle in `MatchManager`.

### 2. Showcase gallery

- [x] Build a gallery around the four hub walls so future entries surround the player without crowding the center.
- [x] Display representative models for all three current weapons, the bot, armor, ammunition, and important game objects.
- [x] Label each display with its in-game name and purpose.
- [x] Treat gallery models as non-pickup, non-damageable display objects.
- [x] Keep display meshes out of weapon-hit, bot-target, pickup, and scoring logic.
- [x] Centralize gallery entries in typed data so future weapons or objects can be added without rebuilding the gallery layout code.

Primary implementation: `src/game/arena/trainingGround/showcase/`, a typed showcase-item registry, and the shared `entities/weapon`, `entities/bot`, and `entities/pickup` views. The gallery must configure those views and must never define substitute gameplay models.

### 3. Lazy section registry and lifecycle

- [x] Define typed `TrainingGroundSectionId` values for `shooting-range` and `movement-training`.
- [x] Create a lightweight section registry containing label metadata and dynamic-import functions only.
- [x] Keep Entry/Showcase loaded as the hub; do not construct either training module during the initial map load.
- [x] Give each training section its own root transform, meshes, interactions, assets, and disposable controller.
- [x] Allow exactly one active training section at a time.
- [x] Dispose the active section completely before loading another section or returning to the hub.
- [x] Preserve shared player, HUD, settings, audio, and Training Ground environment resources across section changes.
- [x] Dispose the hub and any active section when changing maps or leaving the Training Ground scene.

Primary implementation: `src/game/arena/trainingGround/createTrainingGround.ts`, a Training Ground section registry, and the two dynamically imported section modules.

### 4. Free-practice lifecycle and HUD

- [x] Present Training Ground as free practice with no global match clock, bot score, or result state.
- [x] Hide Foundry-only bot health, score, armor, and five-minute match UI where they do not apply.
- [x] Keep player health, weapon, ammunition, settings, controls, and Exit Map available where relevant.
- [x] Use hub navigation labels and short instructions to explain the available activities.
- [x] Return the player to the entry spawn whenever Training Ground is newly loaded.
- [x] Ensure returning to the hub, leaving Training Ground, or changing maps clears every active Shooting Range or Movement Training state.

Primary implementation: `MatchManager`, Training Ground section controllers, and HUD bindings.

### 5. Verification and regression

- [x] Verify Training Ground always starts at the entry spawn facing the gallery/routes.
- [x] Verify every gallery item is visible, labelled, non-interactive, and excluded from combat logic.
- [x] Verify both section entrances and the map exit are easy to identify and reachable.
- [x] Verify the hub initially loads without either training-section module or asset set.
- [x] Verify selecting a section loads only the requested module and enables only its controller.
- [x] Verify switching sections disposes the prior section before the next section loads.
- [x] Verify leaving and re-entering Training Ground produces a clean initial state.
- [x] Verify loading Foundry disposes all Training Ground gallery, bot, interaction, and environment resources.
- [x] Test responsive HUD behavior, reduced motion, and all graphics presets.
- [x] Run `npm run typecheck` and `npm run build`.

## Entry and Showcase rules

- The Entry section is the only initial spawn for Training Ground.
- Gallery objects are visual references, not pickups or targets.
- Gallery, Foundry, Shooting Range, and Movement Training reuse the same entity views; modules may configure behavior but may not duplicate model construction.
- Training activities remain isolated in lazily loaded section maps; only one may be active at a time.
- Training Ground does not use the standard five-minute win/draw lifecycle.
- Exiting the map performs a complete Training Ground session cleanup.

## Scope boundary

Module 1 does not add a shop, inventory menu, unlock system, persistent collection, tutorials with saved progress, or new art assets beyond the existing game's representative models and primitives.

## Verification commands

```text
npm run typecheck
npm run build
npm run dev
```

Module 1 is complete when the player enters through a clean, lightweight orientation hub, can inspect the gallery, dynamically load either training section through the top navigation, return to the hub, and exit without carrying Training Ground state into Foundry or a later visit.
