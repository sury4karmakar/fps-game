import { Ray } from "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { CombatSystem } from "../combat/CombatSystem";
import type { PlayerController } from "../player/PlayerController";

const PATROL_SPEED_MIN = 1.8;
const PATROL_SPEED_MAX = 2.45;
const PURSUIT_SPEED = 3.15;
const COMBAT_MOVE_SPEED = 1.35;
const GRAVITY_SPEED = 4.5;
const TURN_SPEED = 3.35;
const DETECTION_RANGE = 32;
const HEARING_RANGE = 34;
const CLOSE_DETECTION_RANGE = 6;
const MAX_ATTACK_RANGE = 30;
const PREFERRED_MINIMUM_RANGE = 6;
const PLAYER_MEMORY_MS = 3_600;
const SEARCH_DURATION_MIN_MS = 1_200;
const SEARCH_DURATION_MAX_MS = 2_200;
const REACTION_TIME_MIN_MS = 500;
const REACTION_TIME_MAX_MS = 850;
const CLOSE_FIRE_INTERVAL_MS = 650;
const MEDIUM_FIRE_INTERVAL_MS = 760;
const LONG_FIRE_INTERVAL_MS = 920;
const FIRE_INTERVAL_JITTER_MS = 110;
const BOT_WEAPON_DAMAGE = 14;
const CLOSE_AIM_SPREAD = 0.03;
const MEDIUM_AIM_SPREAD = 0.047;
const LONG_AIM_SPREAD = 0.075;
const AIM_TOLERANCE_RADIANS = 0.1;
const PLAYER_HIT_RADIUS = 0.48;
const WAYPOINT_REACHED_DISTANCE = 0.72;
const PATROL_PAUSE_MIN_MS = 350;
const PATROL_PAUSE_MAX_MS = 1_300;
const COMBAT_DECISION_MIN_MS = 750;
const COMBAT_DECISION_MAX_MS = 1_650;
const ROUTE_REPLAN_MIN_MS = 550;
const ROUTE_REPLAN_MAX_MS = 850;
const ROUTE_TARGET_CHANGE_DISTANCE = 2.2;
const NAVIGATION_EDGE_RANGE = 12.5;
const NAVIGATION_LINK_RANGE = 15;
const NAVIGATION_CLEARANCE = 0.46;
const NAVIGATION_RAY_HEIGHT = 0.72;
const OBSTACLE_LOOK_AHEAD = 2.1;
const OBSTACLE_TURN_RADIANS = 1.02;
const STUCK_TRIGGER_SECONDS = 0.52;
const RECOVERY_MIN_MS = 700;
const RECOVERY_MAX_MS = 1_050;
const FIELD_OF_VIEW_COSINE = Math.cos((80 * Math.PI) / 180);

type BotBehaviorState = "patrol" | "pursuit" | "search" | "attack";
type CombatMoveMode =
  | "hold"
  | "strafe-left"
  | "strafe-right"
  | "advance"
  | "retreat";

interface NavigationEdge {
  readonly to: number;
  readonly cost: number;
}

export class BotAI {
  private readonly updateObserver: Observer<Scene>;
  private readonly lastKnownPlayerPosition = Vector3.Zero();
  private readonly navigationGraph: readonly NavigationEdge[][];
  private readonly patrolScanTarget = Vector3.Zero();
  private readonly searchLookTarget = Vector3.Zero();

  private state: BotBehaviorState = "patrol";
  private combatMoveMode: CombatMoveMode = "hold";
  private patrolTargetIndex = -1;
  private previousPatrolTargetIndex = -1;
  private patrolSpeed = PATROL_SPEED_MIN;
  private patrolPauseUntil = 0;
  private nextCombatDecisionAt = 0;
  private lastContactAt = Number.NEGATIVE_INFINITY;
  private reactionReadyAt = Number.POSITIVE_INFINITY;
  private nextShotAt = 0;
  private searchUntil = 0;
  private nextSearchTurnAt = 0;
  private hadVisualContact = false;
  private isEnabled = true;
  private wasBotAlive = true;

  private route: Vector3[] = [];
  private routeIndex = 0;
  private routeDestination: Vector3 | null = null;
  private nextRouteAt = 0;

  private avoidanceSign = Math.random() < 0.5 ? -1 : 1;
  private stuckForSeconds = 0;
  private recoveryUntil = 0;
  private readonly recoveryDirection = Vector3.Zero();

