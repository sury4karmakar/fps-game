import { Engine } from "@babylonjs/core/Engines/engine.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { createScene, type SceneBuildResult } from "./createScene";
import type { AudioHudElements } from "./audio/AudioSystem";
import type { CombatHudElements } from "./combat/CombatSystem";
import {
  DEFAULT_MATCH_CONFIGURATION,
  type MatchConfiguration,
} from "./config/gameConfig";
import type {
  MatchHudElements,
  MatchStartRequestHandler,
} from "./match/MatchManager";
import type { WeaponHudElements } from "./weapon/WeaponSystem";
import {
  SettingsManager,
  type GraphicsQualityId,
  type SettingsHudElements,
} from "./settings/SettingsManager";

export interface GameApplicationOptions {
  readonly matchDurationMs?: number;
  readonly matchConfiguration?: MatchConfiguration;
  readonly onMatchStartRequested?: MatchStartRequestHandler;
}

export class GameApplication {
  private engine: Engine | null = null;
  private runtime: SceneBuildResult | null = null;
  private settingsManager: SettingsManager | null = null;
  private isRenderLoopRunning = false;

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
    this.onMatchStartRequested = options.onMatchStartRequested;
  }

  private readonly matchDurationMs: number | undefined;
  private matchConfiguration: MatchConfiguration;
  private readonly onMatchStartRequested: MatchStartRequestHandler | undefined;

  public async start(): Promise<void> {
    if (this.engine) {
      await this.loadMatch(this.matchConfiguration);
      return;
    }

    this.engine = new Engine(
      this.canvas,
      true,
      {
        preserveDrawingBuffer: false,
        stencil: true,
      },
      true,
    );

    try {
      await this.loadMatch(this.matchConfiguration);
      this.engine.runRenderLoop(() => this.runtime?.scene.render());
      this.isRenderLoopRunning = true;
      window.addEventListener("resize", this.handleResize);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  /**
   * Replaces the active arena and all map-bound gameplay systems. The engine,
   * canvas, render loop, and HUD controls remain in place across map changes.
   */
  public async loadMatch(
    matchConfiguration: MatchConfiguration,
    startImmediately = false,
  ): Promise<void> {
    if (!this.engine) {
      throw new Error("The game engine must be started before loading a match.");
    }

    this.disposeSceneResources();

    let gameScene: Awaited<ReturnType<typeof createScene>> | null = null;
    try {
      gameScene = await createScene(
        this.engine,
        this.canvas,
        this.weaponHud,
        this.combatHud,
        this.matchHud,
        this.audioHud,
        this.matchDurationMs,
        matchConfiguration,
        this.onMatchStartRequested,
      );
      // Register resources before waiting so a readiness failure follows the
      // same complete disposal path as any later scene replacement.
      this.runtime = gameScene;
      await gameScene.scene.whenReadyAsync();

      this.settingsManager = new SettingsManager(
        this.settingsHud,
        gameScene.playerSettings,
        gameScene.audioSettings,
        { applyGraphicsQuality: this.applyGraphicsQuality },
      );
      this.matchConfiguration = matchConfiguration;
      if (startImmediately) {
        gameScene.match.startMatch();
      }
    } catch (error) {
      this.disposeSceneResources();
      const reason = error instanceof Error ? ` ${error.message}` : "";
      throw new Error(
        `Unable to load the ${matchConfiguration.selectedMapId} match.${reason}`,
      );
    }
  }

  public dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    if (this.isRenderLoopRunning) {
      this.engine?.stopRenderLoop();
      this.isRenderLoopRunning = false;
    }
    this.disposeSceneResources();
    this.engine?.dispose();
    this.engine = null;
  }

  private disposeSceneResources(): void {
    this.settingsManager?.dispose();
    this.runtime?.dispose();
    this.settingsManager = null;
    this.runtime = null;
  }

  private readonly applyGraphicsQuality = (quality: GraphicsQualityId): void => {
    const settings = {
      performance: { hardwareScaling: 1.65, shadowDarkness: 0, filtering: ShadowGenerator.QUALITY_LOW },
      balanced: { hardwareScaling: 1.25, shadowDarkness: 0.2, filtering: ShadowGenerator.QUALITY_MEDIUM },
      high: { hardwareScaling: 1, shadowDarkness: 0.28, filtering: ShadowGenerator.QUALITY_HIGH },
    }[quality];
    this.engine?.setHardwareScalingLevel(settings.hardwareScaling);
    if (this.runtime) {
      this.runtime.shadowGenerator.setDarkness(settings.shadowDarkness);
      this.runtime.shadowGenerator.filteringQuality = settings.filtering;
    }
    this.engine?.resize();
  };
}
