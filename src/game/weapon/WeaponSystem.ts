import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.pure.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.pure.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { AudioSystem } from "../audio/AudioSystem";
import { isArenaCollisionMesh } from "../arena/arenaTypes";
import {
  DEFAULT_WEAPON_ID,
  WEAPON_DEFINITIONS,
  type WeaponDefinition,
  type WeaponId,
} from "../config/gameConfig";
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
const IMPACT_LIFETIME_MS = 360;
const SPARK_LIFETIME_MS = 460;
const MAX_IMPACTS = 36;
const MAX_DECALS = 20;
const DECAL_LIFETIME_MS = 7_000;
const MIN_DECAL_SPACING = 0.14;
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
}

export interface WeaponDamageResult {
  readonly damageApplied: boolean;
  readonly eliminated: boolean;
}

interface WeaponAmmoState {
  ammoInMagazine: number;
  reserveAmmo: number;
}

interface WeaponModel {
  readonly root: TransformNode;
  readonly magazine: Mesh;
  readonly muzzleFlash: Mesh;
}

interface ImpactEffect {
  readonly mesh: Mesh;
  readonly createdAt: number;
}

interface ImpactParticle {
  readonly mesh: Mesh;
  readonly velocity: Vector3;
  readonly createdAt: number;
}

interface ImpactDecal {
  readonly mesh: Mesh;
  readonly sourceMesh: AbstractMesh;
  readonly position: Vector3;
  readonly createdAt: number;
}

