/** The user-facing game name. Update this value to rename the application. */
export const GAME_NAME = "Open FPS";

export type WeaponId = "assault-rifle" | "scattergun" | "marksman-rifle";

export type WeaponFireMode = "automatic" | "semi-automatic";

export interface WeaponDefinition {
  readonly id: WeaponId;
  readonly displayName: string;
  readonly role: string;
  readonly fireMode: WeaponFireMode;
  readonly magazineCapacity: number;
  readonly startingReserveAmmo: number;
  readonly maxTotalAmmo: number;
  readonly damagePerProjectile: number;
  readonly projectilesPerShot: number;
  readonly fireIntervalMs: number;
  readonly reloadDurationMs: number;
  readonly range: number;
  readonly spreadRadians: number;
  readonly recoilKick: number;
  readonly adsFieldOfView: number;
}

export const DEFAULT_WEAPON_ID: WeaponId = "assault-rifle";

export const WEAPON_DEFINITIONS: Readonly<Record<WeaponId, WeaponDefinition>> = {
  "assault-rifle": {
    id: "assault-rifle",
    displayName: "Assault Rifle",
    role: "Reliable automatic mid-range weapon.",
    fireMode: "automatic",
    magazineCapacity: 30,
    startingReserveAmmo: 60,
    maxTotalAmmo: 90,
    damagePerProjectile: 34,
    projectilesPerShot: 1,
    fireIntervalMs: 100,
    reloadDurationMs: 1_550,
    range: 80,
    spreadRadians: 0,
    recoilKick: 0.012,
    adsFieldOfView: 0.64,
  },
  scattergun: {
    id: "scattergun",
    displayName: "Scattergun",
    role: "High-damage close-range weapon with pellet spread.",
    fireMode: "semi-automatic",
    magazineCapacity: 8,
    startingReserveAmmo: 32,
    maxTotalAmmo: 40,
    damagePerProjectile: 12,
    projectilesPerShot: 8,
    fireIntervalMs: 720,
    reloadDurationMs: 2_100,
    range: 24,
    spreadRadians: 0.09,
    recoilKick: 0.028,
    adsFieldOfView: 0.73,
  },
  "marksman-rifle": {
    id: "marksman-rifle",
    displayName: "Marksman Rifle",
    role: "Accurate long-range weapon with deliberate follow-up shots.",
    fireMode: "semi-automatic",
    magazineCapacity: 12,
    startingReserveAmmo: 36,
    maxTotalAmmo: 48,
    damagePerProjectile: 58,
    projectilesPerShot: 1,
    fireIntervalMs: 430,
    reloadDurationMs: 1_800,
    range: 110,
    spreadRadians: 0.006,
    recoilKick: 0.02,
    adsFieldOfView: 0.43,
  },
};

export type BotDifficultyId = "easy" | "normal" | "hard";

export interface BotDifficultyDefinition {
  readonly id: BotDifficultyId;
  readonly displayName: string;
  readonly description: string;
  readonly reactionTimeMs: {
    readonly minimum: number;
    readonly maximum: number;
  };
  readonly aimSpreadMultiplier: number;
  readonly movementSpeedMultiplier: number;
  readonly fireIntervalMultiplier: number;
  readonly detectionRangeMultiplier: number;
  readonly combatDecisionIntervalMultiplier: number;
}

export const DEFAULT_BOT_DIFFICULTY_ID: BotDifficultyId = "normal";

export const BOT_DIFFICULTY_DEFINITIONS: Readonly<
  Record<BotDifficultyId, BotDifficultyDefinition>
> = {
  easy: {
    id: "easy",
    displayName: "Easy",
    description: "Slower reactions and less precise aim for a relaxed match.",
    reactionTimeMs: { minimum: 850, maximum: 1_200 },
    aimSpreadMultiplier: 1.45,
    movementSpeedMultiplier: 0.86,
    fireIntervalMultiplier: 1.22,
    detectionRangeMultiplier: 0.82,
    combatDecisionIntervalMultiplier: 1.28,
  },
  normal: {
    id: "normal",
    displayName: "Normal",
    description: "The balanced Phase 1 bot experience.",
    reactionTimeMs: { minimum: 500, maximum: 850 },
    aimSpreadMultiplier: 1,
    movementSpeedMultiplier: 1,
    fireIntervalMultiplier: 1,
    detectionRangeMultiplier: 1,
    combatDecisionIntervalMultiplier: 1,
  },
  hard: {
    id: "hard",
    displayName: "Hard",
    description: "Faster reactions and sharper aim without extra health or damage.",
    reactionTimeMs: { minimum: 280, maximum: 520 },
    aimSpreadMultiplier: 0.72,
    movementSpeedMultiplier: 1.1,
    fireIntervalMultiplier: 0.84,
    detectionRangeMultiplier: 1.12,
    combatDecisionIntervalMultiplier: 0.8,
  },
};

export type ArenaMapId = "foundry" | "training-ground";

export type ArenaMapAvailability = "available" | "planned";

export interface ArenaMapDefinition {
  readonly id: ArenaMapId;
  readonly displayName: string;
  readonly description: string;
  readonly availability: ArenaMapAvailability;
  /** Training maps may omit the opponent while core player systems are tested. */
  readonly hasBot: boolean;
  /** Whether temporary armor pickups are part of this map's match rules. */
  readonly hasArmorPickups: boolean;
  /** Whether this map runs the standard five-minute match countdown. */
  readonly hasMatchTimer: boolean;
}

export const DEFAULT_ARENA_MAP_ID: ArenaMapId = "foundry";

export const ARENA_MAP_DEFINITIONS: Readonly<
  Record<ArenaMapId, ArenaMapDefinition>
> = {
  foundry: {
    id: "foundry",
    displayName: "Foundry",
    description:
      "An industrial arena with a furnace ring, service lanes, and a raised loading dock.",
    availability: "available",
    hasBot: true,
    hasArmorPickups: true,
    hasMatchTimer: true,
  },
  "training-ground": {
    id: "training-ground",
    displayName: "Training Ground",
    description: "A bright, open player-only space for testing core movement and weapons.",
    availability: "available",
    hasBot: false,
    hasArmorPickups: false,
    hasMatchTimer: false,
  },
};

/** Ordered map metadata for pre-match selection UI and map registries. */
export const ARENA_MAPS: readonly ArenaMapDefinition[] = Object.values(
  ARENA_MAP_DEFINITIONS,
);

export interface MapSelectionState {
  readonly selectedMapId: ArenaMapId;
}

export interface MatchConfiguration extends MapSelectionState {
  readonly botDifficultyId: BotDifficultyId;
}

export const DEFAULT_MATCH_CONFIGURATION: Readonly<MatchConfiguration> = {
  selectedMapId: DEFAULT_ARENA_MAP_ID,
  botDifficultyId: DEFAULT_BOT_DIFFICULTY_ID,
};

export function isBotDifficultyId(value: string): value is BotDifficultyId {
  return value in BOT_DIFFICULTY_DEFINITIONS;
}

export function isArenaMapId(value: string): value is ArenaMapId {
  return value in ARENA_MAP_DEFINITIONS;
}

export function getBotDifficultyDefinition(
  difficultyId: BotDifficultyId,
): BotDifficultyDefinition {
  return BOT_DIFFICULTY_DEFINITIONS[difficultyId];
}

export function getArenaMapDefinition(mapId: ArenaMapId): ArenaMapDefinition {
  return ARENA_MAP_DEFINITIONS[mapId];
}

export function isArenaMapAvailable(mapId: ArenaMapId): boolean {
  return getArenaMapDefinition(mapId).availability === "available";
}
