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
import { createEnvironment } from "./createEnvironment";
import type { ArenaBuildResult, ArenaSpawnPoint } from "./arenaTypes";

const ARENA_WIDTH = 36;
const ARENA_DEPTH = 28;
const WALL_HEIGHT = 5;
const WALL_THICKNESS = 0.8;

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

function markAsCollidable(mesh: Mesh, collidableMeshes: AbstractMesh[]): void {
  mesh.checkCollisions = true;
  mesh.isPickable = true;
  mesh.metadata = {
    ...(mesh.metadata as Record<string, unknown> | null),
    arenaCollision: true,
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
  markAsCollidable(mesh, collidableMeshes);

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

export function createArena(scene: Scene): ArenaBuildResult {
  scene.collisionsEnabled = true;

  const { shadowGenerator } = createEnvironment(scene);
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
    },
    {
      name: "west-cover",
      size: { width: 1.2, height: 1.6, depth: 6 },
      position: new Vector3(-7.5, 0.8, 1.5),
      material: coverMaterial,
    },
    {
      name: "east-cover",
      size: { width: 1.2, height: 1.6, depth: 6 },
      position: new Vector3(7.5, 0.8, -1.5),
      material: coverMaterial,
    },
    {
      name: "player-spawn-shield",
      size: { width: 5, height: 2.4, depth: 0.7 },
      position: new Vector3(-11.5, 1.2, -6.5),
      rotationY: -0.35,
      material: coverMaterial,
    },
    {
      name: "bot-spawn-shield",
      size: { width: 5, height: 2.4, depth: 0.7 },
      position: new Vector3(11.5, 1.2, 6.5),
      rotationY: -0.35,
      material: coverMaterial,
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
    });
  });

  const platformHeight = 1.4;
  const platforms: readonly BoxSpec[] = [
    {
      name: "north-platform",
      size: { width: 7, height: platformHeight, depth: 3.8 },
      position: new Vector3(-3.5, platformHeight / 2, 9.5),
      material: rampMaterial,
    },
    {
      name: "south-platform",
      size: { width: 7, height: platformHeight, depth: 3.8 },
      position: new Vector3(3.5, platformHeight / 2, -9.5),
      material: rampMaterial,
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
    },
    {
      name: "south-ramp",
      size: { width: 3.2, height: 0.24, depth: rampLength },
      position: new Vector3(3.5, platformHeight / 2, -6.2),
      rotationX: rampAngle,
      material: rampMaterial,
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

  createSpawnPad(scene, playerSpawn, new Color3(0.15, 0.75, 1));
  createSpawnPad(scene, botSpawn, new Color3(1, 0.28, 0.18));

  return {
    collidableMeshes,
    spawnPoints: {
      player: playerSpawn,
      bot: botSpawn,
    },
  };
}
