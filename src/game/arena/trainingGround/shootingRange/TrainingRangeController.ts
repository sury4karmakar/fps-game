import type { Disposable } from "../../../core/contracts";
import {
  TRAINING_MODE_DEFINITIONS,
  type TrainingModeDefinition,
  type TrainingModeId,
} from "./trainingModes";

export interface TrainingRangeControllerCallbacks {
  onModeStarted?(definition: TrainingModeDefinition): void;
  onModeReset?(definition: TrainingModeDefinition): void;
}

/** Owns the one-active-mode lifecycle; target behavior attaches through callbacks. */
export class TrainingRangeController implements Disposable {
  private activeMode: TrainingModeDefinition | null = null;

  public constructor(private readonly callbacks: TrainingRangeControllerCallbacks = {}) {}

  public get activeModeId(): TrainingModeId | null {
    return this.activeMode?.id ?? null;
  }

  public start(modeId: TrainingModeId): void {
    if (this.activeMode?.id === modeId) {
      return;
    }

    this.reset();
    this.activeMode = TRAINING_MODE_DEFINITIONS[modeId];
    this.callbacks.onModeStarted?.(this.activeMode);
  }

  public reset(): void {
    if (!this.activeMode) {
      return;
    }

    const previousMode = this.activeMode;
    this.activeMode = null;
    this.callbacks.onModeReset?.(previousMode);
  }

  public dispose(): void {
    this.reset();
  }
}
