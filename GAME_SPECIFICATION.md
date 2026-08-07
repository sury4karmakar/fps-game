# Arena Strike - Game Specification

## Product Summary

Arena Strike is a compact, skill-focused first-person shooter that runs in a modern desktop browser. The player competes against one computer-controlled opponent in a small indoor arena. The goal is a responsive, replayable prototype rather than a full commercial Counter-Strike clone.

| Item | Specification |
|---|---|
| Project type | Browser-based first-person shooter |
| Match format | Player versus one AI bot |
| Win condition | Most eliminations when the five-minute timer ends |
| Scope boundary | Single-player only; no online multiplayer in this phase |

## Core Match Rules

| Rule | Specification |
|---|---|
| Participants | One human player and one AI bot |
| Round length | Exactly 5 minutes (300 seconds) |
| Scoring | Each confirmed elimination awards one kill to the attacker |
| Respawn | Both combatants respawn after a short delay at safe spawn points |
| Winner | The combatant with more kills when the timer reaches zero |
| Draw | If scores are equal, the match ends in a draw for the first version |

## Player Experience

- **Start screen:** Explain controls and begin a new five-minute match.
- **Combat:** Move with WASD, look with the mouse, jump, aim with a centered crosshair, fire the rifle, and reload.
- **HUD:** Show player health, ammo, player kills, bot kills, and remaining match time at all times.
- **End screen:** Declare Player Win, Bot Win, or Draw; show the final score; offer Restart.

## Technology Stack

| Layer | Choice | Purpose |
|---|---|---|
| Language | TypeScript | Typed gameplay code and easier maintenance |
| Build tool | Vite | Fast local development server and production build |
| 3D framework | Babylon.js | Scene rendering, cameras, input, assets, audio, raycasts, particles, and GUI |
| Physics | Babylon collisions first | Player/world collision and gravity without adding unnecessary complexity |
| Assets | Blender + glTF/GLB | Create and export the arena, weapon, and bot models |
| Audio | Babylon.js audio | Gunfire, reload, hit, footsteps, and match UI feedback |

## Game Modules

| Module | Responsibility | First-version deliverables |
|---|---|---|
| Application & scene | Initialize Babylon.js and run the game loop | Canvas, engine, scene, resize handling, loading state |
| Arena | Create the playable combat space | Floor, walls, cover crates, ramps, lights, spawn points, collision mesh |
| Player controller | Translate keyboard and mouse input into FPS movement | Pointer lock, WASD, sprint, jump, gravity, collision, camera |
| Weapon system | Handle firing and ammunition | Rifle model placeholder, hitscan raycast, rate of fire, reload, recoil, muzzle flash |
| Damage & health | Apply hits and manage life state | Health values, hit feedback, death, respawn protection |
| Bot AI | Provide a predictable combat opponent | Patrol/chase/attack states, aiming, shooting, respawn |
| Match manager | Own the round state and determine the winner | 300-second timer, kill tracking, start/end states, result evaluation |
| HUD & menus | Make game state visible and controllable | Crosshair, health, ammo, score, timer, start/end/restart screens |
| Audio & effects | Give combat readable feedback | Gunshots, reloads, impacts, damage cue, particles, simple decals |

## Build Sequence

1. **Foundation:** Vite + TypeScript project, Babylon scene, game loop, and test canvas.
2. **Arena and movement:** Collision-ready arena plus first-person player controls.
3. **Combat:** Rifle, raycast bullets, health, respawn, and combat feedback.
4. **Opponent:** One bot with simple patrol, pursuit, aiming, and shooting behavior.
5. **Round rules:** Timer, scores, winner/draw logic, HUD, and restart screen.
6. **Polish:** Replace placeholders, tune balance, add sound and visual effects, then test performance.

## Task Progression

Update an item from `[ ]` to `[x]` when it is completed and verified.

### 1. Project Foundation

- [x] Create the Vite and TypeScript project.
- [x] Install and configure Babylon.js.
- [x] Create the game canvas, engine, scene, and render loop.
- [x] Add browser resize handling.
- [x] Add initial loading and error states.

