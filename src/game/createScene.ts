import type { Engine } from "@babylonjs/core/Engines/engine.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { Scene } from "@babylonjs/core/scene.js";
import { validateArenaBuildResult } from "./arena/arenaTypes";
import { loadArenaBuilder } from "./arena/mapRegistry";
import { TrainingGroundSectionController } from "./arena/trainingGround/sections/TrainingGroundSectionController";
import { TrainingGroundInteractionController } from "./arena/trainingGround/interactions/TrainingGroundInteractionController";
import { AudioSystem, type AudioHudElements } from "./audio/AudioSystem";
import { BotAI } from "./bot/BotAI";
import { CombatSystem, type CombatHudElements } from "./combat/CombatSystem";
import { TeamCombatSystem } from "./combat/TeamCombatSystem";
import {
  DEFAULT_MATCH_CONFIGURATION,
  getArenaMapDefinition,
  isArenaMapAvailable,
  type MatchConfiguration,
} from "./config/gameConfig";
import type {
  AudioSettingsPort,
  BotControlPort,
  MatchCombatPort,
  MatchControlPort,
  PlayerSettingsPort,
} from "./core/contracts";
import {
  MatchManager,
  type MatchHudElements,
  type MatchStartRequestHandler,
} from "./match/MatchManager";
import { PlayerController } from "./player/PlayerController";
import { WeaponSystem, type WeaponHudElements } from "./weapon/WeaponSystem";

export interface SceneBuildResult {
  readonly scene: Scene;
  readonly audioSettings: AudioSettingsPort;
  readonly playerSettings: PlayerSettingsPort;
  readonly match: MatchControlPort;
  readonly shadowGenerator: ShadowGenerator;
  dispose(): void;
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
  let combatSystem: (CombatSystem & MatchCombatPort) | TeamCombatSystem | null = null;
  let matchManager: MatchManager | null = null;
  let weaponSystem: WeaponSystem | null = null;
  let botAI: BotAI | null = null;
  let teamCombat: TeamCombatSystem | null = null;
  let trainingSections: TrainingGroundSectionController | null = null;
  let trainingInteractions: TrainingGroundInteractionController | null = null;

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
    if (matchConfiguration.selectedMapId === "foundry") {
      teamCombat = new TeamCombatSystem(
        scene,
        playerController,
        arena.respawnPoints,
        arena.botPatrolPoints,
        arena.botNavigationPoints,
        arena.botCoverPoints,
        arena.collidableMeshes,
        combatHud,
        (team) => matchManager?.recordKill(team === "blue" ? "player" : "bot"),
        (amount) => weaponSystem?.addAmmo(amount) ?? 0,
        audioSystem,
      );
      teamCombat.setDifficulty(matchConfiguration.botDifficultyId);
      combatSystem = teamCombat;
    } else {
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
    }
    const initializedPlayerController = playerController;
    const initializedCombatSystem = combatSystem;
    const botControl: BotControlPort = teamCombat ?? botAI!;
    trainingInteractions = matchConfiguration.selectedMapId === "training-ground"
      ? new TrainingGroundInteractionController(scene, initializedPlayerController.camera)
      : null;
    weaponSystem = new WeaponSystem(
      scene,
      canvas,
      initializedPlayerController.camera,
      arena.collidableMeshes,
      weaponHud,
      (mesh, damage) => {
        const trainingHit = trainingInteractions?.activateShot(mesh, damage);
        if (trainingHit) {
          return { ...trainingHit, handled: true };
        }
        return initializedCombatSystem.applyWeaponHit(mesh, damage);
      },
      () => {
        botAI?.notifyPlayerShot(initializedPlayerController.camera.position);
        teamCombat?.notifyPlayerWeaponFired(initializedPlayerController.camera.position);
      },
      audioSystem,
      (mesh) => trainingInteractions?.isShotTarget(mesh) ?? false,
    );
    trainingSections = matchConfiguration.selectedMapId === "training-ground"
      ? new TrainingGroundSectionController(
        scene,
        initializedPlayerController,
        weaponSystem,
        arena.spawnPoints.player,
        trainingInteractions!,
        matchHud.trainingRangeStatus,
        (meshes) => {
          const playerRegistration = initializedPlayerController.registerCollisionMeshes(meshes);
          const weaponRegistration = weaponSystem?.registerCollisionMeshes(meshes);
          return {
            dispose: () => {
              playerRegistration.dispose();
              weaponRegistration?.dispose();
            },
          };
        },
        () => matchManager?.reportTrainingHubReturned(),
      )
      : null;
    matchManager = new MatchManager(
      scene,
      playerController,
      combatSystem,
      botControl,
      weaponSystem,
      audioSystem,
      matchHud,
      matchDurationMs,
      matchConfiguration,
      onMatchStartRequested,
      selectedMap.hasBot,
      selectedMap.hasMatchTimer,
      trainingSections
        ? (sectionId) => trainingSections?.activate(sectionId)
        : undefined,
      trainingSections ? () => trainingSections?.returnToHub() : undefined,
    );

    const runtime: SceneBuildResult = {
      scene,
      audioSettings: audioSystem,
      playerSettings: playerController,
      match: matchManager,
      shadowGenerator: arena.shadowGenerator,
      dispose: () => {
        matchManager?.dispose();
        trainingSections?.dispose();
        trainingInteractions?.dispose();
        weaponSystem?.dispose();
        botAI?.dispose();
        combatSystem?.dispose();
        playerController?.dispose();
        audioSystem?.dispose();
        scene.dispose();
        matchManager = null;
        weaponSystem = null;
        botAI = null;
        teamCombat = null;
        trainingSections = null;
        trainingInteractions = null;
        combatSystem = null;
        playerController = null;
        audioSystem = null;
      },
    };
    return runtime;
  } catch (error) {
    matchManager?.dispose();
    trainingSections?.dispose();
    trainingInteractions?.dispose();
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
