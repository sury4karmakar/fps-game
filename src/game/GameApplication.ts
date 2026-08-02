import { Engine } from "@babylonjs/core/Engines/engine.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { createScene } from "./createScene";
import type { PlayerController } from "./player/PlayerController";

export class GameApplication {
  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private playerController: PlayerController | null = null;

  private readonly handleResize = (): void => {
    this.engine?.resize();
  };

  public constructor(private readonly canvas: HTMLCanvasElement) {}

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

    const gameScene = createScene(this.engine, this.canvas);
    this.scene = gameScene.scene;
    this.playerController = gameScene.playerController;
    await this.scene.whenReadyAsync();

    this.engine.runRenderLoop(() => {
      this.scene?.render();
    });

    window.addEventListener("resize", this.handleResize);
  }

  public dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    this.engine?.stopRenderLoop();
    this.playerController?.dispose();
    this.scene?.dispose();
    this.engine?.dispose();
    this.playerController = null;
    this.scene = null;
    this.engine = null;
  }
}
