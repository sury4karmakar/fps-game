import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { isArenaCollisionMesh } from "../arena/arenaTypes";
import {
  DEFAULT_WEAPON_ID,
  WEAPON_DEFINITIONS,
  type WeaponDefinition,
  type WeaponId,
} from "../config/gameConfig";
import type {
  Disposable,
  TrainingAmmoRefillResult,
  TrainingWeaponControlPort,
  WeaponAudioPort,
  WeaponControlPort,
} from "../core/contracts";
import { WeaponImpactEffects } from "../entities/weapon/WeaponImpactEffects";
import { WeaponView } from "../entities/weapon/WeaponView";
import "@babylonjs/core/Shaders/default.fragment.js";
import "@babylonjs/core/Shaders/default.vertex.js";

const WEAPON_IDS: readonly WeaponId[] = [
  "assault-rifle",
  "scattergun",
  "marksman-rifle",
];
const RECOIL_RECOVERY_PER_SECOND = 0.055;
const MUZZLE_FLASH_DURATION_MS = 45;
const HIT_MARKER_DURATION_MS = 110;
const WEAPON_SWITCH_DURATION_MS = 320;
const DEFAULT_FIELD_OF_VIEW = 0.8;
const ADS_TRANSITION_PER_SECOND = 9;

export interface WeaponHudElements {
  readonly crosshair: HTMLElement;
  readonly weaponName: HTMLElement;
  readonly weaponRole: HTMLElement;
  readonly weaponSlots: HTMLElement;
  readonly ammoCount: HTMLElement;
  readonly reloadStatus: HTMLElement;
  readonly hitMarker: HTMLElement;
  readonly trainingFeedback: HTMLElement;
}

export interface WeaponDamageResult {
  readonly damageApplied: boolean;
  readonly eliminated: boolean;
}

interface WeaponAmmoState {
  ammoInMagazine: number;
  reserveAmmo: number;
}

export class WeaponSystem implements WeaponControlPort, TrainingWeaponControlPort {
  private readonly impactEffects: WeaponImpactEffects;
  private readonly models: Readonly<Record<WeaponId, WeaponView>>;
  private readonly ammoByWeapon: Record<WeaponId, WeaponAmmoState>;
  private readonly updateObserver: Observer<Scene>;
  private readonly arenaCollisionMeshes: Set<AbstractMesh>;

  private equippedWeaponId: WeaponId = DEFAULT_WEAPON_ID;
  private isEnabled = true;
  private isReloading = false;
  private isTriggerHeld = false;
  private isAiming = false;
  private aimBlend = 0;
  private nextShotAt = 0;
  private recoilToRecover = 0;
  private reloadFinishesAt = 0;
  private switchStartedAt = 0;
  private switchTargetId: WeaponId | null = null;
  private weaponKick = 0;
  private trainingInventoryEnabled = false;
  private trainingWeaponId: WeaponId | null = null;
  private hitMarkerTimeout: number | null = null;
  private muzzleFlashTimeout: number | null = null;
  private fireFeedbackTimeout: number | null = null;

