import "./styles.css";
import { GameApplication } from "./game/GameApplication";
import type { CombatHudElements } from "./game/combat/CombatSystem";
import type { WeaponHudElements } from "./game/weapon/WeaponSystem";

type StatusState = "loading" | "ready" | "error";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Arena Strike could not find the required element: ${selector}`);
  }

  return element;
}

const canvas = requireElement<HTMLCanvasElement>("#game-canvas");
const overlay = requireElement<HTMLElement>("#status-overlay");
const statusTitle = requireElement<HTMLElement>("#status-title");
const statusMessage = requireElement<HTMLElement>("#status-message");
const retryButton = requireElement<HTMLButtonElement>("#retry-button");
const weaponHud: WeaponHudElements = {
  ammoCount: requireElement<HTMLElement>("#ammo-count"),
  reloadStatus: requireElement<HTMLElement>("#reload-status"),
  hitMarker: requireElement<HTMLElement>("#hit-marker"),
};
const combatHud: CombatHudElements = {
  playerHealth: requireElement<HTMLElement>("#player-health"),
  playerHealthFill: requireElement<HTMLElement>("#player-health-fill"),
  botHealth: requireElement<HTMLElement>("#bot-health"),
  botHealthFill: requireElement<HTMLElement>("#bot-health-fill"),
  protectionStatus: requireElement<HTMLElement>("#protection-status"),
  combatMessage: requireElement<HTMLElement>("#combat-message"),
  damageOverlay: requireElement<HTMLElement>("#damage-overlay"),
};

let application: GameApplication | null = null;

function setStatus(state: StatusState, title: string, message: string): void {
  overlay.dataset.state = state;
  statusTitle.textContent = title;
  statusMessage.textContent = message;
  retryButton.hidden = state !== "error";
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

async function launchGame(): Promise<void> {
  setStatus("loading", "Loading game", "Preparing the Babylon.js scene...");

  try {
    application?.dispose();
    application = new GameApplication(canvas, weaponHud, combatHud);
    await application.start();
    setStatus("ready", "Ready", "The game foundation is running.");
  } catch (error) {
    console.error("Failed to start Arena Strike:", error);
    application?.dispose();
    application = null;
    setStatus(
      "error",
      "Unable to start the game",
      `${describeError(error)} Check WebGL support and try again.`,
    );
  }
}

retryButton.addEventListener("click", () => {
  void launchGame();
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
