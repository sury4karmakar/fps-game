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
import type { Scene } from "@babylonjs/core/scene.js";
import type { ArenaSpawnPoint } from "../arena/arenaTypes";
import type { PlayerController } from "../player/PlayerController";

const MAX_HEALTH = 100;
const RESPAWN_DELAY_MS = 1_800;
const SPAWN_PROTECTION_MS = 1_500;
const DAMAGE_FLASH_MS = 180;
const STATUS_MESSAGE_MS = 1_250;
const HEADSHOT_MULTIPLIER = 3;
const COVER_SAFETY_BONUS = 500;

type CombatantId = "player" | "bot";
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
  readonly bodyMaterial: StandardMaterial;
  readonly headMaterial: StandardMaterial;
  readonly protectionShield: Mesh;
}

export interface CombatHudElements {
  readonly playerHealth: HTMLElement;
  readonly playerHealthFill: HTMLElement;
  readonly botHealth: HTMLElement;
  readonly botHealthFill: HTMLElement;
  readonly protectionStatus: HTMLElement;
  readonly combatMessage: HTMLElement;
  readonly damageOverlay: HTMLElement;
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

  private botDamageFlashUntil = 0;
  private playerDamageFlashUntil = 0;
  private messageVisibleUntil = 0;

  public constructor(
    private readonly scene: Scene,
    private readonly playerController: PlayerController,
    private readonly respawnPoints: {
      readonly player: readonly ArenaSpawnPoint[];
      readonly bot: readonly ArenaSpawnPoint[];
    },
    private readonly hud: CombatHudElements,
  ) {
    const now = performance.now();

    this.playerState = this.createInitialState(now);
    this.botState = this.createInitialState(now);
    this.bot = this.createBotModel(respawnPoints.bot[0]);
    this.updateHud(now);

    this.updateObserver = scene.onAfterAnimationsObservable.add(() => {
      this.update();
    });
  }

  public dispose(): void {
    this.scene.onAfterAnimationsObservable.remove(this.updateObserver);
    this.bot.root.dispose(false, true);
    this.hud.damageOverlay.classList.remove("is-visible");
    this.hud.combatMessage.hidden = true;
    this.hud.protectionStatus.hidden = true;
  }

  public applyWeaponHit(mesh: AbstractMesh, baseDamage: number): CombatHitResult {
    const metadata = mesh.metadata as DamageableMetadata | null;

    if (metadata?.combatantId !== "bot" || !this.botState.alive) {
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

    if (!this.playerState.alive || this.isSpawnProtected(this.playerState, now)) {
      if (this.playerState.alive) {
        this.showMessage("SPAWN PROTECTED", now);
      }
      return false;
    }

    this.applyDamage("player", damage, now);
    return true;
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

    if (!this.playerState.alive && now >= this.playerState.respawnAt) {
      this.respawnPlayer(now);
    }

    if (!this.botState.alive && now >= this.botState.respawnAt) {
      this.respawnBot(now);
    }

    const botIsProtected =
      this.botState.alive && this.isSpawnProtected(this.botState, now);
    this.bot.protectionShield.setEnabled(botIsProtected);

    if (now >= this.botDamageFlashUntil) {
      this.bot.bodyMaterial.emissiveColor.copyFromFloats(0, 0, 0);
      this.bot.headMaterial.emissiveColor.copyFromFloats(0, 0, 0);
    }

    if (now >= this.playerDamageFlashUntil) {
      this.hud.damageOverlay.classList.remove("is-visible");
    }

    if (now >= this.messageVisibleUntil) {
      this.hud.combatMessage.hidden = true;
    }

    this.updateProtectionHud(now);
  }

  private applyDamage(target: CombatantId, damage: number, now: number): boolean {
    const state = target === "player" ? this.playerState : this.botState;
    state.health = Math.max(0, state.health - Math.max(0, damage));

    if (target === "player") {
      this.playerDamageFlashUntil = now + DAMAGE_FLASH_MS;
      this.hud.damageOverlay.classList.add("is-visible");
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
      this.playerController.setEnabled(false);
      this.showMessage("YOU WERE ELIMINATED - RESPAWNING", now, RESPAWN_DELAY_MS);
    } else {
      this.bot.root.setEnabled(false);
      this.showMessage("BOT ELIMINATED - RESPAWNING", now, RESPAWN_DELAY_MS);
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
    this.faceBotToward(safeSpawn.facingTarget);
    this.bot.root.setEnabled(true);
    this.bot.protectionShield.setEnabled(true);
    this.showMessage("BOT RESPAWNED", now);
    this.updateHealthHud();
  }

  private resetState(state: CombatantState, now: number): void {
    state.health = MAX_HEALTH;
    state.alive = true;
    state.respawnAt = 0;
    state.spawnProtectedUntil = now + SPAWN_PROTECTION_MS;
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
    this.updateProtectionHud(now);
  }

  private updateHealthHud(): void {
    this.hud.playerHealth.textContent = String(this.playerState.health);
    this.hud.playerHealthFill.style.width = `${this.playerState.health}%`;
    this.hud.botHealth.textContent = String(this.botState.health);
    this.hud.botHealthFill.style.width = `${this.botState.health}%`;

    this.hud.playerHealth.dataset.level = this.getHealthLevel(this.playerState.health);
    this.hud.botHealth.dataset.level = this.getHealthLevel(this.botState.health);
  }

  private updateProtectionHud(now: number): void {
    const remainingProtection = this.playerState.spawnProtectedUntil - now;
    const showProtection = this.playerState.alive && remainingProtection > 0;
    this.hud.protectionStatus.hidden = !showProtection;

    if (showProtection) {
      this.hud.protectionStatus.textContent = `Protected ${(
        remainingProtection / 1000
      ).toFixed(1)}s`;
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

    const root = new TransformNode("bot-target-root", this.scene);
    root.position.copyFrom(spawnPoint.position);

    const bodyMaterial = new StandardMaterial("bot-body-material", this.scene);
    bodyMaterial.diffuseColor = new Color3(0.55, 0.08, 0.055);
    bodyMaterial.specularColor = new Color3(0.18, 0.18, 0.18);

    const headMaterial = new StandardMaterial("bot-head-material", this.scene);
    headMaterial.diffuseColor = new Color3(0.72, 0.2, 0.08);
    headMaterial.specularColor = new Color3(0.22, 0.22, 0.22);

    const protectionMaterial = new StandardMaterial(
      "bot-spawn-protection-material",
      this.scene,
    );
    protectionMaterial.diffuseColor = new Color3(0.12, 0.55, 1);
    protectionMaterial.emissiveColor = new Color3(0.05, 0.25, 0.8);
    protectionMaterial.alpha = 0.22;
    protectionMaterial.wireframe = true;

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

    const protectionShield = CreateSphere(
      "bot-spawn-protection-shield",
      { diameter: 2.65, segments: 16 },
      this.scene,
    );
    protectionShield.parent = root;
    protectionShield.position.y = 1.15;
    protectionShield.scaling.y = 1.08;
    protectionShield.material = protectionMaterial;
    protectionShield.isPickable = false;
    protectionShield.checkCollisions = false;

    this.faceBotToward(spawnPoint.facingTarget, root);

    return { root, bodyMaterial, headMaterial, protectionShield };
  }

  private faceBotToward(
    target: Vector3,
    root: TransformNode = this.bot.root,
  ): void {
    const direction = target.subtract(root.position);
    root.rotation.y = Math.atan2(direction.x, direction.z);
  }
}
