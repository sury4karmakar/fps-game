import "@babylonjs/core/Collisions/collisionCoordinator.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { validateArenaBuildResult } from "../arenaTypes";
import type { ArenaBuildResult, ArenaCoverPoint, ArenaSpawnPoint } from "../arenaTypes";
import { createTrainingGroundEnvironment } from "./createTrainingGroundEnvironment";

const WIDTH = 32;
const DEPTH = 28;
const WALL_HEIGHT = 5;
const WALL_THICKNESS = 0.8;

function createCollidableBox(
  scene: Scene,
  collidableMeshes: AbstractMesh[],
  name: string,
  size: { width: number; height: number; depth: number },
  position: Vector3,
  material: StandardMaterial,
  walkable = false,
): Mesh {
  const mesh = CreateBox(name, size, scene);
  mesh.position.copyFrom(position);
  mesh.material = material;
  mesh.checkCollisions = true;
  mesh.isPickable = true;
  mesh.receiveShadows = true;
  mesh.metadata = { arenaCollision: true, walkableSurface: walkable };
  collidableMeshes.push(mesh);
  return mesh;
}

function createShowcasePlinth(
  scene: Scene,
  name: string,
  position: Vector3,
  material: StandardMaterial,
): Mesh {
  const plinth = CreateBox(name, { width: 3.8, height: 1.4, depth: 1.8 }, scene);
  plinth.position.copyFrom(position);
  plinth.material = material;
  plinth.isPickable = false;
  plinth.checkCollisions = false;
  plinth.receiveShadows = true;
  return plinth;
}

/** Builds the lightweight Entry and Showcase hub for Training Ground. */
export function createTrainingGround(scene: Scene): ArenaBuildResult {
  scene.collisionsEnabled = true;
  const { shadowGenerator } = createTrainingGroundEnvironment(scene);
  const collidableMeshes: AbstractMesh[] = [];
  const floorMaterial = new StandardMaterial("training-ground-floor-material", scene);
  floorMaterial.diffuseColor = new Color3(0.42, 0.45, 0.38);
  floorMaterial.specularColor = Color3.Black();
  const wallMaterial = new StandardMaterial("training-ground-wall-material", scene);
  wallMaterial.diffuseColor = new Color3(0.82, 0.84, 0.8);
  wallMaterial.specularColor = Color3.Black();
  const showcaseMaterial = new StandardMaterial("training-ground-showcase-material", scene);
  showcaseMaterial.diffuseColor = new Color3(0.17, 0.46, 0.68);
  showcaseMaterial.specularColor = new Color3(0.12, 0.22, 0.3);

  const floor = createCollidableBox(
    scene, collidableMeshes, "training-ground-floor",
    { width: WIDTH, height: 0.4, depth: DEPTH }, new Vector3(0, -0.2, 0), floorMaterial, true,
  );
  floor.receiveShadows = true;

  const halfWidth = WIDTH / 2;
  const halfDepth = DEPTH / 2;
  const walls = [
    ["north", { width: WIDTH + WALL_THICKNESS * 2, height: WALL_HEIGHT, depth: WALL_THICKNESS }, new Vector3(0, WALL_HEIGHT / 2, halfDepth)],
    ["south", { width: WIDTH + WALL_THICKNESS * 2, height: WALL_HEIGHT, depth: WALL_THICKNESS }, new Vector3(0, WALL_HEIGHT / 2, -halfDepth)],
    ["east", { width: WALL_THICKNESS, height: WALL_HEIGHT, depth: DEPTH }, new Vector3(halfWidth, WALL_HEIGHT / 2, 0)],
    ["west", { width: WALL_THICKNESS, height: WALL_HEIGHT, depth: DEPTH }, new Vector3(-halfWidth, WALL_HEIGHT / 2, 0)],
  ] as const;
  for (const [side, size, position] of walls) {
    const wall = createCollidableBox(scene, collidableMeshes, `training-ground-wall-${side}`, size, position, wallMaterial);
    shadowGenerator.addShadowCaster(wall);
  }

  for (const [index, x] of [-5, 0, 5].entries()) {
    const plinth = createShowcasePlinth(
      scene,
      `training-ground-showcase-plinth-${index + 1}`,
      new Vector3(x, 0.7, 2.5),
      showcaseMaterial,
    );
    shadowGenerator.addShadowCaster(plinth);
  }

  const playerSpawn: ArenaSpawnPoint = {
    id: "training-ground-entry-player",
    position: new Vector3(0, 0, -9),
    facingTarget: new Vector3(0, 1.4, 2.5),
  };
  // These contract points are intentionally invisible. Training Ground does not enable a bot.
  const botSpawn: ArenaSpawnPoint = {
    id: "training-ground-bot-placeholder",
    position: new Vector3(0, 0, 10),
    facingTarget: new Vector3(0, 1.4, 0),
  };
  const playerRespawns = [playerSpawn, { id: "training-ground-entry-player-west", position: new Vector3(-8, 0, -9), facingTarget: new Vector3(0, 1.4, 2.5) }] as const;
  const botRespawns = [botSpawn, { id: "training-ground-bot-placeholder-east", position: new Vector3(8, 0, 8), facingTarget: new Vector3(0, 1.4, 0) }] as const;
  const botPatrolPoints = [botSpawn.position] as const;
  const botNavigationPoints = [botSpawn.position] as const;
  const botCoverPoints: readonly ArenaCoverPoint[] = [{
    id: "training-ground-bot-placeholder-cover",
    coverPosition: botSpawn.position,
    peekPosition: botSpawn.position,
  }];

  const arena: ArenaBuildResult = {
    id: "training-ground", shadowGenerator, collidableMeshes,
    botPatrolPoints, botNavigationPoints, botCoverPoints,
    spawnPoints: { player: playerSpawn, bot: botSpawn },
    respawnPoints: { player: playerRespawns, bot: botRespawns },
  };
  validateArenaBuildResult("training-ground", arena);
  return arena;
}

export const createArena = createTrainingGround;
