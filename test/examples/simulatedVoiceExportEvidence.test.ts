import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { renderPrompt } from '../../src/evaluatorHelpers';

const script = path.resolve(__dirname, '../../examples/simulated-voice-user/export-evidence.js');
let root: string;
let exportEvidence: (
  input: string,
  output: string,
  options?: { configDir?: string },
) => Promise<any>;

function wav(channels = 2, sampleRate = 24000, frames = 12000) {
  const bytes = Buffer.alloc(44 + frames * channels * 2);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(channels, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * channels * 2, 28);
  bytes.writeUInt16LE(channels * 2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      // Distinct, known channels let the test detect swapped/deformed samples.
      const sample = channel === 0 ? (frame < 4800 ? 2000 : 0) : frame >= 4800 ? -3000 : 0;
      bytes.writeInt16LE(sample, 44 + (frame * channels + channel) * 2);
    }
  }
  return bytes;
}

function fixture(bytes = wav()) {
  const hash = createHash('sha256').update(bytes).digest('hex');
  const row = {
    id: 'result-1',
    success: false,
    prompt: { raw: 'Only use the authoritative facts.' },
    testCase: { description: 'Interrupt the menu', vars: { instructions: 'Ask for decaf.' } },
    gradingResult: { pass: false, reason: 'An intentionally retained failed task grade.' },
    response: {
      audio: {
        channels: 2,
        sampleRate: 24000,
        blobRef: { hash, sizeBytes: bytes.length, mimeType: 'audio/wav', provider: 'filesystem' },
      },
      metadata: {
        voice: {
          audioChannels: ['target', 'caller'],
          transcript: [
            { speaker: 'caller', source: 'input', delta: 'An unheard fact is not a passed goal.' },
          ],
          interventions: [{ scheduledAtMs: 200, firstFrameAtMs: 200, completedAtMs: 400 }],
        },
      },
    },
  };
  return {
    evalId: 'eval-fixed',
    results: { results: [row] },
    blobAssets: [
      { hash, sizeBytes: bytes.length, mimeType: 'audio/wav', data: bytes.toString('base64') },
    ],
  };
}

async function run(input: unknown, suffix = 'out', options?: { configDir?: string }) {
  const file = path.join(root, `${suffix}.json`);
  await writeFile(file, JSON.stringify(input));
  return exportEvidence(file, path.join(root, suffix), options);
}