### 2. Arena

- [x] Create the arena floor and boundary walls.
- [x] Add cover objects, crates, and ramps.
- [x] Add lighting, shadows, and a basic sky/environment.
- [x] Configure collision meshes.
- [x] Add safe player and bot spawn points.

### 3. Player Controller

- [x] Add pointer-lock mouse controls.
- [x] Add WASD movement and mouse look.
- [x] Add sprinting and jumping.
- [x] Add gravity and world collision.
- [x] Tune movement speed, jump height, and camera feel.

### 4. Weapon System

- [x] Add a placeholder first-person rifle.
- [x] Add left-click hitscan shooting with raycasts.
- [x] Add fire rate and ammunition limits.
- [x] Add reload behavior.
- [x] Add recoil, muzzle flash, impact effects, and hit markers.

### 5. Damage, Health, and Respawning

- [x] Add health to the player and bot.
- [x] Apply weapon damage on confirmed hits.
- [x] Add damage feedback.
- [x] Add death handling and a short respawn delay.
- [x] Add brief spawn protection and safe respawn selection.

### 6. Bot AI

- [ ] Create the bot character and collision body.
- [ ] Add patrol behavior.
- [ ] Add player detection and pursuit behavior.
- [ ] Add aiming and shooting behavior.
- [ ] Add bot death, scoring, and respawning.
- [ ] Tune bot accuracy, reaction time, movement, and difficulty.

### 7. Match Manager

- [ ] Add match states: waiting, playing, and finished.
- [ ] Add the five-minute countdown timer.
- [ ] Track player and bot kills.
- [ ] Stop combat when the timer reaches zero.
- [ ] Determine Player Win, Bot Win, or Draw.
- [ ] Add match restart behavior.

### 8. HUD and Menus

- [ ] Create the start screen with controls.
- [ ] Add the crosshair.
- [ ] Display player health and ammunition.
- [ ] Display player kills, bot kills, and remaining time.
- [ ] Create the final result and restart screen.

### 9. Audio, Effects, and Quality

- [ ] Add gunshot, reload, impact, and UI sounds.
- [ ] Add footsteps and player damage cues.
- [ ] Add simple particles and decals.
- [ ] Replace temporary assets where needed.
- [ ] Test the full five-minute match flow.
- [ ] Test performance and the production build in supported browsers.

## Explicitly Out of Scope

- Online multiplayer, matchmaking, accounts, servers, anti-cheat, and network prediction.
- Multiple maps, weapon inventories, teams, buy phases, ranked play, and persistent progression.
- Advanced bot navigation or realistic character animation in the first playable release.

## Definition of First Playable

A player can open the browser game, start a five-minute match, move safely through a 3D arena, fight one bot, see both scores and the clock, and receive a correct winner/draw result at the end.

## Next Phases - Later, Not Part of the Current Build

The following work is intentionally deferred until the first playable version is complete and stable.

### Phase 2: Expanded Single-Player Game

- [ ] Add multiple bot difficulty levels.
- [ ] Add improved navigation and tactical bot behavior.
- [ ] Add additional weapons and weapon switching.
- [ ] Add a second arena and map selection.
- [ ] Add pickups such as health, ammunition, and armor.
- [ ] Add better character, weapon, and reload animations.
- [ ] Add settings for controls, mouse sensitivity, audio, and graphics.

### Phase 3: Game Polish and Distribution

- [ ] Add higher-quality models, textures, lighting, audio, and visual effects.
- [ ] Add pause, accessibility, and onboarding improvements.
- [ ] Add performance presets for lower-powered devices.
- [ ] Add saved settings and local match statistics.
- [ ] Prepare and publish a production web build.

### Possible Future Multiplayer Phase

- [ ] Evaluate whether multiplayer is still desired after the single-player game is complete.
- [ ] Design a server-authoritative networking architecture.
- [ ] Add online player synchronization, matchmaking, and latency handling.
- [ ] Add server-side validation and basic anti-cheat protections.

Multiplayer remains outside the approved project scope and should not begin without a separate planning decision.
