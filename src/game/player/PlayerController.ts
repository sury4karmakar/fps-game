import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Ray } from "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ArenaSpawnPoint } from "../arena/arenaTypes";

const WALK_SPEED = 0.40;
const SPRINT_SPEED = 0.60;
const CROUCH_SPEED = 0.25;
const JUMP_SPEED = 6.2;
const GRAVITY = 18;
const STANDING_EYE_HEIGHT = 1.7;
const CROUCH_EYE_HEIGHT = 1.08;
const STANDING_COLLIDER_HEIGHT = 0.85;
const CROUCH_COLLIDER_HEIGHT = 0.5;
const CROUCH_TRANSITION_SPEED = 4.8;
const GROUND_CHECK_DISTANCE = 6;
const GROUND_SNAP_DISTANCE = 0.12;
const MAX_STEP_HEIGHT = 0.24;
const MIN_JUMP_INTERVAL_MS = 180;
const WALK_FOOTSTEP_DISTANCE = 1.45;
const SPRINT_FOOTSTEP_DISTANCE = 1.15;
const MIN_FOOTSTEP_INTERVAL_MS = 210;
const DEFAULT_MOUSE_SENSITIVITY = 1;
const MIN_MOUSE_SENSITIVITY = 0.35;
const MAX_MOUSE_SENSITIVITY = 2;

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
  private readonly ceilingRay = new Ray(
    Vector3.Zero(),
    Vector3.Up(),
    STANDING_EYE_HEIGHT - CROUCH_EYE_HEIGHT + STANDING_COLLIDER_HEIGHT,
  );
  private readonly movementObserver: Observer<Scene>;
  private readonly lastFootstepPosition = Vector3.Zero();
  private footstepDistance = 0;
  private currentEyeHeight = STANDING_EYE_HEIGHT;
  private isCrouchRequested = false;
  private isEnabled = true;
  private isSprinting = false;
  private isGrounded = false;
  private lastJumpAt = Number.NEGATIVE_INFINITY;
  private lastFootstepAt = Number.NEGATIVE_INFINITY;
  private verticalVelocity = 0;

  public constructor(
    private readonly scene: Scene,
    private readonly canvas: HTMLCanvasElement,
    spawnPoint: ArenaSpawnPoint,
    private readonly collidableMeshes: readonly AbstractMesh[],
    private readonly playFootstep: (sprinting: boolean) => void,
  ) {
    this.camera = new FreeCamera(
      "player-camera",
      spawnPoint.position.add(new Vector3(0, STANDING_EYE_HEIGHT, 0)),
      scene,
    );
    this.camera.setTarget(spawnPoint.facingTarget);
    this.configureCamera();
    this.lastFootstepPosition.copyFrom(this.camera.position);

    this.movementObserver = scene.onAfterAnimationsObservable.add(() => {
      if (!this.isEnabled) {
        this.camera.speed = 0;
        return;
      }

      const deltaSeconds = Math.min(
        this.scene.getEngine().getDeltaTime() / 1_000,
        0.05,
      );
      this.updateCrouch(deltaSeconds);
      this.camera.speed = this.isCrouching()
        ? CROUCH_SPEED
        : this.isSprinting
          ? SPRINT_SPEED
          : WALK_SPEED;
      this.updateVerticalMotion();
      this.updateFootsteps();
    });

    this.canvas.addEventListener("click", this.requestPointerLock);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    window.addEventListener("keydown", this.handleKeyDown, {
      passive: false,
      capture: true,
    });
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.resetInput);
  }

  public dispose(): void {
    this.scene.onAfterAnimationsObservable.remove(this.movementObserver);
    this.camera.detachControl();
    this.canvas.removeEventListener("click", this.requestPointerLock);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    window.removeEventListener("keydown", this.handleKeyDown, true);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.resetInput);
    this.camera.dispose();
  }

  public setEnabled(enabled: boolean): void {
    if (this.isEnabled === enabled) {
      return;
    }

    this.isEnabled = enabled;
    this.resetInput();
    this.verticalVelocity = 0;

    if (enabled) {
      this.camera.attachControl(false);
      return;
    }

    this.camera.detachControl();
    this.camera.speed = 0;

    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }
  }

  public respawn(spawnPoint: ArenaSpawnPoint): void {
    this.camera.position.copyFrom(
      spawnPoint.position.add(new Vector3(0, STANDING_EYE_HEIGHT, 0)),
    );
    this.camera.setTarget(spawnPoint.facingTarget);
    this.verticalVelocity = 0;
    this.currentEyeHeight = STANDING_EYE_HEIGHT;
    this.camera.ellipsoid.y = STANDING_COLLIDER_HEIGHT;
    this.isCrouchRequested = false;
    this.isGrounded = false;
    this.lastJumpAt = Number.NEGATIVE_INFINITY;
    this.lastFootstepAt = Number.NEGATIVE_INFINITY;
    this.footstepDistance = 0;
    this.lastFootstepPosition.copyFrom(this.camera.position);
    this.setEnabled(true);
  }

  public setMouseSensitivity(value: number): number {
    const sensitivity = Math.min(
      MAX_MOUSE_SENSITIVITY,
      Math.max(MIN_MOUSE_SENSITIVITY, Number.isFinite(value) ? value : DEFAULT_MOUSE_SENSITIVITY),
    );
    // Babylon's angular sensibility is inverse: lower values turn faster.
    this.camera.angularSensibility = 3_200 / sensitivity;
    return sensitivity;
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
    this.camera.ellipsoid = new Vector3(
      0.38,
      STANDING_COLLIDER_HEIGHT,
      0.38,
    );
    this.camera.ellipsoidOffset = Vector3.Zero();
  }

  private readonly requestPointerLock = (): void => {
    if (this.isEnabled && document.pointerLockElement !== this.canvas) {
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
    if (!this.isEnabled || document.pointerLockElement !== this.canvas) {
      return;
    }

    if (
      event.ctrlKey &&
      (event.code === "KeyW" ||
        event.code === "KeyA" ||
        event.code === "KeyS" ||
        event.code === "KeyD")
    ) {
      // Keep crouch + movement inside the game instead of allowing browser
      // shortcuts such as Ctrl+W to handle the movement key.
      event.preventDefault();
    }

    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      if (!this.isCrouchRequested) {
        this.isSprinting = true;
      }
      return;
    }

    if (event.code === "ControlLeft") {
      event.preventDefault();
      this.isCrouchRequested = true;
      this.isSprinting = false;
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
      return;
    }

    if (event.code === "ControlLeft") {
      event.preventDefault();
      this.isCrouchRequested = false;
    }
  };

  private readonly resetInput = (): void => {
    this.isSprinting = false;
    this.isCrouchRequested = false;
  };

  private tryJump(): void {
    const now = performance.now();

    if (
      now - this.lastJumpAt < MIN_JUMP_INTERVAL_MS ||
      !this.isGrounded ||
      this.isCrouching()
    ) {
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

  private updateCrouch(deltaSeconds: number): void {
    const wantsToStand = !this.isCrouchRequested;
    const canStand = !wantsToStand || this.hasStandingClearance();
    const targetEyeHeight = wantsToStand && canStand
      ? STANDING_EYE_HEIGHT
      : CROUCH_EYE_HEIGHT;
    const previousEyeHeight = this.currentEyeHeight;
    const maximumChange = CROUCH_TRANSITION_SPEED * deltaSeconds;

    if (this.currentEyeHeight < targetEyeHeight) {
      this.currentEyeHeight = Math.min(
        targetEyeHeight,
        this.currentEyeHeight + maximumChange,
      );
    } else if (this.currentEyeHeight > targetEyeHeight) {
      this.currentEyeHeight = Math.max(
        targetEyeHeight,
        this.currentEyeHeight - maximumChange,
      );
    }

    const crouchProgress =
      (STANDING_EYE_HEIGHT - this.currentEyeHeight) /
      (STANDING_EYE_HEIGHT - CROUCH_EYE_HEIGHT);
    this.camera.ellipsoid.y =
      STANDING_COLLIDER_HEIGHT +
      (CROUCH_COLLIDER_HEIGHT - STANDING_COLLIDER_HEIGHT) * crouchProgress;

    if (this.isGrounded) {
      this.camera.position.y += this.currentEyeHeight - previousEyeHeight;
    }
  }

  private hasStandingClearance(): boolean {
    if (this.currentEyeHeight >= STANDING_EYE_HEIGHT - 0.01) {
      return true;
    }

    this.ceilingRay.origin.copyFrom(this.camera.position);
    this.ceilingRay.length =
      STANDING_EYE_HEIGHT - this.currentEyeHeight + STANDING_COLLIDER_HEIGHT;
    const hit = this.scene.pickWithRay(
      this.ceilingRay,
      (mesh) => this.collidableMeshes.includes(mesh),
      false,
    );
    return hit?.hit !== true;
  }

  private isCrouching(): boolean {
    return this.currentEyeHeight < STANDING_EYE_HEIGHT - 0.05;
  }

  private updateFootsteps(): void {
    const deltaX = this.camera.position.x - this.lastFootstepPosition.x;
    const deltaZ = this.camera.position.z - this.lastFootstepPosition.z;
    const horizontalDistance = Math.hypot(deltaX, deltaZ);
    this.lastFootstepPosition.copyFrom(this.camera.position);

    if (
      !this.isGrounded ||
      document.pointerLockElement !== this.canvas ||
      horizontalDistance > 1
    ) {
      if (horizontalDistance > 1) {
        this.footstepDistance = 0;
      }
      return;
    }

    this.footstepDistance += horizontalDistance;
    const stepDistance = this.isSprinting
      ? SPRINT_FOOTSTEP_DISTANCE
      : WALK_FOOTSTEP_DISTANCE;
    const now = performance.now();

    if (
      this.footstepDistance >= stepDistance &&
      now - this.lastFootstepAt >= MIN_FOOTSTEP_INTERVAL_MS
    ) {
      this.footstepDistance %= stepDistance;
      this.lastFootstepAt = now;
      this.playFootstep(this.isSprinting);
    }
  }

  private getGroundHeight(): number | null {
    this.groundRay.origin.copyFrom(this.camera.position);

    const hit = this.scene.pickWithRay(
      this.groundRay,
      (mesh) => {
        const metadata = mesh.metadata as { walkableSurface?: boolean } | null;
        return (
          this.collidableMeshes.includes(mesh) && metadata?.walkableSurface === true
        );
      },
      false,
    );

    if (!hit?.hit || !hit.pickedPoint) {
      return null;
    }

    return hit.pickedPoint.y + this.currentEyeHeight;
  }
}
