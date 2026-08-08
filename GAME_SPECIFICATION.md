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

## Project Folders and Files

The source code is organized by gameplay responsibility. `src/main.ts` starts the game, `src/game/createScene.ts` connects all systems, and each subfolder under `src/game/` owns one part of the match.

```text
fps-game/
├─ src/                         Browser application source
│  ├─ game/                     Babylon.js game systems
│  │  ├─ arena/                 Arena geometry, lighting, and spawn/navigation data
│  │  ├─ audio/                 Procedural sound and sound-control UI
│  │  ├─ bot/                   Computer opponent behaviour
│  │  ├─ combat/                Health, damage, deaths, respawns, and pickups
│  │  ├─ match/                 Match lifecycle, timer, scores, and result screen
│  │  ├─ player/                First-person camera and movement controls
│  │  └─ weapon/                Rifle firing, ammunition, hit effects, and reloads
│  ├─ main.ts                   Browser entry point and DOM/HUD element wiring
│  ├─ styles.css                Complete visual styling for the HUD, menus, and responsive layout
│  └─ vite-env.d.ts             Vite TypeScript environment declarations
├─ index.html                   Canvas and all static HUD/menu markup
├─ package.json                 NPM scripts and direct project dependencies
├─ package-lock.json            Locked, reproducible dependency versions
├─ tsconfig.json                TypeScript compiler and strictness settings
├─ vite.config.ts               Vite build configuration
├─ GAME_SPECIFICATION.md        Product requirements, delivery checklist, and this project map
├─ README.md                    Repository landing page (currently empty)
├─ .gitignore                   Excludes dependencies, build output, caches, and logs from Git
├─ node_modules/                Installed NPM packages; generated locally and not committed
└─ dist/                        Generated production build; recreated by `npm run build`
```

| Path | Exact responsibility |
|---|---|
| `src/main.ts` | Imports global styles, finds every required HTML element, creates HUD-element contracts, starts/retries `GameApplication`, supports the development-only `?matchSeconds=` timer override, and reports startup/runtime errors. |
| `src/styles.css` | Styles the full-screen game canvas, crosshair, health/ammo/score/timer HUD, overlays, menu controls, audio toggle, animations, and small-screen/reduced-motion layouts. |
| `src/vite-env.d.ts` | Makes Vite-provided TypeScript types, including `import.meta.env`, available to source files. |
| `src/game/GameApplication.ts` | Creates the Babylon engine, calls `createScene`, starts the render loop, responds to browser resizes, and disposes every game system cleanly. |
| `src/game/createScene.ts` | Composition root: creates the arena, audio, player, combat, bot, weapon, and match systems; connects their callbacks; returns the finished scene and systems to `GameApplication`. |
| `src/game/arena/createArena.ts` | Builds the playable 36×28 arena: floor, walls, cover, crates, platforms, ramps, collision metadata, spawn pads, player/bot respawn points, and bot patrol/navigation waypoints. |
| `src/game/arena/createEnvironment.ts` | Configures the sky sphere, fog, ambient and directional lighting, and filtered shadow generator used by the arena. |
| `src/game/arena/arenaTypes.ts` | Defines the typed data returned by arena construction: spawn positions/facing, collidable meshes, and bot route points. |
| `src/game/player/PlayerController.ts` | Runs the FPS camera and player input: pointer lock, WASD movement, mouse look, sprint, crouch, jump, gravity, collision, ground/ceiling checks, respawning, and footsteps. |
| `src/game/weapon/WeaponSystem.ts` | Owns the player rifle: input to fire, hitscan raycasts, 30-round magazine/90-round total ammo limit, reload timing, recoil, muzzle flash, impact decals/sparks, hit markers, and weapon HUD updates. |
| `src/game/combat/CombatSystem.ts` | Tracks player and bot health; resolves body/headshot damage; handles deaths, protected respawns, safe-spawn selection, bot visuals/fire feedback, damage HUD/messages, and bot-kill supply pickups. |
| `src/game/bot/BotAI.ts` | Controls the bot’s patrol, detection, hearing, pursuit, search, navigation, obstacle/stuck recovery, aiming, movement, firing cadence, accuracy, and temporary combat decisions. |
| `src/game/match/MatchManager.ts` | Controls waiting/playing/finished match states, the five-minute countdown, kill scoring, system enable/disable state, start/restart UI actions, and final player-win/bot-win/draw result. |
| `src/game/audio/AudioSystem.ts` | Generates and plays Web Audio-based gunfire, reload, impact, footsteps, damage, kill, pickup, and UI sounds; also implements mute control and its HUD state. |
| `index.html` | Provides the Babylon canvas plus the semantic DOM markup and IDs consumed by `main.ts`: combat HUD, score/timer, audio control, match start/end overlay, and loading/error overlay. |
| `package.json` | Declares the `dev`, `build`, `preview`, and `typecheck` commands, plus Babylon.js, TypeScript, and Vite dependencies. |
| `tsconfig.json` | Enables strict, no-output TypeScript checking for ES2022 browser code in `src/`. |
| `vite.config.ts` | Sets Vite’s production chunk-size warning threshold to 1400 kB. |

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
- [x] Add hold-to-crouch movement with Left Ctrl.
- [x] Add gravity and world collision.
- [x] Tune movement speed, jump height, and camera feel.

### 4. Weapon System

- [x] Add a placeholder first-person rifle.
- [x] Add left-click hitscan shooting with raycasts.
- [x] Add fire rate and ammunition limits.
- [x] Cap total ammunition at 90 rounds.
- [x] Add reload behavior.
- [x] Add recoil, muzzle flash, impact effects, and hit markers.

### 5. Damage, Health, and Respawning

- [x] Add health to the player and bot.
- [x] Apply weapon damage on confirmed hits.
- [x] Add damage feedback.
- [x] Add death handling and a short respawn delay.
- [x] Add brief spawn protection and safe respawn selection.
- [x] Drop a 15-second health and ammunition pickup when the bot is eliminated.

### 6. Bot AI

- [x] Create the bot character and collision body.
- [x] Add patrol behavior.
- [x] Add player detection and pursuit behavior.
- [x] Add aiming and shooting behavior.
- [x] Add bot death, scoring, and respawning.
- [x] Tune bot accuracy, reaction time, movement, and difficulty.

### 7. Match Manager

- [x] Add match states: waiting, playing, and finished.
- [x] Add the five-minute countdown timer.
- [x] Track player and bot kills.
- [x] Stop combat when the timer reaches zero.
- [x] Determine Player Win, Bot Win, or Draw.
- [x] Add match restart behavior.

### 8. HUD and Menus

- [x] Create the start screen with controls.
- [x] Add the crosshair.
- [x] Display player health and ammunition.
- [x] Display player kills, bot kills, and remaining time.
- [x] Create the final result and restart screen.

### 9. Audio, Effects, and Quality

- [x] Add gunshot, reload, impact, and UI sounds.
- [x] Add footsteps and player damage cues.
- [x] Add simple particles and decals.
- [x] Test the full five-minute match flow.
- [x] Test performance and the production build in supported browsers.

Temporary asset replacement is intentionally deferred for a later phase.

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
- [ ] Add additional pickup types such as armor.
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
