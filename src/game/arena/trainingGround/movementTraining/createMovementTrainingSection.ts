import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.pure.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Disposable } from "../../../core/contracts";
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
): void {
  const mesh = CreateBox(name, size, context.scene);
  mesh.parent = root;
  mesh.position.copyFrom(position);
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
  const sign = CreatePlane(`${name}-label`, { width: 4.2, height: 0.95 }, context.scene);
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
    new Vector3(0, 1.05, -COURSE_DEPTH / 2 + 0.78), "#ffe2dd",
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
