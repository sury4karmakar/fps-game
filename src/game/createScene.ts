import type { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createArena } from "./arena/createArena";
import { CombatSystem, type CombatHudElements } from "./combat/CombatSystem";
import { PlayerController } from "./player/PlayerController";
import { WeaponSystem, type WeaponHudElements } from "./weapon/WeaponSystem";

export interface SceneBuildResult {
  readonly scene: Scene;
  readonly playerController: PlayerController;
  readonly combatSystem: CombatSystem;
  readonly weaponSystem: WeaponSystem;
}

export function createScene(
  engine: Engine,
  canvas: HTMLCanvasElement,
  weaponHud: WeaponHudElements,
  combatHud: CombatHudElements,
): SceneBuildResult {
  const scene = new Scene(engine);
  const arena = createArena(scene);
  const playerController = new PlayerController(
    scene,
    canvas,
    arena.spawnPoints.player,
    arena.collidableMeshes,
  );
  const combatSystem = new CombatSystem(
    scene,
    playerController,
    arena.respawnPoints,
    combatHud,
  );
  const weaponSystem = new WeaponSystem(
    scene,
    canvas,
    playerController.camera,
    weaponHud,
    (mesh, damage) => combatSystem.applyWeaponHit(mesh, damage),
  );

  return { scene, playerController, combatSystem, weaponSystem };
}
