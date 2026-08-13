import "@babylonjs/core/Collisions/collisionCoordinator.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.pure.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { GAME_NAME } from "../../config/gameConfig";
import { validateArenaBuildResult } from "../arenaTypes";
import type {
  ArenaBuildResult,
  ArenaCoverPoint,
  ArenaSpawnPoint,
} from "../arenaTypes";
import { createTrainingYardEnvironment } from "./createTrainingYardEnvironment";

const ARENA_WIDTH = 36;
const ARENA_DEPTH = 28;
const WALL_HEIGHT = 5;
const WALL_THICKNESS = 0.8;

function assertArenaPoint(
  label: string,
  point: Vector3,
  halfWidth: number,
  halfDepth: number,
): void {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(point.z) ||
    Math.abs(point.x) >= halfWidth - WALL_THICKNESS ||
    Math.abs(point.z) >= halfDepth - WALL_THICKNESS
  ) {
    throw new Error(`${GAME_NAME} has an invalid ${label} point.`);
  }
}

function validateArenaTacticalData(
  playerRespawns: readonly ArenaSpawnPoint[],
  botRespawns: readonly ArenaSpawnPoint[],
  patrolPoints: readonly Vector3[],
  navigationPoints: readonly Vector3[],
  coverPoints: readonly ArenaCoverPoint[],
  halfWidth: number,
  halfDepth: number,
): void {
  if (
    playerRespawns.length < 2 ||
    botRespawns.length < 2 ||
    patrolPoints.length === 0 ||
    navigationPoints.length === 0 ||
    coverPoints.length === 0
  ) {
    throw new Error(`${GAME_NAME} requires complete spawn and tactical point data.`);
  }

  const spawnIds = new Set<string>();

  for (const spawn of [...playerRespawns, ...botRespawns]) {
    if (spawnIds.has(spawn.id)) {
      throw new Error(`${GAME_NAME} has a duplicate spawn id: ${spawn.id}.`);
    }

    spawnIds.add(spawn.id);
    assertArenaPoint(`spawn (${spawn.id})`, spawn.position, halfWidth, halfDepth);
  }

  patrolPoints.forEach((point, index) => {
    assertArenaPoint(`patrol (${index})`, point, halfWidth, halfDepth);
  });
  navigationPoints.forEach((point, index) => {
    assertArenaPoint(`navigation (${index})`, point, halfWidth, halfDepth);
  });

  const coverIds = new Set<string>();

  for (const coverPoint of coverPoints) {
    if (coverIds.has(coverPoint.id)) {
      throw new Error(`${GAME_NAME} has a duplicate cover id: ${coverPoint.id}.`);
    }

    coverIds.add(coverPoint.id);
    assertArenaPoint(
      `cover (${coverPoint.id})`,
      coverPoint.coverPosition,
      halfWidth,
      halfDepth,
    );
    assertArenaPoint(
      `cover peek (${coverPoint.id})`,
      coverPoint.peekPosition,
      halfWidth,
      halfDepth,
    );
  }
}

interface BoxSpec {
  readonly name: string;
  readonly size: {
    readonly width: number;
    readonly height: number;
    readonly depth: number;
  };
  readonly position: Vector3;
  readonly material: StandardMaterial;
  readonly rotationX?: number;
  readonly rotationY?: number;
  readonly castsShadow?: boolean;
  readonly walkable?: boolean;
}

function createMaterial(
  scene: Scene,
  name: string,
  diffuse: Color3,
  specular = new Color3(0.06, 0.06, 0.06),
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = diffuse;
  material.specularColor = specular;
  return material;
}

function markAsCollidable(
  mesh: Mesh,
  collidableMeshes: AbstractMesh[],
  walkable: boolean,
): void {
  mesh.checkCollisions = true;
  mesh.isPickable = true;
  mesh.metadata = {
    ...(mesh.metadata as Record<string, unknown> | null),
    arenaCollision: true,
    walkableSurface: walkable,
  };
  collidableMeshes.push(mesh);
}

