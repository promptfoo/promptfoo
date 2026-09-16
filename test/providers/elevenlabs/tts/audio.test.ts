import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';
import { normalizeAudioMimeType } from '../../../../src/blobs/extractor';
import { encodeAudio, saveAudioFile } from '../../../../src/providers/elevenlabs/tts/audio';

let outputDirectory: string | undefined;

afterEach(async () => {
  if (outputDirectory) {
    await rm(outputDirectory, { recursive: true, force: true });
    outputDirectory = undefined;
  }
});

it('preserves raw mu-law bytes with matching media metadata and file extension', async () => {
  const silence = Buffer.alloc(8000, 0xff);
  const audio = await encodeAudio(silence, 'ulaw_8000');
  expect(Buffer.from(audio.data, 'base64')).toEqual(silence);
  expect(normalizeAudioMimeType(audio.format)).toBe('audio/basic');
  expect(audio.durationMs).toBe(1000);

  outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'elevenlabs-ulaw-'));
  const savedPath = await saveAudioFile(audio, outputDirectory, 'speech.wav');
  expect(path.basename(savedPath)).toBe('speech.ulaw');
  expect(await readFile(savedPath)).toEqual(silence);
});
