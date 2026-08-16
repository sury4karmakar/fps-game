import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import {
  GAME_NAME,
  getArenaMapDefinition,
  type ArenaMapId,
} from "../config/gameConfig";

export interface ArenaSpawnPoint {
  readonly id: string;
  readonly position: Vector3;
  readonly facingTarget: Vector3;
}

export interface ArenaCoverPoint {
  readonly id: string;
  readonly coverPosition: Vector3;
  readonly peekPosition: Vector3;
}

export interface ArenaBuildResult {
  readonly id: ArenaMapId;
  readonly shadowGenerator: ShadowGenerator;
  readonly collidableMeshes: readonly AbstractMesh[];
  readonly botPatrolPoints: readonly Vector3[];
  readonly botNavigationPoints: readonly Vector3[];
  readonly botCoverPoints: readonly ArenaCoverPoint[];
  readonly spawnPoints: {
    readonly player: ArenaSpawnPoint;
    readonly bot: ArenaSpawnPoint;
  };
  readonly respawnPoints: {
    readonly player: readonly ArenaSpawnPoint[];
    readonly bot: readonly ArenaSpawnPoint[];
  };
}

/** Identifies geometry supplied by the active arena as a gameplay blocker. */
export function isArenaCollisionMesh(mesh: { metadata: unknown }): boolean {
  const metadata = mesh.metadata as { arenaCollision?: boolean } | null;
  return metadata?.arenaCollision === true;
}

function assertFinitePoint(mapName: string, label: string, point: Vector3): void {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(point.z)
  ) {
    throw new Error(`${GAME_NAME} map "${mapName}" has an invalid ${label}.`);
  }
}

/** Validates the map data consumed by shared player, combat, and bot systems. */
export function validateArenaBuildResult(
  expectedMapId: ArenaMapId,
  arena: ArenaBuildResult,
): void {
  const mapName = getArenaMapDefinition(expectedMapId).displayName;

  if (arena.id !== expectedMapId) {
    throw new Error(
      `${GAME_NAME} map "${mapName}" returned the unexpected map id "${arena.id}".`,
    );
  }

  if (
    arena.collidableMeshes.length === 0 ||
    arena.respawnPoints.player.length < 2 ||
    arena.respawnPoints.bot.length < 2 ||
    arena.botPatrolPoints.length === 0 ||
    arena.botNavigationPoints.length === 0 ||
    arena.botCoverPoints.length === 0
  ) {
    throw new Error(
      `${GAME_NAME} map "${mapName}" requires player and bot respawns, patrol, navigation, and cover data.`,
    );
  }

  for (const mesh of arena.collidableMeshes) {
    if (!isArenaCollisionMesh(mesh) || !mesh.isPickable || !mesh.checkCollisions) {
      throw new Error(
        `${GAME_NAME} map "${mapName}" has invalid collision geometry: ${mesh.name}.`,
      );
    }
  }

  const spawnIds = new Set<string>();
  const spawnGroups = [
    ...arena.respawnPoints.player,
    ...arena.respawnPoints.bot,
  ];

  for (const spawn of spawnGroups) {
    if (spawnIds.has(spawn.id)) {
      throw new Error(
        `${GAME_NAME} map "${mapName}" has a duplicate spawn id: ${spawn.id}.`,
      );
    }

    spawnIds.add(spawn.id);
    assertFinitePoint(mapName, `spawn (${spawn.id})`, spawn.position);
    assertFinitePoint(mapName, `spawn facing target (${spawn.id})`, spawn.facingTarget);
  }

  assertFinitePoint(mapName, "initial player spawn", arena.spawnPoints.player.position);
  assertFinitePoint(
    mapName,
    "initial player spawn facing target",
    arena.spawnPoints.player.facingTarget,
  );
  assertFinitePoint(mapName, "initial bot spawn", arena.spawnPoints.bot.position);
  assertFinitePoint(
    mapName,
    "initial bot spawn facing target",
    arena.spawnPoints.bot.facingTarget,
  );

  arena.botPatrolPoints.forEach((point, index) => {
    assertFinitePoint(mapName, `patrol point (${index})`, point);
  });
  arena.botNavigationPoints.forEach((point, index) => {
    assertFinitePoint(mapName, `navigation point (${index})`, point);
  });

  const coverIds = new Set<string>();
  for (const coverPoint of arena.botCoverPoints) {
    if (coverIds.has(coverPoint.id)) {
      throw new Error(
        `${GAME_NAME} map "${mapName}" has a duplicate cover id: ${coverPoint.id}.`,
      );
    }

    coverIds.add(coverPoint.id);
    assertFinitePoint(mapName, `cover (${coverPoint.id})`, coverPoint.coverPosition);
    assertFinitePoint(
      mapName,
      `cover peek (${coverPoint.id})`,
      coverPoint.peekPosition,
    );
  }
}
