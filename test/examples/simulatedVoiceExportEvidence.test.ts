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

function appFixture() {
  const input = fixture() as any;
  const source = wav(1, 24000, 24000);
  const hash = createHash('sha256').update(source).digest('hex');
  input.blobAssets.push({
    hash,
    sizeBytes: source.length,
    mimeType: 'audio/wav',
    data: source.toString('base64'),
  });
  input.results.results[0].response.metadata.audio = {
    role: 'target_source',
    clock: 'source_sample_order',
    channels: 1,
    sampleRate: 24000,
    duration: 1,
    blobRef: { hash, sizeBytes: source.length, mimeType: 'audio/wav', provider: 'filesystem' },
  };
  input.results.results[0].response.metadata.voice.targetPlayback = {
    mode: 'app-barge-in',
    clock: 'media',
    policy: { sourceQuietMs: 200, callerQuietMs: 200 },
    metrics: {
      sourceBytes: 48000,
      deliveredSourceBytes: 9600,
      transportRejectedSourceBytes: 0,
      bufferingRejectedSourceBytes: 0,
      discardedQueuedBytes: 4800,
      discardedSelectedBytes: 0,
      discardedIncomingBytes: 9600,
      pendingQueuedBytes: 24000,
      pendingSelectedBytes: 0,
      suppressedPlaybackMs: 200,
      stops: 1,
      closed: true,
      suppressed: false,
      recoveryFailed: false,
    },
    events: [
      {
        type: 'suppressed',
        epoch: 1,
        atMs: 200,
        callerOnsetAtMs: 100,
        discardedSourceStartByte: 9600,
        discardedSourceEndByte: 14400,
      },
      { type: 'redirect_acknowledged', epoch: 1, atMs: 210 },
      {
        type: 'resumed',
        epoch: 1,
        atMs: 400,
        recovery: 'observed_source_quiet',
        discardedSourceStartByte: 14400,
        discardedSourceEndByte: 24000,
      },
      { type: 'closed', epoch: 1, atMs: 500 },
    ],
    recognition: { status: 'completed', usageConfirmed: true },
    redirects: [],
  };
  return { input, source };
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

  it('binds playout failures to the corresponding WAV without exposing counters to the audio model', async () => {
    const input = fixture();
    Object.assign(input.results.results[0].response.metadata.voice, {
      participants: {
        target: { playout: { underflowAfterActiveAudioMs: 0, underflowEvents: 0 } },
        caller: { playout: { underflowAfterActiveAudioMs: 80, underflowEvents: 1 } },
      },
    });
    await run(input);
    const tests = JSON.parse(
      await readFile(path.join(root, 'out/audio-review-tests.json'), 'utf8'),
    );
    expect(tests.map((test: any) => test.vars.audio_transport.participants)).toEqual([
      [
        { role: 'target', underflowAfterActiveAudioMs: 0, underflowEvents: 0 },
        { role: 'caller', underflowAfterActiveAudioMs: 80, underflowEvents: 1 },
      ],
      [{ role: 'target', underflowAfterActiveAudioMs: 0, underflowEvents: 0 }],
      [{ role: 'caller', underflowAfterActiveAudioMs: 80, underflowEvents: 1 }],
    ]);
    for (const test of tests) {
      const bytes = await readFile(test.vars.audio_file.slice('file://'.length));
      expect(test.vars.audio_transport.recordingSha256).toBe(
        createHash('sha256').update(bytes).digest('hex'),
      );
    }
    const prompt = {
      raw: await readFile(path.join(path.dirname(script), 'audio-review-prompt.json'), 'utf8'),
      label: 'Actual audio review template',
    };
    const rendered = await renderPrompt(prompt, { ...tests[0].vars });
    expect(rendered).not.toContain('underflowAfterActiveAudioMs');
    expect(rendered).not.toContain('recordingSha256');
  });

  it.each([-1, 501, null])('rejects invalid recorded underflow counters: %s', async (underflow) => {
    const input = fixture();
    Object.assign(input.results.results[0].response.metadata.voice, {
      participants: {
        caller: { playout: { underflowAfterActiveAudioMs: underflow, underflowEvents: 1 } },
      },
    });
    const manifest = await run(input);
    expect(manifest.errors).toBe(1);
    expect(manifest.rows[0].error).toContain('Invalid caller playout counters');
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

  it.each([true, false])(
    'reports target speech resuming after a quiet window and clips its final frame to the caller clip: %s',
    async (activeInsideFinalFrame) => {
      const bytes = wav(2, 24000, 72000);
      for (let frame = 0; frame < 72000; frame++) {
        const ms = frame / 24;
        const targetActive =
          (ms >= 500 && ms < 1100) ||
          (ms >= 1400 && ms < 1520) ||
          (ms >= (activeInsideFinalFrame ? 1800 : 1810) && ms < 1900);
        bytes.writeInt16LE(targetActive ? 2000 : 0, 44 + frame * 4);
        bytes.writeInt16LE(ms >= 1000 && ms < 1810 ? -3000 : 0, 46 + frame * 4);
      }
      const input = fixture(bytes);
      input.results.results[0].response.metadata.voice.interventions[0] = {
        scheduledAtMs: 1000,
        firstFrameAtMs: 1000,
        completedAtMs: 1810,
      };
      const manifest = await run(input);
      const measurement = manifest.rows[0].metrics.interventions[0];
      expect(measurement.first200MsTargetQuietAtMs).toBe(1100);
      expect(measurement.targetActivityAfterFirst200MsQuiet).toEqual({
        intervalStartMs: 1300,
        intervalEndMs: 1810,
        activeMs: activeInsideFinalFrame ? 130 : 120,
        lastActiveEndMs: activeInsideFinalFrame ? 1810 : 1520,
      });
      expect(measurement.interpretation).toContain('does not identify semantic intent');
    },
  );

  it.each(['quiet-through-clip', 'quiet-after-clip', 'no-quiet'])(
    'distinguishes zero later target activity from no measurable post-quiet interval: %s',
    async (mode) => {
      const bytes = wav(2, 24000, 72000);
      for (let frame = 0; frame < 72000; frame++) {
        const ms = frame / 24;
        const targetActive =
          mode === 'no-quiet' || ms < (mode === 'quiet-after-clip' ? 2000 : 1100);
        bytes.writeInt16LE(targetActive ? 2000 : 0, 44 + frame * 4);
        bytes.writeInt16LE(ms >= 1000 && ms < 1810 ? -3000 : 0, 46 + frame * 4);
      }
      const input = fixture(bytes);
      input.results.results[0].response.metadata.voice.interventions[0] = {
        scheduledAtMs: 1000,
        firstFrameAtMs: 1000,
        completedAtMs: 1810,
      };
      const manifest = await run(input);
      expect(manifest.rows[0].metrics.interventions[0].targetActivityAfterFirst200MsQuiet).toEqual(
        mode === 'quiet-through-clip'
          ? { intervalStartMs: 1300, intervalEndMs: 1810, activeMs: 0, lastActiveEndMs: null }
          : null,
      );
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

  it('exports source bytes separately without promoting unheard audio or source clocks into heard evidence', async () => {
    const { input, source } = appFixture();
    const manifest = await run(input);
    expect(manifest.errors).toBe(0);
    expect(manifest.rows[0].recordings.map((r: any) => r.role)).toEqual([
      'stereo',
      'target',
      'caller',
    ]);
    expect(manifest.rows[0].sourceRecordings).toMatchObject([
      {
        role: 'target_source',
        clock: 'source_sample_order',
        heardEvidence: false,
        durationMs: 1000,
      },
    ]);
    expect(await readFile(path.join(root, 'out/case-001-target-source.wav'))).toEqual(source);
    const heardTests = JSON.parse(
      await readFile(path.join(root, 'out/audio-review-tests.json'), 'utf8'),
    );
    const sourceTests = JSON.parse(
      await readFile(path.join(root, 'out/source-audio-review-tests.json'), 'utf8'),
    );
    expect(heardTests).toHaveLength(3);
    expect(sourceTests).toHaveLength(1);
    expect(heardTests.every((t: any) => !t.vars.audio_file.includes('target-source'))).toBe(true);
    expect(Object.keys(sourceTests[0].vars).sort()).toEqual([
      'audio_file',
      'audio_id',
      'audio_view',
    ]);
    expect(sourceTests[0].vars.audio_file).toContain('target-source.wav');
    expect(
      JSON.parse(await readFile(path.join(root, 'out/transcription-tests.json'), 'utf8')),
    ).toHaveLength(2);
    expect(
      JSON.parse(await readFile(path.join(root, 'out/source-transcription-tests.json'), 'utf8')),
    ).toHaveLength(1);
    const html = await readFile(path.join(root, 'out/index.html'), 'utf8');
    const sourcePlayer = html
      .split('for(const file of item.sourceRecordings||[])')[1]
      .split('for(const intervention')[0];
    expect(sourcePlayer).not.toContain('players.push');
    expect(sourcePlayer).not.toContain("'seeked'");
    expect(sourcePlayer).not.toContain("'timeupdate'");
    expect(html).toContain('Seeking this player does not seek the conversation');
  });

  it('reports application timing and accounting separately from native quiet observations', async () => {
    const { input } = appFixture();
    const manifest = await run(input);
    const metrics = manifest.rows[0].metrics;
    expect(metrics.interventionObservationScope).toBe('application-controlled-playback');
    expect(metrics.targetPlayback.accounting).toMatchObject({
      sourceBytes: 48000,
      accountedBytes: 48000,
      intentionallyDiscardedBytes: 14400,
      pendingBytes: 24000,
      sourceMatchesVerifiedWav: true,
    });
    expect(metrics.targetPlayback.stops[0]).toMatchObject({
      detectionDelayMs: 100,
      heardStopFrameBoundMs: 100,
      activeWhileSuppressedMs: 0,
      resumedAtMs: 400,
      firstActivityAfterResumeAtMs: null,
      usefulAnswerLatencyMs: null,
    });
    expect(metrics.targetSource.clock).toBe('source_sample_order');
    const native = await run(fixture(), 'native');
    expect(native.rows[0].metrics.interventionObservationScope).toBe('native-playback');
    expect(native.rows[0].metrics.targetPlayback).toBeUndefined();
  });

  it('retains an audible leak inside application suppression in the measured stop bound', async () => {
    const { input } = appFixture();
    const heard = wav();
    for (let frame = 7200; frame < 8160; frame++) {
      heard.writeInt16LE(2000, 44 + frame * 4);
    }
    const replacement = fixture(heard);
    input.results.results[0].response.audio = replacement.results.results[0].response.audio;
    input.blobAssets[0] = replacement.blobAssets[0];
    const manifest = await run(input);
    expect(manifest.rows[0].metrics.targetPlayback.stops[0]).toMatchObject({
      lastActiveTargetFrameEndBeforeResumeMs: 340,
      heardStopFrameBoundMs: 240,
      activeWhileSuppressedMs: 40,
    });
  });

  it.each([
    'missing',
    'hash',
    'clock',
    'duration',
    'balance',
    'source-size',
    'delivery-size',
    'range',
    'onset',
  ] as const)(
    'fails source/accounting provenance checks while retaining heard tracks: %s',
    async (failure) => {
      const { input } = appFixture();
      const metadata = input.results.results[0].response.metadata;
      const metrics = metadata.voice.targetPlayback.metrics;
      if (failure === 'missing') {
        delete metadata.audio;
      }
      if (failure === 'hash') {
        input.blobAssets[1].data = wav(1, 16000, 24000).toString('base64');
      }
      if (failure === 'clock') {
        metadata.audio.clock = 'media';
      }
      if (failure === 'duration') {
        metadata.audio.duration = 500;
      }
      if (failure === 'balance') {
        metrics.pendingQueuedBytes += 2;
      }
      if (failure === 'source-size') {
        metrics.sourceBytes += 2;
        metrics.pendingQueuedBytes += 2;
      }
      if (failure === 'delivery-size') {
        metrics.deliveredSourceBytes += 15000;
        metrics.pendingQueuedBytes -= 15000;
      }
      if (failure === 'range') {
        metadata.voice.targetPlayback.events[0].discardedSourceEndByte = 48002;
      }
      if (failure === 'onset') {
        metadata.voice.targetPlayback.events[0].callerOnsetAtMs = 300;
      }
      const manifest = await run(input);
      expect(manifest.errors).toBe(1);
      expect(manifest.rows[0].error).toBeTruthy();
      expect(manifest.rows[0].recordings).toHaveLength(3);
      expect(manifest.rows[0].sourceRecordings).toBeUndefined();
    },
  );

  it('retains exportable evidence for failed application recovery instead of recasting it as native success', async () => {
    const { input } = appFixture();
    const playback = input.results.results[0].response.metadata.voice.targetPlayback;
    playback.metrics.suppressed = true;
    playback.metrics.recoveryFailed = true;
    playback.events[2].type = 'recovery_timeout';
    const manifest = await run(input);
    expect(manifest.errors).toBe(0);
    expect(manifest.rows[0].metrics.targetPlayback.accounting.recoveryFailed).toBe(true);
    expect(manifest.rows[0].metrics.targetPlayback.stops[0].resumedAtMs).toBeNull();
    expect(manifest.rows[0].evalSuccess).toBe(false);
  });

  it('grades recovery, recognition completion, and explicitly expected false stops independently of accounting', async () => {
    const grade = (
      await import(pathToFileURL(path.join(path.dirname(script), 'app-playback-health.js')).href)
    ).default;
    const { input } = appFixture();
    const response = input.results.results[0].response;
    expect(
      grade('', { providerResponse: response, vars: { expectedApplicationStops: 1 } }).pass,
    ).toBe(true);
    expect(
      grade('', { providerResponse: response, vars: { expectedApplicationStops: 0 } }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining('observed 1') });
    response.metadata.voice.targetPlayback.metrics.recoveryFailed = true;
    expect(grade('', { providerResponse: response }).reason).toContain('did not recover');
    response.metadata.voice.targetPlayback.metrics.recoveryFailed = false;
    response.metadata.voice.targetPlayback.recognition.usageConfirmed = false;
    expect(grade('', { providerResponse: response })).toMatchObject({
      pass: true,
      reason: expect.stringContaining('billing usage is unconfirmed'),
    });
    response.metadata.voice.targetPlayback.recognition.status = 'failed';
    response.metadata.voice.targetPlayback.recognition.usageConfirmed = true;
    expect(grade('', { providerResponse: response })).toMatchObject({
      pass: false,
      reason: expect.stringContaining('recognition did not complete'),
    });
    expect(grade('', { providerResponse: {} }).pass).toBe(false);
  });

  it('preserves provider-clock source on startup failure without manufacturing a heard-stop delay', async () => {
    const { input, source } = appFixture();
    delete input.results.results[0].response.audio;
    const playback = input.results.results[0].response.metadata.voice.targetPlayback;
    playback.clock = 'provider';
    Object.assign(playback.metrics, {
      deliveredSourceBytes: 0,
      discardedQueuedBytes: 0,
      discardedIncomingBytes: 0,
      pendingQueuedBytes: 48000,
      stops: 0,
      suppressedPlaybackMs: 0,
    });
    playback.events = [{ type: 'closed', epoch: 0, atMs: 100 }];
    const manifest = await run(input);
    expect(manifest.errors).toBe(1);
    expect(manifest.rows[0].recordings).toHaveLength(0);
    expect(await readFile(path.join(root, 'out/case-001-target-source.wav'))).toEqual(source);
    expect(manifest.rows[0].metrics.targetPlayback.clock).toBe('provider');
    expect(manifest.rows[0].metrics.targetPlayback.stops).toBeNull();
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
