import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const credentialFile = '/Users/jschuler/Projects/vanta-city/.env';
const officialApiOrigin = 'https://api.elevenlabs.io';
const maximumMusicCandidates = 2;
const maximumTtsCandidates = 3;
const maximumTtsCharacters = 1500;

export interface SafeProviderResult {
  readonly status:
    | 'authenticated'
    | 'invalid-key'
    | 'restricted'
    | 'available'
    | 'blocked'
    | 'generated';
  readonly httpStatus: number;
  readonly providerCode?: string;
  readonly requestId?: string;
  readonly songId?: string;
  readonly characterCost?: string;
}

export function classifyAuthenticationStatus(
  httpStatus: number,
): SafeProviderResult['status'] {
  if (httpStatus >= 200 && httpStatus < 300) return 'authenticated';
  if (httpStatus === 401) return 'invalid-key';
  if (httpStatus === 403) return 'restricted';
  return 'blocked';
}

export function validateCandidateNumber(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > maximumMusicCandidates) {
    throw new Error(
      `Candidate number must be between 1 and ${maximumMusicCandidates}`,
    );
  }
  return value;
}

export function validateTtsRequest(candidate: number, text: string): void {
  if (
    !Number.isInteger(candidate) ||
    candidate < 1 ||
    candidate > maximumTtsCandidates
  ) {
    throw new Error(
      `TTS candidate number must be between 1 and ${maximumTtsCandidates}`,
    );
  }
  if (text.length === 0 || text.length > maximumTtsCharacters) {
    throw new Error(
      `TTS text must contain 1–${maximumTtsCharacters} characters`,
    );
  }
}

export function sanitizeProviderError(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const detail = (input as { detail?: unknown }).detail;
  if (detail && typeof detail === 'object') {
    const status = (detail as { status?: unknown }).status;
    if (typeof status === 'string' && /^[a-z0-9_]+$/i.test(status))
      return status;
  }
  return undefined;
}

async function credentials(): Promise<{ apiKey: string; voiceId: string }> {
  const parsed = parseEnv(await readFile(credentialFile, 'utf8'));
  const apiKey = parsed.ELEVENLABS_API_KEY;
  const voiceId = parsed.ELEVENLABS_RADIOGUY_VOICE_ID;
  if (!apiKey || !voiceId)
    throw new Error('Required ElevenLabs configuration is unavailable');
  return { apiKey, voiceId };
}

export async function checkConfiguredRadioVoice(): Promise<SafeProviderResult> {
  const { apiKey, voiceId } = await credentials();
  const response = await fetch(
    `${officialApiOrigin}/v1/voices/${encodeURIComponent(voiceId)}`,
    {
      headers: { 'xi-api-key': apiKey },
    },
  );
  if (response.ok) return safeHeaders(response, 'available');
  const body: unknown = await response.json().catch((): undefined => undefined);
  return {
    ...safeHeaders(response, 'blocked'),
    providerCode: sanitizeProviderError(body),
  };
}

export async function checkApiAuthentication(): Promise<SafeProviderResult> {
  const { apiKey } = await credentials();
  const response = await fetch(`${officialApiOrigin}/v1/user`, {
    headers: { 'xi-api-key': apiKey },
  });
  // The response can include account and key fields. Never read or serialize it.
  return {
    status: classifyAuthenticationStatus(response.status),
    httpStatus: response.status,
  };
}

export async function generateMusicCandidate(options: {
  candidate: number;
  output: string;
  prompt: string;
  lengthMs: number;
}): Promise<SafeProviderResult> {
  const candidate = validateCandidateNumber(options.candidate);
  if (options.prompt.length === 0 || options.prompt.length > 4100)
    throw new Error('Music prompt must contain 1–4100 characters');
  if (
    !Number.isInteger(options.lengthMs) ||
    options.lengthMs < 3000 ||
    options.lengthMs > 600000
  ) {
    throw new Error('Music length must contain 3000–600000 milliseconds');
  }
  const { apiKey } = await credentials();
  const endpoint = new URL('/v1/music', officialApiOrigin);
  endpoint.searchParams.set('output_format', 'mp3_48000_192');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      prompt: options.prompt,
      music_length_ms: options.lengthMs,
      model_id: 'music_v2',
      force_instrumental: true,
      store_for_inpainting: false,
      sign_with_c2pa: true,
    }),
  });
  if (!response.ok) {
    const body: unknown = await response
      .json()
      .catch((): undefined => undefined);
    throw new Error(
      `ElevenLabs music request failed (${response.status}${sanitizeProviderError(body) ? `, ${sanitizeProviderError(body)}` : ''})`,
    );
  }
  const audio = Buffer.from(await response.arrayBuffer());
  const absoluteOutput = resolve(options.output);
  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, audio);
  const result = safeHeaders(response, 'generated');
  await writeFile(
    `${absoluteOutput}.json`,
    `${JSON.stringify(
      {
        schema: 'vanta-city.audio-generation',
        version: 1,
        provider: 'ElevenLabs Music API',
        endpoint: '/v1/music',
        candidate,
        model: 'music_v2',
        outputFormat: 'mp3_48000_192',
        prompt: options.prompt,
        musicLengthMs: options.lengthMs,
        forceInstrumental: true,
        storeForInpainting: false,
        c2paRequested: true,
        generatedAt: new Date().toISOString(),
        sha256: createHash('sha256').update(audio).digest('hex'),
        bytes: audio.byteLength,
        purpose: 'AUDIO-001 Ashfall instrumental theme candidate',
        requestId: result.requestId,
        songId: result.songId,
        characterCost: result.characterCost,
        decision: 'pending-review',
      },
      null,
      2,
    )}\n`,
  );
  return result;
}