export class WeaponSystem {
  private readonly impactMaterial: StandardMaterial;
  private readonly decalMaterial: StandardMaterial;
  private readonly impacts: ImpactEffect[] = [];
  private readonly impactParticles: ImpactParticle[] = [];
  private readonly decals: ImpactDecal[] = [];
  private readonly models: Readonly<Record<WeaponId, WeaponModel>>;
  private readonly ammoByWeapon: Record<WeaponId, WeaponAmmoState>;
  private readonly updateObserver: Observer<Scene>;
  private readonly arenaCollisionMeshes: ReadonlySet<AbstractMesh>;

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
    ) => WeaponDamageResult,
    private readonly notifyWeaponFired: () => void,
    private readonly audioSystem: AudioSystem,
  ) {
    this.arenaCollisionMeshes = new Set(collidableMeshes);
    this.models = {
      "assault-rifle": this.createWeaponModel("assault-rifle"),
      scattergun: this.createWeaponModel("scattergun"),
      "marksman-rifle": this.createWeaponModel("marksman-rifle"),
    };
    this.ammoByWeapon = this.createStartingAmmo();
    this.impactMaterial = this.createImpactMaterial();
    this.decalMaterial = this.createDecalMaterial();
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
    this.impacts.forEach(({ mesh }) => mesh.dispose());
    this.impactParticles.forEach(({ mesh }) => mesh.dispose());
    this.decals.forEach(({ mesh }) => mesh.dispose());
    Object.values(this.models).forEach(({ root }) => root.dispose(false, true));
    this.impactMaterial.dispose();
    this.decalMaterial.dispose();
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
    this.impacts.forEach(({ mesh }) => mesh.dispose());
    this.impactParticles.forEach(({ mesh }) => mesh.dispose());
    this.decals.forEach(({ mesh }) => mesh.dispose());
    this.impacts.length = 0;
    this.impactParticles.length = 0;
    this.decals.length = 0;
    this.hud.hitMarker.classList.remove("is-visible", "is-elimination");
    this.hud.crosshair.classList.remove("is-firing");
    this.updateWeaponVisibility();
    this.updateHud();
    this.showFireFeedback();
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
    const slot = Number(event.key);
    if (slot >= 1 && slot <= WEAPON_IDS.length) {
      event.preventDefault();
      this.equipWeapon(WEAPON_IDS[slot - 1]!);
    }
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.isEnabled || document.pointerLockElement !== this.canvas || event.deltaY === 0) return;
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
    this.updateImpacts(now, deltaSeconds);
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

  private fireHitscan(): void {
    const definition = this.definition;
    for (let pellet = 0; pellet < definition.projectilesPerShot; pellet += 1) {
      const ray = this.camera.getForwardRay(definition.range);
      ray.direction = this.applySpread(ray.direction, definition.spreadRadians);
      const hit = this.scene.pickWithRay(ray, this.isHitscanTarget, false);
      if (!hit?.hit || !hit.pickedPoint || !hit.pickedMesh) continue;
      const normal = hit.getNormal(true) ?? ray.direction.scale(-1);
      this.createImpact(hit.pickedPoint, normal, hit.pickedMesh);
      const result = this.resolveDamageHit(hit.pickedMesh, definition.damagePerProjectile);
      if (result.damageApplied) {
        this.showHitMarker(result.eliminated);
        this.audioSystem.playHitConfirmation(result.eliminated);
      } else {
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
    for (const [weaponId, model] of Object.entries(this.models) as [WeaponId, WeaponModel][]) {
      const selected = weaponId === this.equippedWeaponId;
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

  private createImpact(
    position: Vector3,
    normal: Vector3,
    sourceMesh: AbstractMesh,
  ): void {
    const createdAt = performance.now();
    const impact = CreateSphere(`weapon-impact-${createdAt}`, { diameter: 0.075, segments: 6 }, this.scene);
    impact.position.copyFrom(position.add(normal.scale(0.025)));
    impact.material = this.impactMaterial;
    impact.isPickable = false;
    impact.renderingGroupId = 1;
    this.impacts.push({ mesh: impact, createdAt });
    if (this.arenaCollisionMeshes.has(sourceMesh) && isArenaCollisionMesh(sourceMesh)) {
      this.createImpactDecal(position, normal, sourceMesh, createdAt);
    }
    for (let index = 0; index < 2; index += 1) {
      const spark = CreateBox(`weapon-spark-${createdAt}-${index}`, { size: 0.035 }, this.scene);
      spark.position.copyFrom(impact.position);
      spark.material = this.impactMaterial;
      spark.isPickable = false;
      spark.renderingGroupId = 1;
      this.impactParticles.push({ mesh: spark, velocity: normal.scale(1.7 + Math.random() * 1.5).add(new Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5)), createdAt });
    }
    while (this.impacts.length > MAX_IMPACTS) this.impacts.shift()?.mesh.dispose();
  }

  private updateImpacts(now: number, deltaSeconds: number): void {
    for (let index = this.impacts.length - 1; index >= 0; index -= 1) {
      const effect = this.impacts[index]!;
      const progress = (now - effect.createdAt) / IMPACT_LIFETIME_MS;
      if (progress >= 1) { effect.mesh.dispose(); this.impacts.splice(index, 1); continue; }
      effect.mesh.scaling.setAll(1 + progress * 2.4);
      effect.mesh.visibility = 1 - progress;
    }
    for (let index = this.impactParticles.length - 1; index >= 0; index -= 1) {
      const particle = this.impactParticles[index]!;
      const progress = (now - particle.createdAt) / SPARK_LIFETIME_MS;
      if (progress >= 1) { particle.mesh.dispose(); this.impactParticles.splice(index, 1); continue; }
      particle.velocity.y -= 5.2 * deltaSeconds;
      particle.mesh.position.addInPlace(particle.velocity.scale(deltaSeconds));
      particle.mesh.visibility = 1 - progress;
    }
    for (let index = this.decals.length - 1; index >= 0; index -= 1) {
      const decal = this.decals[index]!;
      const progress = (now - decal.createdAt) / DECAL_LIFETIME_MS;
      if (progress >= 1) {
        decal.mesh.dispose();
        this.decals.splice(index, 1);
        continue;
      }
      decal.mesh.visibility = progress < 0.6 ? 1 : 1 - (progress - 0.6) / 0.4;
    }
  }

  private createImpactDecal(
    position: Vector3,
    normal: Vector3,
    sourceMesh: AbstractMesh,
    createdAt: number,
  ): void {
    const surfaceNormal = normal.normalizeToNew();
    const overlapsExistingDecal = this.decals.some(
      (decal) =>
        decal.sourceMesh === sourceMesh &&
        Vector3.DistanceSquared(decal.position, position) < MIN_DECAL_SPACING * MIN_DECAL_SPACING,
    );
    if (overlapsExistingDecal) return;

    const decal = CreateCylinder(
      `weapon-decal-${createdAt}`,
      { diameter: 0.075 + Math.random() * 0.015, height: 0.008, tessellation: 16 },
      this.scene,
    );
    decal.position.copyFrom(position.add(surfaceNormal.scale(0.004)));
    decal.rotationQuaternion = Quaternion.Identity();
    Quaternion.FromUnitVectorsToRef(Vector3.Up(), surfaceNormal, decal.rotationQuaternion);
    decal.material = this.decalMaterial;
    decal.isPickable = false;
    decal.checkCollisions = false;
    decal.receiveShadows = false;
    // World group keeps scene depth occlusion, so marks cannot show through cover.
    decal.renderingGroupId = 0;
    this.decals.push({ mesh: decal, sourceMesh, position: position.clone(), createdAt });
    while (this.decals.length > MAX_DECALS) this.decals.shift()?.mesh.dispose();
  }

  private readonly isHitscanTarget = (mesh: AbstractMesh): boolean => {
    if (this.arenaCollisionMeshes.has(mesh) && isArenaCollisionMesh(mesh)) {
      return true;
    }

    const metadata = mesh.metadata as { combatantId?: string } | null;
    return metadata?.combatantId === "bot";
  };

  private updateHud(): void {
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

  private createStartingAmmo(): Record<WeaponId, WeaponAmmoState> {
    return Object.fromEntries(WEAPON_IDS.map((weaponId) => {
      const weapon = WEAPON_DEFINITIONS[weaponId];
      return [weaponId, { ammoInMagazine: weapon.magazineCapacity, reserveAmmo: weapon.startingReserveAmmo }];
    })) as Record<WeaponId, WeaponAmmoState>;
  }

  private lerp(start: number, end: number, amount: number): number {
    return start + (end - start) * amount;
  }

  private createWeaponModel(weaponId: WeaponId): WeaponModel {
    const root = new TransformNode(`player-${weaponId}-root`, this.scene);
    root.parent = this.camera;
    const colors: Record<WeaponId, Color3> = {
      "assault-rifle": new Color3(0.08, 0.13, 0.17),
      scattergun: new Color3(0.21, 0.1, 0.055),
      "marksman-rifle": new Color3(0.08, 0.19, 0.14),
    };
    const material = new StandardMaterial(`player-${weaponId}-material`, this.scene);
    material.diffuseColor = colors[weaponId];
    material.specularColor = new Color3(0.38, 0.42, 0.45);
    const muzzleMaterial = new StandardMaterial(`player-${weaponId}-muzzle`, this.scene);
    muzzleMaterial.disableLighting = true;
    muzzleMaterial.emissiveColor = weaponId === "scattergun" ? new Color3(1, 0.32, 0.06) : new Color3(1, 0.55, 0.09);
    const attach = (mesh: Mesh): Mesh => { mesh.parent = root; mesh.material = material; mesh.isPickable = false; mesh.renderingGroupId = 1; return mesh; };
    const isScattergun = weaponId === "scattergun";
    const isMarksman = weaponId === "marksman-rifle";
    const body = attach(CreateBox(`player-${weaponId}-body`, { width: isScattergun ? 0.25 : 0.18, height: 0.16, depth: isMarksman ? 0.72 : 0.58 }, this.scene));
    body.position.z = 0.12;
    const magazine = attach(CreateBox(`player-${weaponId}-magazine`, { width: 0.12, height: isScattergun ? 0.2 : 0.28, depth: 0.14 }, this.scene));
    magazine.position.set(0, -0.2, 0.08);
    const barrel = attach(CreateCylinder(`player-${weaponId}-barrel`, { height: isScattergun ? 0.7 : isMarksman ? 0.82 : 0.42, diameter: isScattergun ? 0.075 : 0.045, tessellation: 12 }, this.scene));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = isScattergun ? 0.76 : isMarksman ? 0.94 : 0.84;
    if (isMarksman) { const scope = attach(CreateCylinder(`player-${weaponId}-scope`, { height: 0.3, diameter: 0.09, tessellation: 12 }, this.scene)); scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.13, 0.34); }
    const muzzleFlash = CreateSphere(`player-${weaponId}-muzzle-flash`, { diameter: isScattergun ? 0.2 : 0.13, segments: 6 }, this.scene);
    muzzleFlash.parent = root; muzzleFlash.material = muzzleMaterial; muzzleFlash.isPickable = false; muzzleFlash.renderingGroupId = 1; muzzleFlash.position.z = isScattergun ? 1.14 : isMarksman ? 1.38 : 1.07; muzzleFlash.setEnabled(false);
    return { root, magazine, muzzleFlash };
  }

  private createImpactMaterial(): StandardMaterial {
    const material = new StandardMaterial("weapon-impact-material", this.scene);
    material.disableLighting = true;
    material.emissiveColor = new Color3(1, 0.58, 0.12);
    return material;
  }

  private createDecalMaterial(): StandardMaterial {
    const material = new StandardMaterial("weapon-decal-material", this.scene);
    material.diffuseColor = new Color3(0.018, 0.014, 0.012);
    material.emissiveColor = new Color3(0.01, 0.006, 0.003);
    material.specularColor = Color3.Black();
    material.alpha = 0.82;
    return material;
  }
}
