import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import type { Engine } from "@babylonjs/core/Engines/engine.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure.js";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder.pure.js";
import { Scene } from "@babylonjs/core/scene.js";

export function createScene(engine: Engine, canvas: HTMLCanvasElement): Scene {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.025, 0.045, 0.07, 1);

  const camera = new FreeCamera("foundation-camera", new Vector3(0, 2.5, -8), scene);
  camera.setTarget(new Vector3(0, 1, 0));
  camera.attachControl(canvas, true);
  camera.minZ = 0.1;

  const ambientLight = new HemisphericLight(
    "foundation-light",
    new Vector3(0.25, 1, -0.2),
    scene,
  );
  ambientLight.intensity = 0.9;

  const ground = CreateGround(
    "foundation-ground",
    { width: 14, height: 14 },
    scene,
  );
  const groundMaterial = new StandardMaterial("foundation-ground-material", scene);
  groundMaterial.diffuseColor = new Color3(0.13, 0.18, 0.23);
  groundMaterial.specularColor = new Color3(0.05, 0.05, 0.05);
  ground.material = groundMaterial;

  const marker = CreateBox(
    "foundation-marker",
    { width: 2, height: 2, depth: 2 },
    scene,
  );
  marker.position.y = 1;

  const markerMaterial = new StandardMaterial("foundation-marker-material", scene);
  markerMaterial.diffuseColor = new Color3(0.15, 0.55, 0.88);
  markerMaterial.emissiveColor = new Color3(0.02, 0.08, 0.14);
  marker.material = markerMaterial;

  scene.onBeforeRenderObservable.add(() => {
    marker.rotation.y += (engine.getDeltaTime() / 1000) * 0.5;
  });

  return scene;
}
