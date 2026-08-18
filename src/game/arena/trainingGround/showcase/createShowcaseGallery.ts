import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.pure.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { WEAPON_DEFINITIONS, type WeaponId } from "../../../config/gameConfig";
import { BotAnimationController } from "../../../entities/bot/BotAnimationController";
import { BotView } from "../../../entities/bot/BotView";
import { PickupView, type PickupKind } from "../../../entities/pickup/PickupView";
import { WeaponView } from "../../../entities/weapon/WeaponView";

type ShowcaseVisual = "weapon" | "bot" | "armor" | "ammo" | "health";

interface ShowcaseEntry {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly visual: ShowcaseVisual;
  readonly weaponId?: WeaponId;
}

/**
 * The single source of truth for Training Ground gallery content. Adding an
 * entry here automatically adds its plinth, model, and label to the hub.
 */
export const TRAINING_GROUND_SHOWCASE_ENTRIES: readonly ShowcaseEntry[] = [
  ...Object.values(WEAPON_DEFINITIONS).map((weapon) => ({
    id: `weapon-${weapon.id}`,
    title: weapon.displayName,
    description: weapon.role,
    visual: "weapon" as const,
    weaponId: weapon.id,
  })),
  {
    id: "bot",
    title: "Training Bot",
    description: "Practice opponent for combat drills.",
    visual: "bot",
  },
  {
    id: "armor",
    title: "Armor Pickup",
    description: "Temporary protection that absorbs damage.",
    visual: "armor",
  },
  {
    id: "ammo",
    title: "Ammo Supply",
    description: "Replenishes reserve ammunition.",
    visual: "ammo",
  },
  {
    id: "health",
    title: "Health Supply",
    description: "Restores health after a bot elimination.",
    visual: "health",
  },
];

interface ShowcasePlacement {
  readonly position: Vector3;
  readonly rotationY: number;
}

const GALLERY_WALLS = [
  (progress: number): ShowcasePlacement => ({
    position: new Vector3(-10 + progress * 20, 0, 11.2),
    rotationY: 0,
  }),
  (progress: number): ShowcasePlacement => ({
    position: new Vector3(13.2, 0, 10 - progress * 20),
    rotationY: Math.PI / 2,
  }),
  (progress: number): ShowcasePlacement => ({
    position: new Vector3(10 - progress * 20, 0, -11.2),
    rotationY: Math.PI,
  }),
  (progress: number): ShowcasePlacement => ({
    position: new Vector3(-13.2, 0, -10 + progress * 20),
    rotationY: -Math.PI / 2,
  }),
] as const;

function getShowcasePlacement(index: number, totalEntries: number): ShowcasePlacement {
  const wallIndex = index % GALLERY_WALLS.length;
  const slotIndex = Math.floor(index / GALLERY_WALLS.length);
  const entryCountOnWall = Math.ceil((totalEntries - wallIndex) / GALLERY_WALLS.length);
  const progress = (slotIndex + 1) / (entryCountOnWall + 1);
  return GALLERY_WALLS[wallIndex](progress);
}

function decorate(
  mesh: AbstractMesh,
  root: TransformNode,
  shadowGenerator: ShadowGenerator,
): void {
  mesh.parent = root;
  mesh.isPickable = false;
  mesh.checkCollisions = false;
  mesh.receiveShadows = true;
  shadowGenerator.addShadowCaster(mesh);
}

function createMaterial(scene: Scene, name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(0.08);
  material.specularColor = Color3.Black();
  return material;
}

