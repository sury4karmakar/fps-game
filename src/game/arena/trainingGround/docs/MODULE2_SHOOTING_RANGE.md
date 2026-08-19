# Open FPS — Training Ground Module 2: Shooting Range

## Module 2 outcome

The Shooting Range is a lazily loaded practice section inside Training Ground. It is not constructed when the player initially selects Training Ground; it loads only after the player selects Shooting Range from the hub's top-screen navigation. The player then equips exactly one of the three existing weapons, starts a training session by shooting the start-training box, selects Easy, Medium, or Hard, and practices against non-attacking training bots. Ammunition can be replenished at any time without exceeding the selected weapon's existing ammunition cap.

Shooting the exit-range box ends the session, disposes the complete Shooting Range section, and returns the player to the Entry and Showcase hub. The design must support adding future modes, such as a one-minute reaction or quick-kill challenge, without rewriting the range controller.

## Planned implementation by module

### 1. Shooting-range layout and interaction contract

- [x] Dynamically import the Shooting Range builder only after the hub's Shooting Range button is selected.
- [x] Build the Shooting Range as a bounded, independently disposable Training Ground section with a player entry point, close-, medium-, and long-range target lanes, and safe firing boundaries.
- [x] Add shootable interaction boxes for Start Training and Exit Range.
- [x] Add walk-over pickup stations for the Assault Rifle, Scattergun, and Marksman Rifle.
- [x] Add a walk-over ammunition pickup station that remains available before, during, and after a training session.
- [x] Add an in-world training-mode panel that becomes active after Start Training is shot.
- [x] Ensure shots cannot activate controls through walls or outside the Shooting Range.

Primary implementation: `src/game/arena/trainingGround/shootingRange/` and `src/game/arena/trainingGround/createTrainingGround.ts`.

The range module owns its geometry, interaction meshes, target spawn points, assets, and lifecycle. The Training Ground hub owns section selection and loads no range code or assets before selection.

### 2. Single-weapon pickup flow

- [x] Introduce a Training Ground inventory state that allows exactly one equipped weapon.
- [x] Make collecting a weapon pickup replace the currently equipped weapon rather than adding another weapon slot.
- [x] Disable number-key and mouse-wheel switching while the player is using the Shooting Range inventory.
- [x] Initialize a newly selected weapon with its existing configured magazine and reserve ammunition limits.
- [x] Keep weapon damage, fire rate, reload time, spread, recoil, ADS, and maximum ammunition values sourced from `WEAPON_DEFINITIONS`.
- [x] Require the player to collect a weapon before the Start Training box can activate mode selection.
- [x] Explain that a weapon must be selected when Start Training is shot without one.
- [x] Show clear HUD feedback when a weapon is equipped or replaced.

Primary implementation: `src/game/weapon/WeaponSystem.ts` plus a Training Ground shooting-range controller.

### 3. Extensible training-mode registry

- [x] Define a typed `TrainingModeId` and `TrainingModeDefinition` contract owned by the Shooting Range.
- [x] Register Easy, Medium, and Hard through data rather than mode-specific UI branches.
- [x] Let each definition provide its display name, target count/spawn configuration, movement behavior, and optional duration/scoring rules.
- [x] Keep mode selection disabled until the Start Training box is shot.
- [x] Start exactly one mode at a time and reset an active mode before another begins.
- [x] Allow future timed reaction and quick-kill modes to be registered without changing the range lifecycle or interaction system.

Initial mode rules:

| Mode | Target behavior |
|---|---|
| Easy | Training bots remain static at their configured spawn points. |
| Medium | Training bots strafe left and right within fixed lane bounds; they never move forward or backward. |
| Hard | Training bots choose unpredictable legal movement in any horizontal direction and may jump or crouch. |

All Shooting Range bots are non-attacking practice targets. Eliminated targets respawn at valid range positions while the selected mode remains active.

Primary implementation: `src/game/arena/trainingGround/shootingRange/trainingModes.ts` and `TrainingRangeController.ts`.

### 4. Training-bot lifecycle

