import { Ray } from "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { CombatSystem } from "../combat/CombatSystem";
import type { PlayerController } from "../player/PlayerController";

const PATROL_SPEED = 2.05;
const PURSUIT_SPEED = 3.05;
const COMBAT_STRAFE_SPEED = 1.15;
const GRAVITY_SPEED = 4.5;
const TURN_SPEED = 3.2;
const DETECTION_RANGE = 22;
const CLOSE_DETECTION_RANGE = 5.5;
const ATTACK_RANGE = 15;
const PREFERRED_MINIMUM_RANGE = 5.25;
const PLAYER_MEMORY_MS = 2_400;
const REACTION_TIME_MS = 650;
const FIRE_INTERVAL_MS = 720;
const FIRE_INTERVAL_JITTER_MS = 90;
const BOT_WEAPON_DAMAGE = 14;
const AIM_SPREAD = 0.04;
const AIM_TOLERANCE_RADIANS = 0.12;
const PLAYER_HIT_RADIUS = 0.48;
const WAYPOINT_REACHED_DISTANCE = 0.75;
const OBSTACLE_LOOK_AHEAD = 1.8;
const OBSTACLE_TURN_RADIANS = 1.05;
const STUCK_FLIP_TIME_SECONDS = 0.45;
const FIELD_OF_VIEW_COSINE = Math.cos((75 * Math.PI) / 180);

type BotBehaviorState = "patrol" | "pursuit" | "attack";

export class BotAI {
  private readonly updateObserver: Observer<Scene>;
  private readonly lastKnownPlayerPosition = Vector3.Zero();

  private state: BotBehaviorState = "patrol";
  private patrolIndex: number;
  private lastSeenAt = Number.NEGATIVE_INFINITY;
  private spottedAt = Number.POSITIVE_INFINITY;
  private nextShotAt = 0;
  private avoidanceSign = 1;
  private stuckForSeconds = 0;
  private wasBotAlive = true;

  public constructor(
    private readonly scene: Scene,
    private readonly playerController: PlayerController,
    private readonly combatSystem: CombatSystem,
    private readonly patrolPoints: readonly Vector3[],
  ) {
    if (patrolPoints.length === 0) {
      throw new Error("Arena Strike requires bot patrol points.");
    }

    this.patrolIndex = this.findNearestPatrolPoint();
    this.updateObserver = scene.onAfterAnimationsObservable.add(() => {
      this.update();
    });
  }

  public dispose(): void {
    this.scene.onAfterAnimationsObservable.remove(this.updateObserver);
  }

  private update(): void {
    const now = performance.now();
    const deltaSeconds = Math.min(
      this.scene.getEngine().getDeltaTime() / 1000,
      0.05,
    );

    if (!this.combatSystem.isBotAlive) {
      this.wasBotAlive = false;
      this.state = "patrol";
      return;
    }

    if (!this.wasBotAlive) {
      this.resetAfterRespawn(now);
      this.wasBotAlive = true;
    }

    if (!this.combatSystem.isPlayerAlive) {
      this.state = "patrol";
      this.spottedAt = Number.POSITIVE_INFINITY;
      this.updatePatrol(deltaSeconds);
      return;
    }

    const playerPosition = this.playerController.camera.position;
    const botPosition = this.combatSystem.getBotPosition();
    const distanceToPlayer = Vector3.Distance(botPosition, playerPosition);
    const canSeePlayer = this.canDetectPlayer(playerPosition, distanceToPlayer);

    if (canSeePlayer) {
      if (!Number.isFinite(this.spottedAt)) {
        this.spottedAt = now;
      }

      this.lastSeenAt = now;
      this.lastKnownPlayerPosition.copyFrom(playerPosition);
    }

    if (canSeePlayer && distanceToPlayer <= ATTACK_RANGE) {
      this.state = "attack";
    } else if (canSeePlayer || now - this.lastSeenAt <= PLAYER_MEMORY_MS) {
      this.state = "pursuit";
    } else {
      this.state = "patrol";
      this.spottedAt = Number.POSITIVE_INFINITY;
    }

    if (this.state === "attack") {
      this.updateAttack(playerPosition, distanceToPlayer, now, deltaSeconds);
      return;
    }

    if (this.state === "pursuit") {
      this.updatePursuit(deltaSeconds);
      return;
    }

    this.updatePatrol(deltaSeconds);
  }

  private updatePatrol(deltaSeconds: number): void {
    const target = this.patrolPoints[this.patrolIndex];

    if (!target) {
      return;
    }

    const botPosition = this.combatSystem.getBotPosition();

    if (this.horizontalDistance(botPosition, target) <= WAYPOINT_REACHED_DISTANCE) {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
      return;
    }

    this.moveToward(target, PATROL_SPEED, deltaSeconds);
  }

