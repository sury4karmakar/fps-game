import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type {
  TrainingGroundSection,
  TrainingGroundSectionContext,
} from "../sections/trainingGroundSectionTypes";

/**
 * The Movement Training module currently establishes only its isolated
 * resource scope. Its course geometry, practice bot, signs, and assets must
 * all be owned below this root and disposed through this controller.
 */
export function createTrainingGroundSection(
  context: TrainingGroundSectionContext,
): TrainingGroundSection {
  const root = new TransformNode("training-ground-movement-training-root", context.scene);

  return {
    id: "movement-training",
    root,
    dispose: () => root.dispose(false, true),
  };
}
