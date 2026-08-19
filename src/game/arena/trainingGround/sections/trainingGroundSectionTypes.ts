import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Disposable, PlayerControlPort, TrainingWeaponControlPort } from "../../../core/contracts";
import type { TrainingGroundInteractionController } from "../interactions/TrainingGroundInteractionController";

export type TrainingGroundSectionId = "shooting-range" | "movement-training";

export interface TrainingGroundSectionContext {
  readonly scene: Scene;
  readonly player: PlayerControlPort;
  readonly weapon: TrainingWeaponControlPort;
  readonly trainingRangeStatus: HTMLElement;
  readonly interactions: TrainingGroundInteractionController;
  registerCollisionMeshes(meshes: readonly AbstractMesh[]): Disposable;
  returnToHub(): void;
}

/**
 * A section owns every resource created below its root. Future section modules
 * attach geometry, interaction controllers, and loaded assets here so one
 * dispose call always clears the complete section.
 */
export interface TrainingGroundSection extends Disposable {
  readonly id: TrainingGroundSectionId;
  readonly root: TransformNode;
}

export interface TrainingGroundSectionModule {
  createTrainingGroundSection(
    context: TrainingGroundSectionContext,
  ): TrainingGroundSection;
}

export interface TrainingGroundSectionDefinition {
  readonly id: TrainingGroundSectionId;
  readonly label: string;
  readonly load: () => Promise<TrainingGroundSectionModule>;
}
