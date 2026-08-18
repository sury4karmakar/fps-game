import type { Scene } from "@babylonjs/core/scene.js";
import {
  getArenaMapDefinition,
  isArenaMapAvailable,
  type ArenaMapDefinition,
  type ArenaMapId,
} from "../config/gameConfig";
import {
  validateArenaBuildResult,
  type ArenaBuildResult,
} from "./arenaTypes";

export type ArenaBuilder = (
  scene: Scene,
) => ArenaBuildResult | Promise<ArenaBuildResult>;

interface ArenaModule {
  readonly createArena: ArenaBuilder;
}

export interface MapRegistryEntry {
  readonly definition: ArenaMapDefinition;
  /** Omitted until the map builder is implemented and approved for selection. */
  readonly load?: () => Promise<ArenaModule>;
}

/**
 * Lightweight registry for map selection. Map builders are dynamically imported
 * so their code and assets are excluded from the application startup path.
 */
export const MAP_REGISTRY: Readonly<Record<ArenaMapId, MapRegistryEntry>> = {
  foundry: {
    definition: getArenaMapDefinition("foundry"),
    load: () => import("./foundry/createFoundry"),
  },
  "training-ground": {
    definition: getArenaMapDefinition("training-ground"),
    load: () => import("./trainingGround/createTrainingGround"),
  },
};

export function getMapRegistryEntry(mapId: ArenaMapId): MapRegistryEntry {
  return MAP_REGISTRY[mapId];
}

/**
 * Resolves the selected map builder without constructing a Babylon scene.
 * This keeps unselected map modules and assets outside the startup path.
 */
export async function loadArenaBuilder(mapId: ArenaMapId): Promise<ArenaBuilder> {
  const entry = getMapRegistryEntry(mapId);

  if (!isArenaMapAvailable(mapId) || !entry.load) {
    throw new Error(
      `The ${entry.definition.displayName} map is not available in this build.`,
    );
  }

  try {
    const module = await entry.load();
    return module.createArena;
  } catch (error) {
    const reason = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(
      `Unable to load the ${entry.definition.displayName} map module.${reason}`,
    );
  }
}

/** Loads, builds, and validates exactly one selected map. */
export async function loadArena(
  mapId: ArenaMapId,
  scene: Scene,
): Promise<ArenaBuildResult> {
  const createArena = await loadArenaBuilder(mapId);
  const arena = await createArena(scene);
  validateArenaBuildResult(mapId, arena);
  return arena;
}
