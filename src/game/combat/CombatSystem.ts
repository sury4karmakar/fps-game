import { Ray } from "@babylonjs/core/Culling/ray.js";
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
import "@babylonjs/core/Rendering/outlineRenderer.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/Shaders/outline.fragment.js";
import "@babylonjs/core/Shaders/outline.vertex.js";
import type { ArenaSpawnPoint } from "../arena/arenaTypes";
import type { AudioSystem } from "../audio/AudioSystem";
import type { PlayerController } from "../player/PlayerController";

const MAX_HEALTH = 100;
const RESPAWN_DELAY_MS = 1_800;
const SPAWN_PROTECTION_MS = 1_500;
const DAMAGE_FLASH_MS = 180;
const STATUS_MESSAGE_MS = 1_250;
const HEADSHOT_MULTIPLIER = 3;
const COVER_SAFETY_BONUS = 500;
const SPAWN_PROTECTION_COLOR = new Color3(0.1, 0.78, 1);
const BOT_COLLIDER_HALF_HEIGHT = 0.9;
const BOT_EYE_HEIGHT = 1.62;
const BOT_MUZZLE_FLASH_MS = 55;
const SUPPLY_PICKUP_LIFETIME_MS = 15_000;
const SUPPLY_PICKUP_AMMO = 30;
const SUPPLY_PICKUP_RADIUS = 1.05;
const ARMOR_CAPACITY = 75;
const ARMOR_DAMAGE_ABSORPTION = 0.6;
const ARMOR_PICKUP_LIFETIME_MS = 18_000;
const ARMOR_DURATION_MS = 24_000;
const ARMOR_RESPAWN_DELAY_MS = 28_000;
const ARMOR_INITIAL_SPAWN_DELAY_MS = 20_000;
const ARMOR_PICKUP_RADIUS = 1.1;
const ARMOR_SPAWN_MINIMUM_DISTANCE = 7;

type CombatantId = "player" | "bot";
export type KillOwner = CombatantId;
type HitZone = "body" | "head";

interface CombatantState {
  health: number;
  alive: boolean;
  respawnAt: number;
  spawnProtectedUntil: number;
}

interface DamageableMetadata {
  readonly combatantId?: CombatantId;
  readonly hitZone?: HitZone;
}

interface BotModel {
  readonly root: TransformNode;
  readonly collisionBody: Mesh;
  readonly bodyMaterial: StandardMaterial;
  readonly headMaterial: StandardMaterial;
  readonly muzzleFlash: Mesh;
  readonly protectedMeshes: readonly Mesh[];
  readonly torso: Mesh;
  readonly leftLeg: Mesh;
  readonly rightLeg: Mesh;
}

interface SupplyPickup {
  readonly mesh: Mesh;
  readonly expiresAt: number;
  readonly createdAt: number;
}

interface ArmorPickup {
  readonly mesh: Mesh;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly baseY: number;
}

export interface CombatHudElements {
  readonly playerHealth: HTMLElement;
  readonly playerHealthFill: HTMLElement;
  readonly botHealth: HTMLElement;
  readonly botHealthFill: HTMLElement;
  readonly combatMessage: HTMLElement;
  readonly damageOverlay: HTMLElement;
  readonly armorPanel: HTMLElement;
  readonly playerArmor: HTMLElement;
  readonly playerArmorFill: HTMLElement;
  readonly armorStatus: HTMLElement;
}

export interface CombatHitResult {
  readonly damageApplied: boolean;
  readonly eliminated: boolean;
}

export class CombatSystem {
  private readonly bot: BotModel;
  private readonly playerState: CombatantState;
  private readonly botState: CombatantState;
  private readonly updateObserver: Observer<Scene>;
  private readonly supplyMaterial: StandardMaterial;
  private readonly armorMaterial: StandardMaterial;
  private readonly supplyPickups: SupplyPickup[] = [];
  private armorPickup: ArmorPickup | null = null;

  private botDamageFlashUntil = 0;
  private botMuzzleFlashUntil = 0;
  private combatEnabled = false;
  private playerDamageFlashUntil = 0;
  private messageVisibleUntil = 0;
  private botDeathVisualUntil = 0;
  private botLastMoveAt = 0;
  private botWalkPhase = 0;
  private armor = 0;
  private armorExpiresAt = 0;
  private armorFlashUntil = 0;
  private armorEquipFeedbackUntil = 0;
  private nextArmorSpawnAt = 0;