  public constructor(
    private readonly scene: Scene,
    private readonly playerController: PlayerController,
    private readonly combatSystem: CombatSystem,
    private readonly patrolPoints: readonly Vector3[],
    private readonly navigationPoints: readonly Vector3[],
  ) {
    if (patrolPoints.length === 0 || navigationPoints.length === 0) {
      throw new Error("Arena Strike requires bot patrol and navigation points.");
    }

    this.navigationGraph = this.buildNavigationGraph();
    this.chooseNextPatrolTarget(performance.now());
    this.updateObserver = scene.onAfterAnimationsObservable.add(() => {
      this.update();
    });
  }

  public dispose(): void {
    this.scene.onAfterAnimationsObservable.remove(this.updateObserver);
  }

  public setEnabled(enabled: boolean): void {
    if (this.isEnabled === enabled) {
      return;
    }

    this.isEnabled = enabled;

    if (enabled) {
      this.wasBotAlive = this.combatSystem.isBotAlive;
      this.resetAfterRespawn(performance.now());
    }
  }

  public notifyPlayerShot(playerPosition: Vector3): void {
    if (
      !this.isEnabled ||
      !this.combatSystem.isBotAlive ||
      Vector3.Distance(this.combatSystem.getBotPosition(), playerPosition) >
        HEARING_RANGE
    ) {
      return;
    }

    const now = performance.now();
    this.lastKnownPlayerPosition.copyFrom(playerPosition);
    this.lastContactAt = now;
    this.clearRoute();

    if (this.state === "patrol" || this.state === "search") {
      this.state = "pursuit";
    }
  }

  private update(): void {
    if (!this.isEnabled) {
      return;
    }

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
      this.hadVisualContact = false;
      this.state = "patrol";
      this.updatePatrol(now, deltaSeconds);
      return;
    }

    const playerPosition = this.playerController.camera.position;
    const botPosition = this.combatSystem.getBotPosition();
    const distanceToPlayer = Vector3.Distance(botPosition, playerPosition);
    const canSeePlayer = this.canDetectPlayer(playerPosition, distanceToPlayer);

    if (canSeePlayer) {
      if (!this.hadVisualContact) {
        this.reactionReadyAt =
          now + this.randomBetween(REACTION_TIME_MIN_MS, REACTION_TIME_MAX_MS);
      }

      this.hadVisualContact = true;
      this.lastContactAt = now;
      this.lastKnownPlayerPosition.copyFrom(playerPosition);
    } else {
      this.hadVisualContact = false;
    }

    if (canSeePlayer && distanceToPlayer <= MAX_ATTACK_RANGE) {
      this.state = "attack";
      this.updateAttack(playerPosition, distanceToPlayer, now, deltaSeconds);
      return;
    }

    if (now - this.lastContactAt <= PLAYER_MEMORY_MS) {
      this.state = "pursuit";
      this.updatePursuit(now, deltaSeconds);
      return;
    }

    if (this.state === "pursuit") {
      this.beginSearch(now);
    }

    if (this.state === "search" && now < this.searchUntil) {
      this.updateSearch(now, deltaSeconds);
      return;
    }

