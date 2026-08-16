import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { getMapRegistryEntry } from "../arena/mapRegistry";
import type { BotAI } from "../bot/BotAI";
import type { AudioSystem } from "../audio/AudioSystem";
import type { CombatSystem, KillOwner } from "../combat/CombatSystem";
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
import type { PlayerController } from "../player/PlayerController";
import type { WeaponSystem } from "../weapon/WeaponSystem";

const FIVE_MINUTES_MS = 5 * 60 * 1_000;

export type MatchState = "waiting" | "playing" | "finished";
type MatchResult = "player-win" | "bot-win" | "draw";

export type MatchStartRequestHandler = (
  configuration: MatchConfiguration,
) => Promise<void> | void;

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
  readonly difficultySelect: HTMLSelectElement;
  readonly map: HTMLElement;
  readonly mapSelect: HTMLSelectElement;
  readonly mapDescription: HTMLElement;
  readonly mapStatus: HTMLElement;
  readonly loadingStatus: HTMLElement;
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
  private isDisposed = false;

  public constructor(
    private readonly scene: Scene,
    private readonly playerController: PlayerController,
    private readonly combatSystem: CombatSystem,
    private readonly botAI: BotAI,
    private readonly weaponSystem: WeaponSystem,
    private readonly audioSystem: AudioSystem,
    private readonly hud: MatchHudElements,
    private readonly matchDurationMs = FIVE_MINUTES_MS,
    initialConfiguration: MatchConfiguration = {
      selectedMapId: "foundry",
      botDifficultyId: "normal",
    },
    private readonly onMatchStartRequested?: MatchStartRequestHandler,
  ) {
    if (!Number.isFinite(matchDurationMs) || matchDurationMs <= 0) {
      throw new Error("Match duration must be a positive number.");
    }

    this.remainingMs = matchDurationMs;
    this.selectedDifficultyId = initialConfiguration.botDifficultyId;
    this.selectedMapId = initialConfiguration.selectedMapId;
    this.populateMapSelector();
    this.hud.actionButton.addEventListener("click", this.handleAction);
    this.hud.difficultySelect.addEventListener(
      "change",
      this.handleDifficultyChange,
    );
    this.hud.mapSelect.addEventListener("change", this.handleMapChange);
    this.updateObserver = scene.onAfterAnimationsObservable.add(() => {
      this.update();
    });
    this.enterWaitingState();
  }

  public dispose(): void {
    this.isDisposed = true;
    this.scene.onAfterAnimationsObservable.remove(this.updateObserver);
    this.hud.actionButton.removeEventListener("click", this.handleAction);
    this.hud.difficultySelect.removeEventListener(
      "change",
      this.handleDifficultyChange,
    );
    this.hud.mapSelect.removeEventListener("change", this.handleMapChange);
  }

  public recordKill(killer: KillOwner): void {
    if (this.matchState !== "playing") {
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

  public startMatch(): void {
    if (this.matchState !== "waiting" || this.isLoadingMap) {
      return;
    }

    const now = performance.now();
    this.matchState = "playing";
    this.playerKills = 0;
    this.botKills = 0;
    this.remainingMs = this.matchDurationMs;
    this.matchEndsAt = now + this.matchDurationMs;
    this.displayedSecond = -1;

    this.combatSystem.resetForMatch(now);
    this.weaponSystem.resetForMatch();
    this.audioSystem.playMatchStart();
    this.setGameplayEnabled(true);
    this.updateScoreHud();
    this.updateTimerHud(true);
    this.hud.state.textContent = "LIVE";
    this.hud.state.dataset.state = "playing";
    this.hud.overlay.dataset.state = "playing";
    this.hud.overlay.setAttribute("aria-busy", "false");
    this.hud.difficultySelect.disabled = true;
    this.hud.mapSelect.disabled = true;
    this.hud.loadingStatus.hidden = true;
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

  private readonly handleDifficultyChange = (): void => {
    const difficultyId = this.hud.difficultySelect.value;

    if (!isBotDifficultyId(difficultyId) || this.matchState === "playing") {
      this.hud.difficultySelect.value = this.selectedDifficultyId;
      return;
    }

    this.selectedDifficultyId = difficultyId;
    this.botAI.setDifficulty(difficultyId);
    this.updateSelectionHud();
  };

  private readonly handleMapChange = (): void => {
    const mapId = this.hud.mapSelect.value;

    if (
      !isArenaMapId(mapId) ||
      !this.isSelectableMap(mapId) ||
      this.matchState !== "waiting" ||
      this.isLoadingMap
    ) {
      this.hud.mapSelect.value = this.selectedMapId;
      return;
    }

    this.selectedMapId = mapId;
    this.updateSelectionHud();
  };

  private enterWaitingState(): void {
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
    this.hud.eyebrow.textContent = "Five-minute duel";
    this.hud.title.textContent = "Ready for the match?";
    this.hud.message.textContent =
      "Score more eliminations than the bot before the clock reaches zero.";
    this.hud.finalScore.hidden = true;
    this.hud.actionButton.textContent = "Start Match";
    this.hud.actionButton.disabled = false;
    this.hud.difficultySelect.disabled = false;
    this.hud.mapSelect.disabled = false;
    this.hud.loadingStatus.hidden = true;
    this.isLoadingMap = false;
    delete this.hud.overlay.dataset.result;
    this.updateSelectionHud();
  }

  private update(): void {
    if (this.matchState !== "playing") {
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
    this.hud.difficultySelect.disabled = false;
    this.hud.mapSelect.disabled = false;
  }

  private setGameplayEnabled(enabled: boolean): void {
    this.combatSystem.setCombatEnabled(enabled);
    this.botAI.setEnabled(enabled);
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

  private populateMapSelector(): void {
    this.hud.mapSelect.replaceChildren();

    for (const map of ARENA_MAPS) {
      const registryEntry = getMapRegistryEntry(map.id);
      const available =
        isArenaMapAvailable(map.id) && registryEntry.load !== undefined;
      const option = document.createElement("option");
      option.value = map.id;
      option.textContent = available ? map.displayName : `${map.displayName} (Unavailable)`;
      option.disabled = !available;
      this.hud.mapSelect.append(option);
    }

    if (!this.isSelectableMap(this.selectedMapId)) {
      this.selectedMapId = ARENA_MAPS.find((map) => this.isSelectableMap(map.id))?.id
        ?? this.selectedMapId;
    }
  }

  private isSelectableMap(mapId: ArenaMapId): boolean {
    const entry = getMapRegistryEntry(mapId);
    return isArenaMapAvailable(mapId) && entry.load !== undefined;
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
    this.hud.difficultySelect.disabled = true;
    this.hud.mapSelect.disabled = true;
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
      this.hud.difficultySelect.disabled = false;
      this.hud.mapSelect.disabled = false;
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

  private updateSelectionHud(): void {
    const difficulty = getBotDifficultyDefinition(this.selectedDifficultyId);
    const map = getArenaMapDefinition(this.selectedMapId);
    this.hud.difficulty.textContent = difficulty.displayName;
    this.hud.difficulty.dataset.difficulty = difficulty.id;
    this.hud.difficultySelect.value = difficulty.id;
    this.hud.map.textContent = map.displayName;
    this.hud.map.dataset.map = map.id;
    this.hud.mapSelect.value = map.id;
    this.hud.mapDescription.textContent = this.isSelectableMap(map.id)
      ? map.description
      : `${map.description} This map is unavailable in this build.`;
    this.hud.mapStatus.textContent = this.isSelectableMap(map.id)
      ? `${map.displayName} selected. ${map.description}`
      : `${map.displayName} is unavailable in this build.`;
    this.hud.eyebrow.textContent = `${map.displayName} · ${difficulty.displayName} bot`;
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
