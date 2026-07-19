import type { Texture } from 'three';

/**
 * Creates a sector-owned texture view. Three's clone semantics intentionally
 * share loader-owned pixel Source data while keeping sampler state and the
 * disposable Texture object independent.
 */
export function cloneSectorOwnedTexture(sourceTexture: Texture): Texture {
  return sourceTexture.clone();
}
