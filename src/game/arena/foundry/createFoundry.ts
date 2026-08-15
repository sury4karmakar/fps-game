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
import { loadFoundryAssets } from "./assets";
import { createFoundryEnvironment } from "./createFoundryEnvironment";

const FOUNDRY_WIDTH = 48;
const FOUNDRY_DEPTH = 36;
const WALL_HEIGHT = 7.2;
const WALL_THICKNESS = 1;

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
  readonly rotationZ?: number;
  readonly castsShadow?: boolean;
  readonly collidable?: boolean;
  readonly walkable?: boolean;
}

function createMaterial(
  scene: Scene,
  name: string,
  diffuse: Color3,
  specular = new Color3(0.08, 0.08, 0.08),
  emissive?: Color3,
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = diffuse;
  material.specularColor = specular;
  if (emissive) {
    material.emissiveColor = emissive;
  }
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

function createFoundryBox(
  scene: Scene,
  shadowGenerator: ShadowGenerator,
  collidableMeshes: AbstractMesh[],
  spec: BoxSpec,
): Mesh {
  const mesh = CreateBox(spec.name, spec.size, scene);
  mesh.position.copyFrom(spec.position);
  mesh.rotation.set(
    spec.rotationX ?? 0,
    spec.rotationY ?? 0,
    spec.rotationZ ?? 0,
  );
  mesh.material = spec.material;
  mesh.receiveShadows = true;

  if (spec.collidable ?? true) {
    markAsCollidable(mesh, collidableMeshes, spec.walkable ?? false);
  } else {
    mesh.isPickable = false;
  }

  if (spec.castsShadow ?? true) {
    shadowGenerator.addShadowCaster(mesh);
  }
  return mesh;
}

function createFoundryTank(
  scene: Scene,
  shadowGenerator: ShadowGenerator,
  collidableMeshes: AbstractMesh[],
  name: string,
  position: Vector3,
  material: StandardMaterial,
): Mesh {
  const tank = CreateCylinder(
    name,
    { diameter: 3.2, height: 3.8, tessellation: 24 },
    scene,
  );
  tank.position.copyFrom(position);
  tank.material = material;
  tank.receiveShadows = true;
  markAsCollidable(tank, collidableMeshes, false);
  shadowGenerator.addShadowCaster(tank);
  return tank;
}

function createSpawnPad(
  scene: Scene,
  spawnPoint: ArenaSpawnPoint,
  color: Color3,
): void {
  const pad = CreateCylinder(
    `${spawnPoint.id}-foundry-spawn-pad`,
    { diameter: 2.5, height: 0.04, tessellation: 40 },
    scene,
  );
  pad.position.copyFrom(spawnPoint.position);
  pad.position.y = 0.03;
  pad.isPickable = false;

  const material = createMaterial(
    scene,
    `${spawnPoint.id}-foundry-spawn-pad-material`,
    color.scale(0.22),
    Color3.Black(),
    color.scale(0.4),
  );
  material.alpha = 0.78;
  pad.material = material;
}

function assertFoundryPoint(label: string, point: Vector3): void {
  const halfWidth = FOUNDRY_WIDTH / 2 - WALL_THICKNESS;
  const halfDepth = FOUNDRY_DEPTH / 2 - WALL_THICKNESS;
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(point.z) ||
    Math.abs(point.x) >= halfWidth ||
    Math.abs(point.z) >= halfDepth
  ) {
    throw new Error(`${GAME_NAME} Foundry has an invalid ${label}.`);
  }
}

function validateFoundryPoints(
  playerRespawns: readonly ArenaSpawnPoint[],
  botRespawns: readonly ArenaSpawnPoint[],
  patrolPoints: readonly Vector3[],
  navigationPoints: readonly Vector3[],
  coverPoints: readonly ArenaCoverPoint[],
): void {
  for (const spawn of [...playerRespawns, ...botRespawns]) {
    assertFoundryPoint(`spawn (${spawn.id})`, spawn.position);
    assertFoundryPoint(`spawn target (${spawn.id})`, spawn.facingTarget);
  }
  patrolPoints.forEach((point, index) => {
    assertFoundryPoint(`patrol point (${index})`, point);
  });
  navigationPoints.forEach((point, index) => {
    assertFoundryPoint(`navigation point (${index})`, point);
  });
  for (const cover of coverPoints) {
    assertFoundryPoint(`cover (${cover.id})`, cover.coverPosition);
    assertFoundryPoint(`cover peek (${cover.id})`, cover.peekPosition);
  }
}

