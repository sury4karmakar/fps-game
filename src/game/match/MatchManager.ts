import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { getMapRegistryEntry } from "../arena/mapRegistry";
import type { TrainingGroundSectionId } from "../arena/trainingGround/sections/trainingGroundSectionTypes";
import {
  ARENA_MAPS,
  getArenaMapDefinition,
  getBotDifficultyDefinition,
  isArenaMapAvailable,
  isArenaMapId,
  isBotDifficultyId,
  type ArenaMapId,
  type BotDifficultyId,
  type MatchConfiguration,
} from "../config/gameConfig";
import type {
  BotControlPort,
  KillOwner,
  MatchAudioPort,
  MatchCombatPort,
  PlayerControlPort,
  WeaponControlPort,
} from "../core/contracts";

const FIVE_MINUTES_MS = 5 * 60 * 1_000;

export type MatchState = "waiting" | "playing" | "finished";
type MatchResult = "player-win" | "bot-win" | "draw";

export type MatchStartRequestHandler = (
  configuration: MatchConfiguration,
) => Promise<void> | void;

export type TrainingSectionRequestHandler = (
  sectionId: TrainingGroundSectionId,
) => Promise<void> | void;

export type TrainingHubRequestHandler = () => void;

export interface MatchHudElements {
  readonly state: HTMLElement;
  readonly timer: HTMLElement;
  readonly playerScore: HTMLElement;
  readonly botScore: HTMLElement;
  readonly overlay: HTMLElement;
  readonly eyebrow: HTMLElement;
  readonly title: HTMLElement;
  readonly message: HTMLElement;
  readonly finalScore: HTMLElement;
  readonly finalPlayerScore: HTMLElement;
  readonly finalBotScore: HTMLElement;
  readonly actionButton: HTMLButtonElement;
  readonly difficulty: HTMLElement;
  /** Dormant while the difficulty dropdown is commented out in index.html. */
  readonly difficultySelect?: HTMLSelectElement;
  readonly map: HTMLElement;
  /** Dormant while the map dropdown is commented out in index.html. */
  readonly mapSelect?: HTMLSelectElement;
  readonly mapDescription?: HTMLElement;
  readonly mapStatus?: HTMLElement;
  readonly loadingStatus: HTMLElement;
  readonly exitMapButton: HTMLButtonElement;
  readonly trainingNavigation: HTMLElement;
  readonly shootingRangeButton: HTMLButtonElement;
  readonly movementTrainingButton: HTMLButtonElement;
  readonly returnToHubButton: HTMLButtonElement;
  readonly trainingNavigationStatus: HTMLElement;
  readonly trainingRangeStatus: HTMLElement;
  readonly scorePanel: HTMLElement;
  readonly botHealthCard: HTMLElement;
}

export class MatchManager {
  private readonly updateObserver: Observer<Scene>;

  private matchState: MatchState = "waiting";
  private playerKills = 0;
  private botKills = 0;
  private matchEndsAt = 0;
  private remainingMs: number;
  private displayedSecond = -1;
  private selectedDifficultyId: BotDifficultyId;
  private selectedMapId: ArenaMapId;
  private isLoadingMap = false;
  private isLoadingTrainingSection = false;
  private isDisposed = false;

  public constructor(
    private readonly scene: Scene,
    private readonly playerController: PlayerControlPort,
    private readonly combatSystem: MatchCombatPort,
    private readonly botAI: BotControlPort,
    private readonly weaponSystem: WeaponControlPort,
    private readonly audioSystem: MatchAudioPort,
    private readonly hud: MatchHudElements,
    private readonly matchDurationMs = FIVE_MINUTES_MS,
    initialConfiguration: MatchConfiguration = {
      selectedMapId: "training-ground",
      botDifficultyId: "normal",
    },
    private readonly onMatchStartRequested?: MatchStartRequestHandler,
    private readonly botEnabled = true,
    private readonly hasMatchTimer = true,
    private readonly onTrainingSectionRequested?: TrainingSectionRequestHandler,
    private readonly onTrainingHubRequested?: TrainingHubRequestHandler,
  ) {
    if (!Number.isFinite(matchDurationMs) || matchDurationMs <= 0) {
      throw new Error("Match duration must be a positive number.");
    }

    this.remainingMs = matchDurationMs;
    this.selectedDifficultyId = initialConfiguration.botDifficultyId;
    this.selectedMapId = initialConfiguration.selectedMapId;
    this.populateMapSelector();
    this.hud.actionButton.addEventListener("click", this.handleAction);
    this.hud.difficultySelect?.addEventListener(
      "change",
      this.handleDifficultyChange,
    );
    this.hud.mapSelect?.addEventListener("change", this.handleMapChange);
    this.hud.exitMapButton.addEventListener("click", this.handleExitMap);
    this.hud.shootingRangeButton.addEventListener("click", this.handleShootingRange);
    this.hud.movementTrainingButton.addEventListener("click", this.handleMovementTraining);
    this.hud.returnToHubButton.addEventListener("click", this.handleReturnToHub);
    this.updateObserver = scene.onAfterAnimationsObservable.add(() => {
      this.update();
    });
    this.enterWaitingState();
  }

