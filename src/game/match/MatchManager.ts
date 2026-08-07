import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BotAI } from "../bot/BotAI";
import type { AudioSystem } from "../audio/AudioSystem";
import type { CombatSystem, KillOwner } from "../combat/CombatSystem";
import type { PlayerController } from "../player/PlayerController";
import type { WeaponSystem } from "../weapon/WeaponSystem";

const FIVE_MINUTES_MS = 5 * 60 * 1_000;

export type MatchState = "waiting" | "playing" | "finished";
type MatchResult = "player-win" | "bot-win" | "draw";

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
}

export class MatchManager {
  private readonly updateObserver: Observer<Scene>;

  private matchState: MatchState = "waiting";
  private playerKills = 0;
  private botKills = 0;
  private matchEndsAt = 0;
  private remainingMs: number;
  private displayedSecond = -1;

  public constructor(
    private readonly scene: Scene,
    private readonly playerController: PlayerController,
    private readonly combatSystem: CombatSystem,
    private readonly botAI: BotAI,
    private readonly weaponSystem: WeaponSystem,
    private readonly audioSystem: AudioSystem,
    private readonly hud: MatchHudElements,
    private readonly matchDurationMs = FIVE_MINUTES_MS,
  ) {
    if (!Number.isFinite(matchDurationMs) || matchDurationMs <= 0) {
      throw new Error("Match duration must be a positive number.");
    }

    this.remainingMs = matchDurationMs;
    this.hud.actionButton.addEventListener("click", this.handleAction);
    this.updateObserver = scene.onAfterAnimationsObservable.add(() => {
      this.update();
    });
    this.enterWaitingState();
  }

  public dispose(): void {
    this.scene.onAfterAnimationsObservable.remove(this.updateObserver);
    this.hud.actionButton.removeEventListener("click", this.handleAction);
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

  private readonly handleAction = (): void => {
    if (this.matchState !== "playing") {
      this.startMatch();
    }
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
    this.hud.eyebrow.textContent = "Five-minute duel";
    this.hud.title.textContent = "Ready for the match?";
    this.hud.message.textContent =
      "Score more eliminations than the bot before the clock reaches zero.";
    this.hud.finalScore.hidden = true;
    this.hud.actionButton.textContent = "Start Match";
  }

  private startMatch(): void {
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
    this.hud.overlay.dataset.result = result;
    this.hud.eyebrow.textContent = "Match complete";
    this.hud.title.textContent = resultCopy.title;
    this.hud.message.textContent = resultCopy.message;
    this.hud.finalPlayerScore.textContent = String(this.playerKills);
    this.hud.finalBotScore.textContent = String(this.botKills);
    this.hud.finalScore.hidden = false;
    this.hud.actionButton.textContent = "Play Again";
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
