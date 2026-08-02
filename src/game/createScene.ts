import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import type { Engine } from "@babylonjs/core/Engines/engine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createArena } from "./arena/createArena";

export function createScene(engine: Engine, canvas: HTMLCanvasElement): Scene {
  const scene = new Scene(engine);
  const arena = createArena(scene);
  const playerSpawn = arena.spawnPoints.player;

  const camera = new FreeCamera(
    "foundation-camera",
    playerSpawn.position.add(new Vector3(0, 1.7, 0)),
    scene,
  );
  camera.setTarget(playerSpawn.facingTarget);
  camera.attachControl(canvas, true);
  camera.minZ = 0.1;
  camera.speed = 0.35;

  scene.metadata = {
    arena,
  };

  return scene;
}