  public dispose(): void {
    this.isDisposed = true;
    this.scene.onAfterAnimationsObservable.remove(this.updateObserver);
    this.hud.actionButton.removeEventListener("click", this.handleAction);
    this.hud.difficultySelect?.removeEventListener(
      "change",
      this.handleDifficultyChange,
    );
    this.hud.mapSelect?.removeEventListener("change", this.handleMapChange);
    this.hud.exitMapButton.removeEventListener("click", this.handleExitMap);
    this.hud.shootingRangeButton.removeEventListener("click", this.handleShootingRange);
    this.hud.movementTrainingButton.removeEventListener("click", this.handleMovementTraining);
    this.hud.returnToHubButton.removeEventListener("click", this.handleReturnToHub);
  }

  public recordKill(killer: KillOwner): void {
    if (this.matchState !== "playing" || !this.hasMatchTimer) {
      return;
    }

    if (killer === "player") {
      this.playerKills += 1;
    } else {
      this.botKills += 1;
    }

    this.updateScoreHud();
  }

  public get state(): MatchState {
    return this.matchState;
  }

  /** Lets an in-world section exit synchronize the shared training navigation. */
  public reportTrainingHubReturned(): void {
    if (this.hasMatchTimer || this.matchState !== "playing") {
      return;
    }

    this.hud.returnToHubButton.hidden = true;
    this.setTrainingNavigationState("ready");
  }

  public startMatch(): void {
    if (this.matchState !== "waiting" || this.isLoadingMap) {
      return;
    }

    const now = performance.now();
    this.matchState = "playing";
    this.playerKills = 0;
    this.botKills = 0;
    this.remainingMs = this.matchDurationMs;
    this.matchEndsAt = this.hasMatchTimer ? now + this.matchDurationMs : 0;
    this.displayedSecond = -1;

    this.combatSystem.resetForMatch(now);
    this.weaponSystem.resetForMatch();
    if (this.hasMatchTimer) {
      this.audioSystem.playMatchStart();
    }
    this.setGameplayEnabled(true);
    this.updateScoreHud();
    if (this.hasMatchTimer) {
      this.updateTimerHud(true);
    }
    this.hud.state.textContent = this.hasMatchTimer ? "LIVE" : "PRACTICE";
    this.hud.state.dataset.state = "playing";
    this.hud.overlay.dataset.state = "playing";
    this.hud.overlay.setAttribute("aria-busy", "false");
    if (this.hud.difficultySelect) this.hud.difficultySelect.disabled = true;
    if (this.hud.mapSelect) this.hud.mapSelect.disabled = true;
    this.hud.loadingStatus.hidden = true;
    this.hud.exitMapButton.hidden = this.hasMatchTimer;
    this.hud.exitMapButton.textContent = this.hasMatchTimer ? "Exit Map" : "Exit Training Ground";
    this.hud.trainingNavigation.hidden = this.hasMatchTimer;
    this.hud.returnToHubButton.hidden = true;
    this.setTrainingNavigationState("ready");
  }

  private readonly handleAction = (): void => {
    if (this.matchState === "finished") {
      this.enterWaitingState();
      return;
    }

    if (this.matchState === "waiting") {
      void this.requestMatchStart();
    }
  };

