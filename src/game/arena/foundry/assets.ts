import type { Scene } from "@babylonjs/core/scene.js";

export interface FoundryAssetManifest {
  readonly models: readonly string[];
  readonly textures: readonly string[];
}

/**
 * Foundry currently uses Babylon primitives. Future GLB and texture URLs belong
 * in this manifest so Vite keeps them behind the Foundry dynamic import.
 */
export const FOUNDRY_ASSETS: FoundryAssetManifest = {
  models: [],
  textures: [],
};

/** Map-owned loading hook for future GLB models, textures, and lightmaps. */
export async function loadFoundryAssets(_scene: Scene): Promise<void> {
  await Promise.resolve();
}
