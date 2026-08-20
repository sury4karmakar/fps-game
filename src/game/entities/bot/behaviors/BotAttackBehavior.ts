import { Ray } from "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BotDifficultyDefinition } from "../../../config/gameConfig";
import type { BotCombatPort } from "../../../core/contracts";

const CLOSE_FIRE_INTERVAL_MS = 650;
const MEDIUM_FIRE_INTERVAL_MS = 760;
const LONG_FIRE_INTERVAL_MS = 920;
const FIRE_INTERVAL_JITTER_MS = 110;
const BOT_WEAPON_DAMAGE = 14;
const CLOSE_AIM_SPREAD = 0.03;
const MEDIUM_AIM_SPREAD = 0.047;
const LONG_AIM_SPREAD = 0.075;
const PLAYER_HIT_RADIUS = 0.48;

export interface BotAttackRequest {
  readonly playerPosition: Vector3;
  readonly distanceToPlayer: number;
  readonly now: number;
  readonly difficulty: BotDifficultyDefinition;
}

export interface BotAttackBehavior {
  canAttack(now: number): boolean;
  attack(request: BotAttackRequest): void;
  reset(now: number, difficulty: BotDifficultyDefinition): void;
}

/** Explicit behavior for bots that must never attack. */
export class NoBotAttackBehavior implements BotAttackBehavior {
  public canAttack(_now: number): boolean {
    return false;
  }

  public attack(_request: BotAttackRequest): void {}

  public reset(_now: number, _difficulty: BotDifficultyDefinition): void {}
}

/** Standard Foundry hitscan attack, isolated from navigation and bot visuals. */
export class HitscanBotAttackBehavior implements BotAttackBehavior {
  private nextShotAt = 0;

  public constructor(
    private readonly scene: Scene,
    private readonly combat: BotCombatPort,
    private readonly isArenaCollision: (mesh: AbstractMesh) => boolean,
  ) {}

  public canAttack(now: number): boolean {
    return now >= this.nextShotAt;
  }

  public reset(now: number, difficulty: BotDifficultyDefinition): void {
    this.nextShotAt = now + difficulty.reactionTimeMs.minimum;
  }

  public attack(request: BotAttackRequest): void {
    const { playerPosition, distanceToPlayer, now, difficulty } = request;
    if (!this.combat.consumeBotAmmo()) {
      this.nextShotAt = now + 250;
      return;
    }
    const origin = this.combat.getBotMuzzlePosition();
    const target = playerPosition.subtract(new Vector3(0, 0.12, 0));
    const idealDirection = target.subtract(origin).normalize();
    const right = Vector3.Cross(Vector3.Up(), idealDirection).normalize();
    const shotUp = Vector3.Cross(idealDirection, right).normalize();
    const spread = this.getAimSpread(distanceToPlayer) * difficulty.aimSpreadMultiplier;
    const horizontalSpread = (Math.random() + Math.random() - 1) * spread;
    const verticalSpread = (Math.random() + Math.random() - 1) * spread;
    const shotDirection = idealDirection
      .add(right.scale(horizontalSpread))
      .add(shotUp.scale(verticalSpread))
      .normalize();

    this.combat.showBotMuzzleFlash(now);
    this.nextShotAt =
      now +
      this.getFireInterval(distanceToPlayer) * difficulty.fireIntervalMultiplier +
      this.randomBetween(-FIRE_INTERVAL_JITTER_MS, FIRE_INTERVAL_JITTER_MS);

    const toPlayer = target.subtract(origin);
    const projectedDistance = Vector3.Dot(toPlayer, shotDirection);
    if (projectedDistance <= 0) return;

    const shotRay = new Ray(origin, shotDirection, projectedDistance + 1);
    const coverHit = this.scene.pickWithRay(shotRay, this.isArenaCollision, false);
    if (coverHit?.hit && coverHit.distance < projectedDistance) return;

    const closestPoint = origin.add(shotDirection.scale(projectedDistance));
    if (
      Vector3.DistanceSquared(closestPoint, target) <=
      PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS
    ) {
      this.combat.damageTarget(BOT_WEAPON_DAMAGE);
    }
  }

  private getAimSpread(distance: number): number {
    if (distance <= 8) return CLOSE_AIM_SPREAD;
    if (distance <= 15) {
      const progress = (distance - 8) / 7;
      return CLOSE_AIM_SPREAD + (MEDIUM_AIM_SPREAD - CLOSE_AIM_SPREAD) * progress;
    }
    if (distance >= 22) return LONG_AIM_SPREAD;
    const progress = (distance - 15) / 7;
    return MEDIUM_AIM_SPREAD + (LONG_AIM_SPREAD - MEDIUM_AIM_SPREAD) * progress;
  }

  private getFireInterval(distance: number): number {
    if (distance <= 8) return CLOSE_FIRE_INTERVAL_MS;
    if (distance >= 20) return LONG_FIRE_INTERVAL_MS;
    return MEDIUM_FIRE_INTERVAL_MS;
  }

  private randomBetween(minimum: number, maximum: number): number {
    return minimum + Math.random() * (maximum - minimum);
  }
}
