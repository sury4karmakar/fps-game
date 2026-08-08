import type { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createArena } from "./arena/createArena";
import { AudioSystem, type AudioHudElements } from "./audio/AudioSystem";
import { BotAI } from "./bot/BotAI";
import { CombatSystem, type CombatHudElements } from "./combat/CombatSystem";
import {
  DEFAULT_MATCH_CONFIGURATION,
  getArenaMapDefinition,
  isArenaMapAvailable,
  type MatchConfiguration,
} from "./config/gameConfig";
import { MatchManager, type MatchHudElements } from "./match/MatchManager";
import { PlayerController } from "./player/PlayerController";
import { WeaponSystem, type WeaponHudElements } from "./weapon/WeaponSystem";

export interface SceneBuildResult {
  readonly scene: Scene;
  readonly audioSystem: AudioSystem;
  readonly playerController: PlayerController;
  readonly combatSystem: CombatSystem;
  readonly botAI: BotAI;
  readonly weaponSystem: WeaponSystem;
  readonly matchManager: MatchManager;
}

export function createScene(
  engine: Engine,
  canvas: HTMLCanvasElement,
  weaponHud: WeaponHudElements,
  combatHud: CombatHudElements,
  matchHud: MatchHudElements,
  audioHud: AudioHudElements,
  matchDurationMs?: number,
  matchConfiguration: MatchConfiguration = DEFAULT_MATCH_CONFIGURATION,
): SceneBuildResult {
  const selectedMap = getArenaMapDefinition(matchConfiguration.selectedMapId);

  if (!isArenaMapAvailable(matchConfiguration.selectedMapId)) {
    throw new Error(
      `The ${selectedMap.displayName} map is not available in this build.`,
    );
  }

  const scene = new Scene(engine);
  scene.metadata = {
    ...(scene.metadata as Record<string, unknown> | null),
    matchConfiguration,
  };
  const arena = createArena(scene);
  const audioSystem = new AudioSystem(audioHud);
  const playerController = new PlayerController(
    scene,
    canvas,
    arena.spawnPoints.player,
    arena.collidableMeshes,
    (sprinting) => audioSystem.playFootstep(sprinting),
  );
  let matchManager: MatchManager | null = null;
  let weaponSystem: WeaponSystem | null = null;
  const combatSystem = new CombatSystem(
    scene,
    playerController,
    arena.respawnPoints,
    combatHud,
    (killer) => matchManager?.recordKill(killer),
    (amount) => weaponSystem?.addAmmo(amount) ?? 0,
    audioSystem,
  );
  const botAI = new BotAI(
    scene,
    playerController,
    combatSystem,
    arena.botPatrolPoints,
    arena.botNavigationPoints,
    matchConfiguration.botDifficultyId,
  );
  weaponSystem = new WeaponSystem(
    scene,
    canvas,
    playerController.camera,
    weaponHud,
    (mesh, damage) => combatSystem.applyWeaponHit(mesh, damage),
    () => botAI.notifyPlayerShot(playerController.camera.position),
    audioSystem,
  );
  matchManager = new MatchManager(
    scene,
    playerController,
    combatSystem,
    botAI,
    weaponSystem,
    audioSystem,
    matchHud,
    matchDurationMs,
    matchConfiguration.botDifficultyId,
    (botDifficultyId) => {
      scene.metadata = {
        ...(scene.metadata as Record<string, unknown> | null),
        matchConfiguration: {
          ...matchConfiguration,
          botDifficultyId,
        },
      };
    },
  );

  return {
    scene,
    audioSystem,
    playerController,
    combatSystem,
    botAI,
    weaponSystem,
    matchManager,
  };
}
