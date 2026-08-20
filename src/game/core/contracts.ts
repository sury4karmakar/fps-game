import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { ArenaSpawnPoint } from "../arena/arenaTypes";
import type { BotDifficultyId, WeaponId } from "../config/gameConfig";

export interface Disposable {
  dispose(): void;
}

export interface DynamicCollisionPort {
  registerCollisionMeshes(meshes: readonly AbstractMesh[]): Disposable;
}

export interface Enableable {
  setEnabled(enabled: boolean): void;
}

export interface PlayerControlPort extends Enableable, DynamicCollisionPort {
  readonly camera: FreeCamera;
  respawn(spawnPoint: ArenaSpawnPoint): void;
}

export interface PlayerSettingsPort {
  setMouseSensitivity(value: number): number;
}

export interface WeaponControlPort extends Enableable {
  resetForMatch(): void;
}

/** Narrow inventory contract used only by Training Ground sections. */
export interface TrainingWeaponControlPort {
  readonly hasTrainingWeapon: boolean;
  setTrainingInventoryEnabled(enabled: boolean): void;
  equipTrainingWeapon(weaponId: WeaponId): void;
  refillTrainingWeapon(): TrainingAmmoRefillResult;
  showTrainingWeaponRequired(): void;
}

export interface TrainingAmmoRefillResult {
  readonly status: "refilled" | "full" | "no-weapon";
  readonly added: number;
}

export interface BotControlPort extends Enableable {
  setDifficulty(difficultyId: BotDifficultyId): void;
}

export interface MatchControlPort extends Disposable {
  startMatch(): void;
}

export interface MatchCombatPort {
  resetForMatch(now?: number): void;
  setCombatEnabled(enabled: boolean): void;
}

export interface BotCombatPort {
  readonly isBotAlive: boolean;
  readonly isPlayerAlive: boolean;
  damagePlayer(damage: number): boolean;
  getBotPosition(): Vector3;
  getBotEyePosition(): Vector3;
  getBotMuzzlePosition(): Vector3;
  getBotForward(): Vector3;
  moveBot(displacement: Vector3): number;
  turnBotToward(target: Vector3, maximumTurn: number): number;
  showBotMuzzleFlash(now: number): void;
}

export interface WeaponAudioPort {
  playPlayerGunshot(): void;
  playReload(): void;
  playImpact(): void;
  playHitConfirmation(eliminated: boolean): void;
  playTrainingInteraction(): void;
}

export interface CombatAudioPort {
  playBotGunshot(): void;
  playPlayerDamage(): void;
  playArmorPickup(): void;
  playArmorDamage(): void;
}

export interface MatchAudioPort {
  playMatchStart(): void;
  playMatchEnd(result: "player-win" | "bot-win" | "draw"): void;
}

export interface AudioSettingsPort {
  readonly isMuted: boolean;
  readonly volumePercent: number;
  setMuted(muted: boolean): void;
  setVolume(value: number): number;
  onStateChanged(listener: () => void): () => void;
}

export type KillOwner = "player" | "bot";
