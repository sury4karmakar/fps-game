import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

export interface ArenaSpawnPoint {
  readonly id: "player" | "bot";
  readonly position: Vector3;
  readonly facingTarget: Vector3;
}

export interface ArenaBuildResult {
  readonly collidableMeshes: readonly AbstractMesh[];
  readonly spawnPoints: {
    readonly player: ArenaSpawnPoint;
    readonly bot: ArenaSpawnPoint;
  };
}

