import "./styles.css";
import { GameApplication } from "./game/GameApplication";

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

let application: GameApplication | null = null;

function setStatus(state: StatusState, title: string, message: string): void {
  overlay.dataset.state = state;
  statusTitle.textContent = title;
  statusMessage.textContent = message;
  retryButton.hidden = state !== "error";
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

async function launchGame(): Promise<void> {
  setStatus("loading", "Loading game", "Preparing the Babylon.js scene...");

  try {
    application?.dispose();
    application = new GameApplication(canvas);
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
