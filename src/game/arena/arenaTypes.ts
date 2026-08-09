import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

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
  readonly id: string;
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