function createArenaBox(
  scene: Scene,
  shadowGenerator: ShadowGenerator,
  collidableMeshes: AbstractMesh[],
  spec: BoxSpec,
): Mesh {
  const mesh = CreateBox(spec.name, spec.size, scene);
  mesh.position.copyFrom(spec.position);
  mesh.rotation.x = spec.rotationX ?? 0;
  mesh.rotation.y = spec.rotationY ?? 0;
  mesh.material = spec.material;
  mesh.receiveShadows = true;
  markAsCollidable(mesh, collidableMeshes, spec.walkable ?? false);

  if (spec.castsShadow ?? true) {
    shadowGenerator.addShadowCaster(mesh);
  }

  return mesh;
}

function createSpawnPad(
  scene: Scene,
  spawnPoint: ArenaSpawnPoint,
  color: Color3,
): void {
  const pad = CreateCylinder(
    `${spawnPoint.id}-spawn-pad`,
    {
      diameter: 2.4,
      height: 0.035,
      tessellation: 48,
    },
    scene,
  );
  pad.position.copyFrom(spawnPoint.position);
  pad.position.y = 0.025;
  pad.isPickable = false;

  const padMaterial = createMaterial(
    scene,
    `${spawnPoint.id}-spawn-pad-material`,
    color.scale(0.35),
    Color3.Black(),
  );
  padMaterial.emissiveColor = color.scale(0.35);
  padMaterial.alpha = 0.8;
  pad.material = padMaterial;
}

