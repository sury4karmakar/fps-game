import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type {
  TrainingGroundSection,
  TrainingGroundSectionContext,
} from "../sections/trainingGroundSectionTypes";

/**
 * The Shooting Range module currently establishes only its isolated resource
 * scope. Its later geometry, pickups, controls, targets, and assets must all
 * be parented to this root and disposed through this controller.
 */
export function createTrainingGroundSection(
  context: TrainingGroundSectionContext,
): TrainingGroundSection {
  const root = new TransformNode("training-ground-shooting-range-root", context.scene);

  return {
    id: "shooting-range",
    root,
    dispose: () => root.dispose(false, true),
  };
}