  public constructor(
    private readonly scene: Scene,
    private readonly playerController: PlayerController,
    private readonly respawnPoints: {
      readonly player: readonly ArenaSpawnPoint[];
      readonly bot: readonly ArenaSpawnPoint[];
    },
    private readonly hud: CombatHudElements,
    private readonly reportKill: (killer: KillOwner) => void,
    private readonly addPlayerAmmo: (amount: number) => number,
    private readonly audioSystem: AudioSystem,
  ) {
    const now = performance.now();

    this.playerState = this.createInitialState(now);
    this.botState = this.createInitialState(now);
    this.bot = this.createBotModel(respawnPoints.bot[0]);
    this.supplyMaterial = this.createSupplyMaterial();
    this.armorMaterial = this.createArmorMaterial();
    this.nextArmorSpawnAt = now + ARMOR_INITIAL_SPAWN_DELAY_MS;
    this.updateHud(now);

    this.updateObserver = scene.onAfterAnimationsObservable.add(() => {
      this.update();
    });
  }

  public dispose(): void {
    this.scene.onAfterAnimationsObservable.remove(this.updateObserver);
    this.bot.collisionBody.dispose();
    this.bot.root.dispose(false, true);
    this.clearSupplyPickups();
    this.supplyMaterial.dispose();
    this.clearArmorPickup();
    this.armorMaterial.dispose();
    this.hud.damageOverlay.classList.remove("is-visible");
    this.hud.combatMessage.hidden = true;
  }

  public applyWeaponHit(mesh: AbstractMesh, baseDamage: number): CombatHitResult {
    const metadata = mesh.metadata as DamageableMetadata | null;

    if (
      !this.combatEnabled ||
      metadata?.combatantId !== "bot" ||
      !this.botState.alive
    ) {
      return { damageApplied: false, eliminated: false };
    }

    const now = performance.now();

    if (this.isSpawnProtected(this.botState, now)) {
      this.showMessage("BOT SPAWN PROTECTED", now);
      return { damageApplied: false, eliminated: false };
    }

    const multiplier = metadata.hitZone === "head" ? HEADSHOT_MULTIPLIER : 1;
    const damage = Math.round(baseDamage * multiplier);
    const eliminated = this.applyDamage("bot", damage, now);

    return { damageApplied: true, eliminated };
  }

  public damagePlayer(damage: number): boolean {
    const now = performance.now();

    if (
      !this.combatEnabled ||
      !this.playerState.alive ||
      this.isSpawnProtected(this.playerState, now)
    ) {
      if (this.combatEnabled && this.playerState.alive) {
        this.showMessage("SPAWN PROTECTED", now);
      }
      return false;
    }

    this.applyDamage("player", damage, now);
    return true;
  }

  public get isBotAlive(): boolean {
    return this.botState.alive;
  }

  public get isPlayerAlive(): boolean {
    return this.playerState.alive;
  }

  public setCombatEnabled(enabled: boolean): void {
    this.combatEnabled = enabled;

    if (!enabled) {
      this.bot.muzzleFlash.setEnabled(false);
      this.updateBotProtectionVisual(false, performance.now());
      this.hud.damageOverlay.classList.remove("is-visible");
      this.hud.combatMessage.hidden = true;
      this.clearSupplyPickups();
      this.clearArmorPickup();
    }
  }

  public resetForMatch(now = performance.now()): void {
    const playerSpawn = this.respawnPoints.player[0];
    const botSpawn = this.respawnPoints.bot[0];

    if (!playerSpawn || !botSpawn) {
      throw new Error("Arena Strike requires player and bot match spawns.");
    }

    this.resetState(this.playerState, now);
    this.resetState(this.botState, now);
    this.playerController.respawn(playerSpawn);
    this.bot.root.position.copyFrom(botSpawn.position);
    this.bot.collisionBody.position.copyFrom(
      botSpawn.position.add(new Vector3(0, BOT_COLLIDER_HALF_HEIGHT, 0)),
    );
    this.faceBotToward(botSpawn.facingTarget);
    this.bot.collisionBody.setEnabled(true);
    this.bot.root.setEnabled(true);
    this.botDamageFlashUntil = 0;
    this.botMuzzleFlashUntil = 0;
    this.playerDamageFlashUntil = 0;
    this.messageVisibleUntil = 0;
    this.armor = 0;
    this.armorExpiresAt = 0;
    this.armorFlashUntil = 0;
    this.armorEquipFeedbackUntil = 0;
    this.nextArmorSpawnAt = now + ARMOR_INITIAL_SPAWN_DELAY_MS;
    this.clearSupplyPickups();
    this.clearArmorPickup();
    this.bot.muzzleFlash.setEnabled(false);
    this.hud.damageOverlay.classList.remove("is-visible");
    this.hud.combatMessage.hidden = true;
    this.updateHud(now);
  }

