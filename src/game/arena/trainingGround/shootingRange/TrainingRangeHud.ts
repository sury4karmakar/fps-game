import type { Disposable } from "../../../core/contracts";
import type { TrainingModeDefinition } from "./trainingModes";

/** Owns the range-only status text so it cannot leak into another map or section. */
export class TrainingRangeHud implements Disposable {
  public constructor(private readonly element: HTMLElement) {
    this.reset();
  }

  public showModeSelection(): void {
    this.element.hidden = false;
    this.element.textContent = "Training ready. Shoot a mode to begin.";
  }

  public showActiveMode(mode: TrainingModeDefinition, eliminations: number): void {
    this.element.hidden = false;
    this.element.textContent = `${mode.displayName}: ${mode.description} Eliminations: ${eliminations}.`;
  }

  public updateEliminations(mode: TrainingModeDefinition, eliminations: number): void {
    this.showActiveMode(mode, eliminations);
  }

  public reset(): void {
    this.element.hidden = true;
    this.element.textContent = "";
  }

  public dispose(): void {
    this.reset();
  }
}
