import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.pure.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Disposable } from "../../../core/contracts";
import type { WeaponId } from "../../../config/gameConfig";
import { TrainingRangeController } from "./TrainingRangeController";
import { TRAINING_MODES, type TrainingModeId } from "./trainingModes";
import type {
  TrainingGroundSection,
  TrainingGroundSectionContext,
} from "../sections/trainingGroundSectionTypes";

const RANGE_ORIGIN_Z = 56;
const RANGE_WIDTH = 30;
const RANGE_DEPTH = 68;
const WALL_HEIGHT = 5;

interface StationDefinition {
  readonly id: WeaponId;
  readonly label: string;
  readonly position: Vector3;
  readonly color: Color3;
}

const WEAPON_STATIONS: readonly StationDefinition[] = [
  { id: "assault-rifle", label: "ASSAULT RIFLE", position: new Vector3(-9, 0, -25), color: new Color3(0.2, 0.62, 0.96) },
  { id: "scattergun", label: "SCATTERGUN", position: new Vector3(0, 0, -25), color: new Color3(1, 0.52, 0.17) },
  { id: "marksman-rifle", label: "MARKSMAN RIFLE", position: new Vector3(9, 0, -25), color: new Color3(0.28, 0.84, 0.54) },
];

function createMaterial(scene: TrainingGroundSectionContext["scene"], name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(0.12);
  material.specularColor = Color3.Black();
  return material;
}

function createSign(scene: TrainingGroundSectionContext["scene"], root: TransformNode, name: string, text: string, position: Vector3, color: string): void {
  const texture = new DynamicTexture(`${name}-label-texture`, { width: 1024, height: 240 }, scene, false);
  texture.hasAlpha = true;
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  context.clearRect(0, 0, 1024, 240);
  context.fillStyle = color;
  context.font = "bold 70px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 512, 120);
  texture.update();
  const material = new StandardMaterial(`${name}-label-material`, scene);
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.opacityTexture = texture;
  material.backFaceCulling = false;
  const sign = CreatePlane(`${name}-label`, { width: 3.8, height: 0.9 }, scene);
  sign.parent = root;
  sign.position.copyFrom(position);
  sign.billboardMode = 2;
  sign.material = material;
  sign.isPickable = false;
}

