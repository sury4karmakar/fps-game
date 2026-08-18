import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Disposable } from "../../../core/contracts";

export type TrainingGroundSectionId = "shooting-range" | "movement-training";

export interface TrainingGroundSectionContext {
  readonly scene: Scene;
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
