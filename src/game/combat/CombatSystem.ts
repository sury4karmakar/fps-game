import { Ray } from "@babylonjs/core/Culling/ray.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import "@babylonjs/core/Rendering/outlineRenderer.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/Shaders/outline.fragment.js";
import "@babylonjs/core/Shaders/outline.vertex.js";
import {
  isArenaCollisionMesh,
  type ArenaSpawnPoint,
} from "../arena/arenaTypes";
import { GAME_NAME } from "../config/gameConfig";
import type {
  CombatAudioPort,
  KillOwner,
  MatchCombatPort,
  PlayerControlPort,
} from "../core/contracts";
import { BotAnimationController } from "../entities/bot/BotAnimationController";
import {
  BOT_COLLIDER_HALF_HEIGHT,
  BOT_EYE_HEIGHT,
  BotView,
  type BotDamageMetadata,
} from "../entities/bot/BotView";
import { PickupView } from "../entities/pickup/PickupView";

const MAX_HEALTH = 100;
const RESPAWN_DELAY_MS = 1_800;
const SPAWN_PROTECTION_MS = 1_500;
const DAMAGE_FLASH_MS = 180;
const STATUS_MESSAGE_MS = 1_250;
const HEADSHOT_MULTIPLIER = 3;
const COVER_SAFETY_BONUS = 500;
const SPAWN_PROTECTION_COLOR = new Color3(0.1, 0.78, 1);
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
export type { KillOwner } from "../core/contracts";

interface CombatantState {
  health: number;
  alive: boolean;
  respawnAt: number;
  spawnProtectedUntil: number;
}

interface SupplyPickup {
  readonly view: PickupView;
  readonly expiresAt: number;
}

interface ArmorPickup {
  readonly view: PickupView;
  readonly expiresAt: number;
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

export class CombatSystem implements MatchCombatPort {
  private readonly bot: BotView;
  private readonly botAnimation: BotAnimationController;
  private readonly playerState: CombatantState;
  private readonly botState: CombatantState;
  private readonly updateObserver: Observer<Scene>;
  private readonly arenaCollisionMeshes: ReadonlySet<AbstractMesh>;
  private readonly supplyPickups: SupplyPickup[] = [];
  private armorPickup: ArmorPickup | null = null;

  private botDamageFlashUntil = 0;
  private botMuzzleFlashUntil = 0;
  private combatEnabled = false;
  private playerDamageFlashUntil = 0;
  private messageVisibleUntil = 0;
  private botDeathVisualUntil = 0;
  private armor = 0;
  private armorExpiresAt = 0;
  private armorFlashUntil = 0;
  private armorEquipFeedbackUntil = 0;
  private nextArmorSpawnAt = 0;

  public constructor(
    private readonly scene: Scene,
    private readonly playerController: PlayerControlPort,
    private readonly respawnPoints: {
      readonly player: readonly ArenaSpawnPoint[];
      readonly bot: readonly ArenaSpawnPoint[];
    },
    collidableMeshes: readonly AbstractMesh[],
    private readonly hud: CombatHudElements,
    private readonly reportKill: (killer: KillOwner) => void,
    private readonly addPlayerAmmo: (amount: number) => number,
    private readonly audioSystem: CombatAudioPort,
    private readonly botEnabled = true,
    private readonly armorPickupsEnabled = true,
  ) {
    this.arenaCollisionMeshes = new Set(collidableMeshes);
    const now = performance.now();

    this.playerState = this.createInitialState(now);
    this.botState = this.createInitialState(now);
    const initialBotSpawn = respawnPoints.bot[0];
    if (!initialBotSpawn) {
      throw new Error(`${GAME_NAME} requires an initial bot spawn point.`);
    }
    this.bot = new BotView(scene, {
      namePrefix: "bot-target",
      position: initialBotSpawn.position,
      facingTarget: initialBotSpawn.facingTarget,
      damageable: true,
      collisionEnabled: true,
    });
    this.botAnimation = new BotAnimationController(scene, this.bot);
    if (!this.botEnabled) {
      this.bot.root.setEnabled(false);
      this.bot.collisionBody.setEnabled(false);
      this.botState.alive = false;
    }
    this.nextArmorSpawnAt = armorPickupsEnabled
      ? now + ARMOR_INITIAL_SPAWN_DELAY_MS
      : Number.POSITIVE_INFINITY;
    this.hud.armorPanel.hidden = !armorPickupsEnabled;
    this.updateHud(now);

    this.updateObserver = scene.onAfterAnimationsObservable.add(() => {
      this.update();
    });
  }

  public dispose(): void {
    this.scene.onAfterAnimationsObservable.remove(this.updateObserver);
    this.botAnimation.dispose();
    this.bot.dispose();
    this.clearSupplyPickups();
    this.clearArmorPickup();
    this.hud.damageOverlay.classList.remove("is-visible");
    this.hud.combatMessage.hidden = true;
  }