  private readonly handleExitMap = (): void => {
    if (this.matchState === "playing") {
      this.enterWaitingState();
    }
  };

  private readonly handleShootingRange = (): void => {
    void this.requestTrainingSection("shooting-range");
  };

  private readonly handleMovementTraining = (): void => {
    void this.requestTrainingSection("movement-training");
  };

  private readonly handleReturnToHub = (): void => {
    if (this.hasMatchTimer || this.matchState !== "playing" || this.isLoadingTrainingSection) {
      return;
    }

    this.onTrainingHubRequested?.();
    this.reportTrainingHubReturned();
  };

  private readonly handleDifficultyChange = (): void => {
    const difficultySelect = this.hud.difficultySelect;
    const difficultyId = difficultySelect?.value;

    if (!difficultySelect || !difficultyId || !isBotDifficultyId(difficultyId) || this.matchState === "playing") {
      if (difficultySelect) {
        difficultySelect.value = this.selectedDifficultyId;
      }
      return;
    }

    this.selectedDifficultyId = difficultyId;
    this.botAI.setDifficulty(difficultyId);
    this.updateSelectionHud();
  };

  private readonly handleMapChange = (): void => {
    const mapSelect = this.hud.mapSelect;
    const mapId = mapSelect?.value;

    if (
      !mapSelect ||
      !mapId ||
      !isArenaMapId(mapId) ||
      !this.isSelectableMap(mapId) ||
      this.matchState !== "waiting" ||
      this.isLoadingMap
    ) {
      if (mapSelect) {
        mapSelect.value = this.selectedMapId;
      }
      return;
    }

    this.selectedMapId = mapId;
    this.updateSelectionHud();
  };

  private enterWaitingState(): void {
    if (!this.hasMatchTimer) {
      this.onTrainingHubRequested?.();
    }
    this.matchState = "waiting";
    this.playerKills = 0;
    this.botKills = 0;
    this.remainingMs = this.matchDurationMs;
    this.setGameplayEnabled(false);
    this.updateScoreHud();
    this.updateTimerHud(true);
    this.hud.state.textContent = "WAITING";
    this.hud.state.dataset.state = "waiting";
    this.hud.overlay.dataset.state = "waiting";
    this.hud.overlay.setAttribute("aria-busy", "false");
    this.hud.timer.hidden = !this.hasMatchTimer;
    this.hud.exitMapButton.hidden = true;
    this.hud.exitMapButton.textContent = this.hasMatchTimer ? "Exit Map" : "Exit Training Ground";
    this.hud.trainingNavigation.hidden = true;
    this.hud.returnToHubButton.hidden = true;
    this.hud.scorePanel.hidden = !this.botEnabled;
    this.hud.botHealthCard.hidden = !this.botEnabled;
    this.hud.eyebrow.textContent = this.hasMatchTimer
      ? "Five-minute duel"
      : "Free practice";
    this.hud.title.textContent = this.hasMatchTimer
      ? "Ready for the match?"
      : "Ready for free practice?";
    this.hud.message.textContent = this.hasMatchTimer
      ? "Score more eliminations than the bot before the clock reaches zero."
      : "Explore and test your equipment with no opponent or countdown.";
    this.hud.finalScore.hidden = true;
    this.hud.actionButton.textContent = this.hasMatchTimer
      ? "Start Match"
      : "Enter Training Ground";
    this.hud.actionButton.disabled = false;
    if (this.hud.difficultySelect) this.hud.difficultySelect.disabled = false;
    if (this.hud.mapSelect) this.hud.mapSelect.disabled = false;
    this.hud.loadingStatus.hidden = true;
    this.isLoadingMap = false;
    this.isLoadingTrainingSection = false;
    delete this.hud.overlay.dataset.result;
    this.updateSelectionHud();
  }

  private update(): void {
    if (this.matchState !== "playing" || !this.hasMatchTimer) {
      return;
    }

    this.remainingMs = Math.max(0, this.matchEndsAt - performance.now());
    this.updateTimerHud();

    if (this.remainingMs <= 0) {
      this.finishMatch();
    }
  }

