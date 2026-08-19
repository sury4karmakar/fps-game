import type { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Disposable } from "../../../core/contracts";
import { BotView } from "../../../entities/bot/BotView";

/**
 * Owns the Movement Training destination bot. This intentionally composes only
 * the shared view and idle animation: it does not create BotAI, a combatant,
 * a hit target, or any respawn/scoring work.
 */
export class MovementTrainingPracticeBotController implements Disposable {
  private readonly view: BotView;

  public constructor(scene: Scene, position: Vector3, facingTarget: Vector3) {
    this.view = new BotView(scene, {
      namePrefix: "movement-training-practice-bot",
      position,
      facingTarget,
      damageable: false,
      collisionEnabled: false,
    });
  }

  public dispose(): void {
    this.view.dispose();
  }
}
