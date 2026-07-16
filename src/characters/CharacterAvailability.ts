import type { AssetCatalog } from '../assets/AssetCatalog';
import type { CharacterDefinition } from './CharacterDefinition';

export type CharacterAvailabilityStatus =
  'checking' | 'available' | 'fallback' | 'unavailable';

export interface CharacterAvailabilityResult {
  readonly status: Exclude<CharacterAvailabilityStatus, 'checking'>;
  readonly reason?: string;
}

export interface CharacterAvailabilityProbe {
  check(definition: CharacterDefinition): Promise<CharacterAvailabilityResult>;
}

export interface CharacterPortraitSource {
  readonly kind: 'asset' | 'generated';
  readonly url?: string;
}

interface HeadResponse {
  readonly ok: boolean;
  readonly headers: Pick<Headers, 'get'>;
}

type HeadRequest = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<HeadResponse>;

/** Lightweight local-only availability checks; no full model is downloaded. */
export class ManifestCharacterAvailabilityProbe implements CharacterAvailabilityProbe {
  public constructor(
    private readonly catalog: AssetCatalog,
    private readonly request: HeadRequest = fetch,
    private readonly baseUrl = window.location.href,
  ) {}

  public async check(
    definition: CharacterDefinition,
  ): Promise<CharacterAvailabilityResult> {
    if (!definition.modelAssetId) return { status: 'available' };

    try {
      const asset = this.catalog.get(definition.modelAssetId);
      if (asset.type !== 'model') {
        return {
          status: 'unavailable',
          reason: 'Registered asset is not a model.',
        };
      }
      const url = new URL(asset.url, this.baseUrl);
      if (url.origin !== new URL(this.baseUrl).origin) {
        return {
          status: 'unavailable',
          reason: 'Remote character models are not allowed.',
        };
      }

      const response = await this.request(url, { method: 'HEAD' });
      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok || contentType.includes('text/html')) {
        return {
          status: 'fallback',
          reason:
            'Model file is not installed locally; placeholder fallback will be used.',
        };
      }
      return { status: 'available' };
    } catch {
      return {
        status: 'fallback',
        reason:
          'Model file could not be verified; placeholder fallback will be used.',
      };
    }
  }
}

export function resolveCharacterPortrait(
  definition: CharacterDefinition,
  catalog: AssetCatalog,
  baseUrl = window.location.href,
): CharacterPortraitSource {
  if (!definition.portraitAssetId) return { kind: 'generated' };
  try {
    const asset = catalog.get(definition.portraitAssetId);
    const url = new URL(asset.url, baseUrl);
    if (asset.type !== 'texture' || url.origin !== new URL(baseUrl).origin) {
      return { kind: 'generated' };
    }
    return { kind: 'asset', url: url.href };
  } catch {
    return { kind: 'generated' };
  }
}