  private finishMatch(): void {
    this.matchState = "finished";
    this.remainingMs = 0;
    this.setGameplayEnabled(false);
    this.updateTimerHud(true);

    const result = this.getResult();
    const resultCopy = this.getResultCopy(result);
    this.audioSystem.playMatchEnd(result);
    this.hud.state.textContent = "FINISHED";
    this.hud.state.dataset.state = "finished";
    this.hud.overlay.dataset.state = "finished";
    this.hud.overlay.setAttribute("aria-busy", "false");
    this.hud.overlay.dataset.result = result;
    this.hud.eyebrow.textContent = "Match complete";
    this.hud.title.textContent = resultCopy.title;
    this.hud.message.textContent = resultCopy.message;
    this.hud.finalPlayerScore.textContent = String(this.playerKills);
    this.hud.finalBotScore.textContent = String(this.botKills);
    this.hud.finalScore.hidden = false;
    this.hud.actionButton.textContent = "Play Again";
    this.hud.actionButton.disabled = false;
    if (this.hud.difficultySelect) this.hud.difficultySelect.disabled = false;
    if (this.hud.mapSelect) this.hud.mapSelect.disabled = false;
  }

  private setGameplayEnabled(enabled: boolean): void {
    this.combatSystem.setCombatEnabled(enabled);
    this.botAI.setEnabled(enabled && this.botEnabled);
    this.weaponSystem.setEnabled(enabled);
    this.playerController.setEnabled(enabled);
  }

  private getResult(): MatchResult {
    if (this.playerKills > this.botKills) {
      return "player-win";
    }

    if (this.botKills > this.playerKills) {
      return "bot-win";
    }

    return "draw";
  }

  private getResultCopy(result: MatchResult): {
    readonly title: string;
    readonly message: string;
  } {
    if (result === "player-win") {
      return {
        title: "Player Wins",
        message: "You finished the round with the most eliminations.",
      };
    }

    if (result === "bot-win") {
      return {
        title: "Bot Wins",
        message: "The bot finished the round with the most eliminations.",
      };
    }

    return {
      title: "Draw",
      message: "Both combatants finished with the same number of eliminations.",
    };
  }

  private updateScoreHud(): void {
    this.hud.playerScore.textContent = String(this.playerKills);
    this.hud.botScore.textContent = String(this.botKills);
  }

  private isSelectableMap(mapId: ArenaMapId): boolean {
    const entry = getMapRegistryEntry(mapId);
    return isArenaMapAvailable(mapId) && entry.load !== undefined;
  }

  /** Restores selector options whenever those optional controls are enabled. */
  private populateMapSelector(): void {
    const mapSelect = this.hud.mapSelect;

    if (!mapSelect) {
      return;
    }

    mapSelect.replaceChildren();
    for (const map of ARENA_MAPS) {
      const registryEntry = getMapRegistryEntry(map.id);
      const available = isArenaMapAvailable(map.id) && registryEntry.load !== undefined;
      const option = document.createElement("option");
      option.value = map.id;
      option.textContent = available ? map.displayName : `${map.displayName} (Unavailable)`;
      option.disabled = !available;
      mapSelect.append(option);
    }
  }

  private async requestMatchStart(): Promise<void> {
    if (this.isLoadingMap || this.matchState !== "waiting") {
      return;
    }

    if (!this.isSelectableMap(this.selectedMapId)) {
      this.hud.message.textContent = "That map is unavailable in this build. Choose another battlefield.";
      return;
    }

    if (!this.onMatchStartRequested) {
      this.startMatch();
      return;
    }

    const selectedMap = getArenaMapDefinition(this.selectedMapId);
    this.isLoadingMap = true;
    if (this.hud.difficultySelect) this.hud.difficultySelect.disabled = true;
    if (this.hud.mapSelect) this.hud.mapSelect.disabled = true;
    this.hud.actionButton.disabled = true;
    this.hud.actionButton.textContent = "Loading…";
    this.hud.overlay.dataset.state = "loading";
    this.hud.overlay.setAttribute("aria-busy", "true");
    this.hud.loadingStatus.hidden = false;
    this.hud.loadingStatus.textContent = `Loading ${selectedMap.displayName}. Please wait.`;
    this.hud.eyebrow.textContent = "Loading battlefield";
    this.hud.title.textContent = `Preparing ${selectedMap.displayName}`;
    this.hud.message.textContent = "Loading the selected arena and resetting the match.";

    try {
      await this.onMatchStartRequested({
        selectedMapId: this.selectedMapId,
        botDifficultyId: this.selectedDifficultyId,
      });
    } catch (error) {
      if (this.isDisposed) {
        return;
      }

      this.isLoadingMap = false;
      if (this.hud.difficultySelect) this.hud.difficultySelect.disabled = false;
      if (this.hud.mapSelect) this.hud.mapSelect.disabled = false;
      this.hud.actionButton.disabled = false;
      this.hud.actionButton.textContent = "Try Again";
      this.hud.overlay.dataset.state = "waiting";
      this.hud.overlay.setAttribute("aria-busy", "false");
      this.hud.loadingStatus.hidden = true;
      this.hud.title.textContent = "Unable to load the battlefield";
      this.hud.message.textContent = error instanceof Error
        ? error.message
        : "The selected map could not be loaded. Please try again.";
    }
  }

