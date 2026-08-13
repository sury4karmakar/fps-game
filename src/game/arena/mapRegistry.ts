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

export type ArenaBuilder = (scene: Scene) => ArenaBuildResult;

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
  "training-yard": {
    definition: getArenaMapDefinition("training-yard"),
    load: () => import("./createArena"),
  },
  foundry: {
    definition: getArenaMapDefinition("foundry"),
  },
};

export function getMapRegistryEntry(mapId: ArenaMapId): MapRegistryEntry {
  return MAP_REGISTRY[mapId];
}

/** Loads, builds, and validates exactly one selected map. */
export async function loadArena(
  mapId: ArenaMapId,
  scene: Scene,
): Promise<ArenaBuildResult> {
  const entry = getMapRegistryEntry(mapId);

  if (!isArenaMapAvailable(mapId) || !entry.load) {
    throw new Error(
      `The ${entry.definition.displayName} map is not available in this build.`,
    );
  }

  const module = await entry.load();
  const arena = module.createArena(scene);
  validateArenaBuildResult(mapId, arena);
  return arena;
}
