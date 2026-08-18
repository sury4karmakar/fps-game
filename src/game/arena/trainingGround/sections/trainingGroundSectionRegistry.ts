import {
  type TrainingGroundSectionDefinition,
  type TrainingGroundSectionId,
} from "./trainingGroundSectionTypes";

/**
 * The hub may read this lightweight metadata immediately. Each builder stays
 * behind a dynamic import so neither section code nor its future assets load
 * until the player selects that section.
 */
export const TRAINING_GROUND_SECTION_REGISTRY: Readonly<
  Record<TrainingGroundSectionId, TrainingGroundSectionDefinition>
> = {
  "shooting-range": {
    id: "shooting-range",
    label: "Shooting Range",
    load: () => import("../shootingRange/createShootingRangeSection"),
  },
  "movement-training": {
    id: "movement-training",
    label: "Movement Training",
    load: () => import("../movementTraining/createMovementTrainingSection"),
  },
};

export function getTrainingGroundSectionDefinition(
  sectionId: TrainingGroundSectionId,
): TrainingGroundSectionDefinition {
  return TRAINING_GROUND_SECTION_REGISTRY[sectionId];
}