  public getBotPosition(): Vector3 {
    return this.bot.root.position.clone();
  }

  public getBotEyePosition(): Vector3 {
    return this.bot.root.position.add(new Vector3(0, BOT_EYE_HEIGHT, 0));
  }

  public getBotMuzzlePosition(): Vector3 {
    return this.bot.muzzleFlash.getAbsolutePosition().clone();
  }

  public getBotForward(): Vector3 {
    return new Vector3(
      Math.sin(this.bot.root.rotation.y),
      0,
      Math.cos(this.bot.root.rotation.y),
    );
  }

  public moveBot(displacement: Vector3): number {
    if (!this.combatEnabled || !this.botState.alive) {
      return 0;
    }

    const previousPosition = this.bot.collisionBody.position.clone();
    this.bot.collisionBody.moveWithCollisions(displacement);
    this.syncBotVisualToCollisionBody();
    const distanceMoved = Vector3.Distance(previousPosition, this.bot.collisionBody.position);
    if (distanceMoved > 0.002) {
      this.botLastMoveAt = performance.now();
      this.botWalkPhase += distanceMoved * 8;
    }
    return distanceMoved;
  }

  public turnBotToward(target: Vector3, maximumTurn: number): number {
    const direction = target.subtract(this.bot.root.position);
    const targetYaw = Math.atan2(direction.x, direction.z);
    const yawDifference = this.normalizeAngle(targetYaw - this.bot.root.rotation.y);
    const appliedTurn = Math.max(-maximumTurn, Math.min(maximumTurn, yawDifference));
    this.bot.root.rotation.y = this.normalizeAngle(
      this.bot.root.rotation.y + appliedTurn,
    );
    return Math.abs(yawDifference - appliedTurn);
  }

  public showBotMuzzleFlash(now: number): void {
    if (!this.combatEnabled || !this.botState.alive) {
      return;
    }

    this.bot.muzzleFlash.setEnabled(true);
    this.bot.muzzleFlash.scaling.setAll(0.75 + Math.random() * 0.5);
    this.botMuzzleFlashUntil = now + BOT_MUZZLE_FLASH_MS;
    this.audioSystem.playBotGunshot();
  }

  private createInitialState(now: number): CombatantState {
    return {
      health: MAX_HEALTH,
      alive: true,
      respawnAt: 0,
      spawnProtectedUntil: now + SPAWN_PROTECTION_MS,
    };
  }

  private update(): void {
    const now = performance.now();

    if (!this.combatEnabled) {
      return;
    }

    if (!this.playerState.alive && now >= this.playerState.respawnAt) {
      this.respawnPlayer(now);
    }

    if (!this.botState.alive && now >= this.botState.respawnAt) {
      this.respawnBot(now);
    }

    const botIsProtected =
      this.botState.alive && this.isSpawnProtected(this.botState, now);
    this.updateBotProtectionVisual(botIsProtected, now);

    if (now >= this.botDamageFlashUntil) {
      this.bot.bodyMaterial.emissiveColor.copyFromFloats(0, 0, 0);
      this.bot.headMaterial.emissiveColor.copyFromFloats(0, 0, 0);
    }

    if (now >= this.botMuzzleFlashUntil) {
      this.bot.muzzleFlash.setEnabled(false);
    }

    this.updateBotAnimation(now);

    if (!this.botState.alive && now >= this.botDeathVisualUntil) {
      this.bot.root.setEnabled(false);
    }

    if (now >= this.playerDamageFlashUntil) {
      this.hud.damageOverlay.classList.remove("is-visible");
    }

    if (now >= this.armorFlashUntil) {
      this.hud.armorPanel.classList.remove("is-damaged");
    }

    if (now >= this.armorEquipFeedbackUntil) {
      this.hud.armorPanel.classList.remove("is-equipped");
    }

    if (now >= this.messageVisibleUntil) {
      this.hud.combatMessage.hidden = true;
    }

    this.updateSupplyPickups(now);
    this.updateArmorPickup(now);
    this.updateArmorState(now);
  }

