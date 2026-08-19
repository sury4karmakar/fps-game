import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.pure.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Disposable } from "../../../core/contracts";
import { MovementTrainingPracticeBotController } from "./MovementTrainingPracticeBotController";
import type {
  TrainingGroundSection,
  TrainingGroundSectionContext,
} from "../sections/trainingGroundSectionTypes";

// The course lives to the right of the hub, matching the blueprint while
// remaining physically isolated from the Shooting Range and gallery.
const COURSE_ORIGIN_X = 46;
const COURSE_WIDTH = 28;
const COURSE_DEPTH = 58;
const WALL_HEIGHT = 5;
const WALL_THICKNESS = 0.8;
const PLAYER_START_LOCAL_Z = -COURSE_DEPTH / 2 + 4;
const FINISH_ZONE_LOCAL_Z = COURSE_DEPTH / 2 - 5;

function createMaterial(
  context: TrainingGroundSectionContext,
  name: string,
  color: Color3,
): StandardMaterial {
  const material = new StandardMaterial(name, context.scene);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(0.1);
  material.specularColor = Color3.Black();
  return material;
}

function createCollisionBox(
  context: TrainingGroundSectionContext,
  root: TransformNode,
  colliders: AbstractMesh[],
  name: string,
  size: { width: number; height: number; depth: number },
  position: Vector3,
  material: StandardMaterial,
  walkable = false,
  rotationX = 0,
): void {
  const mesh = CreateBox(name, size, context.scene);
  mesh.parent = root;
  mesh.position.copyFrom(position);
  mesh.rotation.x = rotationX;
  mesh.material = material;
  mesh.checkCollisions = true;
  mesh.isPickable = true;
  mesh.receiveShadows = true;
  mesh.metadata = { arenaCollision: true, walkableSurface: walkable };
  colliders.push(mesh);
}

function createSign(
  context: TrainingGroundSectionContext,
  root: TransformNode,
  name: string,
  text: string,
  position: Vector3,
  color: string,
  size: { width: number; height: number } = { width: 4.2, height: 0.95 },
): void {
  const texture = new DynamicTexture(`${name}-label-texture`, { width: 1024, height: 240 }, context.scene, false);
  texture.hasAlpha = true;
  const canvas = texture.getContext() as unknown as CanvasRenderingContext2D;
  canvas.clearRect(0, 0, 1024, 240);
  canvas.fillStyle = color;
  canvas.font = "bold 70px sans-serif";
  canvas.textAlign = "center";
  canvas.textBaseline = "middle";
  canvas.fillText(text, 512, 120);
  texture.update();

  const material = new StandardMaterial(`${name}-label-material`, context.scene);
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.opacityTexture = texture;
  material.backFaceCulling = false;
  const sign = CreatePlane(`${name}-label`, size, context.scene);
  sign.parent = root;
  sign.position.copyFrom(position);
  sign.billboardMode = 2;
  sign.material = material;
  sign.isPickable = false;
}