  private updatePursuit(deltaSeconds: number): void {
    const botPosition = this.combatSystem.getBotPosition();

    if (
      this.horizontalDistance(botPosition, this.lastKnownPlayerPosition) <=
      WAYPOINT_REACHED_DISTANCE
    ) {
      this.lastSeenAt = Number.NEGATIVE_INFINITY;
      this.spottedAt = Number.POSITIVE_INFINITY;
      this.state = "patrol";
      this.patrolIndex = this.findNearestPatrolPoint();
      return;
    }

    this.moveToward(this.lastKnownPlayerPosition, PURSUIT_SPEED, deltaSeconds);
  }

  private updateAttack(
    playerPosition: Vector3,
    distanceToPlayer: number,
    now: number,
    deltaSeconds: number,
  ): void {
    const remainingAimError = this.combatSystem.turnBotToward(
      playerPosition,
      TURN_SPEED * deltaSeconds,
    );

    if (distanceToPlayer > ATTACK_RANGE * 0.86) {
      this.moveToward(playerPosition, PURSUIT_SPEED * 0.7, deltaSeconds);
    } else if (distanceToPlayer < PREFERRED_MINIMUM_RANGE) {
      const retreatDirection = this.combatSystem
        .getBotPosition()
        .subtract(playerPosition);
      this.moveInDirection(
        retreatDirection,
        PURSUIT_SPEED * 0.72,
        deltaSeconds,
        false,
      );
    } else {
      const directionToPlayer = playerPosition
        .subtract(this.combatSystem.getBotPosition())
        .normalize();
      const strafeSign = Math.sin(now * 0.00135) >= 0 ? 1 : -1;
      const strafeDirection = new Vector3(
        directionToPlayer.z * strafeSign,
        0,
        -directionToPlayer.x * strafeSign,
      );
      this.moveInDirection(
        strafeDirection,
        COMBAT_STRAFE_SPEED,
        deltaSeconds,
        false,
      );
    }

    if (
      now - this.spottedAt >= REACTION_TIME_MS &&
      now >= this.nextShotAt &&
      remainingAimError <= AIM_TOLERANCE_RADIANS &&
      this.hasClearLineOfSight(playerPosition)
    ) {
      this.fireAtPlayer(playerPosition, now);
    }
  }

  private moveToward(
    target: Vector3,
    speed: number,
    deltaSeconds: number,
  ): void {
    const direction = target.subtract(this.combatSystem.getBotPosition());
    this.moveInDirection(direction, speed, deltaSeconds);
  }

  private moveInDirection(
    direction: Vector3,
    speed: number,
    deltaSeconds: number,
    faceMovement = true,
  ): void {
    const horizontalDirection = new Vector3(direction.x, 0, direction.z);

    if (horizontalDirection.lengthSquared() < 0.0001) {
      return;
    }

    horizontalDirection.normalize();
    const steeringDirection = this.avoidObstacles(horizontalDirection);
    if (faceMovement) {
      const botPosition = this.combatSystem.getBotPosition();
      this.combatSystem.turnBotToward(
        botPosition.add(steeringDirection),
        TURN_SPEED * deltaSeconds,
      );
    }

    const displacement = steeringDirection.scale(speed * deltaSeconds);
    displacement.y = -GRAVITY_SPEED * deltaSeconds;
    const distanceMoved = this.combatSystem.moveBot(displacement);
    const expectedHorizontalMovement = speed * deltaSeconds;

    if (distanceMoved < expectedHorizontalMovement * 0.18) {
      this.stuckForSeconds += deltaSeconds;

      if (this.stuckForSeconds >= STUCK_FLIP_TIME_SECONDS) {
        this.avoidanceSign *= -1;
        this.stuckForSeconds = 0;
      }
    } else {
      this.stuckForSeconds = 0;
    }
  }

  private avoidObstacles(direction: Vector3): Vector3 {
    const forwardClearance = this.getObstacleClearance(
      direction,
      OBSTACLE_LOOK_AHEAD,
    );

    if (forwardClearance >= OBSTACLE_LOOK_AHEAD * 0.92) {
      return direction;
    }

    const leftDirection = this.rotateDirection(
      direction,
      OBSTACLE_TURN_RADIANS * this.avoidanceSign,
    );
    const rightDirection = this.rotateDirection(
      direction,
      -OBSTACLE_TURN_RADIANS * this.avoidanceSign,
    );
    const leftClearance = this.getObstacleClearance(
      leftDirection,
      OBSTACLE_LOOK_AHEAD * 1.35,
    );
    const rightClearance = this.getObstacleClearance(
      rightDirection,
      OBSTACLE_LOOK_AHEAD * 1.35,
    );
    const avoidanceDirection =
      leftClearance >= rightClearance ? leftDirection : rightDirection;

    return direction.scale(0.2).add(avoidanceDirection.scale(0.8)).normalize();
  }

