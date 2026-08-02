import type { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createArena } from "./arena/createArena";
import { PlayerController } from "./player/PlayerController";

export interface SceneBuildResult {
  readonly scene: Scene;
  readonly playerController: PlayerController;
}

export function createScene(engine: Engine, canvas: HTMLCanvasElement): SceneBuildResult {
  const scene = new Scene(engine);
  const arena = createArena(scene);
  const playerController = new PlayerController(
    scene,
    canvas,
    arena.spawnPoints.player,
    arena.collidableMeshes,
  );

  return { scene, playerController };
}
