import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.pure.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.pure.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

const IMPACT_LIFETIME_MS = 360;
const SPARK_LIFETIME_MS = 460;
const MAX_IMPACTS = 36;
const MAX_DECALS = 20;
const DECAL_LIFETIME_MS = 7_000;
const MIN_DECAL_SPACING = 0.14;

interface TimedMesh {
  readonly mesh: Mesh;
  readonly createdAt: number;
}

interface ImpactParticle extends TimedMesh {
  readonly velocity: Vector3;
}

interface ImpactDecal extends TimedMesh {
  readonly sourceMesh: AbstractMesh;
  readonly position: Vector3;
}

/** Reusable world-hit presentation. It has no damage, scoring, or arena policy. */
export class WeaponImpactEffects {
  private readonly impactMaterial: StandardMaterial;
  private readonly decalMaterial: StandardMaterial;
  private readonly impacts: TimedMesh[] = [];
  private readonly particles: ImpactParticle[] = [];
  private readonly decals: ImpactDecal[] = [];

  public constructor(private readonly scene: Scene) {
    this.impactMaterial = new StandardMaterial("weapon-impact-material", scene);
    this.impactMaterial.disableLighting = true;
    this.impactMaterial.emissiveColor = new Color3(1, 0.58, 0.12);

    this.decalMaterial = new StandardMaterial("weapon-decal-material", scene);
    this.decalMaterial.diffuseColor = new Color3(0.018, 0.014, 0.012);
    this.decalMaterial.emissiveColor = new Color3(0.01, 0.006, 0.003);
    this.decalMaterial.specularColor = Color3.Black();
    this.decalMaterial.alpha = 0.82;
  }

  public add(
    position: Vector3,
    normal: Vector3,
    sourceMesh: AbstractMesh,
    createDecal: boolean,
  ): void {
    const createdAt = performance.now();
    const impact = CreateSphere(
      `weapon-impact-${createdAt}`,
      { diameter: 0.075, segments: 6 },
      this.scene,
    );
    impact.position.copyFrom(position.add(normal.scale(0.025)));
    impact.material = this.impactMaterial;
    impact.isPickable = false;
    impact.renderingGroupId = 1;
    this.impacts.push({ mesh: impact, createdAt });

    if (createDecal) this.addDecal(position, normal, sourceMesh, createdAt);

    for (let index = 0; index < 2; index += 1) {
      const spark = CreateBox(
        `weapon-spark-${createdAt}-${index}`,
        { size: 0.035 },
        this.scene,
      );
      spark.position.copyFrom(impact.position);
      spark.material = this.impactMaterial;
      spark.isPickable = false;
      spark.renderingGroupId = 1;
      this.particles.push({
        mesh: spark,
        velocity: normal
          .scale(1.7 + Math.random() * 1.5)
          .add(new Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5)),
        createdAt,
      });
    }

    while (this.impacts.length > MAX_IMPACTS) this.impacts.shift()?.mesh.dispose();
  }

  public update(now: number, deltaSeconds: number): void {
    for (let index = this.impacts.length - 1; index >= 0; index -= 1) {
      const effect = this.impacts[index]!;
      const progress = (now - effect.createdAt) / IMPACT_LIFETIME_MS;
      if (progress >= 1) {
        effect.mesh.dispose();
        this.impacts.splice(index, 1);
        continue;
      }
      effect.mesh.scaling.setAll(1 + progress * 2.4);
      effect.mesh.visibility = 1 - progress;
    }

    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index]!;
      const progress = (now - particle.createdAt) / SPARK_LIFETIME_MS;
      if (progress >= 1) {
        particle.mesh.dispose();
        this.particles.splice(index, 1);
        continue;
      }
      particle.velocity.y -= 5.2 * deltaSeconds;
      particle.mesh.position.addInPlace(particle.velocity.scale(deltaSeconds));
      particle.mesh.visibility = 1 - progress;
    }

    for (let index = this.decals.length - 1; index >= 0; index -= 1) {
      const decal = this.decals[index]!;
      const progress = (now - decal.createdAt) / DECAL_LIFETIME_MS;
      if (progress >= 1) {
        decal.mesh.dispose();
        this.decals.splice(index, 1);
        continue;
      }
      decal.mesh.visibility = progress < 0.6 ? 1 : 1 - (progress - 0.6) / 0.4;
    }
  }

  public clear(): void {
    this.impacts.forEach(({ mesh }) => mesh.dispose());
    this.particles.forEach(({ mesh }) => mesh.dispose());
    this.decals.forEach(({ mesh }) => mesh.dispose());
    this.impacts.length = 0;
    this.particles.length = 0;
    this.decals.length = 0;
  }

  public dispose(): void {
    this.clear();
    this.impactMaterial.dispose();
    this.decalMaterial.dispose();
  }

  private addDecal(
    position: Vector3,
    normal: Vector3,
    sourceMesh: AbstractMesh,
    createdAt: number,
  ): void {
    if (this.decals.some(
      (decal) => decal.sourceMesh === sourceMesh &&
        Vector3.DistanceSquared(decal.position, position) <
          MIN_DECAL_SPACING * MIN_DECAL_SPACING,
    )) return;

    const surfaceNormal = normal.normalizeToNew();
    const decal = CreateCylinder(
      `weapon-decal-${createdAt}`,
      { diameter: 0.075 + Math.random() * 0.015, height: 0.008, tessellation: 16 },
      this.scene,
    );
    decal.position.copyFrom(position.add(surfaceNormal.scale(0.004)));
    decal.rotationQuaternion = Quaternion.Identity();
    Quaternion.FromUnitVectorsToRef(Vector3.Up(), surfaceNormal, decal.rotationQuaternion);
    decal.material = this.decalMaterial;
    decal.isPickable = false;
    decal.checkCollisions = false;
    decal.receiveShadows = false;
    decal.renderingGroupId = 0;
    this.decals.push({ mesh: decal, sourceMesh, position: position.clone(), createdAt });
    while (this.decals.length > MAX_DECALS) this.decals.shift()?.mesh.dispose();
  }
}
