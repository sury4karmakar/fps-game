import type { Scene } from "@babylonjs/core/scene.js";
import {
  getTrainingGroundSectionDefinition,
} from "./trainingGroundSectionRegistry";
import type {
  TrainingGroundSection,
  TrainingGroundSectionId,
} from "./trainingGroundSectionTypes";

/** Owns the one-active-section rule for a single Training Ground scene. */
export class TrainingGroundSectionController {
  private activeSection: TrainingGroundSection | null = null;
  private requestGeneration = 0;
  private disposed = false;

  public constructor(private readonly scene: Scene) {}

  public get activeSectionId(): TrainingGroundSectionId | null {
    return this.activeSection?.id ?? null;
  }

  public async activate(sectionId: TrainingGroundSectionId): Promise<void> {
    if (this.disposed) {
      throw new Error("Training Ground is no longer active.");
    }

    if (this.activeSection?.id === sectionId) {
      return;
    }

    // Dispose before importing the replacement so active section state never
    // overlaps, including while the replacement chunk is loading.
    const requestGeneration = ++this.requestGeneration;
    this.disposeActiveSection();
    const definition = getTrainingGroundSectionDefinition(sectionId);

    let module;
    try {
      module = await definition.load();
    } catch (error) {
      const reason = error instanceof Error ? ` ${error.message}` : "";
      throw new Error(`Unable to load ${definition.label}.${reason}`);
    }

    if (this.disposed || requestGeneration !== this.requestGeneration) {
      return;
    }

    const section = module.createTrainingGroundSection({ scene: this.scene });
    if (section.id !== sectionId) {
      section.dispose();
      throw new Error(`${definition.label} returned an unexpected section id.`);
    }

    this.activeSection = section;
  }

  public returnToHub(): void {
    this.requestGeneration += 1;
    this.disposeActiveSection();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.returnToHub();
  }

  private disposeActiveSection(): void {
    this.activeSection?.dispose();
    this.activeSection = null;
  }
}
