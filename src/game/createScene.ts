import type { Engine } from "@babylonjs/core/Engines/engine.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { Scene } from "@babylonjs/core/scene.js";
import { validateArenaBuildResult } from "./arena/arenaTypes";
import { loadArenaBuilder } from "./arena/mapRegistry";
import { AudioSystem, type AudioHudElements } from "./audio/AudioSystem";
import { BotAI } from "./bot/BotAI";
import { CombatSystem, type CombatHudElements } from "./combat/CombatSystem";
import {
  DEFAULT_MATCH_CONFIGURATION,
  getArenaMapDefinition,
  isArenaMapAvailable,
  type MatchConfiguration,
} from "./config/gameConfig";
import {
  MatchManager,
  type MatchHudElements,
  type MatchStartRequestHandler,
} from "./match/MatchManager";
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
  readonly shadowGenerator: ShadowGenerator;
}

export async function createScene(
  engine: Engine,
  canvas: HTMLCanvasElement,
  weaponHud: WeaponHudElements,
  combatHud: CombatHudElements,
  matchHud: MatchHudElements,
  audioHud: AudioHudElements,
  matchDurationMs?: number,
  matchConfiguration: MatchConfiguration = DEFAULT_MATCH_CONFIGURATION,
  onMatchStartRequested?: MatchStartRequestHandler,
): Promise<SceneBuildResult> {
  const selectedMap = getArenaMapDefinition(matchConfiguration.selectedMapId);

  if (!isArenaMapAvailable(matchConfiguration.selectedMapId)) {
    throw new Error(
      `The ${selectedMap.displayName} map is not available in this build.`,
    );
  }

  const createArena = await loadArenaBuilder(matchConfiguration.selectedMapId);
  const scene = new Scene(engine);
  let audioSystem: AudioSystem | null = null;
  let playerController: PlayerController | null = null;
  let combatSystem: CombatSystem | null = null;
  let matchManager: MatchManager | null = null;
  let weaponSystem: WeaponSystem | null = null;
  let botAI: BotAI | null = null;

  try {
    const arena = await createArena(scene);
    validateArenaBuildResult(matchConfiguration.selectedMapId, arena);
    scene.metadata = {
      ...(scene.metadata as Record<string, unknown> | null),
      matchConfiguration,
    };
    audioSystem = new AudioSystem(audioHud);
    playerController = new PlayerController(
      scene,
      canvas,
      arena.spawnPoints.player,
      arena.collidableMeshes,
      (sprinting) => audioSystem?.playFootstep(sprinting),
    );
    combatSystem = new CombatSystem(
      scene,
      playerController,
      arena.respawnPoints,
      arena.collidableMeshes,
      combatHud,
      (killer) => matchManager?.recordKill(killer),
      (amount) => weaponSystem?.addAmmo(amount) ?? 0,
      audioSystem,
      selectedMap.hasBot,
      selectedMap.hasArmorPickups,
    );
    botAI = new BotAI(
      scene,
      playerController,
      combatSystem,
      arena.botPatrolPoints,
      arena.botNavigationPoints,
      arena.botCoverPoints,
      arena.collidableMeshes,
      matchConfiguration.botDifficultyId,
    );
    const initializedPlayerController = playerController;
    const initializedCombatSystem = combatSystem;
    const initializedBotAI = botAI;
    weaponSystem = new WeaponSystem(
      scene,
      canvas,
      initializedPlayerController.camera,
      arena.collidableMeshes,
      weaponHud,
      (mesh, damage) => initializedCombatSystem.applyWeaponHit(mesh, damage),
      () => initializedBotAI.notifyPlayerShot(initializedPlayerController.camera.position),
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
      matchConfiguration,
      onMatchStartRequested,
      selectedMap.hasBot,
      selectedMap.hasMatchTimer,
    );

    return {
      scene,
      audioSystem,
      playerController,
      combatSystem,
      botAI,
      weaponSystem,
      matchManager,
      shadowGenerator: arena.shadowGenerator,
    };
  } catch (error) {
    matchManager?.dispose();
    weaponSystem?.dispose();
    botAI?.dispose();
    combatSystem?.dispose();
    playerController?.dispose();
    audioSystem?.dispose();
    scene.dispose();
    const reason = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(`Unable to construct the ${selectedMap.displayName} arena.${reason}`);
  }
}