  private async requestTrainingSection(sectionId: TrainingGroundSectionId): Promise<void> {
    if (
      this.hasMatchTimer ||
      this.matchState !== "playing" ||
      this.isLoadingTrainingSection
    ) {
      return;
    }

    this.isLoadingTrainingSection = true;
    this.setTrainingNavigationState("loading", sectionId);

    try {
      if (!this.onTrainingSectionRequested) {
        throw new Error(
          "This training module is not available in the current build.",
        );
      }

      await this.onTrainingSectionRequested(sectionId);
      if (!this.isDisposed && this.matchState === "playing") {
        this.hud.returnToHubButton.hidden = false;
        this.setTrainingNavigationState("ready", sectionId);
      }
    } catch (error) {
      if (!this.isDisposed) {
        this.setTrainingNavigationState(
          "error",
          error instanceof Error ? error.message : "Unable to load this training module.",
        );
      }
    } finally {
      this.isLoadingTrainingSection = false;
    }
  }

  private setTrainingNavigationState(
    state: "ready" | "loading" | "error",
    detail?: TrainingGroundSectionId | string,
  ): void {
    const isLoading = state === "loading";
    this.hud.shootingRangeButton.disabled = isLoading;
    this.hud.movementTrainingButton.disabled = isLoading;
    this.hud.trainingNavigationStatus.dataset.state = state;

    if (state === "ready") {
      this.hud.trainingNavigationStatus.textContent =
        "Choose Shooting Range for aim practice or Movement Training for mobility practice.";
      return;
    }

    if (state === "loading") {
      const label = detail === "movement-training" ? "Movement Training" : "Shooting Range";
      this.hud.trainingNavigationStatus.textContent = `Loading ${label}…`;
      return;
    }

    this.hud.trainingNavigationStatus.textContent = detail ?? "Unable to load this training module.";
  }

  private updateSelectionHud(): void {
    const difficulty = getBotDifficultyDefinition(this.selectedDifficultyId);
    const map = getArenaMapDefinition(this.selectedMapId);
    this.hud.difficulty.textContent = difficulty.displayName;
    this.hud.difficulty.dataset.difficulty = difficulty.id;
    if (this.hud.difficultySelect) {
      this.hud.difficultySelect.value = difficulty.id;
    }
    this.hud.map.textContent = map.displayName;
    this.hud.map.dataset.map = map.id;
    if (this.hud.mapSelect) {
      this.hud.mapSelect.value = map.id;
    }
    if (this.hud.mapDescription) {
      this.hud.mapDescription.textContent = map.description;
    }
    if (this.hud.mapStatus) {
      this.hud.mapStatus.textContent = `${map.displayName} selected. ${map.description}`;
    }
  }

  private updateTimerHud(force = false): void {
    const totalSeconds = Math.ceil(this.remainingMs / 1_000);

    if (!force && totalSeconds === this.displayedSecond) {
      return;
    }

    this.displayedSecond = totalSeconds;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    this.hud.timer.textContent = `${String(minutes).padStart(2, "0")}:${String(
      seconds,
    ).padStart(2, "0")}`;
    this.hud.timer.dataset.urgent = String(
      this.matchState === "playing" && totalSeconds <= 30,
    );
  }
}