  private applyDamage(target: CombatantId, damage: number, now: number): boolean {
    const state = target === "player" ? this.playerState : this.botState;
    let healthDamage = Math.max(0, damage);

    if (target === "player" && this.armor > 0 && healthDamage > 0) {
      const absorbedDamage = Math.min(
        this.armor,
        Math.max(1, Math.round(healthDamage * ARMOR_DAMAGE_ABSORPTION)),
      );
      this.armor -= absorbedDamage;
      healthDamage -= absorbedDamage;
      this.armorFlashUntil = now + DAMAGE_FLASH_MS;
      this.hud.armorPanel.classList.add("is-damaged");
      this.audioSystem.playArmorDamage();
      if (this.armor === 0) {
        this.showMessage("ARMOR DEPLETED", now);
      }
    }

    state.health = Math.max(0, state.health - healthDamage);

    if (target === "player") {
      this.playerDamageFlashUntil = now + DAMAGE_FLASH_MS;
      this.hud.damageOverlay.classList.add("is-visible");
      this.audioSystem.playPlayerDamage();
    } else {
      this.botDamageFlashUntil = now + DAMAGE_FLASH_MS;
      this.bot.bodyMaterial.emissiveColor.copyFromFloats(0.8, 0.04, 0.02);
      this.bot.headMaterial.emissiveColor.copyFromFloats(1, 0.12, 0.04);
    }

    this.updateHealthHud();

    if (state.health > 0) {
      if (target === "bot") {
        this.showMessage(`${state.health} BOT HEALTH`, now);
      }
      return false;
    }

    this.handleDeath(target, now);
    return true;
  }

  private handleDeath(target: CombatantId, now: number): void {
    const state = target === "player" ? this.playerState : this.botState;
    state.alive = false;
    state.respawnAt = now + RESPAWN_DELAY_MS;
    state.spawnProtectedUntil = 0;

    if (target === "player") {
      this.armor = 0;
      this.armorExpiresAt = 0;
      this.playerController.setEnabled(false);
      this.showMessage("YOU WERE ELIMINATED - RESPAWNING", now, RESPAWN_DELAY_MS);
      this.reportKill("bot");
    } else {
      this.createSupplyPickup(this.bot.root.position, now);
      this.bot.collisionBody.setEnabled(false);
      this.botDeathVisualUntil = now + 500;
      this.showMessage("BOT ELIMINATED - RESPAWNING", now, RESPAWN_DELAY_MS);
      this.reportKill("player");
    }
  }

  private respawnPlayer(now: number): void {
    const safeSpawn = this.selectSafestSpawn(
      this.respawnPoints.player,
      this.bot.root.getAbsolutePosition().add(new Vector3(0, 1.1, 0)),
    );

    this.resetState(this.playerState, now);
    this.playerController.respawn(safeSpawn);
    this.showMessage("RESPAWNED - SPAWN PROTECTED", now);
    this.updateHealthHud();
  }

  private respawnBot(now: number): void {
    const safeSpawn = this.selectSafestSpawn(
      this.respawnPoints.bot,
      this.playerController.camera.position,
    );

    this.resetState(this.botState, now);
    this.bot.root.position.copyFrom(safeSpawn.position);
    this.bot.collisionBody.position.copyFrom(
      safeSpawn.position.add(new Vector3(0, BOT_COLLIDER_HALF_HEIGHT, 0)),
    );
    this.faceBotToward(safeSpawn.facingTarget);
    this.bot.collisionBody.setEnabled(true);
    this.bot.root.setEnabled(true);
    this.bot.root.scaling.copyFromFloats(1, 0.85, 1);
    this.bot.torso.rotation.z = 0;
    this.bot.leftLeg.rotation.x = 0;
    this.bot.rightLeg.rotation.x = 0;
    this.botDeathVisualUntil = 0;
    this.updateBotProtectionVisual(true, now);
    this.showMessage("BOT RESPAWNED", now);
    this.updateHealthHud();
  }

  private resetState(state: CombatantState, now: number): void {
    state.health = MAX_HEALTH;
    state.alive = true;
    state.respawnAt = 0;
    state.spawnProtectedUntil = now + SPAWN_PROTECTION_MS;
  }