  private canDetectPlayer(playerPosition: Vector3, distance: number): boolean {
    if (distance > DETECTION_RANGE || !this.hasClearLineOfSight(playerPosition)) {
      return false;
    }

    if (distance <= CLOSE_DETECTION_RANGE) {
      return true;
    }

    const directionToPlayer = playerPosition
      .subtract(this.combatSystem.getBotEyePosition())
      .normalize();
    const forward = this.combatSystem.getBotForward();
    return Vector3.Dot(forward, directionToPlayer) >= FIELD_OF_VIEW_COSINE;
  }

  private hasClearLineOfSight(target: Vector3): boolean {
    const origin = this.combatSystem.getBotEyePosition();
    const toTarget = target.subtract(origin);
    const distance = toTarget.length();

    if (distance <= 0.01) {
      return true;
    }

    const ray = new Ray(origin, toTarget.scale(1 / distance), distance);
    const coverHit = this.scene.pickWithRay(
      ray,
      (mesh) => {
        const metadata = mesh.metadata as { arenaCollision?: boolean } | null;
        return metadata?.arenaCollision === true;
      },
      false,
    );

    return coverHit?.hit !== true;
  }

  private fireAtPlayer(playerPosition: Vector3, now: number): void {
    const origin = this.combatSystem.getBotMuzzlePosition();
    const target = playerPosition.subtract(new Vector3(0, 0.12, 0));
    const idealDirection = target.subtract(origin).normalize();
    const right = Vector3.Cross(Vector3.Up(), idealDirection).normalize();
    const shotUp = Vector3.Cross(idealDirection, right).normalize();
    const horizontalSpread = (Math.random() * 2 - 1) * AIM_SPREAD;
    const verticalSpread = (Math.random() * 2 - 1) * AIM_SPREAD;
    const shotDirection = idealDirection
      .add(right.scale(horizontalSpread))
      .add(shotUp.scale(verticalSpread))
      .normalize();

    this.combatSystem.showBotMuzzleFlash(now);
    this.nextShotAt =
      now +
      FIRE_INTERVAL_MS +
      (Math.random() * 2 - 1) * FIRE_INTERVAL_JITTER_MS;

    const toPlayer = target.subtract(origin);
    const projectedDistance = Vector3.Dot(toPlayer, shotDirection);

    if (projectedDistance <= 0) {
      return;
    }

    const shotRay = new Ray(origin, shotDirection, projectedDistance + 1);
    const coverHit = this.scene.pickWithRay(
      shotRay,
      (mesh) => {
        const metadata = mesh.metadata as { arenaCollision?: boolean } | null;
        return metadata?.arenaCollision === true;
      },
      false,
    );

    if (coverHit?.hit && coverHit.distance < projectedDistance) {
      return;
    }

    const closestPoint = origin.add(shotDirection.scale(projectedDistance));
    const missDistanceSquared = Vector3.DistanceSquared(closestPoint, target);

    if (missDistanceSquared <= PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
      this.combatSystem.damagePlayer(BOT_WEAPON_DAMAGE);
    }
  }

  private getObstacleClearance(direction: Vector3, distance: number): number {
    const origin = this.combatSystem
      .getBotEyePosition()
      .subtract(new Vector3(0, 0.85, 0));
    const ray = new Ray(origin, direction, distance);
    const hit = this.scene.pickWithRay(
      ray,
      (mesh) => {
        const metadata = mesh.metadata as { arenaCollision?: boolean } | null;
        return metadata?.arenaCollision === true;
      },
      false,
    );

    return hit?.hit ? hit.distance : distance;
  }

  private rotateDirection(direction: Vector3, angle: number): Vector3 {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return new Vector3(
      direction.x * cosine + direction.z * sine,
      0,
      -direction.x * sine + direction.z * cosine,
    );
  }

  private resetAfterRespawn(now: number): void {
    this.state = "patrol";
    this.patrolIndex = this.findNearestPatrolPoint();
    this.lastSeenAt = Number.NEGATIVE_INFINITY;
    this.spottedAt = Number.POSITIVE_INFINITY;
    this.nextShotAt = now + REACTION_TIME_MS;
    this.stuckForSeconds = 0;
  }

  private findNearestPatrolPoint(): number {
    const botPosition = this.combatSystem.getBotPosition();
    let nearestIndex = 0;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;

    this.patrolPoints.forEach((point, index) => {
      const distanceSquared = Vector3.DistanceSquared(botPosition, point);

      if (distanceSquared < nearestDistanceSquared) {
        nearestDistanceSquared = distanceSquared;
        nearestIndex = index;
      }
    });

    return nearestIndex;
  }

  private horizontalDistance(first: Vector3, second: Vector3): number {
    const deltaX = first.x - second.x;
    const deltaZ = first.z - second.z;
    return Math.hypot(deltaX, deltaZ);
  }
}
