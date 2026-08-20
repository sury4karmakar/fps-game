import "./styles.css";
import { GameApplication } from "./game/GameApplication";
import type { AudioHudElements } from "./game/audio/AudioSystem";
import type { CombatHudElements } from "./game/combat/CombatSystem";
import {
  DEFAULT_MATCH_CONFIGURATION,
  GAME_NAME,
  getArenaMapDefinition,
  type MatchConfiguration,
} from "./game/config/gameConfig";
import type { MatchHudElements } from "./game/match/MatchManager";
import type { WeaponHudElements } from "./game/weapon/WeaponSystem";
import type { SettingsHudElements } from "./game/settings/SettingsManager";

type StatusState = "loading" | "ready" | "error";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`${GAME_NAME} could not find the required element: ${selector}`);
  }

  return element;
}

const canvas = requireElement<HTMLCanvasElement>("#game-canvas");
const overlay = requireElement<HTMLElement>("#status-overlay");
const statusTitle = requireElement<HTMLElement>("#status-title");
const statusMessage = requireElement<HTMLElement>("#status-message");
const retryButton = requireElement<HTMLButtonElement>("#retry-button");
const weaponHud: WeaponHudElements = {
  crosshair: requireElement<HTMLElement>("#crosshair"),
  weaponName: requireElement<HTMLElement>("#weapon-name"),
  weaponRole: requireElement<HTMLElement>("#weapon-role"),
  weaponSlots: requireElement<HTMLElement>("#weapon-slots"),
  ammoCount: requireElement<HTMLElement>("#ammo-count"),
  reloadStatus: requireElement<HTMLElement>("#reload-status"),
  hitMarker: requireElement<HTMLElement>("#hit-marker"),
  trainingFeedback: requireElement<HTMLElement>("#training-weapon-feedback"),
};
const combatHud: CombatHudElements = {
  playerHealth: requireElement<HTMLElement>("#player-health"),
  playerHealthFill: requireElement<HTMLElement>("#player-health-fill"),
  botHealth: requireElement<HTMLElement>("#bot-health"),
  botHealthFill: requireElement<HTMLElement>("#bot-health-fill"),
  combatMessage: requireElement<HTMLElement>("#combat-message"),
  damageOverlay: requireElement<HTMLElement>("#damage-overlay"),
  armorPanel: requireElement<HTMLElement>("#armor-card"),
  playerArmor: requireElement<HTMLElement>("#player-armor"),
  playerArmorFill: requireElement<HTMLElement>("#player-armor-fill"),
  armorStatus: requireElement<HTMLElement>("#armor-status"),
};
const matchHud: MatchHudElements = {
  state: requireElement<HTMLElement>("#match-state"),
  timer: requireElement<HTMLElement>("#match-timer"),
  playerScore: requireElement<HTMLElement>("#player-score"),
  botScore: requireElement<HTMLElement>("#bot-score"),
  overlay: requireElement<HTMLElement>("#match-overlay"),
  eyebrow: requireElement<HTMLElement>("#match-eyebrow"),
  title: requireElement<HTMLElement>("#match-title"),
  message: requireElement<HTMLElement>("#match-message"),
  finalScore: requireElement<HTMLElement>("#match-final-score"),
  finalPlayerScore: requireElement<HTMLElement>("#match-final-player-score"),
  finalBotScore: requireElement<HTMLElement>("#match-final-bot-score"),
  actionButton: requireElement<HTMLButtonElement>("#match-action-button"),
  difficulty: requireElement<HTMLElement>("#match-difficulty"),
  difficultySelect: requireElement<HTMLSelectElement>("#match-difficulty-select"),
  map: requireElement<HTMLElement>("#match-map"),
  mapSelect: requireElement<HTMLSelectElement>("#match-map-select"),
  mapDescription: requireElement<HTMLElement>("#match-map-description"),
  mapStatus: requireElement<HTMLElement>("#match-map-status"),
  loadingStatus: requireElement<HTMLElement>("#match-loading-status"),
  exitMapButton: requireElement<HTMLButtonElement>("#exit-map-button"),
  trainingNavigation: requireElement<HTMLElement>("#training-navigation"),
  shootingRangeButton: requireElement<HTMLButtonElement>("#shooting-range-button"),
  movementTrainingButton: requireElement<HTMLButtonElement>("#movement-training-button"),
  returnToHubButton: requireElement<HTMLButtonElement>("#return-to-hub-button"),
  trainingNavigationStatus: requireElement<HTMLElement>("#training-navigation-status"),
  trainingRangeStatus: requireElement<HTMLElement>("#training-range-status"),
  scorePanel: requireElement<HTMLElement>("#score-panel"),
  botHealthCard: requireElement<HTMLElement>(".bot-health-card"),
};
const audioHud: AudioHudElements = {
  toggleButton: requireElement<HTMLButtonElement>("#audio-toggle"),
  status: requireElement<HTMLElement>("#audio-status"),
};
const settingsHud: SettingsHudElements = {
  mouseSensitivity: requireElement<HTMLInputElement>("#mouse-sensitivity"),
  mouseSensitivityValue: requireElement<HTMLElement>("#mouse-sensitivity-value"),
  audioVolume: requireElement<HTMLInputElement>("#audio-volume"),
  audioVolumeValue: requireElement<HTMLElement>("#audio-volume-value"),
  muteButton: requireElement<HTMLButtonElement>("#settings-mute-button"),
  graphicsQuality: requireElement<HTMLSelectElement>("#graphics-quality"),
  graphicsQualityValue: requireElement<HTMLElement>("#graphics-quality-value"),
};