  private updateBotAnimation(now: number): void {
    if (!this.botState.alive) {
      const deathProgress = Math.min(1, Math.max(0, 1 - (this.botDeathVisualUntil - now) / 500));
      this.bot.root.scaling.copyFromFloats(1 + deathProgress * 0.12, 0.85 * (1 - deathProgress * 0.78), 1 + deathProgress * 0.12);
      this.bot.torso.rotation.z = deathProgress * 0.46;
      this.bot.leftLeg.rotation.x = deathProgress * 0.58;
      this.bot.rightLeg.rotation.x = -deathProgress * 0.35;
      return;
    }

    const moving = now - this.botLastMoveAt < 120;
    const stride = moving ? Math.sin(this.botWalkPhase) * 0.42 : 0;
    const bob = moving ? Math.abs(Math.sin(this.botWalkPhase)) * 0.05 : 0;
    this.bot.torso.position.y = 1.18 + bob;
    this.bot.torso.rotation.z = 0;
    this.bot.leftLeg.rotation.x = stride;
    this.bot.rightLeg.rotation.x = -stride;
    this.bot.root.scaling.copyFromFloats(1, 0.85, 1);
  }

  private createSupplyPickup(position: Vector3, now: number): void {
    const mesh = CreateBox(
      `bot-supply-pickup-${now}`,
      { size: 0.72 },
      this.scene,
    );
    mesh.position.copyFrom(position);
    mesh.position.y += 0.42;
    mesh.material = this.supplyMaterial;
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.receiveShadows = false;
    mesh.renderOutline = true;
    mesh.outlineColor.copyFromFloats(0.25, 1, 0.35);
    mesh.outlineWidth = 0.06;
    this.supplyPickups.push({
      mesh,
      createdAt: now,
      expiresAt: now + SUPPLY_PICKUP_LIFETIME_MS,
    });
  }

  private updateSupplyPickups(now: number): void {
    const playerPosition = this.playerController.camera.position;

    for (let index = this.supplyPickups.length - 1; index >= 0; index -= 1) {
      const pickup = this.supplyPickups[index];

      if (!pickup) {
        continue;
      }

      if (now >= pickup.expiresAt) {
        pickup.mesh.dispose();
        this.supplyPickups.splice(index, 1);
        continue;
      }

      const ageSeconds = (now - pickup.createdAt) / 1_000;
      const pulse = 1 + Math.sin(ageSeconds * 6) * 0.08;
      pickup.mesh.rotation.y +=
        Math.min(this.scene.getEngine().getDeltaTime() / 1_000, 0.05) * 1.6;
      pickup.mesh.scaling.setAll(pulse);

      const horizontalDistance = Math.hypot(
        pickup.mesh.position.x - playerPosition.x,
        pickup.mesh.position.z - playerPosition.z,
      );

      if (!this.playerState.alive || horizontalDistance > SUPPLY_PICKUP_RADIUS) {
        continue;
      }

      this.playerState.health = MAX_HEALTH;
      const addedAmmo = this.addPlayerAmmo(SUPPLY_PICKUP_AMMO);
      this.updateHealthHud();
      this.showMessage(
        addedAmmo > 0
          ? `SUPPLY COLLECTED - FULL HEALTH +${addedAmmo} AMMO`
          : "SUPPLY COLLECTED - FULL HEALTH - AMMO FULL",
        now,
        1_800,
      );
      pickup.mesh.dispose();
      this.supplyPickups.splice(index, 1);
    }
  }

  private updateArmorPickup(now: number): void {
    if (!this.armorPickup && now >= this.nextArmorSpawnAt) {
      this.createArmorPickup(now);
    }

    const pickup = this.armorPickup;
    if (!pickup) {
      return;
    }

    if (now >= pickup.expiresAt) {
      this.clearArmorPickup();
      this.nextArmorSpawnAt = now + ARMOR_RESPAWN_DELAY_MS;
      return;
    }

    const ageSeconds = (now - pickup.createdAt) / 1_000;
    pickup.mesh.rotation.y += Math.min(this.scene.getEngine().getDeltaTime() / 1_000, 0.05) * 1.4;
    pickup.mesh.position.y = pickup.baseY + Math.sin(ageSeconds * 3.5) * 0.06;
    pickup.mesh.scaling.setAll(1 + Math.sin(ageSeconds * 6) * 0.07);

    const playerPosition = this.playerController.camera.position;
    const distance = Math.hypot(
      pickup.mesh.position.x - playerPosition.x,
      pickup.mesh.position.z - playerPosition.z,
    );
    if (!this.playerState.alive || distance > ARMOR_PICKUP_RADIUS) {
      return;
    }

    this.armor = ARMOR_CAPACITY;
    this.armorExpiresAt = now + ARMOR_DURATION_MS;
    this.armorEquipFeedbackUntil = now + 650;
    this.hud.armorPanel.classList.add("is-equipped");
    this.audioSystem.playArmorPickup();
    this.showMessage("ARMOR EQUIPPED - 24 SECONDS", now, 1_800);
    this.clearArmorPickup();
    this.nextArmorSpawnAt = now + ARMOR_RESPAWN_DELAY_MS;
    this.updateHealthHud();
  }

