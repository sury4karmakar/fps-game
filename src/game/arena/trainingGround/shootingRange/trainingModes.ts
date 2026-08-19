export type TrainingModeId = "easy" | "medium" | "hard";

export type TrainingTargetMovement =
  | "static"
  | "lateral-lane"
  | "unpredictable-bounded";

export type TrainingRangeLaneId = "close" | "medium" | "long";

export interface TrainingTargetSpawnDefinition {
  readonly id: string;
  readonly lane: TrainingRangeLaneId;
  readonly x: number;
  readonly z: number;
  /** Horizontal limits used by movement behaviors, relative to the range root. */
  readonly movementBounds: {
    readonly minimumX: number;
    readonly maximumX: number;
    readonly minimumZ: number;
    readonly maximumZ: number;
  };
}

export interface TrainingModeDefinition {
  readonly id: TrainingModeId;
  readonly displayName: string;
  readonly description: string;
  readonly targetCount: number;
  readonly targetSpawns: readonly TrainingTargetSpawnDefinition[];
  readonly movement: TrainingTargetMovement;
  /** Undefined modes run until the player selects another mode or exits. */
  readonly durationMs?: number;
  readonly scoring: "eliminations" | "none";
}

const RANGE_SPAWNS: readonly TrainingTargetSpawnDefinition[] = [
  {
    id: "close-center",
    lane: "close",
    x: 0,
    z: -4,
    movementBounds: { minimumX: -10, maximumX: 10, minimumZ: -6, maximumZ: -2 },
  },
  {
    id: "medium-left",
    lane: "medium",
    x: -4,
    z: 12,
    movementBounds: { minimumX: -11, maximumX: 11, minimumZ: 9, maximumZ: 15 },
  },
  {
    id: "long-right",
    lane: "long",
    x: 5,
    z: 27,
    movementBounds: { minimumX: -12, maximumX: 12, minimumZ: 23, maximumZ: 30 },
  },
];

/**
 * Register a new practice type here; the range UI and lifecycle consume this
 * data without adding mode-specific branches.
 */
export const TRAINING_MODE_DEFINITIONS: Readonly<
  Record<TrainingModeId, TrainingModeDefinition>
> = {
  easy: {
    id: "easy",
    displayName: "Easy",
    description: "Static targets at the close, medium, and long lanes.",
    targetCount: RANGE_SPAWNS.length,
    targetSpawns: RANGE_SPAWNS,
    movement: "static",
    scoring: "eliminations",
  },
  medium: {
    id: "medium",
    displayName: "Medium",
    description: "Targets strafe left and right within their assigned lane.",
    targetCount: RANGE_SPAWNS.length,
    targetSpawns: RANGE_SPAWNS,
    movement: "lateral-lane",
    scoring: "eliminations",
  },
  hard: {
    id: "hard",
    displayName: "Hard",
    description: "Targets use bounded unpredictable movement, jumps, and crouches.",
    targetCount: RANGE_SPAWNS.length,
    targetSpawns: RANGE_SPAWNS,
    movement: "unpredictable-bounded",
    scoring: "eliminations",
  },
};

export const TRAINING_MODES: readonly TrainingModeDefinition[] = Object.values(
  TRAINING_MODE_DEFINITIONS,
);
