import type { AudioSettingsPort, PlayerSettingsPort } from "../core/contracts";

export type GraphicsQualityId = "performance" | "balanced" | "high";

export interface SettingsHudElements {
  readonly mouseSensitivity: HTMLInputElement;
  readonly mouseSensitivityValue: HTMLElement;
  readonly audioVolume: HTMLInputElement;
  readonly audioVolumeValue: HTMLElement;
  readonly muteButton: HTMLButtonElement;
  readonly graphicsQuality: HTMLSelectElement;
  readonly graphicsQualityValue: HTMLElement;
}

export interface SettingsManagerOptions {
  readonly applyGraphicsQuality: (quality: GraphicsQualityId) => void;
}

const GRAPHICS_QUALITY_LABELS: Readonly<Record<GraphicsQualityId, string>> = {
  performance: "Performance",
  balanced: "Balanced",
  high: "High",
};

function isGraphicsQualityId(value: string): value is GraphicsQualityId {
  return value in GRAPHICS_QUALITY_LABELS;
}

export class SettingsManager {
  private readonly unsubscribeAudioState: () => void;

  public constructor(
    private readonly hud: SettingsHudElements,
    private readonly playerController: PlayerSettingsPort,
    private readonly audioSystem: AudioSettingsPort,
    private readonly options: SettingsManagerOptions,
  ) {
    this.hud.mouseSensitivity.addEventListener("input", this.handleMouseSensitivity);
    this.hud.audioVolume.addEventListener("input", this.handleAudioVolume);
    this.hud.muteButton.addEventListener("click", this.handleMute);
    this.hud.graphicsQuality.addEventListener("change", this.handleGraphicsQuality);
    this.unsubscribeAudioState = this.audioSystem.onStateChanged(this.syncAudioHud);

    this.applyMouseSensitivity();
    this.applyAudioVolume();
    this.applyGraphicsQuality();
    this.syncAudioHud();
  }

  public dispose(): void {
    this.hud.mouseSensitivity.removeEventListener("input", this.handleMouseSensitivity);
    this.hud.audioVolume.removeEventListener("input", this.handleAudioVolume);
    this.hud.muteButton.removeEventListener("click", this.handleMute);
    this.hud.graphicsQuality.removeEventListener("change", this.handleGraphicsQuality);
    this.unsubscribeAudioState();
  }

  private readonly handleMouseSensitivity = (): void => this.applyMouseSensitivity();
  private readonly handleAudioVolume = (): void => this.applyAudioVolume();
  private readonly handleMute = (): void => this.audioSystem.setMuted(!this.audioSystem.isMuted);
  private readonly handleGraphicsQuality = (): void => this.applyGraphicsQuality();

  private applyMouseSensitivity(): void {
    const sensitivity = this.playerController.setMouseSensitivity(Number(this.hud.mouseSensitivity.value));
    this.hud.mouseSensitivity.value = sensitivity.toFixed(2);
    this.hud.mouseSensitivityValue.textContent = `${sensitivity.toFixed(2)}×`;
  }

  private applyAudioVolume(): void {
    const volume = this.audioSystem.setVolume(Number(this.hud.audioVolume.value));
    this.hud.audioVolume.value = String(volume);
    this.syncAudioHud();
  }

  private applyGraphicsQuality(): void {
    const quality = this.hud.graphicsQuality.value;
    const safeQuality: GraphicsQualityId = isGraphicsQualityId(quality) ? quality : "balanced";
    this.hud.graphicsQuality.value = safeQuality;
    this.hud.graphicsQualityValue.textContent = GRAPHICS_QUALITY_LABELS[safeQuality];
    this.options.applyGraphicsQuality(safeQuality);
  }

  private readonly syncAudioHud = (): void => {
    const volume = this.audioSystem.volumePercent;
    this.hud.audioVolume.value = String(volume);
    this.hud.audioVolumeValue.textContent = this.audioSystem.isMuted ? "Muted" : `${volume}%`;
    this.hud.muteButton.textContent = this.audioSystem.isMuted ? "Unmute" : "Mute";
    this.hud.muteButton.setAttribute("aria-pressed", String(this.audioSystem.isMuted));
  };
}