  public constructor(
    private readonly scene: Scene,
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: FreeCamera,
    collidableMeshes: readonly AbstractMesh[],
    private readonly hud: WeaponHudElements,
    private readonly resolveDamageHit: (
      mesh: AbstractMesh,
      damage: number,
    ) => WeaponDamageResult & { readonly handled?: boolean },
    private readonly notifyWeaponFired: () => void,
    private readonly audioSystem: WeaponAudioPort,
    private readonly isInteractionTarget: (mesh: AbstractMesh) => boolean = () => false,
  ) {
    this.arenaCollisionMeshes = new Set(collidableMeshes);
    this.models = {
      "assault-rifle": new WeaponView(scene, "assault-rifle", { parent: camera, namePrefix: "player", renderingGroupId: 1 }),
      scattergun: new WeaponView(scene, "scattergun", { parent: camera, namePrefix: "player", renderingGroupId: 1 }),
      "marksman-rifle": new WeaponView(scene, "marksman-rifle", { parent: camera, namePrefix: "player", renderingGroupId: 1 }),
    };
    this.ammoByWeapon = this.createStartingAmmo();
    this.impactEffects = new WeaponImpactEffects(scene);
    this.updateObserver = scene.onAfterAnimationsObservable.add(() => this.update());

    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("mousedown", this.handleMouseDown, true);
    this.canvas.addEventListener("contextmenu", this.preventContextMenu);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("mouseup", this.handleMouseUp, true);
    window.addEventListener("pointercancel", this.releaseTrigger);
    window.addEventListener("keydown", this.handleKeyDown, { passive: false });
    window.addEventListener("wheel", this.handleWheel, { passive: false });
    window.addEventListener("blur", this.releaseTrigger);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    this.updateWeaponVisibility();
    this.updateHud();
  }

  public dispose(): void {
    this.scene.onAfterAnimationsObservable.remove(this.updateObserver);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("mousedown", this.handleMouseDown, true);
    this.canvas.removeEventListener("contextmenu", this.preventContextMenu);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("mouseup", this.handleMouseUp, true);
    window.removeEventListener("pointercancel", this.releaseTrigger);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("wheel", this.handleWheel);
    window.removeEventListener("blur", this.releaseTrigger);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    if (this.hitMarkerTimeout !== null) window.clearTimeout(this.hitMarkerTimeout);
    if (this.muzzleFlashTimeout !== null) window.clearTimeout(this.muzzleFlashTimeout);
    if (this.fireFeedbackTimeout !== null) window.clearTimeout(this.fireFeedbackTimeout);
    this.impactEffects.dispose();
    Object.values(this.models).forEach((model) => model.dispose());
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    this.isTriggerHeld = false;
    this.isAiming = false;
    if (!enabled) {
      this.cancelReload();
      this.switchTargetId = null;
      this.switchStartedAt = 0;
    }
    this.updateHud();
  }

  public resetForMatch(): void {
    this.trainingInventoryEnabled = false;
    this.trainingWeaponId = null;
    this.equippedWeaponId = DEFAULT_WEAPON_ID;
    this.isReloading = false;
    this.isTriggerHeld = false;
    this.isAiming = false;
    this.aimBlend = 0;
    this.camera.fov = DEFAULT_FIELD_OF_VIEW;
    this.nextShotAt = 0;
    this.recoilToRecover = 0;
    this.weaponKick = 0;
    this.reloadFinishesAt = 0;
    this.switchStartedAt = 0;
    this.switchTargetId = null;
    Object.assign(this.ammoByWeapon, this.createStartingAmmo());
    this.impactEffects.clear();
    this.hud.hitMarker.classList.remove("is-visible", "is-elimination");
    this.hud.crosshair.classList.remove("is-firing");
    this.updateWeaponVisibility();
    this.updateHud();
    this.showFireFeedback();
    this.hideTrainingFeedback();
  }

  public get hasTrainingWeapon(): boolean {
    return this.trainingInventoryEnabled && this.trainingWeaponId !== null;
  }

  /** Limits Training Ground to one station-selected weapon at a time. */
  public setTrainingInventoryEnabled(enabled: boolean): void {
    if (enabled === this.trainingInventoryEnabled) return;

    this.trainingInventoryEnabled = enabled;
    this.trainingWeaponId = null;
    this.cancelReload();
    this.isTriggerHeld = false;
    this.isAiming = false;
    this.switchTargetId = null;
    this.switchStartedAt = 0;
    this.equippedWeaponId = DEFAULT_WEAPON_ID;
    this.updateWeaponVisibility();
    this.updateHud();
    if (enabled) {
      this.showTrainingFeedback("Collect one weapon from a Shooting Range station.");
    } else {
      this.hideTrainingFeedback();
    }
  }

