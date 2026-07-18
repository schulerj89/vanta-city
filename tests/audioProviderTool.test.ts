import {
  classifyAuthenticationStatus,
  sanitizeProviderError,
  validateCandidateNumber,
  validateTtsRequest,
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

  it('classifies authentication without reading or exposing the response body', () => {
    expect(classifyAuthenticationStatus(200)).toBe('authenticated');
    expect(classifyAuthenticationStatus(401)).toBe('invalid-key');
    expect(classifyAuthenticationStatus(403)).toBe('restricted');
    expect(classifyAuthenticationStatus(500)).toBe('blocked');
  });

  it('enforces the three-candidate and 1500-character TTS bounds', () => {
    expect(() => validateTtsRequest(1, 'Station break')).not.toThrow();
    expect(() => validateTtsRequest(4, 'Station break')).toThrow(
      /between 1 and 3/,
    );
    expect(() => validateTtsRequest(1, 'x'.repeat(1501))).toThrow(
      /1–1500 characters/,
    );
  });
});
