# Open FPS - Game Specification

## Product Summary

Open FPS is a compact, skill-focused first-person shooter that runs in a modern desktop browser. The player competes against one computer-controlled opponent in a small indoor arena. The goal is a responsive, replayable prototype rather than a full commercial Counter-Strike clone.

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
- **Combat:** Move with WASD, look with the mouse, jump, aim with a centered crosshair, hold right mouse to use weapon-specific ADS, fire, switch weapons, and reload.
- **HUD:** Show player health, ammo, player kills, bot kills, and remaining match time at all times.
- **End screen:** Declare Player Win, Bot Win, or Draw; show the final score; offer Restart.

### Aim Down Sights (ADS)

ADS is a hold-to-aim feature available on every player weapon. Holding the right mouse button smoothly narrows the camera field of view and moves the equipped weapon into an aimed position. Releasing the button returns to the normal hip-fire view. ADS is cancelled safely when the player reloads, switches weapons, unlocks the pointer, dies, or the match ends. Left mouse fire continues to work while right mouse ADS is held.

| Weapon | ADS field of view | Intended use |
|---|---:|---|
| Assault Rifle | 0.64 radians | Moderate mid-range zoom |
| Scattergun | 0.73 radians | Light close-range zoom |
| Marksman Rifle | 0.43 radians | Strong long-range zoom |

The ADS transition also updates the crosshair and first-person weapon transform together. The values are defined in `src/game/config/gameConfig.ts` and applied by `src/game/weapon/WeaponSystem.ts`.

## Technology Stack

| Layer | Choice | Purpose |
|---|---|---|
| Language | TypeScript | Typed gameplay code and easier maintenance |
| Build tool | Vite | Fast local development server and production build |
| 3D framework | Babylon.js | Scene rendering, cameras, input, assets, audio, raycasts, particles, and GUI |
| Physics | Babylon collisions first | Player/world collision and gravity without adding unnecessary complexity |
| Assets | Blender + glTF/GLB | Create and export the arena, weapon, and bot models |
| Audio | Babylon.js audio | Gunfire, reload, hit, footsteps, and match UI feedback |

## Extensible Map Loading Architecture

Open FPS uses a lazy-loaded, map-isolated arena architecture. Shared game systems load once when the application starts, but map code and map assets load only after the player selects a map. This keeps unselected arenas out of the active scene and supports additional maps without loading every arena into memory at startup.

### Loading lifecycle

```text
Open FPS starts
  -> Load shared engine, HUD, player, weapon, bot, audio, settings, and match systems
  -> Show the pre-match map-selection screen
  -> Player selects a map
  -> Dynamically import the selected map module
  -> Load the selected map's GLB models, textures, materials, and environment assets
  -> Create and play one arena scene
  -> Dispose the current scene before creating a different selected map
```

The map-selection screen may load lightweight metadata for every map, such as its ID, display name, description, and optional thumbnail. It must not preload map geometry, GLB models, textures, collision data, or environment assets for unselected maps.

### Map module contract

Each map is a self-contained module that owns its geometry, GLB models, textures, materials, lighting, collision meshes, spawn points, patrol points, navigation points, cover points, and other map-specific data. Every map must return the shared `ArenaBuildResult` contract so the player, combat, bot, weapon, and match systems remain map-agnostic.

```text
src/game/arena/
├── arenaTypes.ts                Shared ArenaBuildResult and arena data contracts
├── mapRegistry.ts               Lightweight metadata and dynamic map import functions
├── trainingYard/
│   ├── createTrainingYard.ts    Training Yard builder
│   └── assets.ts                Training Yard asset references and loading helpers
└── foundry/
    ├── createFoundry.ts         Foundry builder
    └── assets.ts                Foundry asset references and loading helpers
```

`mapRegistry.ts` is the only shared entry point for map construction. It must use dynamic imports for map builders so Vite emits separate map chunks. A new map should require only its own module/assets, lightweight registry metadata, and shared-contract validation; it should not require changes to the core gameplay systems.

### Runtime and caching rules

- Only the currently selected map may be constructed in the Babylon scene.
- Changing maps or starting a match on a different map disposes the previous scene and its map resources before creating the next one.
- The browser may cache previously downloaded map code and assets, allowing later selections to load faster, but a new scene is created for each match.
- The application must show a loading state while the selected map module and its assets are loading.
- Map assets must not be statically imported by the startup path or preloaded for maps the player has not selected.

### Map acceptance criteria

- Selecting one map does not download or construct another map's geometry or assets.
- Each map supplies valid spawn, patrol, navigation, and cover data through `ArenaBuildResult`.
- Each map passes collision, visibility, respawn-safety, bot-navigation, performance, and full-match verification.
- Adding a future third or fourth map follows the same module-and-registry pattern without expanding the initial scene memory footprint.

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
| `src/game/weapon/WeaponSystem.ts` | Owns the three player weapons: firing, ADS, hitscan raycasts, independent ammunition, reload timing, recoil, muzzle flash, impact decals/sparks, hit markers, switching animation, and weapon HUD updates. |
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

## Explicitly Out of Scope

- Online multiplayer, matchmaking, accounts, servers, anti-cheat, and network prediction.
- Multiple maps, weapon inventories, teams, buy phases, ranked play, and persistent progression.
- Advanced bot navigation or realistic character animation in the first playable release.