beforeAll(async () => {
  exportEvidence = (await import(pathToFileURL(script).href)).exportEvidence;
});
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'voice-export-test-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('voice example portable evidence export', () => {
  it('preserves the original WAV and deinterleaves exact samples without hiding failed grades', async () => {
    const original = wav();
    const manifest = await run(fixture(original));
    expect(manifest.errors).toBe(0);
    expect(await readFile(path.join(root, 'out/case-001-stereo.wav'))).toEqual(original);
    const left = await readFile(path.join(root, 'out/case-001-target.wav'));
    const right = await readFile(path.join(root, 'out/case-001-caller.wav'));
    for (let frame = 0; frame < 12000; frame++) {
      expect(left.readInt16LE(44 + frame * 2)).toBe(original.readInt16LE(44 + frame * 4));
      expect(right.readInt16LE(44 + frame * 2)).toBe(original.readInt16LE(46 + frame * 4));
    }
    const evidence = JSON.parse(
      await readFile(path.join(root, 'out/case-001-evidence.json'), 'utf8'),
    );
    expect(evidence.success).toBe(false);
    expect(evidence.gradingResult.reason).toContain('retained failed');
    expect(manifest.rows[0].metrics.interventions[0]).toMatchObject({
      targetActiveFor100MsBeforeCue: true,
      overlapMs: 0,
      callerActivityOnsetMs: 200,
      first100MsTargetQuietAtMs: 200,
      interruptionOpportunity: 'target-active-before-cue',
    });
  });

  it('keeps audio review inputs free of transcript, scenario, and expected labels while declaring channel layout', async () => {
    await run(fixture());
    const tests = JSON.parse(
      await readFile(path.join(root, 'out/audio-review-tests.json'), 'utf8'),
    );
    expect(tests).toHaveLength(3);
    for (const test of tests) {
      expect(Object.keys(test.vars).sort()).toEqual(['audio_file', 'audio_id', 'audio_view']);
      expect(test.description).toBe(test.vars.audio_id);
      expect(test.vars.audio_id).toMatch(/^[a-f0-9-]{36}$/);
      expect((await readFile(test.vars.audio_file.slice('file://'.length))).length).toBeGreaterThan(
        44,
      );
    }
    expect(tests.map((test: { vars: { audio_view: string } }) => test.vars.audio_view)).toEqual([
      'stereo_conversation',
      'isolated_target',
      'isolated_caller',
    ]);
    const transcriptionTests = JSON.parse(
      await readFile(path.join(root, 'out/transcription-tests.json'), 'utf8'),
    );
    expect(transcriptionTests).toHaveLength(2);
    for (const test of transcriptionTests) {
      expect(Object.keys(test.vars)).toEqual(['audio_path']);
      expect(path.isAbsolute(test.vars.audio_path)).toBe(true);
      expect(test.vars.audio_path).not.toContain('file://');
      expect((await readFile(test.vars.audio_path)).readUInt16LE(22)).toBe(1);
    }
    const review = JSON.parse(await readFile(path.join(root, 'out/manual-review.json'), 'utf8'));
    expect(review.status).toBe('not-reviewed');
  });

  it.each([true, false])(
    'measures active-speech opportunity without requiring every phonetic frame to be voiced: %s',
    async (recentSpeech) => {
      const bytes = wav(2, 24000, 72000);
      for (let frame = 0; frame < 72000; frame++) {
        const ms = frame / 24;
        const target =
          ms >= 500 && ms < (recentSpeech ? 1560 : 1300) && !(ms >= 1400 && ms < 1440) ? 2000 : 0;
        bytes.writeInt16LE(target, 44 + frame * 4);
        bytes.writeInt16LE(ms >= 1500 && ms < 1800 ? -3000 : 0, 46 + frame * 4);
      }
      const input = fixture(bytes);
      input.results.results[0].response.metadata.voice.interventions[0] = {
        scheduledAtMs: 1500,
        firstFrameAtMs: 1500,
        completedAtMs: 1800,
      };
      const manifest = await run(input);
      const measurement = manifest.rows[0].metrics.interventions[0];
      expect(measurement.targetActiveFor100MsBeforeCue).toBe(false);
      expect(measurement.activeSpeechOpportunity).toBe(
        recentSpeech ? 'eligible-by-pcm' : 'not-exercised-by-pcm',
      );
      expect(measurement.targetActiveMsIn1000MsBeforeCallerOnset).toBe(recentSpeech ? 960 : 800);
      expect(measurement.targetActiveMsIn100MsBeforeCallerOnset).toBe(recentSpeech ? 60 : 0);
      expect(measurement.first200MsTargetQuietAtMs).toBe(recentSpeech ? 1560 : 1500);
    },
  );

  it('exports a complete prepared utterance only after matching the recorded caller PCM hash', async () => {
    const input = fixture();
    const pcm = Buffer.alloc(9600);
    for (let index = 0; index < pcm.length; index += 2) {
      pcm.writeInt16LE(-3000, index);
    }
    Object.assign(input.results.results[0].response.metadata.voice.interventions[0], {
      mode: 'audio',
      deliveredAudioBytes: pcm.length,
      clipDurationMs: 200,
      clipSha256: createHash('sha256').update(pcm).digest('hex'),
    });
    const manifest = await run(input);
    expect(manifest.errors).toBe(0);
    const clip = manifest.rows[0].interventionClips[0];
    const exported = await readFile(path.join(root, 'out', clip.file));
    expect(exported.subarray(44)).toEqual(pcm);
    expect(clip.sha256).toBe(createHash('sha256').update(exported).digest('hex'));
    expect(clip.pcmSha256).toBe(createHash('sha256').update(pcm).digest('hex'));
    expect(clip.file).toBe('case-001-intervention-001.wav');
    expect(
      JSON.parse(await readFile(path.join(root, 'out/audio-review-tests.json'), 'utf8')),
    ).toHaveLength(3);
  });

  it.each(['partial', 'wrong-hash'] as const)(
    'retains full recordings but fails invalid prepared clip evidence: %s',
    async (failure) => {
      const input = fixture();
      Object.assign(input.results.results[0].response.metadata.voice.interventions[0], {
        mode: 'audio',
        deliveredAudioBytes: failure === 'partial' ? 4800 : 9600,
        clipDurationMs: 200,
        clipSha256: '0'.repeat(64),
      });
      const manifest = await run(input);
      expect(manifest.errors).toBe(1);
      expect(manifest.rows[0].recordings).toHaveLength(3);
      expect(manifest.rows[0].interventionClips[0].error).toMatch(/partial|does not match/);
      expect(manifest.rows[0].interventionClips[0].file).toBeUndefined();
    },
  );

  it('loads emitted audio references through the real prompt renderer from paths with spaces and Unicode', async () => {
    await run(fixture(), 'audio review café #1');
    const tests = JSON.parse(
      await readFile(path.join(root, 'audio review café #1/audio-review-tests.json'), 'utf8'),
    );
    const prompt = {
      raw: '[{"role":"user","content":[{"type":"input_audio","input_audio":{"data":"{{audio_file}}","format":"wav"}}]}]',
      label: 'Blind audio review',
    };
    const rendered = JSON.parse(await renderPrompt(prompt, { ...tests[0].vars }));
    expect(Buffer.from(rendered[0].content[0].input_audio.data, 'base64')).toEqual(wav());
  });

  it('retains partial error rows and valid neighboring recordings when media is missing', async () => {
    const input = fixture();
    input.results.results.push({
      ...input.results.results[0],
      response: { ...input.results.results[0].response, audio: undefined as never },
    });
    const manifest = await run(input);
    expect(manifest.errors).toBe(1);
    expect(manifest.rows[0].recordings).toHaveLength(3);
    expect(manifest.rows[1].recordings).toHaveLength(0);
    expect(manifest.rows[1].error).toContain('blob reference');
    expect(JSON.parse(await readFile(path.join(root, 'out/manifest.json'), 'utf8')).errors).toBe(1);
    expect(await readFile(path.join(root, 'out/index.html'), 'utf8')).toContain('Case ');
  });

  it.each(['hash', 'size', 'base64', 'duplicate'] as const)(
    'rejects corrupt or ambiguous portable evidence: %s',
    async (failure) => {
      const input = fixture();
      if (failure === 'hash') {
        input.blobAssets[0].data = wav(2, 16000).toString('base64');
      } else if (failure === 'size') {
        input.results.results[0].response.audio.blobRef.sizeBytes++;
      } else if (failure === 'base64') {
        input.blobAssets[0].data += '\n';
      } else {
        input.blobAssets.push(input.blobAssets[0]);
      }
      const manifest = await run(input);
      expect(manifest.errors).toBe(1);
      expect(manifest.rows[0].recordings).toHaveLength(0);
    },
  );

  it.each(['wav', 'channels', 'mapping'] as const)(
    'fails closed for unsupported recording structure: %s',
    async (failure) => {
      const input = fixture(
        failure === 'wav' ? Buffer.from('not a WAV file') : failure === 'channels' ? wav(1) : wav(),
      );
      if (failure === 'mapping') {
        input.results.results[0].response.metadata.voice.audioChannels.reverse();
      }
      const manifest = await run(input);
      expect(manifest.errors).toBe(1);
      expect(manifest.rows[0].recordings).toHaveLength(0);
    },
  );

  it('only resolves local blobs when an explicit config directory is supplied', async () => {
    const input = fixture();
    const asset = input.blobAssets[0];
    input.blobAssets = [];
    const state = path.join(root, 'state');
    const directory = path.join(state, 'blobs', asset.hash.slice(0, 2), asset.hash.slice(2, 4));
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, asset.hash), Buffer.from(asset.data, 'base64'));
    expect((await run(input, 'without')).errors).toBe(1);
    const manifest = await run(input, 'with', { configDir: state });
    expect(manifest.errors).toBe(0);
    expect(manifest.rows[0].source).toBe('filesystem');
  });

  it('rejects filesystem blobs whose symlink escapes the selected blob directory', async () => {
    const input = fixture();
    const asset = input.blobAssets[0];
    input.blobAssets = [];
    const state = path.join(root, 'state');
    const directory = path.join(state, 'blobs', asset.hash.slice(0, 2), asset.hash.slice(2, 4));
    await mkdir(directory, { recursive: true });
    const external = path.join(root, 'external.wav');
    await writeFile(external, Buffer.from(asset.data, 'base64'));
    await symlink(external, path.join(directory, asset.hash));
    const manifest = await run(input, 'out', { configDir: state });
    expect(manifest.errors).toBe(1);
    expect(manifest.rows[0].error).toContain('outside');
  });

  it('renders hostile transcript and description strings only as inert JSON/textContent', async () => {
    const input = fixture();
    const malicious = '</script><img src=x onerror="globalThis.compromised=true">';
    input.results.results[0].testCase.description = malicious;
    input.results.results[0].response.metadata.voice.transcript[0].delta = malicious;
    await run(input);
    const html = await readFile(path.join(root, 'out/index.html'), 'utf8');
    expect(html).not.toContain(malicious);
    expect(html).not.toContain('innerHTML');
    const embedded = html.match(/id="data">([\s\S]*?)<\/script>/)?.[1];
    expect(JSON.parse(embedded!).evidence[0].description).toBe(malicious);
    expect(html).toContain('item.textContent=text');
  });

  it('refuses to overwrite an existing output directory', async () => {
    await run(fixture());
    await expect(run(fixture())).rejects.toMatchObject({ code: 'EEXIST' });
  });

  it('returns a nonzero CLI exit status while retaining the partial manifest', async () => {
    const input = fixture();
    input.blobAssets = [];
    const file = path.join(root, 'input.json');
    await writeFile(file, JSON.stringify(input));
    const command = spawnSync(process.execPath, [script, file, '--out', path.join(root, 'cli')], {
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(command.status).toBe(1);
    expect(command.stdout).toContain('1 recording error');
    expect(JSON.parse(await readFile(path.join(root, 'cli/manifest.json'), 'utf8')).errors).toBe(1);
  });
});
