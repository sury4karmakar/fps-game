import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BotView } from "./BotView";

export interface BotAnimationOptions {
  readonly autoUpdate?: boolean;
  readonly idleMotion?: boolean;
}

/** Owns reusable bot pose transitions without AI, damage, or match rules. */
export class BotAnimationController {
  private readonly observer: Observer<Scene> | null;
  private alive = true;
  private deathStartedAt = 0;
  private lastMoveAt = Number.NEGATIVE_INFINITY;
  private walkPhase = 0;

  public constructor(
    private readonly scene: Scene,
    private readonly view: BotView,
    private readonly options: BotAnimationOptions = {},
  ) {
    this.observer = options.autoUpdate
      ? scene.onAfterAnimationsObservable.add(() => this.update(performance.now()))
      : null;
  }

  public recordMovement(distance: number, now = performance.now()): void {
    if (distance <= 0) return;
    this.lastMoveAt = now;
    this.walkPhase += distance * 8;
  }

  public setAlive(alive: boolean, now = performance.now()): void {
    if (this.alive === alive) return;
    this.alive = alive;
    if (alive) {
      this.deathStartedAt = 0;
      this.view.resetPose();
    } else {
      this.deathStartedAt = now;
    }
  }

  public update(now = performance.now()): void {
    if (!this.alive) {
      const progress = Math.min(1, Math.max(0, (now - this.deathStartedAt) / 500));
      this.view.applyDeathPose(progress);
      return;
    }

    if (this.options.idleMotion && now - this.lastMoveAt >= 120) {
      this.walkPhase += Math.min(this.scene.getEngine().getDeltaTime() / 1_000, 0.05) * 1.4;
      this.view.applyMovementPose(true, this.walkPhase);
      return;
    }

    this.view.applyMovementPose(now - this.lastMoveAt < 120, this.walkPhase);
  }

  public dispose(): void {
    if (this.observer) {
      this.scene.onAfterAnimationsObservable.remove(this.observer);
    }
  }
}
