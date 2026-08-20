import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.pure.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.pure.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Node } from "@babylonjs/core/node.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { WeaponView } from "../weapon/WeaponView";

export const BOT_COLLIDER_HALF_HEIGHT = 0.9;
export const BOT_EYE_HEIGHT = 1.62;

export type BotHitZone = "body" | "head";

export interface BotDamageMetadata {
  readonly combatantId: string;
  readonly hitZone: BotHitZone;
}

export interface BotViewOptions {
  readonly namePrefix?: string;
  readonly parent?: Node;
  readonly position?: Vector3;
  readonly facingTarget?: Vector3;
  readonly damageable?: boolean;
  /** Optional combat identity for multi-bot maps; defaults to the legacy bot. */
  readonly combatantId?: string;
  readonly collisionEnabled?: boolean;
  readonly shadowGenerator?: ShadowGenerator;
}

/** Reusable bot body and collision representation with no AI or combat rules. */
export class BotView {
  public readonly root: TransformNode;
  public readonly collisionBody: Mesh;
  public readonly bodyMaterial: StandardMaterial;
  public readonly headMaterial: StandardMaterial;
  public readonly muzzleFlash: Mesh;
  public readonly protectedMeshes: readonly Mesh[];
  public readonly torso: Mesh;
  public readonly leftLeg: Mesh;
  public readonly rightLeg: Mesh;

  private readonly collisionEnabled: boolean;

  public constructor(scene: Scene, options: BotViewOptions = {}) {
    const prefix = options.namePrefix ?? "bot";
    const position = options.position ?? Vector3.Zero();
    const damageable = options.damageable ?? false;
    this.collisionEnabled = options.collisionEnabled ?? false;

    this.collisionBody = CreateBox(`${prefix}-collision-body`, {
      width: 0.9,
      height: BOT_COLLIDER_HALF_HEIGHT * 2,
      depth: 0.9,
    }, scene);
    this.collisionBody.position.copyFrom(
      position.add(new Vector3(0, BOT_COLLIDER_HALF_HEIGHT, 0)),
    );
    this.collisionBody.isVisible = false;
    this.collisionBody.isPickable = false;
    this.collisionBody.checkCollisions = this.collisionEnabled;
    this.collisionBody.ellipsoid = new Vector3(0.45, BOT_COLLIDER_HALF_HEIGHT, 0.45);
    this.collisionBody.ellipsoidOffset = Vector3.Zero();
    this.collisionBody.metadata = this.collisionEnabled ? { botCollision: true } : null;
    this.collisionBody.setEnabled(this.collisionEnabled);

    this.root = new TransformNode(`${prefix}-root`, scene);
    this.root.parent = options.parent ?? null;
    this.root.position.copyFrom(position);
    this.root.scaling.y = 0.85;
    const protectedMeshes: Mesh[] = [];

    this.bodyMaterial = new StandardMaterial(`${prefix}-body-material`, scene);
    this.bodyMaterial.diffuseColor = new Color3(0.55, 0.08, 0.055);
    this.bodyMaterial.specularColor = new Color3(0.18, 0.18, 0.18);

    this.headMaterial = new StandardMaterial(`${prefix}-head-material`, scene);
    this.headMaterial.diffuseColor = new Color3(0.72, 0.2, 0.08);
    this.headMaterial.specularColor = new Color3(0.22, 0.22, 0.22);

    const configureBodyMesh = (
      mesh: Mesh,
      material: StandardMaterial,
      hitZone: BotHitZone,
    ): Mesh => {
      mesh.parent = this.root;
      mesh.material = material;
      mesh.isPickable = damageable;
      mesh.checkCollisions = false;
      mesh.receiveShadows = true;
      mesh.metadata = damageable
        ? ({ combatantId: options.combatantId ?? "bot", hitZone } satisfies BotDamageMetadata)
        : null;
      options.shadowGenerator?.addShadowCaster(mesh);
      protectedMeshes.push(mesh);
      return mesh;
    };

    this.torso = configureBodyMesh(CreateCylinder(`${prefix}-torso`, {
      height: 1.15,
      diameterTop: 0.72,
      diameterBottom: 0.82,
      tessellation: 16,
    }, scene), this.bodyMaterial, "body");
    this.torso.position.y = 1.18;

    const head = configureBodyMesh(CreateSphere(`${prefix}-head`, {
      diameter: 0.48,
      segments: 12,
    }, scene), this.headMaterial, "head");
    head.position.y = 2.02;

    this.leftLeg = configureBodyMesh(CreateBox(`${prefix}-left-leg`, {
      width: 0.28,
      height: 0.65,
      depth: 0.32,
    }, scene), this.bodyMaterial, "body");
    this.leftLeg.position.set(-0.2, 0.34, 0);

    this.rightLeg = configureBodyMesh(CreateBox(`${prefix}-right-leg`, {
      width: 0.28,
      height: 0.65,
      depth: 0.32,
    }, scene), this.bodyMaterial, "body");
    this.rightLeg.position.set(0.2, 0.34, 0);

    const weapon = new WeaponView(scene, "assault-rifle", {
      parent: this.root,
      namePrefix: `${prefix}-equipped`,
      shadowGenerator: options.shadowGenerator,
    });
    weapon.root.position.set(0.42, 1.26, 0.01);
    this.muzzleFlash = weapon.muzzleFlash;
    this.muzzleFlash.scaling.z = 1.7;
    this.muzzleFlash.setEnabled(false);
    this.protectedMeshes = protectedMeshes;

    if (options.facingTarget) {
      this.faceToward(options.facingTarget);
    }
  }

  public faceToward(target: Vector3): void {
    const direction = target.subtract(this.root.getAbsolutePosition());
    this.root.rotation.y = Math.atan2(direction.x, direction.z);
  }

  public syncVisualToCollisionBody(): void {
    this.root.position.copyFromFloats(
      this.collisionBody.position.x,
      this.collisionBody.position.y - BOT_COLLIDER_HALF_HEIGHT,
      this.collisionBody.position.z,
    );
  }

  public setEnabled(enabled: boolean): void {
    this.root.setEnabled(enabled);
    this.collisionBody.setEnabled(enabled && this.collisionEnabled);
  }

  public resetPose(): void {
    this.root.scaling.copyFromFloats(1, 0.85, 1);
    this.torso.position.y = 1.18;
    this.torso.rotation.z = 0;
    this.leftLeg.rotation.x = 0;
    this.rightLeg.rotation.x = 0;
  }

  public applyMovementPose(moving: boolean, walkPhase: number): void {
    const stride = moving ? Math.sin(walkPhase) * 0.42 : 0;
    const bob = moving ? Math.abs(Math.sin(walkPhase)) * 0.05 : 0;
    this.torso.position.y = 1.18 + bob;
    this.torso.rotation.z = 0;
    this.leftLeg.rotation.x = stride;
    this.rightLeg.rotation.x = -stride;
    this.root.scaling.copyFromFloats(1, 0.85, 1);
  }

  public applyDeathPose(progress: number): void {
    this.root.scaling.copyFromFloats(
      1 + progress * 0.12,
      0.85 * (1 - progress * 0.78),
      1 + progress * 0.12,
    );
    this.torso.rotation.z = progress * 0.46;
    this.leftLeg.rotation.x = progress * 0.58;
    this.rightLeg.rotation.x = -progress * 0.35;
  }

  public dispose(): void {
    this.collisionBody.dispose();
    this.root.dispose(false, true);
  }
}
