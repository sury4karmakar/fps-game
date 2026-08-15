import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.pure.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/Shaders/shadowMap.fragment.js";
import "@babylonjs/core/Shaders/shadowMap.vertex.js";

export interface FoundryEnvironment {
  readonly shadowGenerator: ShadowGenerator;
}

/** Creates Foundry's cool warehouse ambience and warm furnace lighting. */
export function createFoundryEnvironment(scene: Scene): FoundryEnvironment {
  const hazeColor = new Color3(0.075, 0.095, 0.11);
  scene.clearColor = new Color4(hazeColor.r, hazeColor.g, hazeColor.b, 1);
  scene.ambientColor = new Color3(0.07, 0.075, 0.08);
  scene.fogMode = 2;
  scene.fogColor = hazeColor;
  scene.fogDensity = 0.009;

  const sky = CreateSphere(
    "foundry-sky",
    { diameter: 190, segments: 16, sideOrientation: 1 },
    scene,
  );
  sky.isPickable = false;
  sky.infiniteDistance = true;

  const skyMaterial = new StandardMaterial("foundry-sky-material", scene);
  skyMaterial.backFaceCulling = false;
  skyMaterial.disableLighting = true;
  skyMaterial.emissiveColor = hazeColor;
  sky.material = skyMaterial;

  const ambientLight = new HemisphericLight(
    "foundry-ambient-light",
    new Vector3(-0.1, 1, 0.2),
    scene,
  );
  ambientLight.intensity = 0.68;
  ambientLight.diffuse = new Color3(0.62, 0.72, 0.8);
  ambientLight.groundColor = new Color3(0.12, 0.095, 0.08);

  const overheadDirection = new Vector3(0.2, -1, 0.12);
  const overheadLight = new DirectionalLight(
    "foundry-overhead-light",
    overheadDirection,
    scene,
  );
  overheadLight.position = overheadDirection.scale(-38);
  overheadLight.intensity = 1.5;
  overheadLight.diffuse = new Color3(0.78, 0.86, 0.92);
  overheadLight.autoCalcShadowZBounds = true;
  overheadLight.shadowOrthoScale = 0.08;

  const furnaceLight = new PointLight(
    "foundry-furnace-light",
    new Vector3(0, 2.2, 0),
    scene,
  );
  furnaceLight.diffuse = new Color3(1, 0.32, 0.08);
  furnaceLight.intensity = 2.4;
  furnaceLight.range = 17;

  const shadowGenerator = new ShadowGenerator(2048, overheadLight);
  shadowGenerator.usePercentageCloserFiltering = true;
  shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_HIGH;
  shadowGenerator.forceBackFacesOnly = true;
  shadowGenerator.bias = 0.0006;
  shadowGenerator.normalBias = 0.025;
  shadowGenerator.frustumEdgeFalloff = 0.12;
  shadowGenerator.setDarkness(0.32);

  return { shadowGenerator };
}