/** Builds the bounded, independently disposable Movement Training course. */
export function createTrainingGroundSection(
  context: TrainingGroundSectionContext,
): TrainingGroundSection {
  const root = new TransformNode("training-ground-movement-training-root", context.scene);
  root.position.x = COURSE_ORIGIN_X;
  const resources: Disposable[] = [];
  const colliders: AbstractMesh[] = [];
  const floorMaterial = createMaterial(context, "movement-training-floor-material", new Color3(0.12, 0.2, 0.25));
  const wallMaterial = createMaterial(context, "movement-training-wall-material", new Color3(0.25, 0.34, 0.39));
  const boundaryMaterial = createMaterial(context, "movement-training-boundary-material", new Color3(0.16, 0.42, 0.52));
  const obstacleMaterial = createMaterial(context, "movement-training-obstacle-material", new Color3(0.7, 0.34, 0.16));
  const platformMaterial = createMaterial(context, "movement-training-platform-material", new Color3(0.26, 0.66, 0.45));

  createCollisionBox(
    context, root, colliders, "movement-training-floor",
    { width: COURSE_WIDTH, height: 0.4, depth: COURSE_DEPTH },
    new Vector3(0, -0.2, 0), floorMaterial, true,
  );
  createCollisionBox(
    context, root, colliders, "movement-training-west-wall",
    { width: WALL_THICKNESS, height: WALL_HEIGHT, depth: COURSE_DEPTH + WALL_THICKNESS * 2 },
    new Vector3(-COURSE_WIDTH / 2, WALL_HEIGHT / 2, 0), wallMaterial,
  );
  createCollisionBox(
    context, root, colliders, "movement-training-east-wall",
    { width: WALL_THICKNESS, height: WALL_HEIGHT, depth: COURSE_DEPTH + WALL_THICKNESS * 2 },
    new Vector3(COURSE_WIDTH / 2, WALL_HEIGHT / 2, 0), wallMaterial,
  );
  createCollisionBox(
    context, root, colliders, "movement-training-start-boundary",
    { width: COURSE_WIDTH + WALL_THICKNESS * 2, height: WALL_HEIGHT, depth: WALL_THICKNESS },
    new Vector3(0, WALL_HEIGHT / 2, -COURSE_DEPTH / 2), boundaryMaterial,
  );
  createCollisionBox(
    context, root, colliders, "movement-training-finish-boundary",
    { width: COURSE_WIDTH + WALL_THICKNESS * 2, height: WALL_HEIGHT, depth: WALL_THICKNESS },
    new Vector3(0, WALL_HEIGHT / 2, COURSE_DEPTH / 2), boundaryMaterial,
  );
  resources.push(context.registerCollisionMeshes(colliders));

  const startZoneMaterial = createMaterial(context, "movement-training-start-zone-material", new Color3(0.18, 0.58, 0.78));
  const finishZoneMaterial = createMaterial(context, "movement-training-finish-zone-material", new Color3(0.2, 0.7, 0.42));
  for (const [name, z, material] of [
    ["start", PLAYER_START_LOCAL_Z, startZoneMaterial],
    ["finish", FINISH_ZONE_LOCAL_Z, finishZoneMaterial],
  ] as const) {
    const zone = CreateBox(`movement-training-${name}-zone`, { width: COURSE_WIDTH - 2, height: 0.06, depth: 6 }, context.scene);
    zone.parent = root;
    zone.position.set(0, 0.04, z);
    zone.material = material;
    zone.isPickable = false;
  }

  // Alternating barriers leave a generous route on opposite sides, creating a
  // repeatable left/right strafe sequence without trapping the player.
  createCollisionBox(
    context, root, colliders, "movement-training-strafe-barrier-west",
    { width: 9, height: 2.2, depth: 1.25 }, new Vector3(-4.7, 1.1, -17), obstacleMaterial,
  );
  createCollisionBox(
    context, root, colliders, "movement-training-strafe-barrier-east",
    { width: 9, height: 2.2, depth: 1.25 }, new Vector3(4.7, 1.1, -12), obstacleMaterial,
  );

  // This spans the navigable width, so the configured jump height is required
  // to continue; it is kept low enough for a reliable landing on the floor.
  createCollisionBox(
    context, root, colliders, "movement-training-jump-hurdle",
    { width: COURSE_WIDTH - 1.4, height: 0.62, depth: 0.65 }, new Vector3(0, 0.31, -6), obstacleMaterial,
  );

  // The ceiling is high enough for the crouched collider but blocks the
  // standing collider across the full lane, preventing a bypass route.
  createCollisionBox(
    context, root, colliders, "movement-training-crouch-ceiling",
    { width: COURSE_WIDTH - 1.2, height: 0.5, depth: 5.4 }, new Vector3(0, 1.9, 2), obstacleMaterial,
  );

  // Offset cover blocks force a route decision while retaining clear paths
  // around their outside edges for a no-dead-end practice course.
  createCollisionBox(
    context, root, colliders, "movement-training-cover-west",
    { width: 11, height: 2.5, depth: 2.2 }, new Vector3(-3.7, 1.25, 8.5), obstacleMaterial,
  );
  createCollisionBox(
    context, root, colliders, "movement-training-cover-east",
    { width: 11, height: 2.5, depth: 2.2 }, new Vector3(3.7, 1.25, 13), obstacleMaterial,
  );

  const platformHeight = 1.45;
  const rampRun = 4.8;
  const rampAngle = Math.atan2(platformHeight, rampRun);
  createCollisionBox(
    context, root, colliders, "movement-training-up-ramp",
    { width: 7.5, height: 0.28, depth: Math.hypot(platformHeight, rampRun) },
    new Vector3(0, platformHeight / 2, 17), platformMaterial, true, -rampAngle,
  );
  createCollisionBox(
    context, root, colliders, "movement-training-platform",
    { width: 9, height: platformHeight, depth: 8.8 }, new Vector3(0, platformHeight / 2, 23.8), platformMaterial, true,
  );

  // This is a static visual destination only. It remains in the far finish
  // zone and cannot damage, be damaged, score, respawn, or leave the course.
  resources.push(new MovementTrainingPracticeBotController(
    context.scene,
    new Vector3(COURSE_ORIGIN_X, platformHeight, FINISH_ZONE_LOCAL_Z),
    new Vector3(COURSE_ORIGIN_X, platformHeight + 1.6, PLAYER_START_LOCAL_Z),
  ));

  // Guidance is deliberately static and emissive, so it stays legible at all
  // quality presets without depending on shadows, animation, or timed cues.
  createSign(
    context, root, "movement-training-title", "MOVEMENT TRAINING",
    new Vector3(0, 4.15, -23), "#e8f8ff", { width: 7, height: 1.3 },
  );
  createSign(
    context, root, "movement-training-player-start", "PLAYER START • WASD MOVE",
    new Vector3(0, 2.8, PLAYER_START_LOCAL_Z + 2), "#aee8ff", { width: 6, height: 1.1 },
  );
  createSign(
    context, root, "movement-training-strafe-guide", "STRAFE • A / D",
    new Vector3(0, 2.9, -15), "#ffe0a8", { width: 5, height: 1 },
  );
  createSign(
    context, root, "movement-training-jump-guide", "JUMP • SPACE",
    new Vector3(0, 2.35, -8), "#ffe0a8", { width: 5, height: 1 },
  );
  createSign(
    context, root, "movement-training-crouch-guide", "CROUCH • LEFT CTRL",
    new Vector3(0, 2.75, 2), "#ffe0a8", { width: 6, height: 1 },
  );
  createSign(
    context, root, "movement-training-cover-guide", "COVER • CHANGE ROUTE",
    new Vector3(0, 3.2, 10.8), "#ffe0a8", { width: 6, height: 1 },
  );
  createSign(
    context, root, "movement-training-sprint-guide", "SPRINT • SHIFT",
    new Vector3(0, 2.8, 16), "#b6f4c8", { width: 5, height: 1 },
  );
  createSign(
    context, root, "movement-training-finish", "FINISH • PRACTICE BOT",
    new Vector3(0, platformHeight + 3.1, FINISH_ZONE_LOCAL_Z), "#b6f4c8", { width: 6, height: 1 },
  );

  const exitMaterial = createMaterial(context, "movement-training-exit-material", new Color3(0.9, 0.25, 0.2));
  const exitControl = CreateBox(
    "movement-training-exit-control",
    { width: 5, height: 2.1, depth: 0.7 },
    context.scene,
  );
  exitControl.parent = root;
  exitControl.position.set(0, 1.05, -COURSE_DEPTH / 2 + 1.2);
  exitControl.material = exitMaterial;
  exitControl.isPickable = true;
  createSign(
    context, root, "movement-training-exit", "SHOOT: EXIT TRAINING",
    new Vector3(0, 1.05, -COURSE_DEPTH / 2 + 0.78), "#ffe2dd", { width: 5.4, height: 1 },
  );
  resources.push(context.interactions.registerShotTarget(exitControl, () => context.returnToHub()));

  context.player.respawn({
    id: "movement-training-player-start",
    position: new Vector3(COURSE_ORIGIN_X, 0, PLAYER_START_LOCAL_Z),
    facingTarget: new Vector3(COURSE_ORIGIN_X, 1.6, PLAYER_START_LOCAL_Z + 10),
  });

  return {
    id: "movement-training",
    root,
    dispose: () => {
      resources.splice(0).reverse().forEach((resource) => resource.dispose());
      root.dispose(false, true);
    },
  };
}
