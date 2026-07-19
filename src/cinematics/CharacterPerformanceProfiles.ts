import type { CharacterDefinition } from '../characters/CharacterDefinition';
import type {
  CharacterPerformanceBinding,
  CharacterPerformanceProfile,
  CinematicPerformanceIntent,
} from './CinematicPerformanceController';

const rookIntents = {
  'neutral-hold': { animationId: 'idle', playback: 'loop' },
  indicate: { animationId: 'interact', playback: 'one-shot' },
  acknowledge: { animationId: 'wave', playback: 'one-shot' },
} as const satisfies Partial<
  Record<CinematicPerformanceIntent, CharacterPerformanceBinding>
>;

const sharedRigIntents = {
  'neutral-hold': { animationId: 'idle', playback: 'loop' },
  applaud: { animationId: 'applaud', playback: 'one-shot' },
} as const satisfies Partial<
  Record<CinematicPerformanceIntent, CharacterPerformanceBinding>
>;

export const characterPerformanceProfiles = Object.freeze([
  {
    profileId: 'performance.casual',
    characterId: 'casual',
    intents: rookIntents,
  },
  { profileId: 'performance.punk', characterId: 'punk', intents: rookIntents },
  ...[
    'npc-worker',
    'npc-hoodie',
    'npc-punk',
    'pedestrian-casual',
    'pedestrian-street',
    'pedestrian-tank-top',
    'pedestrian-dress',
  ].map((characterId) => ({
    profileId: `performance.${characterId}`,
    characterId,
    intents: sharedRigIntents,
  })),
] satisfies readonly CharacterPerformanceProfile[]);

export function getCharacterPerformanceProfile(
  characterId: string,
): CharacterPerformanceProfile | undefined {
  return characterPerformanceProfiles.find(
    (profile) => profile.characterId === characterId,
  );
}

export function validateCharacterPerformanceProfiles(
  profiles: readonly CharacterPerformanceProfile[],
  characters: readonly CharacterDefinition[],
): readonly CharacterPerformanceProfile[] {
  const characterById = new Map(
    characters.map((character) => [character.id, character]),
  );
  const profileIds = new Set<string>();
  for (const profile of profiles) {
    if (profileIds.has(profile.profileId)) {
      throw new Error(`Duplicate performance profile: ${profile.profileId}`);
    }
    const character = characterById.get(profile.characterId);
    if (!character) {
      throw new Error(
        `Performance profile "${profile.profileId}" references unknown character "${profile.characterId}"`,
      );
    }
    for (const [intent, binding] of Object.entries(profile.intents)) {
      if (!character.animations?.[binding.animationId]) {
        throw new Error(
          `Performance profile "${profile.profileId}" maps "${intent}" to missing animation "${binding.animationId}"`,
        );
      }
      const names = character.animations[binding.animationId]!.clipNames;
      const applauseSource = names.some((name) => /clapp|applaus/i.test(name));
      if (applauseSource && intent !== 'applaud') {
        throw new Error(
          `Performance profile "${profile.profileId}" may map applause only to "applaud"`,
        );
      }
      if (
        binding.playback === 'transition-with-hold' &&
        (binding.holdAtNormalizedTime === undefined ||
          binding.holdAtNormalizedTime <= 0 ||
          binding.holdAtNormalizedTime >= 1)
      ) {
        throw new Error(
          `Performance profile "${profile.profileId}" needs a hold window for "${intent}"`,
        );
      }
    }
    profileIds.add(profile.profileId);
  }
  return Object.freeze([...profiles]);
}
