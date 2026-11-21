import { readFileSync } from 'node:fs';

import { load } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractAndStoreBinaryData } from '../../../src/blobs/extractor';
import { recordBlobReference, storeBlob } from '../../../src/blobs/index';

vi.mock('../../../src/blobs/index', () => ({
  hasBlobReferenceOwner: async (id: string) => id === 'saved-eval',
  storeBlob: vi.fn(),
  recordBlobReference: vi.fn(),
}));

const guide = readFileSync('site/docs/guides/evaluate-elevenlabs.md', 'utf8');
const audioAssertions = [...guide.matchAll(/```yaml[^\n]*\n([\s\S]*?)\n```/g)]
  .flatMap((match) => (load(match[1]) as any)?.tests ?? [])
  .flatMap((test) => test.assert ?? [])
  .filter(
    (assertion) =>
      assertion.type === 'javascript' &&
      typeof assertion.value === 'string' &&
      assertion.value.includes('providerResponse.audio'),
  );

function extractAudio(audio: Buffer) {
  return extractAndStoreBinaryData(
    { output: 'Generated speech', audio: { data: audio.toString('base64'), format: 'mp3' } },
    { evalId: 'saved-eval' },
  );
}

function evaluateAudioAssertions(providerResponse: unknown) {
  expect(audioAssertions).toHaveLength(2);
  return audioAssertions.map(({ value }) =>
    new Function('context', value.includes('\n') ? value : `return (${value});`)({
      providerResponse,
    }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('PROMPTFOO_INLINE_MEDIA', 'false');
  vi.mocked(storeBlob).mockResolvedValue({
    ref: { uri: 'promptfoo://blob/audio-fixture', hash: 'audio-fixture' },
  } as any);
  vi.mocked(recordBlobReference).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe('ElevenLabs guide audio assertions', () => {
  it('accepts normal-sized speech after the evaluator externalizes it to a blob reference', async () => {
    const audio = readFileSync('examples/provider-elevenlabs/stt/audio/sample1.mp3');
    const response = await extractAudio(audio);
    expect(storeBlob).toHaveBeenCalledWith(audio, 'audio/mpeg', expect.anything());
    expect(response?.audio?.data).toBeUndefined();
    expect(response?.audio?.blobRef).toBeDefined();
    expect(evaluateAudioAssertions(response)).toEqual([true, true]);
  });

  it('accepts inline audio that is below the storage threshold', async () => {
    const response = await extractAudio(Buffer.from('short fixture'));
    expect(storeBlob).not.toHaveBeenCalled();
    expect(response?.audio?.data).toBeDefined();
    expect(evaluateAudioAssertions(response)).toEqual([true, true]);
  });

  it('rejects a text-only response without generated audio', () => {
    expect(evaluateAudioAssertions({ output: 'No audio' })).toEqual([false, false]);
  });
});