  public equipTrainingWeapon(weaponId: WeaponId): void {
    if (!this.trainingInventoryEnabled) return;

    const definition = WEAPON_DEFINITIONS[weaponId];
    const wasReplacement = this.trainingWeaponId !== null;
    this.trainingWeaponId = weaponId;
    this.equippedWeaponId = weaponId;
    this.ammoByWeapon[weaponId].ammoInMagazine = definition.magazineCapacity;
    this.ammoByWeapon[weaponId].reserveAmmo = definition.startingReserveAmmo;
    this.cancelReload();
    this.isTriggerHeld = false;
    this.isAiming = false;
    this.switchTargetId = null;
    this.switchStartedAt = 0;
    this.updateWeaponVisibility();
    this.updateHud();
    this.showTrainingFeedback(
      wasReplacement
        ? `${definition.displayName} equipped — previous training weapon replaced.`
        : `${definition.displayName} equipped for training.`,
    );
    this.audioSystem.playTrainingInteraction();
  }

  public refillTrainingWeapon(): TrainingAmmoRefillResult {
    if (!this.trainingInventoryEnabled || !this.trainingWeaponId) {
      this.showTrainingFeedback("Collect a weapon before using the ammunition station.");
      if (this.trainingInventoryEnabled) this.audioSystem.playTrainingInteraction();
      return { status: "no-weapon", added: 0 };
    }

    this.audioSystem.playTrainingInteraction();
    const weaponId = this.trainingWeaponId;
    const definition = WEAPON_DEFINITIONS[weaponId];
    const ammo = this.ammoByWeapon[weaponId];
    const totalAmmo = ammo.ammoInMagazine + ammo.reserveAmmo;
    const added = Math.max(0, definition.maxTotalAmmo - totalAmmo);

    if (added === 0) {
      this.showTrainingFeedback(`${definition.displayName} ammunition is already full.`);
      return { status: "full", added: 0 };
    }

    ammo.reserveAmmo += added;
    this.updateHud();
    this.showTrainingFeedback(`${definition.displayName} ammunition refilled (+${added}).`);
    return { status: "refilled", added };
  }

  public showTrainingWeaponRequired(): void {
    if (this.trainingInventoryEnabled && !this.trainingWeaponId) {
      this.showTrainingFeedback("Collect a weapon before starting training.");
    }
  }

  /** Splits a pickup evenly so no one weapon becomes the only viable choice. */
  public addAmmo(amount: number): number {
    let remaining = Math.max(0, Math.floor(amount));
    let added = 0;
    for (const weaponId of WEAPON_IDS) {
      if (remaining === 0) break;
      const definition = WEAPON_DEFINITIONS[weaponId];
      const ammo = this.ammoByWeapon[weaponId];
      const available = definition.maxTotalAmmo - ammo.ammoInMagazine - ammo.reserveAmmo;
      const granted = Math.min(available, remaining);
      ammo.reserveAmmo += granted;
      remaining -= granted;
      added += granted;
    }
    this.updateHud();
    return added;
  }

  /** Lets a lazy-loaded map section receive impact effects on its collision geometry. */
  public registerCollisionMeshes(meshes: readonly AbstractMesh[]): Disposable {
    meshes.forEach((mesh) => this.arenaCollisionMeshes.add(mesh));
    return {
      dispose: () => meshes.forEach((mesh) => this.arenaCollisionMeshes.delete(mesh)),
    };
  }

  private get definition(): WeaponDefinition {
    return WEAPON_DEFINITIONS[this.equippedWeaponId];
  }

  private get ammo(): WeaponAmmoState {
    return this.ammoByWeapon[this.equippedWeaponId];
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.handleButtonDown(event);
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    this.handleButtonDown(event);
  };