export async function generateRadioHostCandidate(options: {
  candidate: number;
  output: string;
  text: string;
  contentId: string;
}): Promise<SafeProviderResult> {
  validateTtsRequest(options.candidate, options.text);
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(options.contentId)) {
    throw new Error('Radio content ID must be lowercase dot-separated text');
  }
  const voice = await checkConfiguredRadioVoice();
  if (voice.status !== 'available') {
    throw new Error(
      `Configured radio voice is unavailable (${voice.httpStatus}${voice.providerCode ? `, ${voice.providerCode}` : ''})`,
    );
  }
  const { apiKey, voiceId } = await credentials();
  const endpoint = new URL(
    `/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    officialApiOrigin,
  );
  endpoint.searchParams.set('output_format', 'mp3_44100_128');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      text: options.text,
      model_id: 'eleven_v3',
      language_code: 'en',
    }),
  });
  if (!response.ok) {
    const body: unknown = await response
      .json()
      .catch((): undefined => undefined);
    throw new Error(
      `ElevenLabs TTS request failed (${response.status}${sanitizeProviderError(body) ? `, ${sanitizeProviderError(body)}` : ''})`,
    );
  }
  const audio = Buffer.from(await response.arrayBuffer());
  const absoluteOutput = resolve(options.output);
  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, audio);
  const result = safeHeaders(response, 'generated');
  await writeFile(
    `${absoluteOutput}.json`,
    `${JSON.stringify(
      {
        schema: 'vanta-city.audio-generation',
        version: 1,
        provider: 'ElevenLabs Text to Speech API',
        endpoint: '/v1/text-to-speech/{configured-radio-voice}',
        candidate: options.candidate,
        contentId: options.contentId,
        model: 'eleven_v3',
        outputFormat: 'mp3_44100_128',
        script: options.text,
        characters: options.text.length,
        generatedAt: new Date().toISOString(),
        sha256: createHash('sha256').update(audio).digest('hex'),
        bytes: audio.byteLength,
        purpose: 'AUDIO-001 in-world car radio host station break',
        requestId: result.requestId,
        characterCost: result.characterCost,
        decision: 'pending-review',
      },
      null,
      2,
    )}\n`,
  );
  return result;
}

function safeHeaders(
  response: Response,
  status: SafeProviderResult['status'],
): SafeProviderResult {
  return {
    status,
    httpStatus: response.status,
    requestId: response.headers.get('request-id') ?? undefined,
    songId: response.headers.get('song-id') ?? undefined,
    characterCost: response.headers.get('character-cost') ?? undefined,
  };
}

function parseEnv(source: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'check-voice') {
    process.stdout.write(
      `${JSON.stringify(await checkConfiguredRadioVoice())}\n`,
    );
    return;
  }
  if (command === 'check-auth') {
    process.stdout.write(`${JSON.stringify(await checkApiAuthentication())}\n`);
    return;
  }
  if (command === 'generate-music') {
    const values: Record<string, string> = {};
    for (const argument of args) {
      const separator = argument.indexOf('=');
      if (separator > 0) {
        values[argument.slice(0, separator)] = argument.slice(separator + 1);
      }
    }
    const result = await generateMusicCandidate({
      candidate: Number(values['--candidate']),
      output: values['--output'] ?? '',
      prompt: values['--prompt'] ?? '',
      lengthMs: Number(values['--length-ms']),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === 'generate-radio-host') {
    const values: Record<string, string> = {};
    for (const argument of args) {
      const separator = argument.indexOf('=');
      if (separator > 0) {
        values[argument.slice(0, separator)] = argument.slice(separator + 1);
      }
    }
    const result = await generateRadioHostCandidate({
      candidate: Number(values['--candidate']),
      output: values['--output'] ?? '',
      text: values['--text'] ?? '',
      contentId: values['--content-id'] ?? '',
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  throw new Error(
    'Usage: check-auth | check-voice | generate-music --candidate=N --output=PATH --prompt=TEXT --length-ms=N | generate-radio-host --candidate=N --output=PATH --content-id=ID --text=TEXT',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Audio provider command failed'}\n`,
    );
    process.exitCode = 1;
  });
}
