import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { BOT_COLLIDER_HALF_HEIGHT, BotView, type BotDamageMetadata } from "../../../entities/bot/BotView";
import { BotAnimationController } from "../../../entities/bot/BotAnimationController";
import type { Disposable } from "../../../core/contracts";
import type { TrainingGroundInteractionController } from "../interactions/TrainingGroundInteractionController";
import type { TrainingModeDefinition, TrainingTargetMovement, TrainingTargetSpawnDefinition } from "./trainingModes";

const TARGET_HEALTH = 100;
const TARGET_RESPAWN_DELAY_MS = 1_200;
const LATERAL_SPEED = 2.6;
const HARD_SPEED = 3.1;

interface TrainingTarget {
  readonly view: BotView;
  readonly animation: BotAnimationController;
  readonly spawn: TrainingTargetSpawnDefinition;
  readonly registrations: Disposable[];
  readonly movement: TrainingTargetMovement;
  health: number;
  alive: boolean;
  respawnAt: number;
  lateralDirection: 1 | -1;
  decisionAt: number;
  destination: Vector3;
  jumpEndsAt: number;
  crouchEndsAt: number;
}

/** Owns non-attacking targets for one active Shooting Range training mode. */
export class TrainingRangeTargetController implements Disposable {
  private readonly targets: TrainingTarget[] = [];
  private readonly observer: Observer<Scene>;

  public constructor(
    private readonly scene: Scene,
    private readonly rangeRoot: { readonly position: Vector3 },
    private readonly interactions: TrainingGroundInteractionController,
    private readonly onTargetEliminated?: () => void,
  ) {
    this.observer = scene.onAfterAnimationsObservable.add(() => this.update(performance.now()));
  }

  public start(definition: TrainingModeDefinition): void {
    this.reset();
    definition.targetSpawns.slice(0, definition.targetCount).forEach((spawn) => {
      this.targets.push(this.createTarget(spawn, definition.movement));
    });
  }

  public reset(): void {
    this.targets.splice(0).forEach((target) => this.disposeTarget(target));
  }

  public dispose(): void {
    this.scene.onAfterAnimationsObservable.remove(this.observer);
    this.reset();
  }

  private createTarget(
    spawn: TrainingTargetSpawnDefinition,
    movement: TrainingTargetMovement,
  ): TrainingTarget {
    const position = this.toWorldPosition(spawn.x, spawn.z);
    const view = new BotView(this.scene, {
      namePrefix: `training-target-${spawn.id}`,
      position,
      facingTarget: position.add(new Vector3(0, 0, -1)),
      damageable: true,
      collisionEnabled: true,
    });
    const animation = new BotAnimationController(this.scene, view);
    const target: TrainingTarget = {
      view,
      animation,
      spawn,
      registrations: [],
      movement,
      health: TARGET_HEALTH,
      alive: true,
      respawnAt: 0,
      lateralDirection: 1,
      decisionAt: performance.now(),
      destination: position.clone(),
      jumpEndsAt: 0,
      crouchEndsAt: 0,
    };
    view.protectedMeshes.forEach((mesh) => {
      target.registrations.push(this.interactions.registerShotTarget(mesh, (damage) =>
        this.applyDamage(target, mesh.metadata as BotDamageMetadata | null, damage),
      ));
    });
    return target;
  }

  private applyDamage(
    target: TrainingTarget,
    metadata: BotDamageMetadata | null,
    damage: number,
  ): { readonly damageApplied: boolean; readonly eliminated: boolean } {
    if (!target.alive) {
      return { damageApplied: false, eliminated: false };
    }

    const multiplier = metadata?.hitZone === "head" ? 3 : 1;
    target.health = Math.max(0, target.health - Math.round(damage * multiplier));
    const eliminated = target.health === 0;
    if (eliminated) {
      target.alive = false;
      this.onTargetEliminated?.();
      target.respawnAt = performance.now() + TARGET_RESPAWN_DELAY_MS;
      target.animation.setAlive(false);
      target.view.collisionBody.setEnabled(false);
    }
    return { damageApplied: true, eliminated };
  }

  private update(now: number): void {
    const deltaSeconds = Math.min(this.scene.getEngine().getDeltaTime() / 1_000, 0.05);
    this.targets.forEach((target) => {
      if (!target.alive) {
        target.animation.update(now);
        if (now >= target.respawnAt) {
          this.respawn(target, now);
        }
        return;
      }

      this.updateMovement(target, now, deltaSeconds);
      target.animation.update(now);
      this.applyVerticalPose(target, now);
    });
  }

