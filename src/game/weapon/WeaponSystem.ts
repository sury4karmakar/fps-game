import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.pure.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.pure.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/Shaders/default.fragment.js";
import "@babylonjs/core/Shaders/default.vertex.js";

const MAGAZINE_CAPACITY = 30;
const STARTING_RESERVE_AMMO = 90;
const FIRE_INTERVAL_MS = 100;
const RELOAD_DURATION_MS = 1_550;
const WEAPON_RANGE = 80;
const WEAPON_DAMAGE = 34;
const RECOIL_KICK = 0.012;
const RECOIL_RECOVERY_PER_SECOND = 0.055;
const MUZZLE_FLASH_DURATION_MS = 45;
const HIT_MARKER_DURATION_MS = 110;
const IMPACT_LIFETIME_MS = 360;

const RIFLE_IDLE_POSITION = new Vector3(0.31, -0.29, 0.58);
const RIFLE_IDLE_ROTATION = new Vector3(-0.025, -0.025, 0);
const MAGAZINE_IDLE_POSITION = new Vector3(0, -0.2, 0.08);
const MAGAZINE_IDLE_ROTATION = new Vector3(-0.16, 0, 0);

export interface WeaponHudElements {
  readonly ammoCount: HTMLElement;
  readonly reloadStatus: HTMLElement;
  readonly hitMarker: HTMLElement;
}

export interface WeaponDamageResult {
  readonly damageApplied: boolean;
  readonly eliminated: boolean;
}

interface ImpactEffect {
  readonly mesh: Mesh;
  readonly createdAt: number;
}

interface RifleModel {
  readonly root: TransformNode;
  readonly magazine: Mesh;
  readonly muzzleFlash: Mesh;
}

export class WeaponSystem {
  private readonly impactMaterial: StandardMaterial;
  private readonly impacts: ImpactEffect[] = [];
  private readonly muzzleFlash: Mesh;
  private readonly rifleMagazine: Mesh;
  private readonly rifleRoot: TransformNode;
  private readonly updateObserver: Observer<Scene>;

  private ammoInMagazine = MAGAZINE_CAPACITY;
  private isReloading = false;
  private isTriggerHeld = false;
  private nextShotAt = 0;
  private recoilToRecover = 0;
  private reloadFinishesAt = 0;
  private reserveAmmo = STARTING_RESERVE_AMMO;
  private weaponKick = 0;
  private hitMarkerTimeout: number | null = null;
  private muzzleFlashTimeout: number | null = null;

  public constructor(
    private readonly scene: Scene,
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: FreeCamera,
    private readonly hud: WeaponHudElements,
    private readonly resolveDamageHit: (
      mesh: AbstractMesh,
      damage: number,
    ) => WeaponDamageResult,
    private readonly notifyWeaponFired: () => void,
  ) {
    const rifle = this.createRifleModel();
    this.rifleRoot = rifle.root;
    this.rifleMagazine = rifle.magazine;
    this.muzzleFlash = rifle.muzzleFlash;
    this.impactMaterial = this.createImpactMaterial();

    this.updateObserver = scene.onAfterAnimationsObservable.add(() => {
      this.update();
    });

    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("keydown", this.handleKeyDown, { passive: false });
    window.addEventListener("blur", this.releaseTrigger);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);

