import type { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createArena } from "./arena/createArena";
import { BotAI } from "./bot/BotAI";
import { CombatSystem, type CombatHudElements } from "./combat/CombatSystem";
import { MatchManager, type MatchHudElements } from "./match/MatchManager";
import { PlayerController } from "./player/PlayerController";
import { WeaponSystem, type WeaponHudElements } from "./weapon/WeaponSystem";

export interface SceneBuildResult {
  readonly scene: Scene;
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
  matchDurationMs?: number,
): SceneBuildResult {
  const scene = new Scene(engine);
  const arena = createArena(scene);
  const playerController = new PlayerController(
    scene,
    canvas,
    arena.spawnPoints.player,
    arena.collidableMeshes,
  );
  let matchManager: MatchManager | null = null;
  const combatSystem = new CombatSystem(
    scene,
    playerController,
    arena.respawnPoints,
    combatHud,
    (killer) => matchManager?.recordKill(killer),
  );
  const botAI = new BotAI(
    scene,
    playerController,
    combatSystem,
    arena.botPatrolPoints,
    arena.botNavigationPoints,
  );
  const weaponSystem = new WeaponSystem(
    scene,
    canvas,
    playerController.camera,
    weaponHud,
    (mesh, damage) => combatSystem.applyWeaponHit(mesh, damage),
    () => botAI.notifyPlayerShot(playerController.camera.position),
  );
  matchManager = new MatchManager(
    scene,
    playerController,
    combatSystem,
    botAI,
    weaponSystem,
    matchHud,
    matchDurationMs,
  );

  return {
    scene,
    playerController,
    combatSystem,
    botAI,
    weaponSystem,
    matchManager,
  };
}