  private updateArmorState(now: number): void {
    if (this.armor > 0 && now >= this.armorExpiresAt) {
      this.armor = 0;
      this.armorExpiresAt = 0;
      this.showMessage("ARMOR EXPIRED", now);
      this.updateHealthHud();
    }

    if (this.armor > 0) {
      const remainingSeconds = Math.ceil((this.armorExpiresAt - now) / 1_000);
      this.hud.armorStatus.textContent = `Armor active · ${remainingSeconds}s`;
    }
  }

  private createArmorPickup(now: number): void {
    const position = this.selectArmorSpawnPosition();
    const mesh = CreateCylinder(
      `armor-pickup-${now}`,
      { height: 0.82, diameterTop: 0.62, diameterBottom: 0.82, tessellation: 8 },
      this.scene,
    );
    mesh.position.copyFrom(position);
    mesh.position.y += 0.48;
    mesh.material = this.armorMaterial;
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.receiveShadows = false;
    mesh.renderOutline = true;
    mesh.outlineColor.copyFromFloats(0.24, 0.78, 1);
    mesh.outlineWidth = 0.06;
    this.armorPickup = {
      mesh,
      createdAt: now,
      expiresAt: now + ARMOR_PICKUP_LIFETIME_MS,
      baseY: mesh.position.y,
    };
    this.showMessage("ARMOR DROP DEPLOYED", now);
  }

  private selectArmorSpawnPosition(): Vector3 {
    const candidates = [
      ...this.respawnPoints.player,
      ...this.respawnPoints.bot,
    ];
    const playerPosition = this.playerController.camera.position;
    const botPosition = this.bot.root.position;
    const rankedCandidates = candidates
      .map((spawn) => ({
        position: spawn.position,
        nearestCombatant: Math.min(
          Vector3.Distance(spawn.position, playerPosition),
          Vector3.Distance(spawn.position, botPosition),
        ),
      }))
      .sort((left, right) => right.nearestCombatant - left.nearestCombatant);
    const fairCandidate = rankedCandidates.find(
      (candidate) => candidate.nearestCombatant >= ARMOR_SPAWN_MINIMUM_DISTANCE,
    );
    return (fairCandidate ?? rankedCandidates[0])?.position.clone() ?? Vector3.Zero();
  }

  private clearSupplyPickups(): void {
    for (const pickup of this.supplyPickups) {
      pickup.mesh.dispose();
    }

    this.supplyPickups.length = 0;
  }

  private clearArmorPickup(): void {
    this.armorPickup?.mesh.dispose();
    this.armorPickup = null;
  }

  private createSupplyMaterial(): StandardMaterial {
    const material = new StandardMaterial("bot-supply-material", this.scene);
    material.diffuseColor = new Color3(0.05, 0.65, 0.12);
    material.emissiveColor = new Color3(0.08, 0.9, 0.18);
    material.specularColor = new Color3(0.25, 0.75, 0.3);
    material.alpha = 0.82;
    return material;
  }

  private createArmorMaterial(): StandardMaterial {
    const material = new StandardMaterial("armor-pickup-material", this.scene);
    material.diffuseColor = new Color3(0.04, 0.32, 0.58);
    material.emissiveColor = new Color3(0.08, 0.68, 1);
    material.specularColor = new Color3(0.45, 0.88, 1);
    material.alpha = 0.86;
    return material;
  }

  private selectSafestSpawn(
    candidates: readonly ArenaSpawnPoint[],
    threatPosition: Vector3,
  ): ArenaSpawnPoint {
    const firstCandidate = candidates[0];

    if (!firstCandidate) {
      throw new Error("Arena Strike requires at least one respawn point.");
    }

    let safestSpawn = firstCandidate;
    let safestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of candidates) {
      const spawnEyePosition = candidate.position.add(new Vector3(0, 1.25, 0));
      const toThreat = threatPosition.subtract(spawnEyePosition);
      const distanceSquared = toThreat.lengthSquared();
      const distance = Math.sqrt(distanceSquared);
      let hasCover = false;

      if (distance > 0.01) {
        const sightRay = new Ray(
          spawnEyePosition,
          toThreat.scale(1 / distance),
          distance,
        );
        const coverHit = this.scene.pickWithRay(
          sightRay,
          (mesh) => {
            const metadata = mesh.metadata as { arenaCollision?: boolean } | null;
            return metadata?.arenaCollision === true;
          },
          false,
        );
        hasCover = coverHit?.hit === true;
      }

      const score = distanceSquared + (hasCover ? COVER_SAFETY_BONUS : 0);

      if (score > safestScore) {
        safestScore = score;
        safestSpawn = candidate;
      }
    }