  private updateMovement(target: TrainingTarget, now: number, deltaSeconds: number): void {
    if (target.movement === "static") {
      target.view.applyMovementPose(false, 0);
      return;
    }

    const bounds = target.spawn.movementBounds;
    const position = target.view.root.position;
    let displacement = Vector3.Zero();
    if (target.movement === "lateral-lane") {
      const nextX = position.x + target.lateralDirection * LATERAL_SPEED * deltaSeconds;
      if (nextX <= bounds.minimumX + this.rangeRoot.position.x || nextX >= bounds.maximumX + this.rangeRoot.position.x) {
        target.lateralDirection = target.lateralDirection === 1 ? -1 : 1;
      }
      displacement = new Vector3(target.lateralDirection * LATERAL_SPEED * deltaSeconds, 0, 0);
    } else {
      if (now >= target.decisionAt || Vector3.DistanceSquared(position, target.destination) < 0.25) {
        target.destination.copyFrom(this.toWorldPosition(
          this.randomBetween(bounds.minimumX, bounds.maximumX),
          this.randomBetween(bounds.minimumZ, bounds.maximumZ),
        ));
        target.decisionAt = now + this.randomBetween(350, 900);
        if (Math.random() < 0.22) target.jumpEndsAt = now + 420;
        if (Math.random() < 0.28) target.crouchEndsAt = now + 520;
      }
      const direction = target.destination.subtract(position);
      direction.y = 0;
      if (direction.lengthSquared() > 0.001) {
        direction.normalize();
        displacement = direction.scale(HARD_SPEED * deltaSeconds);
        target.view.faceToward(target.destination);
      }
    }

    if (displacement.lengthSquared() > 0) {
      position.addInPlace(displacement);
      target.view.collisionBody.position.copyFrom(
        position.add(new Vector3(0, BOT_COLLIDER_HALF_HEIGHT, 0)),
      );
      target.animation.recordMovement(displacement.length(), now);
    }
  }

  private applyVerticalPose(target: TrainingTarget, now: number): void {
    if (target.movement !== "unpredictable-bounded") {
      return;
    }

    const jumping = now < target.jumpEndsAt;
    const crouching = !jumping && now < target.crouchEndsAt;
    if (jumping) {
      const progress = 1 - (target.jumpEndsAt - now) / 420;
      target.view.root.position.y = Math.sin(Math.PI * Math.max(0, Math.min(1, progress))) * 0.85;
      target.view.collisionBody.position.y = target.view.root.position.y + BOT_COLLIDER_HALF_HEIGHT;
      return;
    }

    target.view.root.position.y = 0;
    target.view.collisionBody.position.y = BOT_COLLIDER_HALF_HEIGHT;
    target.view.root.scaling.y = crouching ? 0.52 : 0.85;
    target.view.collisionBody.scaling.y = crouching ? 0.56 : 1;
  }

  private respawn(target: TrainingTarget, now: number): void {
    const position = this.toWorldPosition(target.spawn.x, target.spawn.z);
    target.health = TARGET_HEALTH;
    target.alive = true;
    target.lateralDirection = 1;
    target.decisionAt = now;
    target.destination.copyFrom(position);
    target.jumpEndsAt = 0;
    target.crouchEndsAt = 0;
    target.view.root.position.copyFrom(position);
    target.view.root.scaling.copyFromFloats(1, 0.85, 1);
    target.view.collisionBody.position.copyFrom(position.add(new Vector3(0, BOT_COLLIDER_HALF_HEIGHT, 0)));
    target.view.collisionBody.scaling.setAll(1);
    target.view.collisionBody.setEnabled(true);
    target.view.root.setEnabled(true);
    target.animation.setAlive(true, now);
  }

  private disposeTarget(target: TrainingTarget): void {
    target.registrations.splice(0).forEach((registration) => registration.dispose());
    target.animation.dispose();
    target.view.dispose();
  }

  private toWorldPosition(x: number, z: number): Vector3 {
    return new Vector3(x + this.rangeRoot.position.x, 0, z + this.rangeRoot.position.z);
  }

  private randomBetween(minimum: number, maximum: number): number {
    return minimum + Math.random() * (maximum - minimum);
  }
}
