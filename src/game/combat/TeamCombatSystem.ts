import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { BotAI } from "../bot/BotAI";
import {
  type ArenaCoverPoint,
  type ArenaSpawnPoint,
} from "../arena/arenaTypes";
import type { BotDifficultyId } from "../config/gameConfig";
import type {
  BotCombatPort,
  BotControlPort,
  CombatAudioPort,
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
import type { CombatHitResult, CombatHudElements } from "./CombatSystem";

export type TeamId = "blue" | "red";
type BotCombatantId = `blue-bot-${1 | 2}` | `red-bot-${1 | 2 | 3}`;
type CombatantId = "player" | BotCombatantId;

interface CombatantState {
  health: number;
  armor: number;
  armorExpiresAt: number;
  ammunition: number;
  alive: boolean;
  respawnAt: number;
  spawnProtectedUntil: number;
}

interface TeamBot {
  readonly id: BotCombatantId;
  readonly team: TeamId;
  readonly view: BotView;
  readonly animation: BotAnimationController;
  readonly spawnPoints: readonly ArenaSpawnPoint[];
  readonly initialSpawnIndex: number;
  readonly state: CombatantState;
  ai: BotAI | null;
  targetId: CombatantId | null;
  muzzleFlashUntil: number;
  damageFlashUntil: number;
  deathVisualUntil: number;
}

interface SupplyPickup {
  readonly view: PickupView;
  readonly expiresAt: number;
}

interface ArmorSpawnSlot {
  readonly teamSide: TeamId;
  pickup: PickupView | null;
  expiresAt: number;
  nextSpawnAt: number;
}

interface DamageResult {
  readonly applied: boolean;
  readonly eliminated: boolean;
}

const MAX_HEALTH = 100;
const MAX_BOT_AMMUNITION = 90;
const RESPAWN_DELAY_MS = 1_800;
const SPAWN_PROTECTION_MS = 1_500;
const HEADSHOT_MULTIPLIER = 3;
const ARMOR_CAPACITY = 75;
const ARMOR_DAMAGE_ABSORPTION = 0.6;
const ARMOR_DURATION_MS = 24_000;
const ARMOR_INITIAL_SPAWN_DELAY_MS = 20_000;
const ARMOR_RESPAWN_DELAY_MS = 28_000;
const ARMOR_PICKUP_LIFETIME_MS = 18_000;
const PICKUP_RADIUS = 1.1;
const SUPPLY_PICKUP_LIFETIME_MS = 15_000;
const SUPPLY_PICKUP_AMMO = 30;
const DAMAGE_FLASH_MS = 180;
const BOT_MUZZLE_FLASH_MS = 55;
const STATUS_MESSAGE_MS = 1_500;
const SPAWN_PROTECTION_COLOR = new Color3(0.1, 0.78, 1);
const BLUE_BODY_COLOR = new Color3(0.05, 0.24, 0.78);
const BLUE_HEAD_COLOR = new Color3(0.14, 0.48, 1);
const RED_BODY_COLOR = new Color3(0.72, 0.07, 0.05);
const RED_HEAD_COLOR = new Color3(1, 0.18, 0.08);

/**
 * Foundry's local 3v3 simulation. Every participant uses the same combatant
 * state and team rules. Five BotAI instances temporarily fill remote-player
 * slots; the combat/resource model is independent of whether an actor is
 * human, AI-controlled, or eventually network-controlled.
 */
export class TeamCombatSystem implements MatchCombatPort, BotControlPort {
  private readonly bots: TeamBot[];
  private readonly playerState: CombatantState;
  private readonly supplyPickups: SupplyPickup[] = [];
  private readonly armorSlots: ArmorSpawnSlot[];
  private readonly updateObserver: Observer<Scene>;
  private combatEnabled = false;
  private difficultyId: BotDifficultyId = "normal";
  private playerDamageFlashUntil = 0;
  private messageVisibleUntil = 0;

  public constructor(
    private readonly scene: Scene,
    private readonly player: PlayerControlPort,
    private readonly respawnPoints: {
      readonly player: readonly ArenaSpawnPoint[];
      readonly bot: readonly ArenaSpawnPoint[];
    },
    patrolPoints: readonly Vector3[],
    navigationPoints: readonly Vector3[],
    coverPoints: readonly ArenaCoverPoint[],
    collidableMeshes: readonly AbstractMesh[],
    private readonly hud: CombatHudElements,
    private readonly reportTeamKill: (team: TeamId) => void,
    private readonly addPlayerAmmo: (amount: number) => number,
    private readonly audio: CombatAudioPort,
  ) {
    const now = performance.now();
    this.playerState = this.createState(now);
    this.bots = [
      this.createBot("blue-bot-1", "blue", 1, now),
      this.createBot("blue-bot-2", "blue", 2, now),
      this.createBot("red-bot-1", "red", 0, now),
      this.createBot("red-bot-2", "red", 1, now),
      this.createBot("red-bot-3", "red", 2, now),
    ];
    this.armorSlots = [
      this.createArmorSlot("blue", now),
      this.createArmorSlot("red", now),
    ];

    for (const bot of this.bots) {
      bot.ai = new BotAI(
        scene,
        () => this.getTargetPosition(bot),
        this.createBotCombatPort(bot),
        patrolPoints,
        navigationPoints,
        coverPoints,
        collidableMeshes,
        this.difficultyId,
      );
    }

    this.hud.armorPanel.hidden = false;
    this.updateHud(now);
    this.updateObserver = scene.onAfterAnimationsObservable.add(() => this.update());
  }

  public dispose(): void {
    this.scene.onAfterAnimationsObservable.remove(this.updateObserver);
    for (const bot of this.bots) {
      bot.ai?.dispose();
      bot.animation.dispose();
      bot.view.dispose();
    }
    this.clearSupplyPickups();
    this.clearArmorPickups();
    this.hud.damageOverlay.classList.remove("is-visible");
    this.hud.combatMessage.hidden = true;
  }

  public setEnabled(enabled: boolean): void {
    this.combatEnabled = enabled;
    this.bots.forEach((bot) => bot.ai?.setEnabled(enabled));
    if (!enabled) {
      this.bots.forEach((bot) => bot.view.muzzleFlash.setEnabled(false));
      this.hud.damageOverlay.classList.remove("is-visible");
      this.hud.combatMessage.hidden = true;
      this.clearSupplyPickups();
      this.clearArmorPickups();
    }
  }

  public setCombatEnabled(enabled: boolean): void {
    this.setEnabled(enabled);
  }

  public setDifficulty(difficultyId: BotDifficultyId): void {
    this.difficultyId = difficultyId;
    this.bots.forEach((bot) => bot.ai?.setDifficulty(difficultyId));
  }

  public resetForMatch(now = performance.now()): void {
    const playerSpawn = this.respawnPoints.player[0];
    if (!playerSpawn) throw new Error("Foundry requires a Blue player spawn.");

    this.resetState(this.playerState, now);
    this.player.respawn(playerSpawn);
    this.bots.forEach((bot) => this.respawnBot(bot, now, true));
    this.clearSupplyPickups();
    this.clearArmorPickups();
    this.armorSlots.forEach((slot) => {
      slot.nextSpawnAt = now + ARMOR_INITIAL_SPAWN_DELAY_MS;
    });
    this.playerDamageFlashUntil = 0;
    this.messageVisibleUntil = 0;
    this.hud.damageOverlay.classList.remove("is-visible");
    this.hud.combatMessage.hidden = true;
    this.updateHud(now);
  }

  public applyWeaponHit(
    mesh: AbstractMesh,
    baseDamage: number,
  ): CombatHitResult & { readonly handled: boolean } {
    const metadata = mesh.metadata as BotDamageMetadata | null;
    const combatantId = metadata?.combatantId as CombatantId | undefined;
    if (!combatantId || combatantId === "player") {
      return { damageApplied: false, eliminated: false, handled: false };
    }

    const target = this.getBot(combatantId);
    if (!target) {
      return { damageApplied: false, eliminated: false, handled: false };
    }
    if (target.team === "blue") {
      return { damageApplied: false, eliminated: false, handled: true };
    }

    const multiplier = metadata?.hitZone === "head" ? HEADSHOT_MULTIPLIER : 1;
    const result = this.damageCombatant(
      target.id,
      Math.round(baseDamage * multiplier),
      "blue",
      performance.now(),
    );
    return {
      damageApplied: result.applied,
      eliminated: result.eliminated,
      handled: true,
    };
  }

  /** Propagates player gunfire to hostile BotAI hearing without alerting allies. */
  public notifyPlayerWeaponFired(position: Vector3): void {
    this.notifyEnemyBotsOfShot("blue", position);
  }

  private createBot(
    id: BotCombatantId,
    team: TeamId,
    spawnIndex: number,
    now: number,
  ): TeamBot {
    const spawnPoints = team === "blue"
      ? this.respawnPoints.player
      : this.respawnPoints.bot;
    const spawn = spawnPoints[spawnIndex % spawnPoints.length];
    if (!spawn) throw new Error(`Foundry requires a ${team} team spawn.`);

    const view = new BotView(this.scene, {
      namePrefix: id,
      combatantId: id,
      position: spawn.position,
      facingTarget: spawn.facingTarget,
      damageable: true,
      collisionEnabled: true,
    });
    view.bodyMaterial.diffuseColor.copyFrom(team === "blue" ? BLUE_BODY_COLOR : RED_BODY_COLOR);
    view.headMaterial.diffuseColor.copyFrom(team === "blue" ? BLUE_HEAD_COLOR : RED_HEAD_COLOR);

    return {
      id,
      team,
      view,
      animation: new BotAnimationController(this.scene, view),
      spawnPoints,
      initialSpawnIndex: spawnIndex,
      state: this.createState(now),
      ai: null,
      targetId: null,
      muzzleFlashUntil: 0,
      damageFlashUntil: 0,
      deathVisualUntil: 0,
    };
  }

  private createBotCombatPort(bot: TeamBot): BotCombatPort {
    const system = this;
    return {
      get isBotAlive(): boolean {
        return bot.state.alive;
      },
      get hasLivingTarget(): boolean {
        return system.selectTarget(bot) !== null;
      },
      consumeBotAmmo(): boolean {
        if (!system.combatEnabled || !bot.state.alive || bot.state.ammunition <= 0) {
          return false;
        }
        bot.state.ammunition -= 1;
        return true;
      },
      damageTarget(damage: number): boolean {
        const target = system.getCurrentTarget(bot);
        if (!target) return false;
        return system.damageCombatant(target, damage, bot.team, performance.now()).applied;
      },
      getBotPosition(): Vector3 {
        return bot.view.root.position.clone();
      },
      getBotEyePosition(): Vector3 {
        return bot.view.root.position.add(new Vector3(0, BOT_EYE_HEIGHT, 0));
      },
      getBotMuzzlePosition(): Vector3 {
        return bot.view.muzzleFlash.getAbsolutePosition().clone();
      },
      getBotForward(): Vector3 {
        return new Vector3(
          Math.sin(bot.view.root.rotation.y),
          0,
          Math.cos(bot.view.root.rotation.y),
        );
      },
      moveBot(displacement: Vector3): number {
        if (!system.combatEnabled || !bot.state.alive) return 0;
        const previous = bot.view.collisionBody.position.clone();
        bot.view.collisionBody.moveWithCollisions(displacement);
        bot.view.syncVisualToCollisionBody();
        const distance = Vector3.Distance(previous, bot.view.collisionBody.position);
        if (distance > 0.002) bot.animation.recordMovement(distance);
        return distance;
      },
      turnBotToward(target: Vector3, maximumTurn: number): number {
        const direction = target.subtract(bot.view.root.position);
        const targetYaw = Math.atan2(direction.x, direction.z);
        const yawDifference = system.normalizeAngle(targetYaw - bot.view.root.rotation.y);
        const applied = Math.max(-maximumTurn, Math.min(maximumTurn, yawDifference));
        bot.view.root.rotation.y = system.normalizeAngle(bot.view.root.rotation.y + applied);
        return Math.abs(yawDifference - applied);
      },
      showBotMuzzleFlash(now: number): void {
        if (!system.combatEnabled || !bot.state.alive) return;
        bot.view.muzzleFlash.setEnabled(true);
        bot.view.muzzleFlash.scaling.setAll(0.75 + Math.random() * 0.5);
        bot.muzzleFlashUntil = now + BOT_MUZZLE_FLASH_MS;
        system.audio.playBotGunshot();
        system.notifyEnemyBotsOfShot(bot.team, bot.view.root.position);
      },
    };
  }

  private update(): void {
    if (!this.combatEnabled) return;
    const now = performance.now();

    if (!this.playerState.alive && now >= this.playerState.respawnAt) {
      this.respawnPlayer(now);
    }
    this.updateStateExpiry(this.playerState, now);

    for (const bot of this.bots) {
      this.updateStateExpiry(bot.state, now);
      if (!bot.state.alive) {
        if (now >= bot.deathVisualUntil) bot.view.root.setEnabled(false);
        if (now >= bot.state.respawnAt) this.respawnBot(bot, now, false);
        continue;
      }

      bot.animation.update(now);
      this.updateBotProtectionVisual(bot, now);
      if (now >= bot.muzzleFlashUntil) bot.view.muzzleFlash.setEnabled(false);
      if (now >= bot.damageFlashUntil) {
        bot.view.bodyMaterial.emissiveColor.copyFromFloats(0, 0, 0);
        bot.view.headMaterial.emissiveColor.copyFromFloats(0, 0, 0);
      }
    }

    if (now >= this.playerDamageFlashUntil) {
      this.hud.damageOverlay.classList.remove("is-visible");
    }
    if (now >= this.messageVisibleUntil) {
      this.hud.combatMessage.hidden = true;
    }

    this.updateSupplyPickups(now);
    this.updateArmorPickups(now);
    this.updateHud(now);
  }

  private damageCombatant(
    targetId: CombatantId,
    damage: number,
    attackerTeam: TeamId,
    now: number,
  ): DamageResult {
    const targetTeam = this.getTeam(targetId);
    const state = this.getState(targetId);
    if (
      !this.combatEnabled ||
      targetTeam === attackerTeam ||
      !state?.alive ||
      now < state.spawnProtectedUntil
    ) {
      return { applied: false, eliminated: false };
    }

    let healthDamage = Math.max(0, damage);
    if (state.armor > 0 && healthDamage > 0) {
      const absorbed = Math.min(
        state.armor,
        Math.max(1, Math.round(healthDamage * ARMOR_DAMAGE_ABSORPTION)),
      );
      state.armor -= absorbed;
      healthDamage -= absorbed;
      if (targetId === "player") this.audio.playArmorDamage();
    }
    state.health = Math.max(0, state.health - healthDamage);

    if (targetId === "player") {
      this.playerDamageFlashUntil = now + DAMAGE_FLASH_MS;
      this.hud.damageOverlay.classList.add("is-visible");
      this.audio.playPlayerDamage();
    } else {
      const bot = this.getBot(targetId);
      if (bot) {
        bot.damageFlashUntil = now + DAMAGE_FLASH_MS;
        bot.view.bodyMaterial.emissiveColor.copyFromFloats(0.8, 0.04, 0.02);
        bot.view.headMaterial.emissiveColor.copyFromFloats(1, 0.12, 0.04);
      }
    }

    if (state.health > 0) {
      return { applied: true, eliminated: false };
    }

    this.handleDeath(targetId, attackerTeam, now);
    return { applied: true, eliminated: true };
  }

  private handleDeath(targetId: CombatantId, attackerTeam: TeamId, now: number): void {
    const state = this.getState(targetId);
    if (!state) return;
    state.alive = false;
    state.respawnAt = now + RESPAWN_DELAY_MS;
    state.spawnProtectedUntil = 0;
    state.armor = 0;
    state.armorExpiresAt = 0;
    this.createSupplyPickup(this.getCombatantPosition(targetId), now);

    if (targetId === "player") {
      this.player.setEnabled(false);
      this.showMessage("YOU WERE ELIMINATED - RESPAWNING", now, RESPAWN_DELAY_MS);
    } else {
      const bot = this.getBot(targetId);
      if (bot) {
        bot.view.collisionBody.setEnabled(false);
        bot.animation.setAlive(false, now);
        bot.deathVisualUntil = now + 500;
      }
    }
    this.reportTeamKill(attackerTeam);
  }

  private respawnPlayer(now: number): void {
    const spawn = this.selectSafestSpawn(this.respawnPoints.player, "red");
    this.resetState(this.playerState, now);
    this.player.respawn(spawn);
    this.showMessage("RESPAWNED - SPAWN PROTECTED", now);
  }

  private respawnBot(bot: TeamBot, now: number, initial: boolean): void {
    const availableSpawns = bot.team === "blue"
      ? bot.spawnPoints.slice(1)
      : bot.spawnPoints;
    const spawn = initial
      ? bot.spawnPoints[bot.initialSpawnIndex]
      : this.selectSafestSpawn(availableSpawns, bot.team === "blue" ? "red" : "blue");
    if (!spawn) return;

    this.resetState(bot.state, now);
    bot.targetId = null;
    bot.view.root.position.copyFrom(spawn.position);
    bot.view.collisionBody.position.copyFrom(
      spawn.position.add(new Vector3(0, BOT_COLLIDER_HALF_HEIGHT, 0)),
    );
    bot.view.faceToward(spawn.facingTarget);
    bot.view.collisionBody.setEnabled(true);
    bot.view.root.setEnabled(true);
    bot.view.muzzleFlash.setEnabled(false);
    bot.animation.setAlive(true, now);
    bot.deathVisualUntil = 0;
    bot.damageFlashUntil = 0;
  }

  private selectTarget(bot: TeamBot): CombatantId | null {
    const enemies = this.getLivingCombatantIds().filter(
      (id) => this.getTeam(id) !== bot.team,
    );
    let closest: CombatantId | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const enemyId of enemies) {
      const distance = Vector3.DistanceSquared(
        bot.view.root.position,
        this.getCombatantPosition(enemyId),
      );
      if (distance < closestDistance) {
        closest = enemyId;
        closestDistance = distance;
      }
    }
    bot.targetId = closest;
    return closest;
  }

  private getCurrentTarget(bot: TeamBot): CombatantId | null {
    const current = bot.targetId;
    if (
      current &&
      this.getTeam(current) !== bot.team &&
      this.getState(current)?.alive
    ) {
      return current;
    }
    return this.selectTarget(bot);
  }

  private getTargetPosition(bot: TeamBot): Vector3 {
    const target = this.selectTarget(bot);
    return target
      ? this.getCombatantAimPosition(target)
      : bot.view.root.position.clone();
  }

  private notifyEnemyBotsOfShot(team: TeamId, position: Vector3): void {
    for (const bot of this.bots) {
      if (bot.team !== team) bot.ai?.notifyPlayerShot(position);
    }
  }

  private createSupplyPickup(position: Vector3, now: number): void {
    const pickupPosition = new Vector3(position.x, position.y + 0.42, position.z);
    this.supplyPickups.push({
      view: new PickupView(this.scene, "supply", {
        namePrefix: `team-supply-${now}-${this.supplyPickups.length}`,
        position: pickupPosition,
        animation: {
          rotationSpeed: 1.6,
          pulseAmplitude: 0.08,
          pulseFrequency: 6,
        },
      }),
      expiresAt: now + SUPPLY_PICKUP_LIFETIME_MS,
    });
  }

  private updateSupplyPickups(now: number): void {
    for (let index = this.supplyPickups.length - 1; index >= 0; index -= 1) {
      const pickup = this.supplyPickups[index];
      if (!pickup) continue;
      if (now >= pickup.expiresAt) {
        pickup.view.dispose();
        this.supplyPickups.splice(index, 1);
        continue;
      }

      const collector = this.findPickupCollector(pickup.view.mesh.position);
      if (!collector) continue;
      const state = this.getState(collector);
      if (!state) continue;
      state.health = MAX_HEALTH;
      state.ammunition = Math.min(
        MAX_BOT_AMMUNITION,
        state.ammunition + SUPPLY_PICKUP_AMMO,
      );
      if (collector === "player") {
        this.addPlayerAmmo(SUPPLY_PICKUP_AMMO);
        this.showMessage("SUPPLY COLLECTED - HEALTH + AMMO", now);
      }
      this.audio.playArmorPickup();
      pickup.view.dispose();
      this.supplyPickups.splice(index, 1);
    }
  }

  private createArmorSlot(teamSide: TeamId, now: number): ArmorSpawnSlot {
    return {
      teamSide,
      pickup: null,
      expiresAt: 0,
      nextSpawnAt: now + ARMOR_INITIAL_SPAWN_DELAY_MS,
    };
  }

  private updateArmorPickups(now: number): void {
    for (const slot of this.armorSlots) {
      if (!slot.pickup && now >= slot.nextSpawnAt) {
        this.spawnArmorPickup(slot, now);
      }
      if (!slot.pickup) continue;
      if (now >= slot.expiresAt) {
        this.disposeArmorPickup(slot, now);
        continue;
      }

      const collector = this.findPickupCollector(slot.pickup.mesh.position);
      if (!collector) continue;
      const state = this.getState(collector);
      if (!state) continue;
      state.armor = ARMOR_CAPACITY;
      state.armorExpiresAt = now + ARMOR_DURATION_MS;
      if (collector === "player") {
        this.showMessage("ARMOR EQUIPPED - 24 SECONDS", now);
      }
      this.audio.playArmorPickup();
      this.disposeArmorPickup(slot, now);
    }
  }

  private spawnArmorPickup(slot: ArmorSpawnSlot, now: number): void {
    const candidates = slot.teamSide === "blue"
      ? this.respawnPoints.player
      : this.respawnPoints.bot;
    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    if (!selected) return;
    slot.pickup = new PickupView(this.scene, "armor", {
      namePrefix: `${slot.teamSide}-side-armor-${now}`,
      position: selected.position.add(new Vector3(0, 0.48, 0)),
      animation: {
        rotationSpeed: 1.4,
        bobAmplitude: 0.06,
        bobFrequency: 3.5,
        pulseAmplitude: 0.07,
        pulseFrequency: 6,
      },
    });
    slot.expiresAt = now + ARMOR_PICKUP_LIFETIME_MS;
  }

  private disposeArmorPickup(slot: ArmorSpawnSlot, now: number): void {
    slot.pickup?.dispose();
    slot.pickup = null;
    slot.expiresAt = 0;
    slot.nextSpawnAt = now + ARMOR_RESPAWN_DELAY_MS;
  }

  private findPickupCollector(position: Vector3): CombatantId | null {
    for (const id of this.getLivingCombatantIds()) {
      const actorPosition = this.getCombatantPosition(id);
      if (Math.hypot(position.x - actorPosition.x, position.z - actorPosition.z) <= PICKUP_RADIUS) {
        return id;
      }
    }
    return null;
  }

  private updateStateExpiry(state: CombatantState, now: number): void {
    if (state.armor > 0 && now >= state.armorExpiresAt) {
      state.armor = 0;
      state.armorExpiresAt = 0;
    }
  }

  private selectSafestSpawn(
    candidates: readonly ArenaSpawnPoint[],
    threatTeam: TeamId,
  ): ArenaSpawnPoint {
    const first = candidates[0];
    if (!first) throw new Error("Foundry requires team respawn points.");
    const threats = this.getLivingCombatantIds().filter(
      (id) => this.getTeam(id) === threatTeam,
    );
    if (threats.length === 0) return first;

    return candidates.reduce((safest, candidate) => {
      const nearestThreatDistance = (spawn: ArenaSpawnPoint): number => Math.min(
        ...threats.map((id) => Vector3.DistanceSquared(
          spawn.position,
          this.getCombatantPosition(id),
        )),
      );
      return nearestThreatDistance(candidate) > nearestThreatDistance(safest)
        ? candidate
        : safest;
    }, first);
  }

  private updateBotProtectionVisual(bot: TeamBot, now: number): void {
    const protectedOrArmored = now < bot.state.spawnProtectedUntil || bot.state.armor > 0;
    const outlineColor = bot.state.armor > 0
      ? new Color3(0.08, 0.68, 1)
      : SPAWN_PROTECTION_COLOR;
    for (const mesh of bot.view.protectedMeshes) {
      mesh.renderOutline = protectedOrArmored;
      mesh.outlineColor.copyFrom(outlineColor);
      mesh.outlineWidth = 0.075;
    }
  }

  private getLivingCombatantIds(): CombatantId[] {
    const ids: CombatantId[] = [];
    if (this.playerState.alive) ids.push("player");
    this.bots.forEach((bot) => {
      if (bot.state.alive) ids.push(bot.id);
    });
    return ids;
  }

  private getBot(id: CombatantId): TeamBot | null {
    return this.bots.find((bot) => bot.id === id) ?? null;
  }

  private getState(id: CombatantId): CombatantState | null {
    return id === "player"
      ? this.playerState
      : this.getBot(id)?.state ?? null;
  }

  private getTeam(id: CombatantId): TeamId {
    return id === "player" ? "blue" : this.getBot(id)?.team ?? "red";
  }

  private getCombatantPosition(id: CombatantId): Vector3 {
    if (id === "player") {
      return new Vector3(this.player.camera.position.x, 0, this.player.camera.position.z);
    }
    return this.getBot(id)?.view.root.position.clone() ?? Vector3.Zero();
  }

  private getCombatantAimPosition(id: CombatantId): Vector3 {
    if (id === "player") return this.player.camera.position.clone();
    return this.getBot(id)?.view.root.position.add(new Vector3(0, 1.25, 0)) ?? Vector3.Zero();
  }

  private createState(now: number): CombatantState {
    return {
      health: MAX_HEALTH,
      armor: 0,
      armorExpiresAt: 0,
      ammunition: MAX_BOT_AMMUNITION,
      alive: true,
      respawnAt: 0,
      spawnProtectedUntil: now + SPAWN_PROTECTION_MS,
    };
  }

  private resetState(state: CombatantState, now: number): void {
    state.health = MAX_HEALTH;
    state.armor = 0;
    state.armorExpiresAt = 0;
    state.ammunition = MAX_BOT_AMMUNITION;
    state.alive = true;
    state.respawnAt = 0;
    state.spawnProtectedUntil = now + SPAWN_PROTECTION_MS;
  }

  private clearSupplyPickups(): void {
    this.supplyPickups.splice(0).forEach((pickup) => pickup.view.dispose());
  }

  private clearArmorPickups(): void {
    const now = performance.now();
    this.armorSlots?.forEach((slot) => {
      slot.pickup?.dispose();
      slot.pickup = null;
      slot.expiresAt = 0;
      slot.nextSpawnAt = now + ARMOR_INITIAL_SPAWN_DELAY_MS;
    });
  }

  private updateHud(now: number): void {
    this.hud.playerHealth.textContent = String(this.playerState.health);
    this.hud.playerHealthFill.style.width = `${this.playerState.health}%`;
    this.hud.playerHealth.dataset.level = this.getHealthLevel(this.playerState.health);
    this.hud.playerArmor.textContent = `${this.playerState.armor} / ${ARMOR_CAPACITY}`;
    this.hud.playerArmorFill.style.width = `${(this.playerState.armor / ARMOR_CAPACITY) * 100}%`;
    this.hud.armorPanel.dataset.active = String(this.playerState.armor > 0);
    this.hud.armorStatus.textContent = this.playerState.armor > 0
      ? `Armor active · ${Math.max(0, Math.ceil((this.playerState.armorExpiresAt - now) / 1_000))}s`
      : "No armor";
  }

  private showMessage(message: string, now: number, duration = STATUS_MESSAGE_MS): void {
    this.hud.combatMessage.textContent = message;
    this.hud.combatMessage.hidden = false;
    this.messageVisibleUntil = now + duration;
  }

  private getHealthLevel(health: number): "healthy" | "hurt" | "critical" {
    if (health <= 30) return "critical";
    if (health <= 65) return "hurt";
    return "healthy";
  }

  private normalizeAngle(angle: number): number {
    let normalized = angle;
    while (normalized > Math.PI) normalized -= Math.PI * 2;
    while (normalized < -Math.PI) normalized += Math.PI * 2;
    return normalized;
  }

}
