export interface CharacterTransform {
  readonly scale?: number | readonly [number, number, number];
  /** Euler angles in radians, applied in XYZ order. */
  readonly rotation?: readonly [number, number, number];
  readonly offset?: readonly [number, number, number];
}

export interface CharacterAnimationBinding {
  /** Omit to discover clips embedded in the character model. */
  readonly assetId?: string;
  readonly clipNames: readonly string[];
  readonly required?: boolean;
}

export interface CharacterAttachment {
  readonly id: string;
  readonly assetId: string;
  readonly boneName?: string;
}

export interface CharacterMaterialVariation {
  readonly id: string;
  readonly displayName: string;
  readonly materialNames?: readonly string[];
  readonly textureAssetId?: string;
  readonly color?: string;
}

export interface CharacterDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly modelAssetId?: string;
  readonly animations?: Readonly<Record<string, CharacterAnimationBinding>>;
  readonly transform?: CharacterTransform;
  readonly attachments?: readonly CharacterAttachment[];
  readonly materialVariations?: readonly CharacterMaterialVariation[];
  readonly fallback: 'placeholder';
}

export function validateCharacterDefinitions(
  definitions: readonly CharacterDefinition[],
): readonly CharacterDefinition[] {
  if (definitions.length === 0)
    throw new Error('At least one character is required');
  const ids = new Set<string>();
  for (const definition of definitions) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id)) {
      throw new Error(`Invalid character id: ${definition.id}`);
    }
    if (ids.has(definition.id))
      throw new Error(`Duplicate character id: ${definition.id}`);
    if (definition.displayName.trim().length === 0) {
      throw new Error(`Character "${definition.id}" needs a display name`);
    }
    ids.add(definition.id);
  }
  return Object.freeze([...definitions]);
}
