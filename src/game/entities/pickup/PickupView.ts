import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.pure.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Node } from "@babylonjs/core/node.js";
import "@babylonjs/core/Rendering/outlineRenderer.js";
import type { Scene } from "@babylonjs/core/scene.js";

export type PickupKind = "supply" | "armor" | "ammo" | "health";

export interface PickupAnimationOptions {
  readonly rotationSpeed: number;
  readonly bobAmplitude?: number;
  readonly bobFrequency?: number;
  readonly pulseAmplitude?: number;
  readonly pulseFrequency?: number;
}

export interface PickupViewOptions {
  readonly namePrefix?: string;
  readonly parent?: Node;
  readonly position?: Vector3;
  readonly scale?: number;
  readonly animation?: PickupAnimationOptions;
}

const PICKUP_COLORS: Readonly<Record<PickupKind, Color3>> = {
  supply: new Color3(0.08, 0.9, 0.18),
  armor: new Color3(0.08, 0.68, 1),
  ammo: new Color3(0.98, 0.78, 0.2),
  health: new Color3(0.3, 0.9, 0.46),
};

/** Reusable pickup presentation with optional autonomous display animation. */
export class PickupView {
  public readonly mesh: Mesh;
  public readonly baseY: number;

  private readonly createdAt = performance.now();
  private readonly observer: Observer<Scene> | null;
  private readonly baseScale: number;

  public constructor(
    private readonly scene: Scene,
    public readonly kind: PickupKind,
    options: PickupViewOptions = {},
  ) {
    const prefix = options.namePrefix ?? kind;
    this.mesh = kind === "armor"
      ? CreateCylinder(`${prefix}-${kind}-view`, {
        height: 0.82,
        diameterTop: 0.62,
        diameterBottom: 0.82,
        tessellation: 8,
      }, scene)
      : CreateBox(`${prefix}-${kind}-view`, { size: 0.72 }, scene);
    this.mesh.parent = options.parent ?? null;
    this.mesh.position.copyFrom(options.position ?? Vector3.Zero());
    this.baseScale = options.scale ?? 1;
    this.mesh.scaling.setAll(this.baseScale);
    this.mesh.isPickable = false;
    this.mesh.checkCollisions = false;
    this.mesh.receiveShadows = false;
    this.mesh.renderOutline = true;
    this.mesh.outlineColor.copyFrom(PICKUP_COLORS[kind]);
    this.mesh.outlineWidth = 0.06;

    const material = new StandardMaterial(`${prefix}-${kind}-material`, scene);
    const color = PICKUP_COLORS[kind];
    material.diffuseColor = color.scale(0.55);
    material.emissiveColor = color;
    material.specularColor = color.scale(0.45);
    material.alpha = kind === "armor" ? 0.86 : 0.82;
    this.mesh.material = material;
    this.baseY = this.mesh.position.y;

    this.observer = options.animation
      ? scene.onAfterAnimationsObservable.add(() => this.animate(options.animation!))
      : null;
  }

  public dispose(): void {
    if (this.observer) {
      this.scene.onAfterAnimationsObservable.remove(this.observer);
    }
    this.mesh.dispose(false, true);
  }

  private animate(options: PickupAnimationOptions): void {
    const deltaSeconds = Math.min(this.scene.getEngine().getDeltaTime() / 1_000, 0.05);
    const ageSeconds = (performance.now() - this.createdAt) / 1_000;
    this.mesh.rotation.y += deltaSeconds * options.rotationSpeed;
    this.mesh.position.y = this.baseY
      + Math.sin(ageSeconds * (options.bobFrequency ?? 0)) * (options.bobAmplitude ?? 0);
    this.mesh.scaling.setAll(
      this.baseScale * (
        1 + Math.sin(ageSeconds * (options.pulseFrequency ?? 0)) * (options.pulseAmplitude ?? 0)
      ),
    );
  }
}
