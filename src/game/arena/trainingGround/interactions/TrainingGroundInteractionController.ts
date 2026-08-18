import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Disposable } from "../../../core/contracts";

interface WalkoverTarget {
  readonly position: Vector3;
  readonly radiusSquared: number;
  readonly onEnter: () => void;
  inside: boolean;
}

/**
 * Shared, section-scoped interaction bridge. It exposes only direct shot
 * targets and walk-over volumes; weapon damage and Foundry combat stay out of
 * Training Ground section code.
 */
export class TrainingGroundInteractionController implements Disposable {
  private readonly shotTargets = new Map<AbstractMesh, () => void>();
  private readonly walkoverTargets = new Set<WalkoverTarget>();
  private readonly observer: Observer<Scene>;

  public constructor(
    private readonly scene: Scene,
    private readonly camera: FreeCamera,
  ) {
    this.observer = scene.onAfterAnimationsObservable.add(() => this.update());
  }

  public isShotTarget(mesh: AbstractMesh): boolean {
    return this.shotTargets.has(mesh);
  }

  public activateShot(mesh: AbstractMesh): boolean {
    const handler = this.shotTargets.get(mesh);
    if (!handler) {
      return false;
    }

    handler();
    return true;
  }

  public registerShotTarget(mesh: AbstractMesh, onActivate: () => void): Disposable {
    this.shotTargets.set(mesh, onActivate);
    return {
      dispose: () => this.shotTargets.delete(mesh),
    };
  }

  public registerWalkover(
    position: Vector3,
    radius: number,
    onEnter: () => void,
  ): Disposable {
    const target: WalkoverTarget = {
      position: position.clone(),
      radiusSquared: radius * radius,
      onEnter,
      inside: false,
    };
    this.walkoverTargets.add(target);
    return {
      dispose: () => this.walkoverTargets.delete(target),
    };
  }

  public dispose(): void {
    this.scene.onAfterAnimationsObservable.remove(this.observer);
    this.shotTargets.clear();
    this.walkoverTargets.clear();
  }

  private update(): void {
    for (const target of this.walkoverTargets) {
      const horizontalDistanceSquared = Vector3.DistanceSquared(
        new Vector3(this.camera.position.x, 0, this.camera.position.z),
        new Vector3(target.position.x, 0, target.position.z),
      );
      const inside = horizontalDistanceSquared <= target.radiusSquared;
      if (inside && !target.inside) {
        target.onEnter();
      }
      target.inside = inside;
    }
  }
}
