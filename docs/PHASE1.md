# Open FPS — Phase 1

## Phase 1 outcome

Open FPS is a browser-based, single-player first-person shooter in which one human player fights one AI bot in a small indoor arena. A match lasts exactly five minutes (300 seconds). Each confirmed elimination awards one kill, combatants respawn after a short delay at safe spawn points, and the higher score wins. Equal scores produce a draw.

The first-playable definition is complete: the player can open the game, start a match, move through a 3D arena, fight one bot, see both scores and the clock, and receive the correct winner/draw result.

## Completed implementation by module

### 1. Project Foundation

- [x] Create the Vite and TypeScript project.
- [x] Install and configure Babylon.js.
- [x] Create the game canvas, engine, scene, and render loop.
- [x] Add browser resize handling.
- [x] Add initial loading and error states.

Primary implementation: `src/main.ts`, `src/game/GameApplication.ts`, `src/game/createScene.ts`, `index.html`, `package.json`, `tsconfig.json`, and `vite.config.ts`.

`main.ts` wires the required DOM/HUD elements, starts or retries `GameApplication`, supports the development-only `?matchSeconds=` timer override, and reports startup/runtime errors. `GameApplication.ts` creates and disposes the Babylon engine and render loop. `createScene.ts` composes the arena, audio, player, combat, bot, weapon, and match systems.

### 2. Arena

- [x] Create the arena floor and boundary walls.
- [x] Add cover objects, crates, and ramps.
- [x] Add lighting, shadows, and a basic sky/environment.
- [x] Configure collision meshes.
- [x] Add safe player and bot spawn points.

Primary implementation: `src/game/arena/createArena.ts`, `src/game/arena/createEnvironment.ts`, and `src/game/arena/arenaTypes.ts`.

The playable arena is 36×28 and includes floor, walls, cover, crates, platforms, ramps, collision metadata, spawn pads, player/bot respawn points, and bot patrol/navigation waypoints. The environment includes a sky sphere, fog, ambient and directional lighting, and filtered shadows.

### 3. Player Controller

- [x] Add pointer-lock mouse controls.
- [x] Add WASD movement and mouse look.
- [x] Add sprinting and jumping.
- [x] Add hold-to-crouch movement with Left Ctrl.
- [x] Add gravity and world collision.
- [x] Tune movement speed, jump height, and camera feel.

Primary implementation: `src/game/player/PlayerController.ts`.

The controller owns the first-person camera, pointer lock, keyboard movement, mouse look, sprint, crouch, jump, gravity, collision, ground/ceiling checks, respawn behavior, and footsteps.

### 4. Weapon System

- [x] Add a placeholder first-person rifle.
- [x] Add left-click hitscan shooting with raycasts.
- [x] Add fire rate and ammunition limits.
- [x] Cap total ammunition at 90 rounds.
- [x] Add reload behavior.
- [x] Add recoil, muzzle flash, impact effects, and hit markers.

Primary implementation: `src/game/weapon/WeaponSystem.ts`.

The rifle uses a 30-round magazine with 90-round total ammunition, fire-rate control, reload timing, hitscan raycasts, recoil, muzzle flash, hit markers, impact particles, and impact decals. Decals are depth-occluded by arena geometry so marks cannot be seen through cover.

### 5. Damage, Health, and Respawning

- [x] Add health to the player and bot.
- [x] Apply weapon damage on confirmed hits.
- [x] Add damage feedback.
- [x] Add death handling and a short respawn delay.
- [x] Add brief spawn protection and safe respawn selection.
- [x] Drop a 15-second health and ammunition pickup when the bot is eliminated.

Primary implementation: `src/game/combat/CombatSystem.ts`.

Combat tracks player and bot health, resolves body/headshot damage, handles deaths and protected respawns, chooses safe spawn points, updates bot visuals and fire feedback, displays damage messages, and creates temporary health/ammunition supply pickups after bot elimination.

### 6. Bot AI

- [x] Create the bot character and collision body.
- [x] Add patrol behavior.
- [x] Add player detection and pursuit behavior.
- [x] Add aiming and shooting behavior.
- [x] Add bot death, scoring, and respawning.
- [x] Tune bot accuracy, reaction time, movement, and difficulty.

Primary implementation: `src/game/bot/BotAI.ts`.

The bot supports patrol, detection, hearing, pursuit, search, navigation, obstacle/stuck recovery, aiming, movement, firing cadence, accuracy, temporary combat decisions, death, scoring, and respawning.

### 7. Match Manager

- [x] Add match states: waiting, playing, and finished.
- [x] Add the five-minute countdown timer.
- [x] Track player and bot kills.
- [x] Stop combat when the timer reaches zero.
- [x] Determine Player Win, Bot Win, or Draw.
- [x] Add match restart behavior.

Primary implementation: `src/game/match/MatchManager.ts`.

The manager controls the waiting/playing/finished lifecycle, countdown, scoring, enable/disable state of gameplay systems, start/restart actions, and final result evaluation.

### 8. HUD and Menus

- [x] Create the start screen with controls.
- [x] Add the crosshair.
- [x] Display player health and ammunition.
- [x] Display player kills, bot kills, and remaining time.
- [x] Create the final result and restart screen.

Primary implementation: `index.html`, `src/main.ts`, and `src/styles.css`.

The interface includes the start overlay, controls, centered crosshair, health, ammo, score, timer, audio control, loading/error overlay, final Player Win/Bot Win/Draw result, and restart action. Styles include responsive, small-screen, and reduced-motion layouts.

### 9. Audio, Effects, and Quality

- [x] Add gunshot, reload, impact, and UI sounds.
- [x] Add footsteps and player damage cues.
- [x] Add simple particles and decals.
- [x] Test the full five-minute match flow.
- [x] Test performance and the production build in supported browsers.

Primary implementation: `src/game/audio/AudioSystem.ts` plus the weapon, player, combat, and match systems.

Audio is generated and played through Web Audio-based effects for gunfire, reload, impact, footsteps, damage, kills, pickups, and UI feedback. The audio system also provides mute control and HUD state. Combat effects include muzzle flash, impact particles, hit markers, sparks, and simple decals.

## Match rules implemented

- One human player versus one AI bot.
- Five-minute (300-second) round.
- One kill for each confirmed elimination.
- Short-delay respawns at safe points for both combatants.
- More kills at timeout wins.
- Equal kills produce a draw.
- Combat stops when the timer reaches zero.
- Match can be restarted from the result screen.

## Scope boundary

The following are intentionally not part of this completed phase:

- Online multiplayer, matchmaking, accounts, servers, anti-cheat, and network prediction.
- Multiple maps, weapon inventories, teams, buy phases, ranked play, and persistent progression.
- Advanced bot navigation or realistic character animation.
- Temporary asset replacement; placeholder assets remain intentionally deferred.

## Verification commands

The project defines these commands in `package.json`:

```text
npm run typecheck
npm run build
npm run dev
npm run preview
```

Phase 1 is complete when type checking, the production build, the full five-minute match flow, and supported-browser performance checks pass.