    return safestSpawn;
  }

  private isSpawnProtected(state: CombatantState, now: number): boolean {
    return now < state.spawnProtectedUntil;
  }

  private updateHud(now: number): void {
    this.updateHealthHud();
    this.updateBotProtectionVisual(
      this.botState.alive && this.isSpawnProtected(this.botState, now),
      now,
    );
  }

  private updateHealthHud(): void {
    this.hud.playerHealth.textContent = String(this.playerState.health);
    this.hud.playerHealthFill.style.width = `${this.playerState.health}%`;
    this.hud.botHealth.textContent = String(this.botState.health);
    this.hud.botHealthFill.style.width = `${this.botState.health}%`;

    this.hud.playerHealth.dataset.level = this.getHealthLevel(this.playerState.health);
    this.hud.botHealth.dataset.level = this.getHealthLevel(this.botState.health);
    this.hud.playerArmor.textContent = `${this.armor} / ${ARMOR_CAPACITY}`;
    this.hud.playerArmorFill.style.width = `${(this.armor / ARMOR_CAPACITY) * 100}%`;
    this.hud.armorPanel.dataset.active = String(this.armor > 0);
    this.hud.armorStatus.textContent = this.armor > 0 ? "Armor active" : "No armor";
  }

  private updateBotProtectionVisual(isProtected: boolean, now: number): void {
    const pulse = 0.075 + (Math.sin(now * 0.009) + 1) * 0.018;

    for (const mesh of this.bot.protectedMeshes) {
      mesh.renderOutline = isProtected;
      mesh.outlineColor.copyFrom(SPAWN_PROTECTION_COLOR);
      mesh.outlineWidth = pulse;
    }
  }

  private getHealthLevel(health: number): "healthy" | "hurt" | "critical" {
    if (health <= 30) {
      return "critical";
    }

    if (health <= 65) {
      return "hurt";
    }

    return "healthy";
  }

  private showMessage(
    message: string,
    now: number,
    duration = STATUS_MESSAGE_MS,
  ): void {
    this.hud.combatMessage.textContent = message;
    this.hud.combatMessage.hidden = false;
    this.messageVisibleUntil = now + duration;
  }

  private createBotModel(spawnPoint: ArenaSpawnPoint | undefined): BotModel {
    if (!spawnPoint) {
      throw new Error("Arena Strike requires an initial bot spawn point.");
    }

    const collisionBody = CreateBox(
      "bot-collision-body",
      { width: 0.9, height: BOT_COLLIDER_HALF_HEIGHT * 2, depth: 0.9 },
      this.scene,
    );
    collisionBody.position.copyFrom(
      spawnPoint.position.add(new Vector3(0, BOT_COLLIDER_HALF_HEIGHT, 0)),
    );
    collisionBody.isVisible = false;
    collisionBody.isPickable = false;
    collisionBody.checkCollisions = true;
    collisionBody.ellipsoid = new Vector3(0.45, BOT_COLLIDER_HALF_HEIGHT, 0.45);
    collisionBody.ellipsoidOffset = Vector3.Zero();
    collisionBody.metadata = { botCollision: true };

    const root = new TransformNode("bot-target-root", this.scene);
    root.position.copyFrom(spawnPoint.position);
    root.scaling.y = 0.85;
    const protectedMeshes: Mesh[] = [];

    const bodyMaterial = new StandardMaterial("bot-body-material", this.scene);
    bodyMaterial.diffuseColor = new Color3(0.55, 0.08, 0.055);
    bodyMaterial.specularColor = new Color3(0.18, 0.18, 0.18);

    const headMaterial = new StandardMaterial("bot-head-material", this.scene);
    headMaterial.diffuseColor = new Color3(0.72, 0.2, 0.08);
    headMaterial.specularColor = new Color3(0.22, 0.22, 0.22);

    const weaponMaterial = new StandardMaterial("bot-weapon-material", this.scene);
    weaponMaterial.diffuseColor = new Color3(0.035, 0.045, 0.055);
    weaponMaterial.specularColor = new Color3(0.32, 0.35, 0.38);

    const muzzleMaterial = new StandardMaterial("bot-muzzle-material", this.scene);
    muzzleMaterial.disableLighting = true;
    muzzleMaterial.emissiveColor = new Color3(1, 0.32, 0.04);

    const configureHitZone = (
      mesh: Mesh,
      material: StandardMaterial,
      hitZone: HitZone,
    ): Mesh => {
      mesh.parent = root;
      mesh.material = material;
      mesh.isPickable = true;
      mesh.checkCollisions = false;
      mesh.receiveShadows = true;
      mesh.metadata = { combatantId: "bot", hitZone } satisfies DamageableMetadata;
      protectedMeshes.push(mesh);
      return mesh;
    };

    const configureDecoration = (
      mesh: Mesh,
      material: StandardMaterial,
    ): Mesh => {
      mesh.parent = root;
      mesh.material = material;
      mesh.isPickable = false;
      mesh.checkCollisions = false;
      mesh.receiveShadows = false;
      return mesh;
    };

    const torso = configureHitZone(
      CreateCylinder(
        "bot-target-torso",
        { height: 1.15, diameterTop: 0.72, diameterBottom: 0.82, tessellation: 16 },
        this.scene,
      ),
      bodyMaterial,
      "body",
    );
    torso.position.y = 1.18;

    const head = configureHitZone(
      CreateSphere(
        "bot-target-head",
        { diameter: 0.48, segments: 12 },
        this.scene,
      ),
      headMaterial,
      "head",
    );
    head.position.y = 2.02;

    const leftLeg = configureHitZone(
      CreateBox(
        "bot-target-left-leg",
        { width: 0.28, height: 0.65, depth: 0.32 },
        this.scene,
      ),
      bodyMaterial,
      "body",
    );
    leftLeg.position.set(-0.2, 0.34, 0);

    const rightLeg = configureHitZone(
      CreateBox(
        "bot-target-right-leg",
        { width: 0.28, height: 0.65, depth: 0.32 },
        this.scene,
      ),
      bodyMaterial,
      "body",
    );
    rightLeg.position.set(0.2, 0.34, 0);

    const rifleBody = configureDecoration(
      CreateBox(
        "bot-rifle-body",
        { width: 0.16, height: 0.14, depth: 0.62 },
        this.scene,
      ),
      weaponMaterial,
    );
    rifleBody.position.set(0.42, 1.26, 0.34);

    const rifleBarrel = configureDecoration(
      CreateCylinder(
        "bot-rifle-barrel",
        { height: 0.42, diameter: 0.045, tessellation: 12 },
        this.scene,
      ),
      weaponMaterial,
    );
    rifleBarrel.rotation.x = Math.PI / 2;
    rifleBarrel.position.set(0.42, 1.26, 0.84);

    const muzzleFlash = configureDecoration(
      CreateSphere(
        "bot-rifle-muzzle-flash",
        { diameter: 0.13, segments: 6 },
        this.scene,
      ),
      muzzleMaterial,
    );
    muzzleFlash.position.set(0.42, 1.26, 1.08);
    muzzleFlash.scaling.z = 1.7;
    muzzleFlash.setEnabled(false);

    this.faceBotToward(spawnPoint.facingTarget, root);

    return {
      root,
      collisionBody,
      bodyMaterial,
      headMaterial,
      muzzleFlash,
      protectedMeshes,
      torso,
      leftLeg,
      rightLeg,
    };
  }

  private faceBotToward(
    target: Vector3,
    root: TransformNode = this.bot.root,
  ): void {
    const direction = target.subtract(root.position);
    root.rotation.y = Math.atan2(direction.x, direction.z);
  }

  private syncBotVisualToCollisionBody(): void {
    this.bot.root.position.copyFromFloats(
      this.bot.collisionBody.position.x,
      this.bot.collisionBody.position.y - BOT_COLLIDER_HALF_HEIGHT,
      this.bot.collisionBody.position.z,
    );
  }

  private normalizeAngle(angle: number): number {
    let normalized = angle;

    while (normalized > Math.PI) {
      normalized -= Math.PI * 2;
    }

    while (normalized < -Math.PI) {
      normalized += Math.PI * 2;
    }

    return normalized;
  }
}