    this.updateHud();
  }

  public dispose(): void {
    this.scene.onAfterAnimationsObservable.remove(this.updateObserver);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("blur", this.releaseTrigger);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);

    if (this.hitMarkerTimeout !== null) {
      window.clearTimeout(this.hitMarkerTimeout);
    }

    if (this.muzzleFlashTimeout !== null) {
      window.clearTimeout(this.muzzleFlashTimeout);
    }

    for (const impact of this.impacts) {
      impact.mesh.dispose();
    }

    this.impacts.length = 0;
    this.impactMaterial.dispose();
    this.rifleRoot.dispose(false, true);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || document.pointerLockElement !== this.canvas) {
      return;
    }

    event.preventDefault();
    this.isTriggerHeld = true;
    this.tryFire(performance.now());
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.button === 0) {
      this.isTriggerHeld = false;
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (
      document.pointerLockElement !== this.canvas ||
      event.code !== "KeyR" ||
      event.repeat
    ) {
      return;
    }

    event.preventDefault();
    this.startReload(performance.now());
  };

  private readonly handlePointerLockChange = (): void => {
    if (document.pointerLockElement !== this.canvas) {
      this.releaseTrigger();
    }
  };

  private readonly releaseTrigger = (): void => {
    this.isTriggerHeld = false;
  };

  private update(): void {
    const now = performance.now();
    const deltaSeconds = Math.min(this.scene.getEngine().getDeltaTime() / 1000, 0.05);

    if (this.isReloading && now >= this.reloadFinishesAt) {
      this.finishReload();
    }

    if (this.isTriggerHeld && document.pointerLockElement === this.canvas) {
      this.tryFire(now);
    }

    this.updateWeaponTransform(deltaSeconds, now);
    this.updateImpacts(now);
  }

  private tryFire(now: number): void {
    if (this.isReloading || now < this.nextShotAt) {
      return;
    }

    if (this.ammoInMagazine === 0) {
      this.startReload(now);
      return;
    }

    this.ammoInMagazine -= 1;
    this.nextShotAt = now + FIRE_INTERVAL_MS;
    this.updateHud();
    this.showMuzzleFlash();
    this.notifyWeaponFired();
    this.fireHitscan();
    this.applyRecoil();
  }

  private fireHitscan(): void {
    const ray = this.camera.getForwardRay(WEAPON_RANGE);
    const hit = this.scene.pickWithRay(ray, (mesh) => mesh.isPickable, false);

    if (!hit?.hit || !hit.pickedPoint || !hit.pickedMesh) {
      return;
    }

    const normal = hit.getNormal(true) ?? ray.direction.scale(-1);
    this.createImpactEffect(hit.pickedPoint, normal);
    const damageResult = this.resolveDamageHit(hit.pickedMesh, WEAPON_DAMAGE);

    if (damageResult.damageApplied) {
      this.showHitMarker(damageResult.eliminated);
    }
  }

  private startReload(now: number): void {
    if (
      this.isReloading ||
      this.ammoInMagazine === MAGAZINE_CAPACITY ||
      this.reserveAmmo === 0
    ) {
      return;
    }

    this.isReloading = true;
    this.isTriggerHeld = false;
    this.reloadFinishesAt = now + RELOAD_DURATION_MS;
    this.updateHud();
  }

  private finishReload(): void {
    const neededAmmo = MAGAZINE_CAPACITY - this.ammoInMagazine;
    const loadedAmmo = Math.min(neededAmmo, this.reserveAmmo);

    this.ammoInMagazine += loadedAmmo;
    this.reserveAmmo -= loadedAmmo;
    this.isReloading = false;
    this.rifleMagazine.visibility = 1;
    this.updateHud();
  }

  private applyRecoil(): void {
    this.camera.rotation.x = Math.max(
      this.camera.rotation.x - RECOIL_KICK,
      -Math.PI / 2 + 0.01,
    );
    this.recoilToRecover += RECOIL_KICK;
    this.weaponKick = Math.min(this.weaponKick + 0.065, 0.1);
  }

  private updateWeaponTransform(deltaSeconds: number, now: number): void {
    if (this.recoilToRecover > 0) {
      const recovery = Math.min(
        this.recoilToRecover,
        RECOIL_RECOVERY_PER_SECOND * deltaSeconds,
      );
      this.camera.rotation.x += recovery;
      this.recoilToRecover -= recovery;
    }

    this.weaponKick = Math.max(0, this.weaponKick - 0.5 * deltaSeconds);
    this.rifleRoot.position.copyFrom(RIFLE_IDLE_POSITION);
    this.rifleRoot.position.z -= this.weaponKick;
    this.rifleRoot.rotation.copyFrom(RIFLE_IDLE_ROTATION);
    this.rifleRoot.rotation.x += this.weaponKick * 0.35;
    this.rifleMagazine.position.copyFrom(MAGAZINE_IDLE_POSITION);
    this.rifleMagazine.rotation.copyFrom(MAGAZINE_IDLE_ROTATION);
    this.rifleMagazine.visibility = 1;

    if (this.isReloading) {
      this.applyReloadAnimation(now);
    }
  }

  private applyReloadAnimation(now: number): void {
    const progress = Math.min(
      1,
      Math.max(0, 1 - (this.reloadFinishesAt - now) / RELOAD_DURATION_MS),
    );
    const poseStrength = Math.sin(progress * Math.PI);

    this.rifleRoot.position.x += poseStrength * 0.08;
    this.rifleRoot.position.y -= poseStrength * 0.16;
    this.rifleRoot.position.z -= poseStrength * 0.05;
    this.rifleRoot.rotation.x += poseStrength * 0.2;
    this.rifleRoot.rotation.z += poseStrength * 0.52;

    if (progress < 0.2) {
      return;
    }

    if (progress < 0.42) {
      const removalProgress = this.smoothStep((progress - 0.2) / 0.22);
      this.rifleMagazine.position.y -= removalProgress * 0.34;
      this.rifleMagazine.rotation.z += removalProgress * 0.16;
      return;
    }

    if (progress < 0.57) {
      this.rifleMagazine.visibility = 0;
      return;
    }

    if (progress < 0.82) {
      const insertionProgress = this.smoothStep((progress - 0.57) / 0.25);
      this.rifleMagazine.position.y -= (1 - insertionProgress) * 0.34;
      this.rifleMagazine.rotation.z += (1 - insertionProgress) * 0.16;
    }
  }

  private smoothStep(value: number): number {
    const clamped = Math.min(1, Math.max(0, value));
    return clamped * clamped * (3 - 2 * clamped);
  }

  private showMuzzleFlash(): void {
    this.muzzleFlash.setEnabled(true);
    this.muzzleFlash.scaling.setAll(0.75 + Math.random() * 0.5);

    if (this.muzzleFlashTimeout !== null) {
      window.clearTimeout(this.muzzleFlashTimeout);
    }

    this.muzzleFlashTimeout = window.setTimeout(() => {
      this.muzzleFlash.setEnabled(false);
      this.muzzleFlashTimeout = null;
    }, MUZZLE_FLASH_DURATION_MS);
  }

  private showHitMarker(eliminated: boolean): void {
    this.hud.hitMarker.classList.toggle("is-elimination", eliminated);
    this.hud.hitMarker.classList.add("is-visible");

    if (this.hitMarkerTimeout !== null) {
      window.clearTimeout(this.hitMarkerTimeout);
    }

    this.hitMarkerTimeout = window.setTimeout(() => {
      this.hud.hitMarker.classList.remove("is-visible");
      this.hud.hitMarker.classList.remove("is-elimination");
      this.hitMarkerTimeout = null;
    }, HIT_MARKER_DURATION_MS);
  }

  private createImpactEffect(position: Vector3, normal: Vector3): void {
    const impact = CreateSphere(
      `weapon-impact-${performance.now()}`,
      { diameter: 0.075, segments: 6 },
      this.scene,
    );
    impact.position.copyFrom(position.add(normal.scale(0.025)));
    impact.material = this.impactMaterial;
    impact.isPickable = false;
    impact.checkCollisions = false;
    impact.renderingGroupId = 1;

    this.impacts.push({ mesh: impact, createdAt: performance.now() });
  }

  private updateImpacts(now: number): void {
    for (let index = this.impacts.length - 1; index >= 0; index -= 1) {
      const impact = this.impacts[index];

      if (!impact) {
        continue;
      }

      const progress = (now - impact.createdAt) / IMPACT_LIFETIME_MS;

      if (progress >= 1) {
        impact.mesh.dispose();
        this.impacts.splice(index, 1);
        continue;
      }

      impact.mesh.scaling.setAll(1 + progress * 2.4);
      impact.mesh.visibility = 1 - progress;
    }
  }

  private updateHud(): void {
    this.hud.ammoCount.textContent = `${this.ammoInMagazine} / ${this.reserveAmmo}`;
    this.hud.reloadStatus.hidden = !this.isReloading;
  }

  private createRifleModel(): RifleModel {
    const root = new TransformNode("player-rifle-root", this.scene);
    root.parent = this.camera;
    root.position.copyFrom(RIFLE_IDLE_POSITION);
    root.rotation.copyFrom(RIFLE_IDLE_ROTATION);

    const bodyMaterial = new StandardMaterial("player-rifle-body-material", this.scene);
    bodyMaterial.diffuseColor = new Color3(0.055, 0.065, 0.075);
    bodyMaterial.specularColor = new Color3(0.3, 0.34, 0.38);

    const accentMaterial = new StandardMaterial(
      "player-rifle-accent-material",
      this.scene,
    );
    accentMaterial.diffuseColor = new Color3(0.14, 0.18, 0.21);
    accentMaterial.specularColor = new Color3(0.42, 0.46, 0.5);

    const muzzleMaterial = new StandardMaterial(
      "player-rifle-muzzle-material",
      this.scene,
    );
    muzzleMaterial.disableLighting = true;
    muzzleMaterial.emissiveColor = new Color3(1, 0.48, 0.08);

    const attachPart = (mesh: Mesh, material: StandardMaterial): Mesh => {
      mesh.parent = root;
      mesh.material = material;
      mesh.isPickable = false;
      mesh.checkCollisions = false;
      mesh.receiveShadows = false;
      mesh.renderingGroupId = 1;
      return mesh;
    };

    const body = attachPart(
      CreateBox(
        "player-rifle-body",
        { width: 0.2, height: 0.16, depth: 0.58 },
        this.scene,
      ),
      bodyMaterial,
    );
    body.position.z = 0.08;

    const handguard = attachPart(
      CreateBox(
        "player-rifle-handguard",
        { width: 0.15, height: 0.13, depth: 0.34 },
        this.scene,
      ),
      accentMaterial,
    );
    handguard.position.z = 0.48;

    const stock = attachPart(
      CreateBox(
        "player-rifle-stock",
        { width: 0.17, height: 0.2, depth: 0.25 },
        this.scene,
      ),
      accentMaterial,
    );
    stock.position.set(0, -0.025, -0.32);
    stock.rotation.x = -0.18;

    const magazine = attachPart(
      CreateBox(
        "player-rifle-magazine",
        { width: 0.12, height: 0.28, depth: 0.14 },
        this.scene,
      ),
      bodyMaterial,
    );
    magazine.position.copyFrom(MAGAZINE_IDLE_POSITION);
    magazine.rotation.copyFrom(MAGAZINE_IDLE_ROTATION);

    const barrel = attachPart(
      CreateCylinder(
        "player-rifle-barrel",
        { height: 0.42, diameter: 0.045, tessellation: 12 },
        this.scene,
      ),
      bodyMaterial,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.84;

    const sight = attachPart(
      CreateBox(
        "player-rifle-sight",
        { width: 0.055, height: 0.08, depth: 0.13 },
        this.scene,
      ),
      accentMaterial,
    );
    sight.position.set(0, 0.115, 0.18);

    const muzzleFlash = attachPart(
      CreateSphere(
        "player-rifle-muzzle-flash",
        { diameter: 0.13, segments: 6 },
        this.scene,
      ),
      muzzleMaterial,
    );
    muzzleFlash.position.z = 1.07;
    muzzleFlash.scaling.z = 1.8;
    muzzleFlash.setEnabled(false);

    return { root, magazine, muzzleFlash };
  }

  private createImpactMaterial(): StandardMaterial {
    const material = new StandardMaterial("weapon-impact-material", this.scene);
    material.disableLighting = true;
    material.emissiveColor = new Color3(1, 0.58, 0.12);
    return material;
  }
}