  private handleButtonDown(event: MouseEvent): void {
    if (!this.isEnabled || document.pointerLockElement !== this.canvas) return;
    if (event.button === 2) {
      event.preventDefault();
      if (this.isAiming) return;
      this.isAiming = !this.isReloading && !this.isSwitching;
      return;
    }
    if (event.button !== 0) return;
    event.preventDefault();
    if (this.isTriggerHeld) return;
    this.isTriggerHeld = true;
    this.tryFire(performance.now());
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.handleButtonUp(event);
  };

  private readonly handleMouseUp = (event: MouseEvent): void => {
    this.handleButtonUp(event);
  };

  private handleButtonUp(event: MouseEvent): void {
    if (event.button === 0) this.isTriggerHeld = false;
    if (event.button === 2) this.isAiming = false;
  }

  private readonly preventContextMenu = (event: MouseEvent): void => event.preventDefault();

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.isEnabled || document.pointerLockElement !== this.canvas || event.repeat) return;
    if (event.code === "KeyR") {
      event.preventDefault();
      this.startReload(performance.now());
      return;
    }
    if (this.trainingInventoryEnabled) return;
    const slot = Number(event.key);
    if (slot >= 1 && slot <= WEAPON_IDS.length) {
      event.preventDefault();
      this.equipWeapon(WEAPON_IDS[slot - 1]!);
    }
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.isEnabled || document.pointerLockElement !== this.canvas || event.deltaY === 0) return;
    if (this.trainingInventoryEnabled) return;
    event.preventDefault();
    const current = WEAPON_IDS.indexOf(this.equippedWeaponId);
    const offset = event.deltaY > 0 ? 1 : -1;
    this.equipWeapon(WEAPON_IDS[(current + offset + WEAPON_IDS.length) % WEAPON_IDS.length]!);
  };

  private readonly handlePointerLockChange = (): void => {
    if (document.pointerLockElement !== this.canvas) this.releaseTrigger();
  };

  private readonly releaseTrigger = (): void => {
    this.isTriggerHeld = false;
    this.isAiming = false;
  };

  private update(): void {
    const now = performance.now();
    const deltaSeconds = Math.min(this.scene.getEngine().getDeltaTime() / 1000, 0.05);
    if (this.isReloading && now >= this.reloadFinishesAt) this.finishReload();
    this.updateWeaponSwitch(now);
    if (this.isEnabled && !this.isSwitching && this.isTriggerHeld && this.definition.fireMode === "automatic" && document.pointerLockElement === this.canvas) this.tryFire(now);
    this.updateAim(deltaSeconds);
    this.updateWeaponTransform(deltaSeconds, now);
    this.impactEffects.update(now, deltaSeconds);
  }

  private equipWeapon(weaponId: WeaponId): void {
    if (weaponId === this.equippedWeaponId || this.isSwitching) return;
    this.cancelReload();
    this.isTriggerHeld = false;
    this.isAiming = false;
    this.switchTargetId = weaponId;
    this.switchStartedAt = performance.now();
    this.nextShotAt = this.switchStartedAt + WEAPON_SWITCH_DURATION_MS;
    this.weaponKick = 0;
    this.updateHud();
  }

  private get isSwitching(): boolean {
    return this.switchTargetId !== null;
  }

  private updateWeaponSwitch(now: number): void {
    if (!this.switchTargetId) return;
    const progress = (now - this.switchStartedAt) / WEAPON_SWITCH_DURATION_MS;

    if (progress >= 0.5 && this.equippedWeaponId !== this.switchTargetId) {
      this.equippedWeaponId = this.switchTargetId;
      this.updateWeaponVisibility();
      this.updateHud();
    }

    if (progress >= 1) {
      this.switchTargetId = null;
      this.switchStartedAt = 0;
    }
  }

  private tryFire(now: number): void {
    if (!this.isEnabled || this.isReloading || this.isSwitching || now < this.nextShotAt) return;
    if (this.trainingInventoryEnabled && !this.trainingWeaponId) {
      this.fireTrainingInteraction(now);
      return;
    }
    if (this.ammo.ammoInMagazine === 0) { this.startReload(now); return; }
    this.ammo.ammoInMagazine -= 1;
    this.nextShotAt = now + this.definition.fireIntervalMs;
    if (this.definition.fireMode === "semi-automatic") this.isTriggerHeld = false;
    this.updateHud();
    this.showMuzzleFlash();
    this.audioSystem.playPlayerGunshot();
    this.notifyWeaponFired();
    this.fireHitscan();
    this.applyRecoil();
  }

  /** Allows the Start box to explain the missing weapon without firing combat shots. */
  private fireTrainingInteraction(now: number): void {
    this.nextShotAt = now + 140;
    const ray = this.camera.getForwardRay(WEAPON_DEFINITIONS[DEFAULT_WEAPON_ID].range);
    const hit = this.scene.pickWithRay(ray, this.isHitscanTarget, false);
    if (hit?.hit && hit.pickedMesh && this.isInteractionTarget(hit.pickedMesh)) {
      this.resolveDamageHit(hit.pickedMesh, 0);
    }
  }

  private fireHitscan(): void {
    const definition = this.definition;
    for (let pellet = 0; pellet < definition.projectilesPerShot; pellet += 1) {
      const ray = this.camera.getForwardRay(definition.range);
      ray.direction = this.applySpread(ray.direction, definition.spreadRadians);
      const hit = this.scene.pickWithRay(ray, this.isHitscanTarget, false);
      if (!hit?.hit || !hit.pickedPoint || !hit.pickedMesh) continue;
      const normal = hit.getNormal(true) ?? ray.direction.scale(-1);
      this.impactEffects.add(
        hit.pickedPoint,
        normal,
        hit.pickedMesh,
        this.arenaCollisionMeshes.has(hit.pickedMesh) &&
          isArenaCollisionMesh(hit.pickedMesh),
      );
      const result = this.resolveDamageHit(hit.pickedMesh, definition.damagePerProjectile);
      if (result.damageApplied) {
        this.showHitMarker(result.eliminated);
        this.audioSystem.playHitConfirmation(result.eliminated);
      } else if (!result.handled) {
        this.audioSystem.playImpact();
      }
    }
  }

  private applySpread(direction: Vector3, spreadRadians: number): Vector3 {
    if (spreadRadians === 0) return direction;
    const right = this.camera.getDirection(Vector3.Right());
    const up = this.camera.getDirection(Vector3.Up());
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * Math.tan(spreadRadians);
    return direction.add(right.scale(Math.cos(angle) * distance)).add(up.scale(Math.sin(angle) * distance)).normalize();
  }

  private startReload(now: number): void {
    const { magazineCapacity, reloadDurationMs } = this.definition;
    if (this.isReloading || this.ammo.ammoInMagazine === magazineCapacity || this.ammo.reserveAmmo === 0) return;
    this.isReloading = true;
    this.isTriggerHeld = false;
    this.isAiming = false;
    this.reloadFinishesAt = now + reloadDurationMs;
    this.audioSystem.playReload();
    this.updateHud();
  }

  private finishReload(): void {
    const needed = this.definition.magazineCapacity - this.ammo.ammoInMagazine;
    const loaded = Math.min(needed, this.ammo.reserveAmmo);
    this.ammo.ammoInMagazine += loaded;
    this.ammo.reserveAmmo -= loaded;
    this.isReloading = false;
    this.updateHud();
  }

  private cancelReload(): void { this.isReloading = false; this.reloadFinishesAt = 0; }

  private applyRecoil(): void {
    const recoil = this.definition.recoilKick;
    this.camera.rotation.x = Math.max(this.camera.rotation.x - recoil, -Math.PI / 2 + 0.01);
    this.recoilToRecover += recoil;
    this.weaponKick = Math.min(this.weaponKick + recoil * 5.4, 0.15);
  }

  private updateAim(deltaSeconds: number): void {
    const targetBlend = this.isAiming && !this.isReloading && !this.isSwitching ? 1 : 0;
    const maximumChange = ADS_TRANSITION_PER_SECOND * deltaSeconds;
    this.aimBlend += Math.max(
      -maximumChange,
      Math.min(maximumChange, targetBlend - this.aimBlend),
    );
    this.camera.fov = this.lerp(
      DEFAULT_FIELD_OF_VIEW,
      this.definition.adsFieldOfView,
      this.aimBlend,
    );
    this.hud.crosshair.classList.toggle("is-aiming", this.aimBlend > 0.65);
  }

  private updateWeaponTransform(deltaSeconds: number, now: number): void {
    if (this.recoilToRecover > 0) {
      const recovery = Math.min(this.recoilToRecover, RECOIL_RECOVERY_PER_SECOND * deltaSeconds);
      this.camera.rotation.x += recovery;
      this.recoilToRecover -= recovery;
    }
    this.weaponKick = Math.max(0, this.weaponKick - 0.5 * deltaSeconds);
    const model = this.models[this.equippedWeaponId];
    model.root.position.set(
      this.lerp(0.31, 0.06, this.aimBlend),
      this.lerp(-0.29, -0.18, this.aimBlend),
      this.lerp(0.58, 0.43, this.aimBlend) - this.weaponKick,
    );
    model.root.rotation.set(
      -0.025 + this.weaponKick * 0.35,
      this.lerp(-0.025, 0, this.aimBlend),
      0,
    );
    model.magazine.position.set(0, -0.2, 0.08);
    model.magazine.rotation.set(-0.16, 0, 0);
    model.magazine.visibility = 1;
    if (this.isSwitching) {
      const progress = Math.max(
        0,
        Math.min(1, (now - this.switchStartedAt) / WEAPON_SWITCH_DURATION_MS),
      );
      const lowerAmount = Math.sin(progress * Math.PI);
      model.root.position.y -= lowerAmount * 0.34;
      model.root.position.z -= lowerAmount * 0.14;
      model.root.rotation.x += lowerAmount * 0.4;
      model.root.rotation.z += lowerAmount * 0.22;
    }
    if (this.isReloading) {
      const progress = 1 - (this.reloadFinishesAt - performance.now()) / this.definition.reloadDurationMs;
      const pose = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI);
      model.root.position.y -= pose * 0.16;
      model.root.position.x += pose * 0.07;
      model.root.rotation.z += pose * 0.52;
      if (progress >= 0.2 && progress < 0.42) {
        const removal = (progress - 0.2) / 0.22;
        model.magazine.position.y -= removal * 0.32;
        model.magazine.rotation.z += removal * 0.18;
      } else if (progress >= 0.42 && progress < 0.57) {
        model.magazine.visibility = 0;
      } else if (progress >= 0.57 && progress < 0.82) {
        const insertion = (progress - 0.57) / 0.25;
        model.magazine.position.y -= (1 - insertion) * 0.32;
        model.magazine.rotation.z += (1 - insertion) * 0.18;
      }
    }
  }

  private updateWeaponVisibility(): void {
    for (const [weaponId, model] of Object.entries(this.models) as [WeaponId, WeaponView][]) {
      const selected = this.trainingInventoryEnabled
        ? weaponId === this.trainingWeaponId
        : weaponId === this.equippedWeaponId;
      model.root.setEnabled(selected);
      model.muzzleFlash.setEnabled(false);
    }
  }

  private showMuzzleFlash(): void {
    const muzzleFlash = this.models[this.equippedWeaponId].muzzleFlash;
    muzzleFlash.setEnabled(true);
    muzzleFlash.scaling.setAll(0.75 + Math.random() * 0.5);
    if (this.muzzleFlashTimeout !== null) window.clearTimeout(this.muzzleFlashTimeout);
    this.muzzleFlashTimeout = window.setTimeout(() => {
      muzzleFlash.setEnabled(false);
      this.muzzleFlashTimeout = null;
    }, MUZZLE_FLASH_DURATION_MS);
  }

  private showFireFeedback(): void {
    this.hud.crosshair.classList.add("is-firing");
    if (this.fireFeedbackTimeout !== null) window.clearTimeout(this.fireFeedbackTimeout);
    this.fireFeedbackTimeout = window.setTimeout(() => {
      this.hud.crosshair.classList.remove("is-firing");
      this.fireFeedbackTimeout = null;
    }, 90);
  }

  private showHitMarker(eliminated: boolean): void {
    this.hud.hitMarker.classList.toggle("is-elimination", eliminated);
    this.hud.hitMarker.classList.add("is-visible");
    if (this.hitMarkerTimeout !== null) window.clearTimeout(this.hitMarkerTimeout);
    this.hitMarkerTimeout = window.setTimeout(() => {
      this.hud.hitMarker.classList.remove("is-visible", "is-elimination");
      this.hitMarkerTimeout = null;
    }, HIT_MARKER_DURATION_MS);
  }

  private readonly isHitscanTarget = (mesh: AbstractMesh): boolean => {
    if (this.arenaCollisionMeshes.has(mesh) && isArenaCollisionMesh(mesh)) {
      return true;
    }

    const metadata = mesh.metadata as { combatantId?: string } | null;
    return metadata?.combatantId === "bot" || this.isInteractionTarget(mesh);
  };

  private updateHud(): void {
    if (this.trainingInventoryEnabled && !this.trainingWeaponId) {
      this.hud.weaponName.textContent = "No Training Weapon";
      this.hud.weaponRole.textContent = "Collect one weapon from a Shooting Range station.";
      this.hud.weaponSlots.innerHTML = "<span class=\"weapon-slot\">Training inventory: empty</span>";
      this.hud.ammoCount.textContent = "-- / --";
      this.hud.reloadStatus.hidden = true;
      return;
    }
    const definition = this.definition;
    this.hud.weaponName.textContent = definition.displayName;
    this.hud.weaponRole.textContent = definition.role;
    this.hud.weaponSlots.innerHTML = WEAPON_IDS.map((weaponId, index) => `<span class="weapon-slot${weaponId === this.equippedWeaponId ? " is-equipped" : ""}">${index + 1} ${WEAPON_DEFINITIONS[weaponId].displayName}</span>`).join("");
    this.hud.ammoCount.textContent = `${this.ammo.ammoInMagazine} / ${this.ammo.reserveAmmo}`;
    const switchName = this.switchTargetId
      ? WEAPON_DEFINITIONS[this.switchTargetId].displayName
      : null;
    this.hud.reloadStatus.textContent = switchName
      ? `Switching to ${switchName}...`
      : `Reloading ${definition.displayName}...`;
    this.hud.reloadStatus.hidden = !this.isReloading && !this.isSwitching;
  }

  private showTrainingFeedback(message: string): void {
    this.hud.trainingFeedback.textContent = message;
    this.hud.trainingFeedback.hidden = false;
  }

  private hideTrainingFeedback(): void {
    this.hud.trainingFeedback.hidden = true;
    this.hud.trainingFeedback.textContent = "";
  }

  private createStartingAmmo(): Record<WeaponId, WeaponAmmoState> {
    return Object.fromEntries(WEAPON_IDS.map((weaponId) => {
      const weapon = WEAPON_DEFINITIONS[weaponId];
      return [weaponId, { ammoInMagazine: weapon.magazineCapacity, reserveAmmo: weapon.startingReserveAmmo }];
    })) as Record<WeaponId, WeaponAmmoState>;
  }

  private lerp(start: number, end: number, amount: number): number {
    return start + (end - start) * amount;
  }

}
