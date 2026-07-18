import {
  sanitizeProviderError,
  validateCandidateNumber,
} from '../scripts/audio/elevenlabs-audio';

describe('ElevenLabs audio provider tooling', () => {
  it('enforces the two-candidate iteration bound', () => {
    expect(validateCandidateNumber(1)).toBe(1);
    expect(validateCandidateNumber(2)).toBe(2);
    expect(() => validateCandidateNumber(3)).toThrow(/between 1 and 2/);
  });

  it('redacts provider bodies to an allow-listed status code', () => {
    expect(
      sanitizeProviderError({
        detail: { status: 'voice_not_found', message: 'sensitive detail' },
      }),
    ).toBe('voice_not_found');
    expect(
      sanitizeProviderError({ detail: { status: 'bad status; secret' } }),
    ).toBeUndefined();
  });
});
