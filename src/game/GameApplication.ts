import { Engine } from "@babylonjs/core/Engines/engine.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { createScene } from "./createScene";
import type { AudioHudElements, AudioSystem } from "./audio/AudioSystem";
import type { BotAI } from "./bot/BotAI";
import type { CombatHudElements, CombatSystem } from "./combat/CombatSystem";
import type { MatchHudElements, MatchManager } from "./match/MatchManager";
import type { PlayerController } from "./player/PlayerController";
import type { WeaponHudElements, WeaponSystem } from "./weapon/WeaponSystem";

export class GameApplication {
  private engine: Engine | null = null;
  private audioSystem: AudioSystem | null = null;
  private scene: Scene | null = null;
  private playerController: PlayerController | null = null;
  private combatSystem: CombatSystem | null = null;
  private botAI: BotAI | null = null;
  private weaponSystem: WeaponSystem | null = null;
  private matchManager: MatchManager | null = null;

  private readonly handleResize = (): void => {
    this.engine?.resize();
  };

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly weaponHud: WeaponHudElements,
    private readonly combatHud: CombatHudElements,
    private readonly matchHud: MatchHudElements,
    private readonly audioHud: AudioHudElements,
    private readonly matchDurationMs?: number,
  ) {}

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
    );
    this.scene = gameScene.scene;
    this.audioSystem = gameScene.audioSystem;
    this.playerController = gameScene.playerController;
    this.combatSystem = gameScene.combatSystem;
    this.botAI = gameScene.botAI;
    this.weaponSystem = gameScene.weaponSystem;
    this.matchManager = gameScene.matchManager;
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
    this.scene = null;
    this.engine = null;
  }
}
