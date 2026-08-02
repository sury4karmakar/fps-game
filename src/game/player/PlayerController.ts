import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Ray } from "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ArenaSpawnPoint } from "../arena/arenaTypes";

const WALK_SPEED = 0.34;
const SPRINT_SPEED = 0.58;
const JUMP_SPEED = 6.2;
const GRAVITY = 18;
const EYE_HEIGHT = 1.7;
const GROUND_CHECK_DISTANCE = 6;
const GROUND_SNAP_DISTANCE = 0.12;
const MAX_STEP_HEIGHT = 0.24;
const MIN_JUMP_INTERVAL_MS = 180;

const KEY_W = 87;
const KEY_A = 65;
const KEY_S = 83;
const KEY_D = 68;

export class PlayerController {
  public readonly camera: FreeCamera;

  private readonly groundRay = new Ray(
    Vector3.Zero(),
    new Vector3(0, -1, 0),
    GROUND_CHECK_DISTANCE,
  );
  private readonly beforeRenderObserver: Observer<Scene>;
  private isSprinting = false;
  private isGrounded = false;
  private lastJumpAt = Number.NEGATIVE_INFINITY;
  private verticalVelocity = 0;

  public constructor(
    private readonly scene: Scene,
    private readonly canvas: HTMLCanvasElement,
    spawnPoint: ArenaSpawnPoint,
    private readonly collidableMeshes: readonly AbstractMesh[],
  ) {
    this.camera = new FreeCamera(
      "player-camera",
      spawnPoint.position.add(new Vector3(0, EYE_HEIGHT, 0)),
      scene,
    );
    this.camera.setTarget(spawnPoint.facingTarget);
    this.configureCamera();

    this.beforeRenderObserver = scene.onBeforeRenderObservable.add(() => {
      this.camera.speed = this.isSprinting ? SPRINT_SPEED : WALK_SPEED;
      this.updateVerticalMotion();
    });

    this.canvas.addEventListener("click", this.requestPointerLock);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    window.addEventListener("keydown", this.handleKeyDown, { passive: false });
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.resetInput);
  }

  public dispose(): void {
    this.scene.onBeforeRenderObservable.remove(this.beforeRenderObserver);
    this.camera.detachControl();
    this.canvas.removeEventListener("click", this.requestPointerLock);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.resetInput);
    this.camera.dispose();
  }

  private configureCamera(): void {
    this.camera.attachControl(false);
    this.camera.keysUp = [KEY_W];
    this.camera.keysLeft = [KEY_A];
    this.camera.keysDown = [KEY_S];
    this.camera.keysRight = [KEY_D];
    this.camera.keysUpward = [];
    this.camera.keysDownward = [];
    this.camera.keysRotateLeft = [];
    this.camera.keysRotateRight = [];
    this.camera.keysRotateUp = [];
    this.camera.keysRotateDown = [];

    this.camera.speed = WALK_SPEED;
    this.camera.angularSensibility = 3200;
    this.camera.inertia = 0.72;
    this.camera.minZ = 0.1;

    this.camera.checkCollisions = true;
    this.camera.applyGravity = false;
    this.camera.needMoveForGravity = false;
    this.camera.ellipsoid = new Vector3(0.42, 0.85, 0.42);
    this.camera.ellipsoidOffset = new Vector3(0, -0.85, 0);
  }

  private readonly requestPointerLock = (): void => {
    if (document.pointerLockElement !== this.canvas) {
      void this.canvas.requestPointerLock?.();
    }
  };

  private readonly handlePointerLockChange = (): void => {
    const isLocked = document.pointerLockElement === this.canvas;
    this.canvas.dataset.pointerLocked = String(isLocked);

    if (!isLocked) {
      this.resetInput();
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (document.pointerLockElement !== this.canvas) {
      return;
    }

    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      this.isSprinting = true;
      return;
    }

    if (event.code === "Space" || event.key === " ") {
      event.preventDefault();
      this.tryJump();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      this.isSprinting = false;
    }
  };

  private readonly resetInput = (): void => {
    this.isSprinting = false;
  };

  private tryJump(): void {
    const now = performance.now();

    if (now - this.lastJumpAt < MIN_JUMP_INTERVAL_MS || !this.isGrounded) {
      return;
    }

    this.verticalVelocity = JUMP_SPEED;
    this.isGrounded = false;
    this.lastJumpAt = now;
  }

  private updateVerticalMotion(): void {
    const deltaSeconds = Math.min(this.scene.getEngine().getDeltaTime() / 1000, 0.05);
    const groundHeight = this.getGroundHeight();

    if (groundHeight !== null) {
      const distanceAboveGround = this.camera.position.y - groundHeight;

      if (
        this.verticalVelocity <= 0 &&
        distanceAboveGround <= GROUND_SNAP_DISTANCE
      ) {
        this.camera.position.y = groundHeight;
        this.verticalVelocity = 0;
        this.isGrounded = true;
        return;
      }

      if (
        this.verticalVelocity <= 0 &&
        distanceAboveGround < 0 &&
        Math.abs(distanceAboveGround) <= MAX_STEP_HEIGHT
      ) {
        this.camera.position.y = groundHeight;
        this.verticalVelocity = 0;
        this.isGrounded = true;
        return;
      }
    }

    this.verticalVelocity -= GRAVITY * deltaSeconds;
    this.camera.position.y += this.verticalVelocity * deltaSeconds;
    this.isGrounded = false;

    const landingHeight = this.getGroundHeight();
    if (
      this.verticalVelocity <= 0 &&
      landingHeight !== null &&
      this.camera.position.y <= landingHeight
    ) {
      this.camera.position.y = landingHeight;
      this.verticalVelocity = 0;
      this.isGrounded = true;
    }
  }

  private getGroundHeight(): number | null {
    this.groundRay.origin.copyFrom(this.camera.position);

    const hit = this.scene.pickWithRay(
      this.groundRay,
      (mesh) => this.collidableMeshes.includes(mesh),
      false,
    );

    if (!hit?.hit || !hit.pickedPoint) {
      return null;
    }

    return hit.pickedPoint.y + EYE_HEIGHT;
  }
}
