import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.pure.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.pure.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Node } from "@babylonjs/core/node.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { WeaponId } from "../../config/gameConfig";

export interface WeaponViewOptions {
  readonly parent?: Node;
  readonly namePrefix?: string;
  readonly renderingGroupId?: number;
  readonly scale?: number;
  readonly shadowGenerator?: ShadowGenerator;
}

const WEAPON_COLORS: Readonly<Record<WeaponId, Color3>> = {
  "assault-rifle": new Color3(0.08, 0.13, 0.17),
  scattergun: new Color3(0.21, 0.1, 0.055),
  "marksman-rifle": new Color3(0.08, 0.19, 0.14),
};

/** Reusable visual representation of a weapon, independent from weapon behavior. */
export class WeaponView {
  public readonly root: TransformNode;
  public readonly magazine: Mesh;
  public readonly muzzleFlash: Mesh;

  public constructor(
    scene: Scene,
    public readonly weaponId: WeaponId,
    options: WeaponViewOptions = {},
  ) {
    const prefix = options.namePrefix ?? "weapon";
    const renderingGroupId = options.renderingGroupId ?? 0;
    this.root = new TransformNode(`${prefix}-${weaponId}-root`, scene);
    this.root.parent = options.parent ?? null;
    this.root.scaling.setAll(options.scale ?? 1);

    const material = new StandardMaterial(`${prefix}-${weaponId}-material`, scene);
    material.diffuseColor = WEAPON_COLORS[weaponId];
    material.specularColor = new Color3(0.38, 0.42, 0.45);

    const muzzleMaterial = new StandardMaterial(`${prefix}-${weaponId}-muzzle`, scene);
    muzzleMaterial.disableLighting = true;
    muzzleMaterial.emissiveColor = weaponId === "scattergun"
      ? new Color3(1, 0.32, 0.06)
      : new Color3(1, 0.55, 0.09);

    const attach = (mesh: Mesh): Mesh => {
      mesh.parent = this.root;
      mesh.material = material;
      mesh.isPickable = false;
      mesh.checkCollisions = false;
      mesh.receiveShadows = true;
      mesh.renderingGroupId = renderingGroupId;
      options.shadowGenerator?.addShadowCaster(mesh);
      return mesh;
    };
    const isScattergun = weaponId === "scattergun";
    const isMarksman = weaponId === "marksman-rifle";

    const body = attach(CreateBox(`${prefix}-${weaponId}-body`, {
      width: isScattergun ? 0.25 : 0.18,
      height: 0.16,
      depth: isMarksman ? 0.72 : 0.58,
    }, scene));
    body.position.z = 0.12;

    this.magazine = attach(CreateBox(`${prefix}-${weaponId}-magazine`, {
      width: 0.12,
      height: isScattergun ? 0.2 : 0.28,
      depth: 0.14,
    }, scene));
    this.magazine.position.set(0, -0.2, 0.08);

    const barrel = attach(CreateCylinder(`${prefix}-${weaponId}-barrel`, {
      height: isScattergun ? 0.7 : isMarksman ? 0.82 : 0.42,
      diameter: isScattergun ? 0.075 : 0.045,
      tessellation: 12,
    }, scene));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = isScattergun ? 0.76 : isMarksman ? 0.94 : 0.84;

    if (isMarksman) {
      const scope = attach(CreateCylinder(`${prefix}-${weaponId}-scope`, {
        height: 0.3,
        diameter: 0.09,
        tessellation: 12,
      }, scene));
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.13, 0.34);
    }

    this.muzzleFlash = CreateSphere(`${prefix}-${weaponId}-muzzle-flash`, {
      diameter: isScattergun ? 0.2 : 0.13,
      segments: 6,
    }, scene);
    this.muzzleFlash.parent = this.root;
    this.muzzleFlash.material = muzzleMaterial;
    this.muzzleFlash.isPickable = false;
    this.muzzleFlash.checkCollisions = false;
    this.muzzleFlash.renderingGroupId = renderingGroupId;
    this.muzzleFlash.position.z = isScattergun ? 1.14 : isMarksman ? 1.38 : 1.07;
    this.muzzleFlash.setEnabled(false);
  }

  public setEnabled(enabled: boolean): void {
    this.root.setEnabled(enabled);
  }

  public dispose(): void {
    this.root.dispose(false, true);
  }
}