/** Builds the industrial Foundry arena and all map-owned tactical data. */
export async function createFoundry(scene: Scene): Promise<ArenaBuildResult> {
  await loadFoundryAssets(scene);
  scene.collisionsEnabled = true;

  const { shadowGenerator } = createFoundryEnvironment(scene);
  const collidableMeshes: AbstractMesh[] = [];

  const floorMaterial = createMaterial(
    scene,
    "foundry-floor-material",
    new Color3(0.14, 0.15, 0.16),
    new Color3(0.2, 0.2, 0.2),
  );
  const wallMaterial = createMaterial(
    scene,
    "foundry-wall-material",
    new Color3(0.24, 0.27, 0.29),
  );
  const steelMaterial = createMaterial(
    scene,
    "foundry-steel-material",
    new Color3(0.19, 0.23, 0.25),
    new Color3(0.32, 0.34, 0.35),
  );
  const rustMaterial = createMaterial(
    scene,
    "foundry-rust-material",
    new Color3(0.38, 0.16, 0.07),
  );
  const cautionMaterial = createMaterial(
    scene,
    "foundry-caution-material",
    new Color3(0.55, 0.36, 0.04),
  );
  const furnaceMaterial = createMaterial(
    scene,
    "foundry-furnace-material",
    new Color3(0.36, 0.09, 0.025),
    Color3.Black(),
    new Color3(0.58, 0.12, 0.02),
  );
  const roofMaterial = createMaterial(
    scene,
    "foundry-roof-material",
    new Color3(0.11, 0.13, 0.14),
  );

  createFoundryBox(scene, shadowGenerator, collidableMeshes, {
    name: "foundry-floor",
    size: { width: FOUNDRY_WIDTH, height: 0.4, depth: FOUNDRY_DEPTH },
    position: new Vector3(0, -0.2, 0),
    material: floorMaterial,
    castsShadow: false,
    walkable: true,
  });

  const halfWidth = FOUNDRY_WIDTH / 2;
  const halfDepth = FOUNDRY_DEPTH / 2;
  const wallY = WALL_HEIGHT / 2;
  const boundaryWalls: readonly BoxSpec[] = [
    {
      name: "foundry-wall-north",
      size: {
        width: FOUNDRY_WIDTH + WALL_THICKNESS * 2,
        height: WALL_HEIGHT,
        depth: WALL_THICKNESS,
      },
      position: new Vector3(0, wallY, halfDepth),
      material: wallMaterial,
    },
    {
      name: "foundry-wall-south",
      size: {
        width: FOUNDRY_WIDTH + WALL_THICKNESS * 2,
        height: WALL_HEIGHT,
        depth: WALL_THICKNESS,
      },
      position: new Vector3(0, wallY, -halfDepth),
      material: wallMaterial,
    },
    {
      name: "foundry-wall-east",
      size: { width: WALL_THICKNESS, height: WALL_HEIGHT, depth: FOUNDRY_DEPTH },
      position: new Vector3(halfWidth, wallY, 0),
      material: wallMaterial,
    },
    {
      name: "foundry-wall-west",
      size: { width: WALL_THICKNESS, height: WALL_HEIGHT, depth: FOUNDRY_DEPTH },
      position: new Vector3(-halfWidth, wallY, 0),
      material: wallMaterial,
    },
  ];
  boundaryWalls.forEach((wall) => {
    createFoundryBox(scene, shadowGenerator, collidableMeshes, wall);
  });

  // Split roof panels and cross-beams sell the warehouse silhouette while the
  // central skylight keeps the combat floor readable.
  const roofPanels: readonly BoxSpec[] = [
    {
      name: "foundry-roof-west",
      size: { width: 18, height: 0.35, depth: FOUNDRY_DEPTH },
      position: new Vector3(-15, WALL_HEIGHT, 0),
      material: roofMaterial,
      castsShadow: false,
      walkable: false,
    },
    {
      name: "foundry-roof-east",
      size: { width: 18, height: 0.35, depth: FOUNDRY_DEPTH },
      position: new Vector3(15, WALL_HEIGHT, 0),
      material: roofMaterial,
      castsShadow: false,
      walkable: false,
    },
  ];
  roofPanels.forEach((panel) => {
    createFoundryBox(scene, shadowGenerator, collidableMeshes, panel);
  });
  [-12, 0, 12].forEach((z, index) => {
    createFoundryBox(scene, shadowGenerator, collidableMeshes, {
      name: `foundry-roof-beam-${index + 1}`,
      size: { width: FOUNDRY_WIDTH, height: 0.45, depth: 0.45 },
      position: new Vector3(0, WALL_HEIGHT - 0.3, z),
      material: steelMaterial,
      castsShadow: false,
      collidable: false,
    });
  });

  // The furnace core blocks the longest diagonal sightline and creates a ring
  // with four decision points instead of Training Yard's open center.
  createFoundryBox(scene, shadowGenerator, collidableMeshes, {
    name: "foundry-furnace-core",
    size: { width: 8, height: 3.6, depth: 6 },
    position: new Vector3(0, 1.8, 0),
    material: steelMaterial,
  });
  createFoundryBox(scene, shadowGenerator, collidableMeshes, {
    name: "foundry-furnace-glow",
    size: { width: 8.15, height: 0.42, depth: 6.15 },
    position: new Vector3(0, 1.2, 0),
    material: furnaceMaterial,
    castsShadow: false,
    collidable: false,
  });
  createFoundryBox(scene, shadowGenerator, collidableMeshes, {
    name: "foundry-furnace-stack",
    size: { width: 3.2, height: 3.4, depth: 3.2 },
    position: new Vector3(0, 5.3, 0),
    material: rustMaterial,
  });

  // North loading dock gives the player an elevated route with a broad ramp.
  const dockHeight = 1.8;
  createFoundryBox(scene, shadowGenerator, collidableMeshes, {
    name: "foundry-loading-dock",
    size: { width: 13, height: dockHeight, depth: 4.8 },
    position: new Vector3(0, dockHeight / 2, 13.8),
    material: steelMaterial,
    walkable: true,
  });
  const rampRun = 5.2;
  const rampAngle = Math.atan2(dockHeight, rampRun);
  createFoundryBox(scene, shadowGenerator, collidableMeshes, {
    name: "foundry-loading-ramp",
    size: {
      width: 4.2,
      height: 0.28,
      depth: Math.hypot(dockHeight, rampRun),
    },
    position: new Vector3(0, dockHeight / 2, 9.1),
    rotationX: -rampAngle,
    material: cautionMaterial,
    walkable: true,
  });

  // Machinery and cover define west/east processing lanes and a lower,
  // close-range southern service route.
  createFoundryTank(
    scene,
    shadowGenerator,
    collidableMeshes,
    "foundry-west-tank",
    new Vector3(-13.5, 1.9, 4.5),
    rustMaterial,
  );
  createFoundryTank(
    scene,
    shadowGenerator,
    collidableMeshes,
    "foundry-east-tank",
    new Vector3(13.5, 1.9, -4.5),
    rustMaterial,
  );

  const laneCover: readonly BoxSpec[] = [
    {
      name: "foundry-west-pipe-rack",
      size: { width: 1.4, height: 2.2, depth: 7 },
      position: new Vector3(-9, 1.1, -2.5),
      material: steelMaterial,
    },
    {
      name: "foundry-east-pipe-rack",
      size: { width: 1.4, height: 2.2, depth: 7 },
      position: new Vector3(9, 1.1, 2.5),
      material: steelMaterial,
    },
    {
      name: "foundry-south-ingots-west",
      size: { width: 5, height: 1.45, depth: 2 },
      position: new Vector3(-7.5, 0.725, -11.5),
      rotationY: 0.08,
      material: rustMaterial,
      walkable: true,
    },
    {
      name: "foundry-south-ingots-east",
      size: { width: 5, height: 1.45, depth: 2 },
      position: new Vector3(7.5, 0.725, -11.5),
      rotationY: -0.08,
      material: rustMaterial,
      walkable: true,
    },
    {
      name: "foundry-dock-crates-west",
      size: { width: 2.2, height: 2, depth: 2.2 },
      position: new Vector3(-8.5, 1, 10.8),
      material: cautionMaterial,
      walkable: true,
    },
    {
      name: "foundry-dock-crates-east",
      size: { width: 2.2, height: 2, depth: 2.2 },
      position: new Vector3(8.5, 1, 10.8),
      material: cautionMaterial,
      walkable: true,
    },
  ];
  laneCover.forEach((cover) => {
    createFoundryBox(scene, shadowGenerator, collidableMeshes, cover);
  });

  // L-shaped spawn bays prevent direct spawn-to-spawn fire and provide two
  // safe exits instead of trapping a respawning combatant in a dead end.
  const spawnShields: readonly BoxSpec[] = [
    {
      name: "foundry-player-spawn-shield-front",
      size: { width: 5.5, height: 2.8, depth: 0.75 },
      position: new Vector3(-18.5, 1.4, -10.5),
      material: steelMaterial,
    },
    {
      name: "foundry-player-spawn-shield-side",
      size: { width: 0.75, height: 2.8, depth: 5.5 },
      position: new Vector3(-16, 1.4, -13.2),
      material: steelMaterial,
    },
    {
      name: "foundry-bot-spawn-shield-front",
      size: { width: 5.5, height: 2.8, depth: 0.75 },
      position: new Vector3(18.5, 1.4, 10.5),
      material: steelMaterial,
    },
    {
      name: "foundry-bot-spawn-shield-side",
      size: { width: 0.75, height: 2.8, depth: 5.5 },
      position: new Vector3(16, 1.4, 13.2),
      material: steelMaterial,
    },
  ];
  spawnShields.forEach((shield) => {
    createFoundryBox(scene, shadowGenerator, collidableMeshes, shield);
  });

  // Structural columns give long side lanes periodic breaks and reinforce the
  // scale of the warehouse without closing navigation routes.
  [
    new Vector3(-19, 2.8, -4),
    new Vector3(-19, 2.8, 6),
    new Vector3(19, 2.8, -6),
    new Vector3(19, 2.8, 4),
  ].forEach((position, index) => {
    createFoundryBox(scene, shadowGenerator, collidableMeshes, {
      name: `foundry-column-${index + 1}`,
      size: { width: 1.1, height: 5.6, depth: 1.1 },
      position,
      material: wallMaterial,
    });
  });

  const playerSpawn: ArenaSpawnPoint = {
    id: "foundry-player",
    position: new Vector3(-20.5, 0, -14.2),
    facingTarget: new Vector3(-22, 1.4, -9),
  };
  const botSpawn: ArenaSpawnPoint = {
    id: "foundry-bot",
    position: new Vector3(20.5, 0, 14.2),
    facingTarget: new Vector3(22, 1.4, 9),
  };
  const playerRespawnPoints: readonly ArenaSpawnPoint[] = [
    playerSpawn,
    {
      id: "foundry-player-north-west",
      position: new Vector3(-21, 0, 13),
      facingTarget: new Vector3(-13, 1.4, 8),
    },
    {
      id: "foundry-player-west-service",
      position: new Vector3(-20.5, 0, -1),
      facingTarget: new Vector3(-12, 1.4, -3),
    },
  ];
  const botRespawnPoints: readonly ArenaSpawnPoint[] = [
    botSpawn,
    {
      id: "foundry-bot-south-east",
      position: new Vector3(21, 0, -13),
      facingTarget: new Vector3(13, 1.4, -8),
    },
    {
      id: "foundry-bot-east-service",
      position: new Vector3(20.5, 0, 1),
      facingTarget: new Vector3(12, 1.4, 3),
    },
  ];

  const botPatrolPoints: readonly Vector3[] = [
    new Vector3(20, 0, 14),
    new Vector3(20, 0, 7),
    new Vector3(14, 0, 7),
    new Vector3(7, 0, 6),
    new Vector3(6, 0, -7),
    new Vector3(15, 0, -13.5),
    new Vector3(0, 0, -14.5),
    new Vector3(-15, 0, -13.5),
    new Vector3(-20, 0, -6),
    new Vector3(-14, 0, 7.5),
    new Vector3(-7, 0, 7),
    new Vector3(0, 0, 6),
  ];

  const botCoverPoints: readonly ArenaCoverPoint[] = [
    {
      id: "foundry-furnace-west",
      coverPosition: new Vector3(-5.2, 0, 1.8),
      peekPosition: new Vector3(-5.4, 0, 4.2),
    },
    {
      id: "foundry-furnace-east",
      coverPosition: new Vector3(5.2, 0, -1.8),
      peekPosition: new Vector3(5.4, 0, -4.2),
    },
    {
      id: "foundry-west-pipes",
      coverPosition: new Vector3(-10.2, 0, -2.5),
      peekPosition: new Vector3(-10.3, 0, -6.2),
    },
    {
      id: "foundry-east-pipes",
      coverPosition: new Vector3(10.2, 0, 2.5),
      peekPosition: new Vector3(10.3, 0, 6.2),
    },
    {
      id: "foundry-west-tank",
      coverPosition: new Vector3(-15.7, 0, 4.5),
      peekPosition: new Vector3(-15.5, 0, 7),
    },
    {
      id: "foundry-east-tank",
      coverPosition: new Vector3(15.7, 0, -4.5),
      peekPosition: new Vector3(15.5, 0, -7),
    },
    {
      id: "foundry-south-ingots-west",
      coverPosition: new Vector3(-7.5, 0, -9.9),
      peekPosition: new Vector3(-4.5, 0, -9.8),
    },
    {
      id: "foundry-south-ingots-east",
      coverPosition: new Vector3(7.5, 0, -9.9),
      peekPosition: new Vector3(4.5, 0, -9.8),
    },
  ];

  const botNavigationPoints: readonly Vector3[] = [
    ...botPatrolPoints,
    new Vector3(-21, 0, 0),
    new Vector3(-20, 0, 12),
    new Vector3(-14, 0, 13),
    new Vector3(-10, 0, 8),
    new Vector3(-6, 0, 5),
    new Vector3(-6, 0, -5),
    new Vector3(-11, 0, -8),
    new Vector3(-20, 0, -12),
    new Vector3(21, 0, 0),
    new Vector3(20, 0, -12),
    new Vector3(14, 0, -13),
    new Vector3(10, 0, -8),
    new Vector3(6, 0, -5),
    new Vector3(6, 0, 5),
    new Vector3(11, 0, 8),
    new Vector3(20, 0, 12),
    new Vector3(-3.5, 0, -7),
    new Vector3(0, 0, -7),
    new Vector3(3.5, 0, -7),
    new Vector3(-3.5, 0, 6),
    new Vector3(0, 0, 6),
    new Vector3(3.5, 0, 6),
    ...botCoverPoints.flatMap((cover) => [
      cover.coverPosition,
      cover.peekPosition,
    ]),
  ];

  validateFoundryPoints(
    playerRespawnPoints,
    botRespawnPoints,
    botPatrolPoints,
    botNavigationPoints,
    botCoverPoints,
  );

  createSpawnPad(scene, playerSpawn, new Color3(0.08, 0.68, 1));
  createSpawnPad(scene, botSpawn, new Color3(1, 0.24, 0.08));

  const arena: ArenaBuildResult = {
    id: "foundry",
    shadowGenerator,
    collidableMeshes,
    botPatrolPoints,
    botNavigationPoints,
    botCoverPoints,
    spawnPoints: { player: playerSpawn, bot: botSpawn },
    respawnPoints: {
      player: playerRespawnPoints,
      bot: botRespawnPoints,
    },
  };

  validateArenaBuildResult("foundry", arena);
  return arena;
}

/** Common map-registry export; each lazy-loaded map provides this signature. */
export const createArena = createFoundry;