/** Builds the procedural Training Yard arena and its map-specific environment. */
export function createTrainingYard(scene: Scene): ArenaBuildResult {
  scene.collisionsEnabled = true;

  const { shadowGenerator } = createTrainingYardEnvironment(scene);
  const collidableMeshes: AbstractMesh[] = [];

  const floorMaterial = createMaterial(
    scene,
    "arena-floor-material",
    new Color3(0.17, 0.2, 0.22),
  );
  const wallMaterial = createMaterial(
    scene,
    "arena-wall-material",
    new Color3(0.34, 0.38, 0.4),
  );
  const crateMaterial = createMaterial(
    scene,
    "arena-crate-material",
    new Color3(0.48, 0.27, 0.1),
  );
  const coverMaterial = createMaterial(
    scene,
    "arena-cover-material",
    new Color3(0.12, 0.28, 0.4),
  );
  const rampMaterial = createMaterial(
    scene,
    "arena-ramp-material",
    new Color3(0.3, 0.34, 0.38),
    new Color3(0.16, 0.16, 0.16),
  );

  createArenaBox(scene, shadowGenerator, collidableMeshes, {
    name: "arena-floor",
    size: { width: ARENA_WIDTH, height: 0.4, depth: ARENA_DEPTH },
    position: new Vector3(0, -0.2, 0),
    material: floorMaterial,
    castsShadow: false,
    walkable: true,
  });

  const halfWidth = ARENA_WIDTH / 2;
  const halfDepth = ARENA_DEPTH / 2;
  const wallY = WALL_HEIGHT / 2;

  const walls: readonly BoxSpec[] = [
    {
      name: "arena-wall-north",
      size: {
        width: ARENA_WIDTH + WALL_THICKNESS * 2,
        height: WALL_HEIGHT,
        depth: WALL_THICKNESS,
      },
      position: new Vector3(0, wallY, halfDepth),
      material: wallMaterial,
    },
    {
      name: "arena-wall-south",
      size: {
        width: ARENA_WIDTH + WALL_THICKNESS * 2,
        height: WALL_HEIGHT,
        depth: WALL_THICKNESS,
      },
      position: new Vector3(0, wallY, -halfDepth),
      material: wallMaterial,
    },
    {
      name: "arena-wall-east",
      size: {
        width: WALL_THICKNESS,
        height: WALL_HEIGHT,
        depth: ARENA_DEPTH,
      },
      position: new Vector3(halfWidth, wallY, 0),
      material: wallMaterial,
    },
    {
      name: "arena-wall-west",
      size: {
        width: WALL_THICKNESS,
        height: WALL_HEIGHT,
        depth: ARENA_DEPTH,
      },
      position: new Vector3(-halfWidth, wallY, 0),
      material: wallMaterial,
    },
  ];

  for (const wall of walls) {
    createArenaBox(scene, shadowGenerator, collidableMeshes, wall);
  }

  const coverObjects: readonly BoxSpec[] = [
    {
      name: "central-cover",
      size: { width: 7, height: 1.8, depth: 1.2 },
      position: new Vector3(0, 0.9, 0),
      material: coverMaterial,
      walkable: true,
    },
    {
      name: "west-cover",
      size: { width: 1.2, height: 1.6, depth: 6 },
      position: new Vector3(-7.5, 0.8, 1.5),
      material: coverMaterial,
      walkable: true,
    },
    {
      name: "east-cover",
      size: { width: 1.2, height: 1.6, depth: 6 },
      position: new Vector3(7.5, 0.8, -1.5),
      material: coverMaterial,
      walkable: true,
    },
    {
      name: "player-spawn-shield",
      size: { width: 5, height: 2.4, depth: 0.7 },
      position: new Vector3(-11.5, 1.2, -6.5),
      rotationY: -0.35,
      material: coverMaterial,
      walkable: true,
    },
    {
      name: "bot-spawn-shield",
      size: { width: 5, height: 2.4, depth: 0.7 },
      position: new Vector3(11.5, 1.2, 6.5),
      rotationY: -0.35,
      material: coverMaterial,
      walkable: true,
    },
  ];

  for (const cover of coverObjects) {
    createArenaBox(scene, shadowGenerator, collidableMeshes, cover);
  }

  const cratePositions = [
    new Vector3(-12, 0.75, 3.5),
    new Vector3(-10.35, 0.75, 3.5),
    new Vector3(-11.2, 2.25, 3.5),
    new Vector3(12, 0.75, -3.5),
    new Vector3(10.35, 0.75, -3.5),
    new Vector3(11.2, 2.25, -3.5),
    new Vector3(-3.5, 0.75, -7.5),
    new Vector3(3.5, 0.75, 7.5),
  ] as const;

  cratePositions.forEach((position, index) => {
    createArenaBox(scene, shadowGenerator, collidableMeshes, {
      name: `arena-crate-${index + 1}`,
      size: { width: 1.5, height: 1.5, depth: 1.5 },
      position,
      material: crateMaterial,
      rotationY: index % 2 === 0 ? 0.08 : -0.06,
      walkable: true,
    });
  });

  const platformHeight = 1.4;
  const platforms: readonly BoxSpec[] = [
    {
      name: "north-platform",
      size: { width: 7, height: platformHeight, depth: 3.8 },
      position: new Vector3(-3.5, platformHeight / 2, 9.5),
      material: rampMaterial,
      walkable: true,
    },
    {
      name: "south-platform",
      size: { width: 7, height: platformHeight, depth: 3.8 },
      position: new Vector3(3.5, platformHeight / 2, -9.5),
      material: rampMaterial,
      walkable: true,
    },
  ];

  for (const platform of platforms) {
    createArenaBox(scene, shadowGenerator, collidableMeshes, platform);
  }

  const rampAngle = Math.atan2(platformHeight, 4.2);
  const rampLength = Math.hypot(platformHeight, 4.2);
  const ramps: readonly BoxSpec[] = [
    {
      name: "north-ramp",
      size: { width: 3.2, height: 0.24, depth: rampLength },
      position: new Vector3(-3.5, platformHeight / 2, 6.2),
      rotationX: -rampAngle,
      material: rampMaterial,
      walkable: true,
    },
    {
      name: "south-ramp",
      size: { width: 3.2, height: 0.24, depth: rampLength },
      position: new Vector3(3.5, platformHeight / 2, -6.2),
      rotationX: rampAngle,
      material: rampMaterial,
      walkable: true,
    },
  ];

  for (const ramp of ramps) {
    createArenaBox(scene, shadowGenerator, collidableMeshes, ramp);
  }

  const playerSpawn: ArenaSpawnPoint = {
    id: "player",
    position: new Vector3(-14, 0, -10),
    facingTarget: new Vector3(-7, 1.4, -4),
  };
  const botSpawn: ArenaSpawnPoint = {
    id: "bot",
    position: new Vector3(14, 0, 10),
    facingTarget: new Vector3(7, 1.4, 4),
  };

  const playerRespawnPoints: readonly ArenaSpawnPoint[] = [
    playerSpawn,
    {
      id: "player-north-west",
      position: new Vector3(-14, 0, 9),
      facingTarget: new Vector3(-6, 1.4, 4),
    },
    {
      id: "player-south-center",
      position: new Vector3(-6, 0, -11),
      facingTarget: new Vector3(0, 1.4, -4),
    },
  ];
  const botRespawnPoints: readonly ArenaSpawnPoint[] = [
    botSpawn,
    {
      id: "bot-south-east",
      position: new Vector3(14, 0, -9),
      facingTarget: new Vector3(6, 1.4, -4),
    },
    {
      id: "bot-north-center",
      position: new Vector3(6, 0, 11),
      facingTarget: new Vector3(0, 1.4, 4),
    },
  ];
  const botPatrolPoints: readonly Vector3[] = [
    new Vector3(14, 0, 10),
    new Vector3(14, 0, -10),
    new Vector3(8, 0, -6),
    new Vector3(5, 0, 5),
    new Vector3(2, 0, 9),
    new Vector3(-5, 0, -5),
    new Vector3(-8, 0, 6),
    new Vector3(-14, 0, 10),
    new Vector3(-14, 0, -10),
    new Vector3(-2, 0, -9),
  ];
  const botCoverPoints: readonly ArenaCoverPoint[] = [
    {
      id: "central-cover-west",
      coverPosition: new Vector3(-4.2, 0, 0),
      peekPosition: new Vector3(-4.25, 0, -1.65),
    },
    {
      id: "central-cover-east",
      coverPosition: new Vector3(4.2, 0, 0),
      peekPosition: new Vector3(4.25, 0, 1.65),
    },
    {
      id: "west-cover-north",
      coverPosition: new Vector3(-8.45, 0, 3.2),
      peekPosition: new Vector3(-8.45, 0, 4.65),
    },
    {
      id: "east-cover-south",
      coverPosition: new Vector3(8.45, 0, -3.2),
      peekPosition: new Vector3(8.45, 0, -4.65),
    },
    {
      id: "north-crates",
      coverPosition: new Vector3(-10.4, 0, 2.15),
      peekPosition: new Vector3(-9.2, 0, 2.15),
    },
    {
      id: "south-crates",
      coverPosition: new Vector3(10.4, 0, -2.15),
      peekPosition: new Vector3(9.2, 0, -2.15),
    },
  ];
  const botNavigationPoints: readonly Vector3[] = [
    ...botPatrolPoints,
    new Vector3(15, 0, 0),
    new Vector3(8, 0, -11),
    new Vector3(-2, 0, -11),
    new Vector3(-8, 0, -11),
    new Vector3(-15, 0, 0),
    new Vector3(-8, 0, 11),
    new Vector3(2, 0, 11),
    new Vector3(8, 0, 11),
    new Vector3(-10, 0, -2),
    new Vector3(-10, 0, 5.5),
    new Vector3(10, 0, -5.5),
    new Vector3(10, 0, 2),
    new Vector3(-5, 0, -7),
    new Vector3(0, 0, -6),
    new Vector3(6, 0, -6),
    new Vector3(-5, 0, -2),
    new Vector3(5, 0, -2),
    new Vector3(-5, 0, 2),
    new Vector3(5, 0, 2),
    new Vector3(-6, 0, 6),
    new Vector3(0, 0, 6),
    new Vector3(5, 0, 6),
    ...botCoverPoints.flatMap((coverPoint) => [
      coverPoint.coverPosition,
      coverPoint.peekPosition,
    ]),
  ];

  validateArenaTacticalData(
    playerRespawnPoints,
    botRespawnPoints,
    botPatrolPoints,
    botNavigationPoints,
    botCoverPoints,
    halfWidth,
    halfDepth,
  );

  createSpawnPad(scene, playerSpawn, new Color3(0.15, 0.75, 1));
  createSpawnPad(scene, botSpawn, new Color3(1, 0.28, 0.18));

  const arena: ArenaBuildResult = {
    id: "training-yard",
    shadowGenerator,
    collidableMeshes,
    botPatrolPoints,
    botNavigationPoints,
    botCoverPoints,
    spawnPoints: {
      player: playerSpawn,
      bot: botSpawn,
    },
    respawnPoints: {
      player: playerRespawnPoints,
      bot: botRespawnPoints,
    },
  };

  validateArenaBuildResult("training-yard", arena);
  return arena;
}

/** Common map-registry export; each lazy-loaded map provides this signature. */
export const createArena = createTrainingYard;
