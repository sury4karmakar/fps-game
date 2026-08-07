import type { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createArena } from "./arena/createArena";
import { AudioSystem, type AudioHudElements } from "./audio/AudioSystem";
import { BotAI } from "./bot/BotAI";
import { CombatSystem, type CombatHudElements } from "./combat/CombatSystem";
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
): SceneBuildResult {
  const scene = new Scene(engine);
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