  public applyWeaponHit(mesh: AbstractMesh, baseDamage: number): CombatHitResult {
    const metadata = mesh.metadata as BotDamageMetadata | null;

    if (
      !this.combatEnabled ||
      metadata?.combatantId !== "bot" ||
      !this.botEnabled ||
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

    if (!playerSpawn || (this.botEnabled && !botSpawn)) {
      throw new Error(`${GAME_NAME} requires player and bot match spawns.`);
    }

    this.resetState(this.playerState, now);
    this.resetState(this.botState, now);
    this.playerController.respawn(playerSpawn);
    if (this.botEnabled && botSpawn) {
      this.bot.root.position.copyFrom(botSpawn.position);
      this.bot.collisionBody.position.copyFrom(
        botSpawn.position.add(new Vector3(0, BOT_COLLIDER_HALF_HEIGHT, 0)),
      );
      this.bot.faceToward(botSpawn.facingTarget);
      this.bot.collisionBody.setEnabled(true);
      this.bot.root.setEnabled(true);
    } else {
      this.botState.alive = false;
      this.bot.collisionBody.setEnabled(false);
      this.bot.root.setEnabled(false);
    }
    this.botDamageFlashUntil = 0;
    this.botMuzzleFlashUntil = 0;
    this.playerDamageFlashUntil = 0;
    this.messageVisibleUntil = 0;
    this.armor = 0;
    this.armorExpiresAt = 0;
    this.armorFlashUntil = 0;
    this.armorEquipFeedbackUntil = 0;
    this.nextArmorSpawnAt = this.armorPickupsEnabled
      ? now + ARMOR_INITIAL_SPAWN_DELAY_MS
      : Number.POSITIVE_INFINITY;
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
    if (!this.combatEnabled || !this.botEnabled || !this.botState.alive) {
      return 0;
    }

    const previousPosition = this.bot.collisionBody.position.clone();
    this.bot.collisionBody.moveWithCollisions(displacement);
    this.bot.syncVisualToCollisionBody();
    const distanceMoved = Vector3.Distance(previousPosition, this.bot.collisionBody.position);
    if (distanceMoved > 0.002) {
      this.botAnimation.recordMovement(distanceMoved);
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
    if (!this.combatEnabled || !this.botEnabled || !this.botState.alive) {
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

    if (this.botEnabled && !this.botState.alive && now >= this.botState.respawnAt) {
      this.respawnBot(now);
    }

    const botIsProtected = this.botEnabled &&
      this.botState.alive && this.isSpawnProtected(this.botState, now);
    this.updateBotProtectionVisual(botIsProtected, now);

    if (now >= this.botDamageFlashUntil) {
      this.bot.bodyMaterial.emissiveColor.copyFromFloats(0, 0, 0);
      this.bot.headMaterial.emissiveColor.copyFromFloats(0, 0, 0);
    }

    if (now >= this.botMuzzleFlashUntil) {
      this.bot.muzzleFlash.setEnabled(false);
    }

    this.botAnimation.update(now);

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
    if (this.armorPickupsEnabled) {
      this.updateArmorPickup(now);
      this.updateArmorState(now);
    }
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
      this.botAnimation.setAlive(false, now);
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
    this.bot.faceToward(safeSpawn.facingTarget);
    this.bot.collisionBody.setEnabled(true);
    this.bot.root.setEnabled(true);
    this.botAnimation.setAlive(true, now);
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

  private createSupplyPickup(position: Vector3, now: number): void {
    const pickupPosition = position.clone();
    pickupPosition.y += 0.42;
    const view = new PickupView(this.scene, "supply", {
      namePrefix: `bot-supply-${now}`,
      position: pickupPosition,
      animation: {
        rotationSpeed: 1.6,
        pulseAmplitude: 0.08,
        pulseFrequency: 6,
      },
    });
    this.supplyPickups.push({
      view,
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
        pickup.view.dispose();
        this.supplyPickups.splice(index, 1);
        continue;
      }

      const horizontalDistance = Math.hypot(
        pickup.view.mesh.position.x - playerPosition.x,
        pickup.view.mesh.position.z - playerPosition.z,
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
      pickup.view.dispose();
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

    const playerPosition = this.playerController.camera.position;
    const distance = Math.hypot(
      pickup.view.mesh.position.x - playerPosition.x,
      pickup.view.mesh.position.z - playerPosition.z,
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
    position.y += 0.48;
    const view = new PickupView(this.scene, "armor", {
      namePrefix: `armor-pickup-${now}`,
      position,
      animation: {
        rotationSpeed: 1.4,
        bobAmplitude: 0.06,
        bobFrequency: 3.5,
        pulseAmplitude: 0.07,
        pulseFrequency: 6,
      },
    });
    this.armorPickup = {
      view,
      expiresAt: now + ARMOR_PICKUP_LIFETIME_MS,
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
      pickup.view.dispose();
    }

    this.supplyPickups.length = 0;
  }

  private clearArmorPickup(): void {
    this.armorPickup?.view.dispose();
    this.armorPickup = null;
  }

  private selectSafestSpawn(
    candidates: readonly ArenaSpawnPoint[],
    threatPosition: Vector3,
  ): ArenaSpawnPoint {
    const firstCandidate = candidates[0];

    if (!firstCandidate) {
      throw new Error(`${GAME_NAME} requires at least one respawn point.`);
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
          this.isArenaCollision,
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

  private readonly isArenaCollision = (mesh: AbstractMesh): boolean =>
    this.arenaCollisionMeshes.has(mesh) && isArenaCollisionMesh(mesh);

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
