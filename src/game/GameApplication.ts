import { Engine } from "@babylonjs/core/Engines/engine.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { createScene } from "./createScene";
import type { BotAI } from "./bot/BotAI";
import type { CombatHudElements, CombatSystem } from "./combat/CombatSystem";
import type { PlayerController } from "./player/PlayerController";
import type { WeaponHudElements, WeaponSystem } from "./weapon/WeaponSystem";

export class GameApplication {
  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private playerController: PlayerController | null = null;
  private combatSystem: CombatSystem | null = null;
  private botAI: BotAI | null = null;
  private weaponSystem: WeaponSystem | null = null;

  private readonly handleResize = (): void => {
    this.engine?.resize();
  };

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly weaponHud: WeaponHudElements,
    private readonly combatHud: CombatHudElements,
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
    );
    this.scene = gameScene.scene;
    this.playerController = gameScene.playerController;
    this.combatSystem = gameScene.combatSystem;
    this.botAI = gameScene.botAI;
    this.weaponSystem = gameScene.weaponSystem;
    await this.scene.whenReadyAsync();

    this.engine.runRenderLoop(() => {
      this.scene?.render();
    });

    window.addEventListener("resize", this.handleResize);
  }

  public dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    this.engine?.stopRenderLoop();
    this.weaponSystem?.dispose();
    this.botAI?.dispose();
    this.combatSystem?.dispose();
    this.playerController?.dispose();
    this.scene?.dispose();
    this.engine?.dispose();
    this.playerController = null;
    this.combatSystem = null;
    this.botAI = null;
    this.weaponSystem = null;
    this.scene = null;
    this.engine = null;
  }
}