function createCollisionBox(context: TrainingGroundSectionContext, root: TransformNode, colliders: AbstractMesh[], name: string, size: { width: number; height: number; depth: number }, position: Vector3, material: StandardMaterial, walkable = false): void {
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

/** Builds the independently disposable Shooting Range practice section. */
export function createTrainingGroundSection(
  context: TrainingGroundSectionContext,
): TrainingGroundSection {
  const root = new TransformNode("training-ground-shooting-range-root", context.scene);
  root.position.z = RANGE_ORIGIN_Z;
  context.weapon.setTrainingInventoryEnabled(true);
  const resources: Disposable[] = [];
  const colliders: AbstractMesh[] = [];
  const floorMaterial = createMaterial(context.scene, "shooting-range-floor-material", new Color3(0.12, 0.16, 0.19));
  const wallMaterial = createMaterial(context.scene, "shooting-range-wall-material", new Color3(0.28, 0.32, 0.35));
  const laneMaterial = createMaterial(context.scene, "shooting-range-lane-material", new Color3(0.14, 0.31, 0.42));

  createCollisionBox(context, root, colliders, "shooting-range-floor", { width: RANGE_WIDTH, height: 0.4, depth: RANGE_DEPTH }, new Vector3(0, -0.2, 0), floorMaterial, true);
  createCollisionBox(context, root, colliders, "shooting-range-west-wall", { width: 0.8, height: WALL_HEIGHT, depth: RANGE_DEPTH }, new Vector3(-RANGE_WIDTH / 2, WALL_HEIGHT / 2, 0), wallMaterial);
  createCollisionBox(context, root, colliders, "shooting-range-east-wall", { width: 0.8, height: WALL_HEIGHT, depth: RANGE_DEPTH }, new Vector3(RANGE_WIDTH / 2, WALL_HEIGHT / 2, 0), wallMaterial);
  createCollisionBox(context, root, colliders, "shooting-range-backstop", { width: RANGE_WIDTH, height: WALL_HEIGHT, depth: 1 }, new Vector3(0, WALL_HEIGHT / 2, RANGE_DEPTH / 2), wallMaterial);
  createCollisionBox(context, root, colliders, "shooting-range-entry-boundary", { width: RANGE_WIDTH, height: WALL_HEIGHT, depth: 1 }, new Vector3(0, WALL_HEIGHT / 2, -RANGE_DEPTH / 2), wallMaterial);
  for (const [index, z] of [-4, 12, 27].entries()) {
    createCollisionBox(context, root, colliders, `shooting-range-lane-${index}`, { width: RANGE_WIDTH - 2.4, height: 0.06, depth: 0.45 }, new Vector3(0, 0.04, z), laneMaterial);
  }
  resources.push(context.registerCollisionMeshes(colliders));

  createSign(context.scene, root, "shooting-range-title", "SHOOTING RANGE", new Vector3(0, 3.8, -19), "#d9f2ff");
  createSign(context.scene, root, "shooting-range-close", "CLOSE", new Vector3(0, 2.4, -4), "#86d8ff");
  createSign(context.scene, root, "shooting-range-medium", "MEDIUM", new Vector3(0, 2.4, 12), "#86d8ff");
  createSign(context.scene, root, "shooting-range-long", "LONG", new Vector3(0, 2.4, 27), "#86d8ff");

  const modePanel = new TransformNode("shooting-range-mode-panel", context.scene);
  modePanel.parent = root;
  modePanel.setEnabled(false);
  const modeColors: Readonly<Record<TrainingModeId, Color3>> = {
    easy: new Color3(0.2, 0.76, 0.42),
    medium: new Color3(0.96, 0.66, 0.15),
    hard: new Color3(0.94, 0.27, 0.24),
  };
  const modeMaterials = new Map<TrainingModeId, StandardMaterial>();
  const rangeController = new TrainingRangeController({
    onModeStarted: (definition) => {
      modeMaterials.forEach((material, modeId) => {
        material.emissiveColor = modeId === definition.id
          ? modeColors[modeId].scale(0.65)
          : modeColors[modeId].scale(0.1);
      });
    },
    onModeReset: () => {
      modeMaterials.forEach((material, modeId) => {
        material.emissiveColor = modeColors[modeId].scale(0.1);
      });
    },
  });
  resources.push(rangeController);
  const modeMaterial = createMaterial(context.scene, "shooting-range-mode-panel-material", new Color3(0.28, 0.64, 0.88));
  const modePanelMesh = CreateBox("shooting-range-mode-panel-display", { width: 15, height: 4.2, depth: 0.35 }, context.scene);
  modePanelMesh.parent = modePanel;
  modePanelMesh.position.set(0, 2.3, -12);
  modePanelMesh.material = modeMaterial;
  modePanelMesh.isPickable = false;
  createSign(context.scene, modePanel, "shooting-range-mode-title", "SHOOT A TRAINING MODE", new Vector3(0, 3.35, -12.22), "#f2fbff");
  TRAINING_MODES.forEach((definition, index) => {
    const material = createMaterial(
      context.scene,
      `shooting-range-${definition.id}-mode-material`,
      modeColors[definition.id],
    );
    modeMaterials.set(definition.id, material);
    const control = CreateBox(
      `shooting-range-${definition.id}-mode-control`,
      { width: 4.15, height: 1.35, depth: 0.42 },
      context.scene,
    );
    control.parent = modePanel;
    control.position.set((index - 1) * 4.8, 1.85, -12.24);
    control.material = material;
    control.isPickable = true;
    createSign(
      context.scene,
      modePanel,
      `shooting-range-${definition.id}-mode`,
      definition.displayName.toUpperCase(),
      new Vector3((index - 1) * 4.8, 1.85, -12.5),
      "#f7fbff",
    );
    resources.push(context.interactions.registerShotTarget(
      control,
      () => rangeController.start(definition.id),
    ));
  });

  const startMaterial = createMaterial(context.scene, "shooting-range-start-material", new Color3(0.16, 0.82, 0.47));
  const startControl = CreateBox("shooting-range-start-control", { width: 4.4, height: 2.2, depth: 0.8 }, context.scene);
  startControl.parent = root;
  startControl.position.set(-5.2, 1.1, -18.6);
  startControl.material = startMaterial;
  startControl.isPickable = true;
  createSign(context.scene, root, "shooting-range-start", "SHOOT: START TRAINING", new Vector3(-5.2, 1.1, -19.05), "#d6ffe6");
  resources.push(context.interactions.registerShotTarget(startControl, () => {
    if (!context.weapon.hasTrainingWeapon) {
      context.weapon.showTrainingWeaponRequired();
      return;
    }
    rangeController.reset();
    modePanel.setEnabled(true);
    startMaterial.emissiveColor = new Color3(0.14, 0.38, 0.24);
  }));

  const exitMaterial = createMaterial(context.scene, "shooting-range-exit-material", new Color3(0.92, 0.28, 0.2));
  const exitControl = CreateBox("shooting-range-exit-control", { width: 4.4, height: 2.2, depth: 0.8 }, context.scene);
  exitControl.parent = root;
  exitControl.position.set(5.2, 1.1, -18.6);
  exitControl.material = exitMaterial;
  exitControl.isPickable = true;
  createSign(context.scene, root, "shooting-range-exit", "SHOOT: EXIT RANGE", new Vector3(5.2, 1.1, -19.05), "#ffe2dd");
  resources.push(context.interactions.registerShotTarget(exitControl, context.returnToHub));

  for (const station of WEAPON_STATIONS) {
    const material = createMaterial(context.scene, `shooting-range-${station.id}-station-material`, station.color);
    const stationMesh = CreateBox(`shooting-range-${station.id}-station`, { width: 5.6, height: 1.4, depth: 2.3 }, context.scene);
    stationMesh.parent = root;
    stationMesh.position.copyFrom(station.position.add(new Vector3(0, 0.7, 0)));
    stationMesh.material = material;
    stationMesh.isPickable = false;
    createSign(context.scene, root, `shooting-range-${station.id}-station`, station.label, station.position.add(new Vector3(0, 1.85, -0.85)), "#f4fbff");
    resources.push(context.interactions.registerWalkover(root.position.add(station.position), 2.7, () => {
      context.weapon.equipTrainingWeapon(station.id);
      material.emissiveColor = station.color.scale(0.58);
    }));
  }

  const ammoPosition = new Vector3(0, 0, -29.8);
  const ammoMaterial = createMaterial(context.scene, "shooting-range-ammo-station-material", new Color3(0.94, 0.76, 0.18));
  const ammoStation = CreateBox("shooting-range-ammo-station", { width: 7.2, height: 1.4, depth: 2 }, context.scene);
  ammoStation.parent = root;
  ammoStation.position.copyFrom(ammoPosition.add(new Vector3(0, 0.7, 0)));
  ammoStation.material = ammoMaterial;
  ammoStation.isPickable = false;
  createSign(context.scene, root, "shooting-range-ammo-station", "AMMUNITION", ammoPosition.add(new Vector3(0, 1.85, -0.8)), "#fff4bc");
  resources.push(context.interactions.registerWalkover(root.position.add(ammoPosition), 3.2, () => {
    ammoMaterial.emissiveColor = new Color3(0.75, 0.58, 0.1);
  }));

  context.player.respawn({
    id: "shooting-range-player-entry",
    position: new Vector3(0, 0, RANGE_ORIGIN_Z - 31),
    facingTarget: new Vector3(0, 1.6, RANGE_ORIGIN_Z - 16),
  });

  return {
    id: "shooting-range",
    root,
    dispose: () => {
      resources.splice(0).reverse().forEach((resource) => resource.dispose());
      root.dispose(false, true);
    },
  };
}
