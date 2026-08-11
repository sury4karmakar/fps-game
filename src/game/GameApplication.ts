import { Engine } from "@babylonjs/core/Engines/engine.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { createScene } from "./createScene";
import type { AudioHudElements, AudioSystem } from "./audio/AudioSystem";
import type { BotAI } from "./bot/BotAI";
import type { CombatHudElements, CombatSystem } from "./combat/CombatSystem";
import {
  DEFAULT_MATCH_CONFIGURATION,
  type MatchConfiguration,
} from "./config/gameConfig";
import type { MatchHudElements, MatchManager } from "./match/MatchManager";
import type { PlayerController } from "./player/PlayerController";
import type { WeaponHudElements, WeaponSystem } from "./weapon/WeaponSystem";
import {
  SettingsManager,
  type GraphicsQualityId,
  type SettingsHudElements,
} from "./settings/SettingsManager";

export interface GameApplicationOptions {
  readonly matchDurationMs?: number;
  readonly matchConfiguration?: MatchConfiguration;
}

export class GameApplication {
  private engine: Engine | null = null;
  private audioSystem: AudioSystem | null = null;
  private scene: Scene | null = null;
  private playerController: PlayerController | null = null;
  private combatSystem: CombatSystem | null = null;
  private botAI: BotAI | null = null;
  private weaponSystem: WeaponSystem | null = null;
  private matchManager: MatchManager | null = null;
  private settingsManager: SettingsManager | null = null;
  private shadowGenerator: ShadowGenerator | null = null;

  private readonly handleResize = (): void => {
    this.engine?.resize();
  };

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly weaponHud: WeaponHudElements,
    private readonly combatHud: CombatHudElements,
    private readonly matchHud: MatchHudElements,
    private readonly audioHud: AudioHudElements,
    private readonly settingsHud: SettingsHudElements,
    options: GameApplicationOptions = {},
  ) {
    this.matchDurationMs = options.matchDurationMs;
    this.matchConfiguration =
      options.matchConfiguration ?? DEFAULT_MATCH_CONFIGURATION;
  }

  private readonly matchDurationMs: number | undefined;
  private readonly matchConfiguration: MatchConfiguration;

  public async start(): Promise<void> {
    this.engine = new Engine(
      this.canvas,
      true,
      {
        preserveDrawingBuffer: false,
        stencil: true,
      },
      true,
    );

    const gameScene = createScene(
      this.engine,
      this.canvas,
      this.weaponHud,
      this.combatHud,
      this.matchHud,
      this.audioHud,
      this.matchDurationMs,
      this.matchConfiguration,
    );
    this.scene = gameScene.scene;
    this.audioSystem = gameScene.audioSystem;
    this.playerController = gameScene.playerController;
    this.combatSystem = gameScene.combatSystem;
    this.botAI = gameScene.botAI;
    this.weaponSystem = gameScene.weaponSystem;
    this.matchManager = gameScene.matchManager;
    this.shadowGenerator = gameScene.shadowGenerator;
    this.settingsManager = new SettingsManager(
      this.settingsHud,
      gameScene.playerController,
      gameScene.audioSystem,
      { applyGraphicsQuality: this.applyGraphicsQuality },
    );
    await this.scene.whenReadyAsync();

    this.engine.runRenderLoop(() => {
      this.scene?.render();
    });

    window.addEventListener("resize", this.handleResize);
  }

  public dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    this.engine?.stopRenderLoop();
    this.matchManager?.dispose();
    this.settingsManager?.dispose();
    this.weaponSystem?.dispose();
    this.botAI?.dispose();
    this.combatSystem?.dispose();
    this.playerController?.dispose();
    this.audioSystem?.dispose();
    this.scene?.dispose();
    this.engine?.dispose();
    this.playerController = null;
    this.audioSystem = null;
    this.combatSystem = null;
    this.botAI = null;
    this.weaponSystem = null;
    this.matchManager = null;
    this.settingsManager = null;
    this.shadowGenerator = null;
    this.scene = null;
    this.engine = null;
  }

  private readonly applyGraphicsQuality = (quality: GraphicsQualityId): void => {
    const settings = {
      performance: { hardwareScaling: 1.65, shadowDarkness: 0, filtering: ShadowGenerator.QUALITY_LOW },
      balanced: { hardwareScaling: 1.25, shadowDarkness: 0.2, filtering: ShadowGenerator.QUALITY_MEDIUM },
      high: { hardwareScaling: 1, shadowDarkness: 0.28, filtering: ShadowGenerator.QUALITY_HIGH },
    }[quality];
    this.engine?.setHardwareScalingLevel(settings.hardwareScaling);
    if (this.shadowGenerator) {
      this.shadowGenerator.setDarkness(settings.shadowDarkness);
      this.shadowGenerator.filteringQuality = settings.filtering;
    }
    this.engine?.resize();
  };
}