document.title = GAME_NAME;
document.querySelectorAll<HTMLElement>("[data-game-name]").forEach((element) => {
  element.textContent = GAME_NAME;
});
document
  .querySelector<HTMLCanvasElement>("#game-canvas")
  ?.setAttribute("aria-label", `${GAME_NAME} game viewport`);
document
  .querySelector<HTMLMetaElement>('meta[name="description"]')
  ?.setAttribute("content", `${GAME_NAME} - a lightweight browser FPS built with Babylon.js`);

let application: GameApplication | null = null;
let retryConfiguration: MatchConfiguration = DEFAULT_MATCH_CONFIGURATION;

function getDevelopmentMatchDurationMs(): number | undefined {
  if (!import.meta.env.DEV) {
    return undefined;
  }

  const seconds = Number(
    new URLSearchParams(window.location.search).get("matchSeconds"),
  );
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : undefined;
}

function setStatus(state: StatusState, title: string, message: string): void {
  overlay.dataset.state = state;
  overlay.setAttribute("aria-busy", String(state === "loading"));
  overlay.setAttribute("aria-live", state === "error" ? "assertive" : "polite");
  statusTitle.textContent = title;
  statusMessage.textContent = message;
  retryButton.hidden = state !== "error";

  if (state === "error") {
    window.requestAnimationFrame(() => retryButton.focus());
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "An unexpected error occurred.";
}

async function launchGame(
  matchConfiguration: MatchConfiguration = retryConfiguration,
): Promise<void> {
  setStatus("loading", "Loading game", "Preparing the Babylon.js scene...");

  try {
    application?.dispose();
    application = new GameApplication(
      canvas,
      weaponHud,
      combatHud,
      matchHud,
      audioHud,
      settingsHud,
      {
        matchDurationMs: getDevelopmentMatchDurationMs(),
        matchConfiguration,
        onMatchStartRequested: loadSelectedMatch,
      },
    );
    await application.start();
    setStatus("ready", "Ready", "The game foundation is running.");
  } catch (error) {
    console.error(`Failed to start ${GAME_NAME}:`, error);
    application?.dispose();
    application = null;
    setStatus(
      "error",
      "Unable to start the game",
      `${describeError(error)} Check WebGL support and try again.`,
    );
  }
}

async function loadSelectedMatch(configuration: MatchConfiguration): Promise<void> {
  if (!application) {
    throw new Error("The game is not ready to load a new match.");
  }

  const selectedMap = getArenaMapDefinition(configuration.selectedMapId);
  retryConfiguration = configuration;
  setStatus(
    "loading",
    `Loading ${selectedMap.displayName}`,
    "Resetting the match and loading the selected arena…",
  );

  try {
    await application.loadMatch(configuration, true);
    setStatus("ready", "Ready", `${selectedMap.displayName} is ready.`);
  } catch (error) {
    setStatus(
      "error",
      "Unable to load the selected map",
      `${describeError(error)} Retry will reload ${selectedMap.displayName}.`,
    );
    throw error;
  }
}

retryButton.addEventListener("click", () => {
  void launchGame(retryConfiguration);
});

window.addEventListener("error", (event) => {
  if (overlay.dataset.state !== "error") {
    setStatus("error", "Game error", describeError(event.error));
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (overlay.dataset.state !== "error") {
    setStatus("error", "Game error", describeError(event.reason));
  }
});

window.addEventListener("beforeunload", () => {
  application?.dispose();
});

void launchGame();
