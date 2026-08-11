export interface AudioHudElements {
  readonly toggleButton: HTMLButtonElement;
  readonly status: HTMLElement;
}

type OscillatorShape = OscillatorType;

export class AudioSystem {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private volume = 100;
  private readonly stateChangeListeners = new Set<() => void>();
  private readonly scheduledTimeouts = new Set<number>();

  public constructor(private readonly hud: AudioHudElements) {
    this.hud.toggleButton.addEventListener("click", this.handleToggle);
    this.updateHud();
  }

  public dispose(): void {
    this.hud.toggleButton.removeEventListener("click", this.handleToggle);

    for (const timeout of this.scheduledTimeouts) {
      window.clearTimeout(timeout);
    }

    this.scheduledTimeouts.clear();
    void this.context?.close();
    this.context = null;
    this.masterGain = null;
    this.noiseBuffer = null;
  }

  public playPlayerGunshot(): void {
    this.playGunshot(0.28, 118);
  }

  public get isMuted(): boolean {
    return this.muted;
  }

  public get volumePercent(): number {
    return this.volume;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    const context = this.context;
    if (context && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : this.volume / 100 * 0.36,
        context.currentTime,
        0.015,
      );
    }
    this.updateHud();
    this.notifyStateChanged();
  }

  public setVolume(value: number): number {
    this.volume = Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 100)));
    const context = this.context;
    if (context && this.masterGain && !this.muted) {
      this.masterGain.gain.setTargetAtTime(this.volume / 100 * 0.36, context.currentTime, 0.015);
    }
    this.notifyStateChanged();
    return this.volume;
  }

  public onStateChanged(listener: () => void): () => void {
    this.stateChangeListeners.add(listener);
    return () => this.stateChangeListeners.delete(listener);
  }

  public playBotGunshot(): void {
    this.playGunshot(0.11, 92);
  }

  public playReload(): void {
    this.playMetalClick(0.08, 720);
    this.schedule(510, () => this.playMetalClick(0.07, 510));
    this.schedule(1_090, () => this.playMetalClick(0.09, 880));
  }

  public playImpact(): void {
    const context = this.prepareContext();

    if (!context) {
      return;
    }

    const now = context.currentTime;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.getNoiseBuffer(context);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1_900 + Math.random() * 900, now);
    filter.Q.setValueAtTime(1.2, now);
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    source.connect(filter).connect(gain).connect(this.getMasterGain(context));
    source.start(now);
    source.stop(now + 0.075);
  }

  public playHitConfirmation(eliminated: boolean): void {
    const baseFrequency = eliminated ? 820 : 620;
    this.playTone(baseFrequency, baseFrequency * 1.2, 0.055, 0.045, "sine");

    if (eliminated) {
      this.schedule(65, () => {
        this.playTone(980, 1_180, 0.065, 0.05, "sine");
      });
    }
  }

  public playFootstep(sprinting: boolean): void {
    const context = this.prepareContext();

    if (!context) {
      return;
    }

    const now = context.currentTime;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.getNoiseBuffer(context);
    source.playbackRate.setValueAtTime(0.72 + Math.random() * 0.13, now);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(sprinting ? 310 : 250, now);
    gain.gain.setValueAtTime(sprinting ? 0.06 : 0.042, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    source.connect(filter).connect(gain).connect(this.getMasterGain(context));
    source.start(now);
    source.stop(now + 0.12);
  }

  public playPlayerDamage(): void {
    this.playTone(105, 48, 0.22, 0.11, "sawtooth");
    const context = this.prepareContext();

    if (!context) {
      return;
    }

    const now = context.currentTime;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.getNoiseBuffer(context);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(520, now);
    gain.gain.setValueAtTime(0.065, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    source.connect(filter).connect(gain).connect(this.getMasterGain(context));
    source.start(now);
    source.stop(now + 0.19);
  }

  public playArmorPickup(): void {
    this.playTone(440, 880, 0.16, 0.06, "sine");
    this.schedule(95, () => this.playTone(660, 1_100, 0.14, 0.05, "triangle"));
  }

  public playArmorDamage(): void {
    this.playTone(300, 210, 0.07, 0.04, "square");
  }

  public playMatchStart(): void {
    this.playTone(330, 520, 0.12, 0.07, "triangle");
    this.schedule(105, () => this.playTone(520, 760, 0.13, 0.065, "triangle"));
  }

  public playMatchEnd(result: "player-win" | "bot-win" | "draw"): void {
    if (result === "player-win") {
      this.playTone(440, 660, 0.18, 0.075, "triangle");
      this.schedule(150, () => this.playTone(660, 880, 0.2, 0.07, "triangle"));
      return;
    }

    if (result === "bot-win") {
      this.playTone(230, 115, 0.3, 0.085, "sawtooth");
      return;
    }

    this.playTone(360, 360, 0.16, 0.065, "triangle");
    this.schedule(150, () => this.playTone(300, 300, 0.16, 0.055, "triangle"));
  }

  private readonly handleToggle = (): void => {
    this.setMuted(!this.muted);
    const context = this.ensureContext();

    if (!this.muted) {
      void context.resume();
      this.playTone(520, 700, 0.08, 0.045, "sine");
    }
  };

  private playGunshot(volume: number, bodyFrequency: number): void {
    const context = this.prepareContext();

    if (!context) {
      return;
    }

    const now = context.currentTime;
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = this.getNoiseBuffer(context);
    noiseFilter.type = "highpass";
    noiseFilter.frequency.setValueAtTime(620, now);
    noiseGain.gain.setValueAtTime(volume, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    noise
      .connect(noiseFilter)
      .connect(noiseGain)
      .connect(this.getMasterGain(context));
    noise.start(now);
    noise.stop(now + 0.1);

    const body = context.createOscillator();
    const bodyGain = context.createGain();
    body.type = "triangle";
    body.frequency.setValueAtTime(bodyFrequency, now);
    body.frequency.exponentialRampToValueAtTime(44, now + 0.08);
    bodyGain.gain.setValueAtTime(volume * 0.75, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
    body.connect(bodyGain).connect(this.getMasterGain(context));
    body.start(now);
    body.stop(now + 0.09);
  }

  private playMetalClick(volume: number, frequency: number): void {
    this.playTone(frequency, frequency * 0.72, 0.055, volume, "square");
  }

  private playTone(
    startFrequency: number,
    endFrequency: number,
    duration: number,
    volume: number,
    shape: OscillatorShape,
  ): void {
    const context = this.prepareContext();

    if (!context) {
      return;
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, endFrequency),
      now + duration,
    );
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.getMasterGain(context));
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  private prepareContext(): AudioContext | null {
    if (this.muted) {
      return null;
    }

    const context = this.ensureContext();

    if (context.state === "suspended") {
      void context.resume();
    }

    return context;
  }

  private ensureContext(): AudioContext {
    if (this.context) {
      return this.context;
    }

    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.volume / 100 * 0.36;
    this.masterGain.connect(this.context.destination);
    return this.context;
  }

  private getMasterGain(context: AudioContext): GainNode {
    if (!this.masterGain) {
      this.masterGain = context.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume / 100 * 0.36;
      this.masterGain.connect(context.destination);
    }

    return this.masterGain;
  }

  private getNoiseBuffer(context: AudioContext): AudioBuffer {
    if (this.noiseBuffer) {
      return this.noiseBuffer;
    }

    const frameCount = Math.ceil(context.sampleRate * 0.4);
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const samples = buffer.getChannelData(0);

    for (let index = 0; index < samples.length; index += 1) {
      const envelope = 1 - index / samples.length;
      samples[index] = (Math.random() * 2 - 1) * envelope;
    }

    this.noiseBuffer = buffer;
    return buffer;
  }

  private schedule(delayMs: number, callback: () => void): void {
    const timeout = window.setTimeout(() => {
      this.scheduledTimeouts.delete(timeout);
      callback();
    }, delayMs);
    this.scheduledTimeouts.add(timeout);
  }

  private updateHud(): void {
    this.hud.toggleButton.dataset.muted = String(this.muted);
    this.hud.toggleButton.setAttribute("aria-pressed", String(this.muted));
    this.hud.toggleButton.title = this.muted ? "Enable sound" : "Mute sound";
    this.hud.status.textContent = this.muted ? "Sound off" : "Sound on";
  }

  private notifyStateChanged(): void {
    for (const listener of this.stateChangeListeners) {
      listener();
    }
  }
}