    this.state = "patrol";
    this.updatePatrol(now, deltaSeconds);
  }

  private updatePatrol(now: number, deltaSeconds: number): void {
    if (now < this.patrolPauseUntil) {
      this.combatSystem.turnBotToward(
        this.patrolScanTarget,
        TURN_SPEED * 0.42 * deltaSeconds,
      );
      return;
    }

    if (this.patrolTargetIndex < 0) {
      this.chooseNextPatrolTarget(now);
    }

    const target = this.patrolPoints[this.patrolTargetIndex];

    if (!target) {
      return;
    }

    if (this.navigateTo(target, this.patrolSpeed, now, deltaSeconds)) {
      this.previousPatrolTargetIndex = this.patrolTargetIndex;
      this.patrolTargetIndex = -1;
      this.patrolPauseUntil =
        now + this.randomBetween(PATROL_PAUSE_MIN_MS, PATROL_PAUSE_MAX_MS);
      this.setRandomLookTarget(this.patrolScanTarget, 5);
      this.clearRoute();
    }
  }

  private updatePursuit(now: number, deltaSeconds: number): void {
    if (
      this.horizontalDistance(
        this.combatSystem.getBotPosition(),
        this.lastKnownPlayerPosition,
      ) <= WAYPOINT_REACHED_DISTANCE
    ) {
      this.beginSearch(now);
      return;
    }

    this.navigateTo(
      this.lastKnownPlayerPosition,
      PURSUIT_SPEED,
      now,
      deltaSeconds,
    );
  }

  private updateSearch(now: number, deltaSeconds: number): void {
    if (now >= this.nextSearchTurnAt) {
      this.setRandomLookTarget(this.searchLookTarget, 6);
      this.nextSearchTurnAt = now + this.randomBetween(380, 720);
    }

    this.combatSystem.turnBotToward(
      this.searchLookTarget,
      TURN_SPEED * 0.55 * deltaSeconds,
    );
  }

  private updateAttack(
    playerPosition: Vector3,
    distanceToPlayer: number,
    now: number,
    deltaSeconds: number,
  ): void {
    this.clearRoute();
    const remainingAimError = this.combatSystem.turnBotToward(
      playerPosition,
      TURN_SPEED * deltaSeconds,
    );

    if (now >= this.nextCombatDecisionAt) {
      this.chooseCombatMove(distanceToPlayer, now);
    }

    this.executeCombatMove(
      playerPosition,
      distanceToPlayer,
      now,
      deltaSeconds,
    );

    if (
      now >= this.reactionReadyAt &&
      now >= this.nextShotAt &&
      remainingAimError <= AIM_TOLERANCE_RADIANS &&
      this.hasClearLineOfSight(playerPosition)
    ) {
      this.fireAtPlayer(playerPosition, distanceToPlayer, now);
    }
  }

  private executeCombatMove(
    playerPosition: Vector3,
    distanceToPlayer: number,
    now: number,
    deltaSeconds: number,
  ): void {
    if (this.combatMoveMode === "hold") {
      return;
    }

    const botPosition = this.combatSystem.getBotPosition();
    const directionToPlayer = playerPosition.subtract(botPosition);
    directionToPlayer.y = 0;

    if (directionToPlayer.lengthSquared() < 0.0001) {
      return;
    }

    directionToPlayer.normalize();

    if (this.combatMoveMode === "advance") {
      if (distanceToPlayer > 9) {
        this.moveInDirection(
          directionToPlayer,
          COMBAT_MOVE_SPEED,
          deltaSeconds,
          now,
          false,
        );
      }
      return;
    }

    if (this.combatMoveMode === "retreat") {
      if (distanceToPlayer < 22) {
        this.moveInDirection(
          directionToPlayer.scale(-1),
          COMBAT_MOVE_SPEED,
          deltaSeconds,
          now,
          false,
        );
      }
      return;
    }

    const strafeSign = this.combatMoveMode === "strafe-left" ? -1 : 1;
    const strafeDirection = new Vector3(
      directionToPlayer.z * strafeSign,
      0,
      -directionToPlayer.x * strafeSign,
    );
    this.moveInDirection(
      strafeDirection,
      COMBAT_MOVE_SPEED,
      deltaSeconds,
      now,
      false,
    );
  }

  private chooseCombatMove(distanceToPlayer: number, now: number): void {
    const roll = Math.random();

    if (distanceToPlayer < PREFERRED_MINIMUM_RANGE) {
      this.combatMoveMode = roll < 0.62 ? "retreat" : this.randomStrafeMode();
    } else if (distanceToPlayer > 19) {
      if (roll < 0.4) {
        this.combatMoveMode = "hold";
      } else if (roll < 0.7) {
        this.combatMoveMode = this.randomStrafeMode();
      } else {
        this.combatMoveMode = "advance";
      }
    } else if (roll < 0.5) {
      this.combatMoveMode = this.randomStrafeMode();
    } else if (roll < 0.75) {
      this.combatMoveMode = "hold";
    } else if (roll < 0.88) {
      this.combatMoveMode = "advance";
    } else {
      this.combatMoveMode = "retreat";
    }

    this.nextCombatDecisionAt =
      now + this.randomBetween(COMBAT_DECISION_MIN_MS, COMBAT_DECISION_MAX_MS);
  }

  private navigateTo(
    destination: Vector3,
    speed: number,
    now: number,
    deltaSeconds: number,
  ): boolean {
    const botPosition = this.combatSystem.getBotPosition();
    const destinationChanged =
      this.routeDestination === null ||
      this.horizontalDistance(this.routeDestination, destination) >
        ROUTE_TARGET_CHANGE_DISTANCE;

    if (
      destinationChanged ||
      now >= this.nextRouteAt ||
      this.routeIndex >= this.route.length
    ) {
      this.route = this.findRoute(botPosition, destination);
      this.routeIndex = 0;
      this.routeDestination = destination.clone();
      this.nextRouteAt =
        now + this.randomBetween(ROUTE_REPLAN_MIN_MS, ROUTE_REPLAN_MAX_MS);
    }

    while (this.routeIndex < this.route.length) {
      const routePoint = this.route[this.routeIndex];

      if (!routePoint) {
        break;
      }

      if (
        this.horizontalDistance(this.combatSystem.getBotPosition(), routePoint) >
        WAYPOINT_REACHED_DISTANCE
      ) {
        this.moveToward(routePoint, speed, deltaSeconds, now);
        return false;
      }

      this.routeIndex += 1;
    }

    return this.horizontalDistance(this.combatSystem.getBotPosition(), destination) <=
      WAYPOINT_REACHED_DISTANCE;
  }

  private findRoute(start: Vector3, destination: Vector3): Vector3[] {
    const flatStart = new Vector3(start.x, 0, start.z);
    const flatDestination = new Vector3(destination.x, 0, destination.z);

    if (this.isNavigationSegmentClear(flatStart, flatDestination)) {
      return [flatDestination];
    }

    const startLinks = this.findVisibleNavigationLinks(flatStart);
    const destinationLinks = this.findVisibleNavigationLinks(flatDestination);

    if (startLinks.length === 0 || destinationLinks.length === 0) {
      const fallback = this.findFallbackNavigationPoint(
        flatStart,
        flatDestination,
      );
      return fallback ? [fallback] : [flatDestination];
    }

    const nodeCount = this.navigationPoints.length;
    const distances = Array<number>(nodeCount).fill(Number.POSITIVE_INFINITY);
    const previous = Array<number>(nodeCount).fill(-1);
    const visited = Array<boolean>(nodeCount).fill(false);

    for (const startIndex of startLinks) {
      const startPoint = this.navigationPoints[startIndex];

      if (startPoint) {
        distances[startIndex] = this.horizontalDistance(flatStart, startPoint);
      }
    }

    for (let iteration = 0; iteration < nodeCount; iteration += 1) {
      let currentIndex = -1;
      let currentDistance = Number.POSITIVE_INFINITY;

      for (let index = 0; index < nodeCount; index += 1) {
        if (!visited[index] && (distances[index] ?? Infinity) < currentDistance) {
          currentIndex = index;
          currentDistance = distances[index] ?? Number.POSITIVE_INFINITY;
        }
      }

      if (currentIndex < 0) {
        break;
      }

      visited[currentIndex] = true;

      for (const edge of this.navigationGraph[currentIndex] ?? []) {
        const nextDistance = currentDistance + edge.cost;

        if (nextDistance < (distances[edge.to] ?? Number.POSITIVE_INFINITY)) {
          distances[edge.to] = nextDistance;
          previous[edge.to] = currentIndex;
        }
      }
    }

    let bestDestinationIndex = -1;
    let bestTotalDistance = Number.POSITIVE_INFINITY;

    for (const destinationIndex of destinationLinks) {
      const destinationPoint = this.navigationPoints[destinationIndex];

      if (!destinationPoint) {
        continue;
      }

      const totalDistance =
        (distances[destinationIndex] ?? Number.POSITIVE_INFINITY) +
        this.horizontalDistance(destinationPoint, flatDestination);

      if (totalDistance < bestTotalDistance) {
        bestTotalDistance = totalDistance;
        bestDestinationIndex = destinationIndex;
      }
    }

    if (bestDestinationIndex < 0 || !Number.isFinite(bestTotalDistance)) {
      const fallback = this.findFallbackNavigationPoint(
        flatStart,
        flatDestination,
      );
      return fallback ? [fallback] : [flatDestination];
    }

    const routeIndices: number[] = [];
    let routeIndex = bestDestinationIndex;

    while (routeIndex >= 0) {
      routeIndices.push(routeIndex);
      routeIndex = previous[routeIndex] ?? -1;
    }

    routeIndices.reverse();
    const route = routeIndices
      .map((index) => this.navigationPoints[index]?.clone())
      .filter((point): point is Vector3 => point !== undefined);
    route.push(flatDestination);
    return route;
  }

  private buildNavigationGraph(): readonly NavigationEdge[][] {
    const graph: NavigationEdge[][] = this.navigationPoints.map(() => []);

    for (let firstIndex = 0; firstIndex < this.navigationPoints.length; firstIndex += 1) {
      const firstPoint = this.navigationPoints[firstIndex];

      if (!firstPoint) {
        continue;
      }

      for (
        let secondIndex = firstIndex + 1;
        secondIndex < this.navigationPoints.length;
        secondIndex += 1
      ) {
        const secondPoint = this.navigationPoints[secondIndex];

        if (!secondPoint) {
          continue;
        }

        const distance = this.horizontalDistance(firstPoint, secondPoint);

        if (
          distance <= NAVIGATION_EDGE_RANGE &&
          this.isNavigationSegmentClear(firstPoint, secondPoint)
        ) {
          graph[firstIndex]?.push({ to: secondIndex, cost: distance });
          graph[secondIndex]?.push({ to: firstIndex, cost: distance });
        }
      }
    }

    return graph;
  }

  private findVisibleNavigationLinks(position: Vector3): number[] {
    const nearbyLinks: number[] = [];
    const allVisibleLinks: number[] = [];

    this.navigationPoints.forEach((point, index) => {
      if (!this.isNavigationSegmentClear(position, point)) {
        return;
      }

      allVisibleLinks.push(index);

      if (this.horizontalDistance(position, point) <= NAVIGATION_LINK_RANGE) {
        nearbyLinks.push(index);
      }
    });

    return nearbyLinks.length > 0 ? nearbyLinks : allVisibleLinks;
  }

  private findFallbackNavigationPoint(
    start: Vector3,
    destination: Vector3,
  ): Vector3 | null {
    let bestPoint: Vector3 | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const point of this.navigationPoints) {
      if (!this.isNavigationSegmentClear(start, point)) {
        continue;
      }

      const score =
        this.horizontalDistance(start, point) * 0.35 +
        this.horizontalDistance(point, destination);

      if (score < bestScore) {
        bestScore = score;
        bestPoint = point.clone();
      }
    }

    return bestPoint;
  }

  private isNavigationSegmentClear(start: Vector3, end: Vector3): boolean {
    const horizontal = new Vector3(end.x - start.x, 0, end.z - start.z);
    const distance = horizontal.length();

    if (distance <= 0.05) {
      return true;
    }

    horizontal.scaleInPlace(1 / distance);
    const perpendicular = new Vector3(-horizontal.z, 0, horizontal.x);

    for (const offset of [-NAVIGATION_CLEARANCE, 0, NAVIGATION_CLEARANCE]) {
      const origin = new Vector3(
        start.x + perpendicular.x * offset,
        NAVIGATION_RAY_HEIGHT,
        start.z + perpendicular.z * offset,
      );
      const ray = new Ray(origin, horizontal, distance);
      const hit = this.scene.pickWithRay(ray, this.isArenaCollision, false);

      if (hit?.hit && hit.distance < distance - 0.08) {
        return false;
      }
    }

    return true;
  }

  private moveToward(
    target: Vector3,
    speed: number,
    deltaSeconds: number,
    now: number,
  ): void {
    const direction = target.subtract(this.combatSystem.getBotPosition());
    this.moveInDirection(direction, speed, deltaSeconds, now);
  }

  private moveInDirection(
    direction: Vector3,
    speed: number,
    deltaSeconds: number,
    now: number,
    faceMovement = true,
  ): void {
    const horizontalDirection = new Vector3(direction.x, 0, direction.z);

    if (horizontalDirection.lengthSquared() < 0.0001) {
      return;
    }

    horizontalDirection.normalize();
    const isRecovering = now < this.recoveryUntil;
    const steeringDirection = isRecovering
      ? this.recoveryDirection
      : this.avoidObstacles(horizontalDirection);

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
    const expectedMovement = speed * deltaSeconds;

    if (distanceMoved < expectedMovement * 0.2) {
      this.stuckForSeconds += deltaSeconds;

      if (this.stuckForSeconds >= STUCK_TRIGGER_SECONDS) {
        this.beginStuckRecovery(horizontalDirection, now);
      }
    } else {
      this.stuckForSeconds = Math.max(0, this.stuckForSeconds - deltaSeconds * 2);
    }
  }

  private beginStuckRecovery(direction: Vector3, now: number): void {
    const candidates = [
      this.rotateDirection(direction, Math.PI / 2),
      this.rotateDirection(direction, -Math.PI / 2),
      direction.scale(-1),
    ];
    let bestDirection = candidates[0] ?? direction.scale(-1);
    let bestClearance = Number.NEGATIVE_INFINITY;

    candidates.forEach((candidate, index) => {
      const clearance =
        this.getObstacleClearance(candidate, OBSTACLE_LOOK_AHEAD * 1.6) +
        Math.random() * 0.18 +
        (index === (this.avoidanceSign > 0 ? 0 : 1) ? 0.1 : 0);

      if (clearance > bestClearance) {
        bestClearance = clearance;
        bestDirection = candidate;
      }
    });

    this.recoveryDirection.copyFrom(bestDirection).normalize();
    this.recoveryUntil =
      now + this.randomBetween(RECOVERY_MIN_MS, RECOVERY_MAX_MS);
    this.avoidanceSign *= -1;
    this.stuckForSeconds = 0;
    this.clearRoute();
  }

  private avoidObstacles(direction: Vector3): Vector3 {
    const forwardClearance = this.getObstacleClearance(
      direction,
      OBSTACLE_LOOK_AHEAD,
    );

    if (forwardClearance >= OBSTACLE_LOOK_AHEAD * 0.94) {
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
      OBSTACLE_LOOK_AHEAD * 1.45,
    );
    const rightClearance = this.getObstacleClearance(
      rightDirection,
      OBSTACLE_LOOK_AHEAD * 1.45,
    );
    const avoidanceDirection =
      leftClearance >= rightClearance ? leftDirection : rightDirection;

    return direction.scale(0.15).add(avoidanceDirection.scale(0.85)).normalize();
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
    return (
      Vector3.Dot(this.combatSystem.getBotForward(), directionToPlayer) >=
      FIELD_OF_VIEW_COSINE
    );
  }

  private hasClearLineOfSight(target: Vector3): boolean {
    const origin = this.combatSystem.getBotEyePosition();
    const toTarget = target.subtract(origin);
    const distance = toTarget.length();

    if (distance <= 0.01) {
      return true;
    }

    const ray = new Ray(origin, toTarget.scale(1 / distance), distance);
    const coverHit = this.scene.pickWithRay(ray, this.isArenaCollision, false);
    return coverHit?.hit !== true;
  }

  private fireAtPlayer(
    playerPosition: Vector3,
    distanceToPlayer: number,
    now: number,
  ): void {
    const origin = this.combatSystem.getBotMuzzlePosition();
    const target = playerPosition.subtract(new Vector3(0, 0.12, 0));
    const idealDirection = target.subtract(origin).normalize();
    const right = Vector3.Cross(Vector3.Up(), idealDirection).normalize();
    const shotUp = Vector3.Cross(idealDirection, right).normalize();
    const spread = this.getAimSpread(distanceToPlayer);
    const horizontalSpread = (Math.random() + Math.random() - 1) * spread;
    const verticalSpread = (Math.random() + Math.random() - 1) * spread;
    const shotDirection = idealDirection
      .add(right.scale(horizontalSpread))
      .add(shotUp.scale(verticalSpread))
      .normalize();

    this.combatSystem.showBotMuzzleFlash(now);
    this.nextShotAt =
      now +
      this.getFireInterval(distanceToPlayer) +
      this.randomBetween(-FIRE_INTERVAL_JITTER_MS, FIRE_INTERVAL_JITTER_MS);

    const toPlayer = target.subtract(origin);
    const projectedDistance = Vector3.Dot(toPlayer, shotDirection);

    if (projectedDistance <= 0) {
      return;
    }

    const shotRay = new Ray(origin, shotDirection, projectedDistance + 1);
    const coverHit = this.scene.pickWithRay(
      shotRay,
      this.isArenaCollision,
      false,
    );

    if (coverHit?.hit && coverHit.distance < projectedDistance) {
      return;
    }

    const closestPoint = origin.add(shotDirection.scale(projectedDistance));

    if (
      Vector3.DistanceSquared(closestPoint, target) <=
      PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS
    ) {
      this.combatSystem.damagePlayer(BOT_WEAPON_DAMAGE);
    }
  }

  private getAimSpread(distance: number): number {
    if (distance <= 8) {
      return CLOSE_AIM_SPREAD;
    }

    if (distance <= 15) {
      const closeToMediumProgress = (distance - 8) / 7;
      return (
        CLOSE_AIM_SPREAD +
        (MEDIUM_AIM_SPREAD - CLOSE_AIM_SPREAD) * closeToMediumProgress
      );
    }

    if (distance >= 22) {
      return LONG_AIM_SPREAD;
    }

    const mediumToLongProgress = (distance - 15) / 7;
    return (
      MEDIUM_AIM_SPREAD +
      (LONG_AIM_SPREAD - MEDIUM_AIM_SPREAD) * mediumToLongProgress
    );
  }

  private getFireInterval(distance: number): number {
    if (distance <= 8) {
      return CLOSE_FIRE_INTERVAL_MS;
    }

    if (distance >= 20) {
      return LONG_FIRE_INTERVAL_MS;
    }

    return MEDIUM_FIRE_INTERVAL_MS;
  }

  private getObstacleClearance(direction: Vector3, distance: number): number {
    const centerOrigin = this.combatSystem
      .getBotEyePosition()
      .subtract(new Vector3(0, 0.88, 0));
    const perpendicular = new Vector3(-direction.z, 0, direction.x);
    let minimumClearance = distance;

    for (const offset of [-0.38, 0, 0.38]) {
      const origin = centerOrigin.add(perpendicular.scale(offset));
      const ray = new Ray(origin, direction, distance);
      const hit = this.scene.pickWithRay(ray, this.isArenaCollision, false);

      if (hit?.hit) {
        minimumClearance = Math.min(minimumClearance, hit.distance);
      }
    }

    return minimumClearance;
  }

  private readonly isArenaCollision = (mesh: {
    metadata: unknown;
  }): boolean => {
    const metadata = mesh.metadata as { arenaCollision?: boolean } | null;
    return metadata?.arenaCollision === true;
  };

  private chooseNextPatrolTarget(now: number): void {
    const botPosition = this.combatSystem.getBotPosition();
    const candidates = this.patrolPoints
      .map((point, index) => ({ point, index }))
      .filter(
        ({ point, index }) =>
          index !== this.previousPatrolTargetIndex &&
          this.horizontalDistance(botPosition, point) >= 4,
      );
    const selectionPool = candidates.length > 0 ? candidates : this.patrolPoints.map(
      (point, index) => ({ point, index }),
    );
    const selected = selectionPool[
      Math.floor(Math.random() * selectionPool.length)
    ];

    this.patrolTargetIndex = selected?.index ?? 0;
    this.patrolSpeed = this.randomBetween(PATROL_SPEED_MIN, PATROL_SPEED_MAX);
    this.patrolPauseUntil = now;
    this.clearRoute();
  }

  private beginSearch(now: number): void {
    this.state = "search";
    this.searchUntil =
      now + this.randomBetween(SEARCH_DURATION_MIN_MS, SEARCH_DURATION_MAX_MS);
    this.nextSearchTurnAt = now;
    this.clearRoute();
  }

  private setRandomLookTarget(target: Vector3, distance: number): void {
    const angle = Math.random() * Math.PI * 2;
    const botPosition = this.combatSystem.getBotPosition();
    target.copyFromFloats(
      botPosition.x + Math.sin(angle) * distance,
      botPosition.y + 1.2,
      botPosition.z + Math.cos(angle) * distance,
    );
  }

  private randomStrafeMode(): CombatMoveMode {
    return Math.random() < 0.5 ? "strafe-left" : "strafe-right";
  }

  private resetAfterRespawn(now: number): void {
    this.state = "patrol";
    this.combatMoveMode = "hold";
    this.previousPatrolTargetIndex = -1;
    this.patrolTargetIndex = -1;
    this.patrolPauseUntil = 0;
    this.lastContactAt = Number.NEGATIVE_INFINITY;
    this.reactionReadyAt = Number.POSITIVE_INFINITY;
    this.nextShotAt = now + REACTION_TIME_MIN_MS;
    this.hadVisualContact = false;
    this.stuckForSeconds = 0;
    this.recoveryUntil = 0;
    this.chooseNextPatrolTarget(now);
  }

  private clearRoute(): void {
    this.route = [];
    this.routeIndex = 0;
    this.routeDestination = null;
    this.nextRouteAt = 0;
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

  private randomBetween(minimum: number, maximum: number): number {
    return minimum + Math.random() * (maximum - minimum);
  }

  private horizontalDistance(first: Vector3, second: Vector3): number {
    return Math.hypot(first.x - second.x, first.z - second.z);
  }
}