function drawCenteredDescription(
  context: CanvasRenderingContext2D,
  text: string,
): void {
  const maxWidth = 700;
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine.length === 0 ? word : `${currentLine} ${word}`;
    if (context.measureText(nextLine).width <= maxWidth || currentLine.length === 0) {
      currentLine = nextLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  const visibleLines = lines.slice(0, 2);
  if (lines.length > visibleLines.length) {
    visibleLines[visibleLines.length - 1] = `${visibleLines[visibleLines.length - 1]}…`;
  }

  visibleLines.forEach((line, index) => {
    context.fillText(line, 384, 130 + index * 38);
  });
}

function createLabel(
  scene: Scene,
  root: TransformNode,
  shadowGenerator: ShadowGenerator,
  entry: ShowcaseEntry,
): void {
  const texture = new DynamicTexture(
    `${entry.id}-showcase-label-texture`,
    { width: 768, height: 180 },
    scene,
    false,
  );
  texture.hasAlpha = true;
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  context.clearRect(0, 0, 768, 180);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#f5fbff";
  context.font = "bold 32px sans-serif";
  context.fillText(entry.title, 384, 52);
  context.fillStyle = "#b7d8e9";
  context.font = "20px sans-serif";
  drawCenteredDescription(context, entry.description);
  texture.update();

  const material = new StandardMaterial(`${entry.id}-showcase-label-material`, scene);
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.opacityTexture = texture;
  material.backFaceCulling = false;
  material.specularColor = Color3.Black();

  const label = CreatePlane(`${entry.id}-showcase-label`, { width: 3.25, height: 1.05 }, scene);
  label.position.set(0, 0.625, -0.9);
  label.material = material;
  decorate(label, root, shadowGenerator);
}

function attachWeaponView(
  scene: Scene,
  root: TransformNode,
  shadowGenerator: ShadowGenerator,
  entry: ShowcaseEntry,
): void {
  const weaponId = entry.weaponId;
  if (!weaponId) return;
  const weaponView = new WeaponView(scene, weaponId, {
    parent: root,
    namePrefix: "showcase",
    scale: 1.85,
    shadowGenerator,
  });
  weaponView.root.position.y = 1.72;
}

function attachBotView(
  scene: Scene,
  root: TransformNode,
  shadowGenerator: ShadowGenerator,
): void {
  const botView = new BotView(scene, {
    namePrefix: "showcase-bot",
    parent: root,
    damageable: false,
    collisionEnabled: false,
    shadowGenerator,
  });
  botView.root.position.y = 1.25;
  const animation = new BotAnimationController(scene, botView, {
    autoUpdate: true,
    idleMotion: true,
  });
  scene.onDisposeObservable.addOnce(() => animation.dispose());
}

function attachPickupView(
  scene: Scene,
  root: TransformNode,
  entry: ShowcaseEntry,
): void {
  const kind = entry.visual as PickupKind;
  new PickupView(scene, kind, {
    namePrefix: `showcase-${entry.id}`,
    parent: root,
    position: new Vector3(0, 1.68, 0),
    scale: 1.3,
    animation: {
      rotationSpeed: 0.7,
      bobAmplitude: 0.04,
      bobFrequency: 2.2,
      pulseAmplitude: 0.025,
      pulseFrequency: 3.2,
    },
  });
}

function attachGalleryView(
  scene: Scene,
  root: TransformNode,
  shadowGenerator: ShadowGenerator,
  entry: ShowcaseEntry,
): void {
  if (entry.visual === "weapon") {
    attachWeaponView(scene, root, shadowGenerator, entry);
  } else if (entry.visual === "bot") {
    attachBotView(scene, root, shadowGenerator);
  } else {
    attachPickupView(scene, root, entry);
  }
}

/** Builds a non-interactive gallery around all four Training Ground hub walls. */
export function createTrainingGroundShowcase(
  scene: Scene,
  shadowGenerator: ShadowGenerator,
): TransformNode {
  const galleryRoot = new TransformNode("training-ground-showcase-root", scene);
  const plinthMaterial = createMaterial(
    scene,
    "training-ground-showcase-plinth-material",
    new Color3(0.17, 0.46, 0.68),
  );
  TRAINING_GROUND_SHOWCASE_ENTRIES.forEach((entry, index) => {
    const placement = getShowcasePlacement(
      index,
      TRAINING_GROUND_SHOWCASE_ENTRIES.length,
    );
    const root = new TransformNode(`${entry.id}-showcase-root`, scene);
    root.parent = galleryRoot;
    root.position.copyFrom(placement.position);
    root.rotation.y = placement.rotationY;

    const modelRoot = new TransformNode(`${entry.id}-showcase-model-root`, scene);
    modelRoot.parent = root;
    // The plinth front faces inward; turn the displayed model the same way.
    modelRoot.rotation.y = Math.PI;

    const plinth = CreateBox(`${entry.id}-showcase-plinth`, {
      width: 3.55,
      height: 1.25,
      depth: 1.75,
    }, scene);
    plinth.position.y = 0.625;
    plinth.material = plinthMaterial;
    decorate(plinth, root, shadowGenerator);

    attachGalleryView(scene, modelRoot, shadowGenerator, entry);
    createLabel(scene, root, shadowGenerator, entry);
  });

  return galleryRoot;
}