- [x] Spawn training bots only after a mode is selected.
- [x] Use configured close-, medium-, and long-range spawn points without exposing bots outside the Shooting Range.
- [x] Keep Easy bots stationary and prevent residual velocity after spawn or respawn.
- [x] Constrain Medium bots to lateral movement inside their assigned lane.
- [x] Constrain Hard bots to the range boundaries and prevent movement into the player/control area.
- [x] Support jumping and crouching animations/collision height for Hard bots.
- [x] Count confirmed eliminations for session feedback without affecting Foundry match scores or statistics.
- [x] Dispose every bot mesh, observer, timer, and movement controller during reset or scene disposal.

Primary implementation: a range-specific training-target controller; the standard `BotAI` remains unchanged for Foundry matches.

### 5. Ammunition and reset flow

- [x] Refill only the currently equipped weapon when the ammunition pickup is collected.
- [x] Clamp magazine plus reserve ammunition to that weapon's existing `maxTotalAmmo` value.
- [x] Provide feedback when ammunition is added or already at maximum capacity.
- [x] Make Exit Range stop the current mode immediately.
- [x] Despawn all active training bots and clear target movement, respawn work, timers, counters, and temporary mode state.
- [x] Return the mode panel and Start Training box to the idle state.
- [x] Dispose the range root, geometry, weapon stations, ammunition station, and all section-local resources when Exit Range is shot.
- [x] Return the player to the Entry and Showcase hub after range disposal.
- [x] Run the same cleanup when changing maps or disposing the Training Ground scene.

Primary implementation: `TrainingRangeController.ts`, `WeaponSystem.ts`, and the Training Ground scene lifecycle.

### 6. HUD, feedback, and accessibility

- [x] Display the equipped training weapon and current magazine/reserve ammunition.
- [x] Display the selected mode and session elimination count while training is active.
- [x] Add readable labels and distinct colors for Start, Exit, mode, weapon, and ammunition boxes.
- [x] Provide hit/activation audio and text feedback for every range control.
- [x] Ensure interaction feedback remains usable with reduced motion and muted audio.
- [x] Prevent range prompts and counters from appearing during Foundry matches.

Primary implementation: Shooting Range HUD bindings, `src/main.ts`, `index.html`, and `src/styles.css`.

### 7. Verification and regression

- [x] Verify Start Training reveals/enables exactly the registered modes.
- [x] Verify Easy targets never move.
- [x] Verify Medium targets move laterally only.
- [x] Verify Hard targets move unpredictably within bounds and can jump and crouch.
- [x] Verify targets never attack the player.
- [x] Verify the player can hold only one weapon and pickup replacement is reliable.
- [x] Verify ammunition never exceeds each weapon's configured cap.
- [x] Verify Exit Range disposes the section and returns the player to the hub with no active timers or bots.
- [x] Verify repeated start, mode change, exit, and re-entry cycles do not duplicate observers or meshes.
- [x] Verify the Shooting Range module and assets are absent from the initial Training Ground hub load.
- [x] Verify Training Ground behavior does not change Foundry combat, inventory, bot AI, scoring, or match timing.
- [x] Run `npm run typecheck` and `npm run build`.

## Shooting Range rules

- The range has no five-minute match timer and does not declare a winner or draw.
- The player equips one of the three existing weapons at a time.
- A weapon must be equipped before a training mode can start.
- Ammunition uses the existing per-weapon maximum capacity.
- Training bots do not damage or fire at the player.
- Only one training mode may run at a time.
- Shooting Exit Range always clears and unloads the active training session, then returns to the hub.

## Scope boundary

Module 2 does not add new weapons, persistent scores, leaderboards, multiplayer, player damage from training bots, or the future timed reaction/quick-kill modes. It supplies the registry and lifecycle needed to add those modes later.

## Verification commands

```text
npm run typecheck
npm run build
npm run dev
```

Module 2 is complete when the full enter, equip, start, select-mode, train, refill, and exit flow works repeatedly for all three weapons and modes without leaking state into another Training Ground section or Foundry.
