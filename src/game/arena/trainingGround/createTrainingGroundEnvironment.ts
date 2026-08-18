import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/Shaders/shadowMap.fragment.js";
import "@babylonjs/core/Shaders/shadowMap.vertex.js";

/** Creates the clear, sunlit environment owned by Training Ground. */
export function createTrainingGroundEnvironment(scene: Scene): {
  readonly shadowGenerator: ShadowGenerator;
} {
  const skyColor = new Color3(0.42, 0.72, 0.95);
  scene.clearColor = new Color4(skyColor.r, skyColor.g, skyColor.b, 1);
  scene.ambientColor = new Color3(0.28, 0.34, 0.4);
  scene.fogMode = 0;

  const skylight = new HemisphericLight(
    "training-ground-skylight",
    new Vector3(0, 1, 0),
    scene,
  );
  skylight.intensity = 1.05;
  skylight.diffuse = new Color3(0.9, 0.96, 1);
  skylight.groundColor = new Color3(0.32, 0.34, 0.3);

  const sunDirection = new Vector3(-0.3, -1, -0.22);
  const sun = new DirectionalLight("training-ground-sun", sunDirection, scene);
  sun.position = sunDirection.scale(-48);
  sun.intensity = 2.35;
  sun.diffuse = new Color3(1, 0.95, 0.8);
  sun.autoCalcShadowZBounds = true;
  sun.shadowOrthoScale = 0.08;

  const shadowGenerator = new ShadowGenerator(2048, sun);
  shadowGenerator.usePercentageCloserFiltering = true;
  shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_HIGH;
  shadowGenerator.forceBackFacesOnly = true;
  shadowGenerator.setDarkness(0.2);

  return { shadowGenerator };
}
