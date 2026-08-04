import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.pure.js";
import type { Scene } from "@babylonjs/core/scene.js";

export interface ArenaEnvironment {
  readonly shadowGenerator: ShadowGenerator;
}

export function createEnvironment(scene: Scene): ArenaEnvironment {
  const skyColor = new Color3(0.13, 0.22, 0.32);
  scene.clearColor = new Color4(skyColor.r, skyColor.g, skyColor.b, 1);
  scene.ambientColor = new Color3(0.08, 0.1, 0.13);
  scene.fogMode = 2;
  scene.fogColor = skyColor;
  scene.fogDensity = 0.006;

  const sky = CreateSphere(
    "arena-sky",
    {
      diameter: 160,
      segments: 16,
      sideOrientation: 1,
    },
    scene,
  );
  sky.isPickable = false;
  sky.infiniteDistance = true;

  const skyMaterial = new StandardMaterial("arena-sky-material", scene);
  skyMaterial.backFaceCulling = false;
  skyMaterial.disableLighting = true;
  skyMaterial.emissiveColor = skyColor;
  sky.material = skyMaterial;

  const ambientLight = new HemisphericLight(
    "arena-ambient-light",
    new Vector3(0.2, 1, -0.15),
    scene,
  );
  ambientLight.intensity = 0.55;
  ambientLight.diffuse = new Color3(0.78, 0.88, 1);
  ambientLight.groundColor = new Color3(0.16, 0.18, 0.22);

  // A high, consistent sun direction keeps shadows close to the object that
  // casts them. Its position is kept on the same line so the shadow camera is
  // centred on the arena instead of looking past it.
  const sunDirection = new Vector3(-0.25, -1, -0.2);
  const sun = new DirectionalLight("arena-sun", sunDirection, scene);
  sun.position = sunDirection.scale(-32);
  sun.intensity = 1.55;
  sun.diffuse = new Color3(1, 0.89, 0.72);
  sun.autoCalcShadowZBounds = true;
  sun.shadowOrthoScale = 0.05;

  const shadowGenerator = new ShadowGenerator(2048, sun);
  shadowGenerator.usePercentageCloserFiltering = true;
  shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_HIGH;
  // Arena geometry uses closed boxes. Rendering their back faces into the
  // shadow map prevents the visible front faces from shadowing themselves.
  shadowGenerator.forceBackFacesOnly = true;
  shadowGenerator.bias = 0.0005;
  shadowGenerator.normalBias = 0.02;
  shadowGenerator.frustumEdgeFalloff = 0.1;
  shadowGenerator.setDarkness(0.28);

  return { shadowGenerator };
}
