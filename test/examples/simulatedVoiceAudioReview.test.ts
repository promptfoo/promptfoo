import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import yaml from 'yaml';
import { runAssertion } from '../../src/assertions';
import { getNunjucksEngine } from '../../src/util/templates';

import type { ApiProvider, Assertion } from '../../src/types';

const examplePath = path.resolve(__dirname, '../../examples/simulated-voice-user');
let utils: {
  readPcm16Wav: (input: Buffer) => { sampleRate: number; channels: number; samples: Int16Array };
  writePcm16Wav: (input: { sampleRate: number; channels: number; samples: Int16Array }) => Buffer;
  analyzePcm16: (
    samples: Int16Array,
    rate: number,
  ) => {
    durationMs: number;
    clippedSamples: number;
    zeroIslands: Array<{ startMs: number; endMs: number; durationMs: number }>;
    activeAtEnd: boolean;
  };
};
let validate: (
  output: unknown,
  context?: { vars: { audio_file: string } },
) => { pass: boolean; reason: string };
let scoring: {
  scoreCalibration: (
    labels: unknown,
    results: unknown,
  ) => {
    calibrationPassed: boolean;
    errors: number;
    statusMatches: number;
    cases: Array<{ silenceHallucination?: boolean }>;
    perDefect: Record<string, { falseNegative: number; unknown: number; truePositive: number }>;
    signal: { calibrationPassed: boolean; cases: Array<{ state: string; findings: string[] }> };
    signalWithoutReference: { cases: Array<{ state: string }> };
    combined: { cases: Array<{ state: string }> };
  };
};
let calibration: {
  generateCalibration: (options: {
    source: string;
    profile?: string;
    pauseSource: string;
    out: string;
  }) => Promise<{ directory: string; cases: number; labelsSha256: string }>;
  createControls: (
    samples: Int16Array,
    rate: number,
    options?: { profile: string },
  ) => Array<{ kind: string; samples: Int16Array; expected: string }>;
};
type SignalReport = {
  state: string;
  referenceUsed: boolean;
  findings: Array<{ type: string; evidence: string; start_seconds: number; end_seconds: number }>;
  observations: Array<{ type: string }>;
};
let signal: {
  analyzeAudioSignal: (
    audio: { sampleRate: number; channels: number; samples: Int16Array },
    reference?: { sampleRate: number; channels: number; samples: Int16Array },
  ) => SignalReport;
  default: (
    output: unknown,
    context: { vars: Record<string, unknown> },
  ) => { pass: boolean; reason: string };
};
beforeAll(async () => {
  utils = await import(pathToFileURL(path.join(examplePath, 'audio-utils.js')).href);
  validate = (await import(pathToFileURL(path.join(examplePath, 'validate-audio-review.js')).href))
    .default;
  calibration = await import(pathToFileURL(path.join(examplePath, 'calibrate-audio.js')).href);
  signal = await import(pathToFileURL(path.join(examplePath, 'grade-audio-signal.js')).href);
  scoring = await import(pathToFileURL(path.join(examplePath, 'score-audio-calibration.js')).href);
});

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const audioContext = () => ({
  vars: {
    audio_file: utils
      .writePcm16Wav({ sampleRate: 24000, channels: 1, samples: new Int16Array([1000, -1000]) })
      .toString('base64'),
  },
});

const clear = {
  status: 'no_issue_flagged',
  intelligibility: 'clear',
  transcript: 'The cafe closes at four.',
  summary: 'Clear continuous speech.',
  findings: [],
};

describe('audio evidence WAV handling', () => {
  it('round-trips interleaved stereo without mixing or dropping samples', () => {
    const samples = new Int16Array([-32768, 32767, 100, -200, 0, 10]);
    const decoded = utils.readPcm16Wav(
      utils.writePcm16Wav({ sampleRate: 24000, channels: 2, samples }),
    );
    expect(decoded.sampleRate).toBe(24000);
    expect(decoded.channels).toBe(2);
    expect(decoded.samples).toEqual(samples);
  });
  it('supports unrelated WAV chunks and rejects truncated or unsupported audio', () => {
    const wav = utils.writePcm16Wav({
      sampleRate: 24000,
      channels: 1,
      samples: new Int16Array([10, 20]),
    });
    const extra = Buffer.from([74, 85, 78, 75, 2, 0, 0, 0, 1, 2]);
    const withExtra = Buffer.concat([wav.subarray(0, 12), extra, wav.subarray(12)]);
    withExtra.writeUInt32LE(withExtra.length - 8, 4);
    expect(utils.readPcm16Wav(withExtra).samples).toEqual(new Int16Array([10, 20]));
    expect(() => utils.readPcm16Wav(wav.subarray(0, -1))).toThrow(/WAV|truncated/i);
    const floatWav = Buffer.from(wav);
    floatWav.writeUInt16LE(3, 20);
    expect(() => utils.readPcm16Wav(floatWav)).toThrow(/PCM16/);
  });
  it('distinguishes an internal zero island from leading and trailing silence', () => {
    const samples = new Int16Array(24000);
    samples.fill(4000, 2400, 21600);
    samples.fill(0, 9600, 12000);
    const metrics = utils.analyzePcm16(samples, 24000);
    expect(metrics.durationMs).toBe(1000);
    expect(metrics.zeroIslands).toEqual([{ startMs: 400, endMs: 500, durationMs: 100 }]);
    expect(metrics.activeAtEnd).toBe(false);
    samples[10000] = 32767;
    samples[10001] = -32768;
    expect(utils.analyzePcm16(samples, 24000).clippedSamples).toBe(2);
  });
});

describe('audio model judgments fail closed', () => {
  it('rejects out-of-recording findings while preserving an in-bounds advisory judgment', () => {
    const audio = utils.writePcm16Wav({
      sampleRate: 24000,
      channels: 2,
      samples: new Int16Array(48000).fill(1000),
    });
    const context = { vars: { audio_file: audio.toString('base64') } };
    const review = {
      ...clear,
      status: 'review_required',
      findings: [
        {
          type: 'cutoff',
          severity: 'uncertain',
          start_seconds: 0.8,
          end_seconds: 1,
          description: 'Possible cut-off.',
        },
      ],
    };
    expect(validate(JSON.stringify(review), context)).toMatchObject({
      pass: false,
      reason: expect.stringContaining('Audio-model review: review_required'),
    });
    for (const times of [
      { start_seconds: 1.5, end_seconds: null },
      { start_seconds: null, end_seconds: 1.5 },
    ]) {
      const invalid = { ...review, findings: [{ ...review.findings[0], ...times }] };
      expect(validate(JSON.stringify(invalid), context)).toMatchObject({
        pass: false,
        reason: expect.stringContaining('outside the recording duration'),
      });
    }
  });
  it('rejects invented speech on an all-zero WAV independently of the model judgment', () => {
    const audio = utils.writePcm16Wav({
      sampleRate: 24000,
      channels: 1,
      samples: new Int16Array(24000),
    });
    expect(
      validate(JSON.stringify(clear), { vars: { audio_file: audio.toString('base64') } }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining('no signal') });
    expect(validate(JSON.stringify(clear)).pass).toBe(false);
  });
  it('accepts only a coherent clear no-issue judgment', () => {
    expect(validate(JSON.stringify(clear), audioContext()).pass).toBe(true);
  });
  it.each([
    'not json',
    'null',
    '{}',
    JSON.stringify({ ...clear, status: 'pass' }),
    JSON.stringify({ ...clear, transcript: '' }),
    JSON.stringify({ ...clear, intelligibility: 'no_speech' }),
    JSON.stringify({
      ...clear,
      findings: [
        {
          type: 'dropout',
          severity: 'major',
          start_seconds: 1,
          end_seconds: 2,
          description: 'Missing speech.',
        },
      ],
    }),
    JSON.stringify({ ...clear, status: 'review_required' }),
    JSON.stringify({ ...clear, status: 'unratable' }),
  ])('does not pass invalid, contradictory or uncertain review %s', (output) => {
    expect(validate(output, audioContext()).pass).toBe(false);
  });
  it('renders optional channel context without adding transcript or expected labels', () => {
    const template = readFileSync(path.join(examplePath, 'audio-review-prompt.json'), 'utf8');
    for (const audio_view of [
      undefined,
      'stereo_conversation',
      'isolated_target',
      'isolated_caller',
      'standalone_clip',
    ]) {
      const variables = {
        audio_id: 'opaque',
        audio_file: 'UklGRg==',
        ...(audio_view ? { audio_view } : {}),
      };
      const messages = JSON.parse(getNunjucksEngine().renderString(template, variables));
      expect(messages[1].content[0].text).toContain(
        `Recording view: ${audio_view ?? 'unspecified'}`,
      );
      expect(messages[1].content[1]).toEqual({
        type: 'input_audio',
        input_audio: { data: 'UklGRg==', format: 'wav' },
      });
      expect(messages[0].content).toContain('silence while the other party speaks is expected');
    }
  });
  it('uses actual is-json schema validation for additional fields and malformed evidence', async () => {
    const config = yaml.parse(
      readFileSync(path.join(examplePath, 'promptfooconfig.audio-review.yaml'), 'utf8'),
    );
    const assertion: Assertion = config.defaultTest.assert[0];
    const provider: ApiProvider = {
      id: () => 'audio-fixture',
      callApi: async () => ({ output: '' }),
    };
    const schema = JSON.parse(
      readFileSync(path.join(examplePath, 'audio-review-schema.json'), 'utf8'),
    );
    for (const [output, expected] of [
      [clear, true],
      [{ ...clear, unexplained: 'extra' }, false],
      [{ ...clear, findings: [{ type: 'dropout' }] }, false],
    ] as const) {
      const result = await runAssertion({
        assertion: { ...assertion, value: schema },
        providerResponse: { output: JSON.stringify(output) },
        test: {},
        provider,
      });
      expect(result.pass).toBe(expected);
    }
    const prompt = readFileSync(path.join(examplePath, 'audio-review-prompt.json'), 'utf8');
    expect(prompt).toContain('input_audio');
    expect(prompt).not.toMatch(/\{\{(?:expected|transcript|facts)/);
    expect(config.providers[0].config.modalities).toEqual(['text']);
    expect(config.providers[0].config.response_format).toBeUndefined();
  });
});

describe('blinded acoustic control construction', () => {
  it('freezes exact hashes separately from opaque model inputs and refuses to overwrite a run', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'voice-audio-calibration-'));
    temporaryDirectories.push(directory);
    const samples = Int16Array.from({ length: 72000 }, (_, index) =>
      Math.round(12000 * Math.sin(index / 5)),
    );
    const source = path.join(directory, 'source.wav');
    const pauseSource = path.join(directory, 'pause.wav');
    const out = path.join(directory, 'controls');
    const original = utils.writePcm16Wav({ sampleRate: 24000, channels: 1, samples });
    writeFileSync(source, original);
    const paused = Int16Array.from(samples);
    paused.fill(0, 24000, 42000);
    writeFileSync(
      pauseSource,
      utils.writePcm16Wav({ sampleRate: 24000, channels: 1, samples: paused }),
    );
    const generated = await calibration.generateCalibration({ source, pauseSource, out });
    expect(generated.cases).toBe(9);
    const labelsBytes = readFileSync(path.join(out, 'frozen-labels.json'));
    expect(createHash('sha256').update(labelsBytes).digest('hex')).toBe(generated.labelsSha256);
    const labels = JSON.parse(labelsBytes.toString());
    const tests = JSON.parse(readFileSync(path.join(out, 'audio-review-tests.json'), 'utf8'));
    for (const test of tests) {
      expect(Object.keys(test).sort()).toEqual(['description', 'vars']);
      expect(Object.keys(test.vars).sort()).toEqual([
        'audio_file',
        'audio_id',
        'audio_reference',
        'audio_reference_sha256',
        'audio_view',
      ]);
      expect(test.description).toBe(test.vars.audio_id);
      expect(test.vars.audio_id).toMatch(/^[0-9a-f-]{36}$/);
      const control = labels.cases.find((item: { id: string }) => item.id === test.vars.audio_id);
      expect(test.vars.audio_view).toBe(
        control.kind === 'natural_pause_source' ? 'isolated_caller' : 'standalone_clip',
      );
      const audio = readFileSync(path.join(out, control.file));
      expect(createHash('sha256').update(audio).digest('hex')).toBe(control.sha256);
      if (control.kind.startsWith('unchanged')) {
        expect(audio).toEqual(original);
      }
    }
    await expect(calibration.generateCalibration({ source, pauseSource, out })).rejects.toThrow(
      /EEXIST/,
    );
    expect(readFileSync(path.join(out, 'frozen-labels.json'))).toEqual(labelsBytes);
  });
  it('leaves the source untouched and deterministically introduces each advertised defect', () => {
    const samples = Int16Array.from({ length: 72000 }, (_, index) =>
      Math.round(12000 * Math.sin(index / 5)),
    );
    const before = Int16Array.from(samples);
    const controls = calibration.createControls(samples, 24000);
    expect(samples).toEqual(before);
    expect(controls.find((control) => control.kind === 'unchanged')?.samples).toEqual(before);
    const gap = controls.find((control) => control.kind === 'gap_200ms')!;
    expect(
      utils.analyzePcm16(gap.samples, 24000).zeroIslands.some((island) => island.durationMs >= 200),
    ).toBe(true);
    const clipped = controls.find((control) => control.kind === 'severe_clipping')!;
    expect(utils.analyzePcm16(clipped.samples, 24000).clippedSamples).toBeGreaterThan(72000 / 5);
    expect(controls.find((control) => control.kind === 'truncation')!.samples.length).toBeLessThan(
      samples.length,
    );
    expect(
      controls
        .find((control) => control.kind === 'silence')!
        .samples.every((sample) => sample === 0),
    ).toBe(true);
    expect(
      controls.find((control) => control.kind === 'repetition')!.samples.length,
    ).toBeGreaterThan(samples.length);
  });
  it('rejects silence or short source material instead of inventing a voiced control location', () => {
    expect(() => calibration.createControls(new Int16Array(72000), 24000)).toThrow(
      /voiced|active/i,
    );
    expect(() => calibration.createControls(new Int16Array([1, 2]), 24000)).toThrow(
      /short|second/i,
    );
  });
});

describe('frozen audio calibration scoring', () => {
  function fixture(samples = new Int16Array([1000, -1000])) {
    const audio = utils.writePcm16Wav({
      sampleRate: 24000,
      channels: 1,
      samples,
    });
    const labels = {
      version: 1,
      source: { sha256: createHash('sha256').update(audio).digest('hex') },
      pauseSource: { sha256: createHash('sha256').update(audio).digest('hex') },
      cases: [
        {
          id: 'opaque',
          kind: 'unchanged',
          requirement: 'negative_control',
          expected: 'no_issue_flagged',
          sha256: createHash('sha256').update(audio).digest('hex'),
        },
      ],
    };
    const row = {
      testCase: {
        vars: {
          audio_id: 'opaque',
          audio_reference: audio.toString('base64'),
          audio_reference_sha256: labels.source.sha256,
        },
      },
      prompt: {
        raw: JSON.stringify([
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: { data: audio.toString('base64'), format: 'wav' },
              },
            ],
          },
        ]),
      },
      response: { output: JSON.stringify(clear) },
    };
    return { labels, row };
  }
  it('keeps signal detections separate from model misses and preserves provider errors in combined results', () => {
    const { labels, row } = fixture(
      Int16Array.from({ length: 24000 }, (_, index) => (index % 2 ? -32768 : 32767)),
    );
    labels.cases[0] = {
      ...labels.cases[0],
      kind: 'severe_clipping',
      requirement: 'severe_control',
      expected: 'review_required',
    };
    const missed = scoring.scoreCalibration(labels, { results: { results: [row] } });
    expect(missed.cases[0]).toMatchObject({
      state: 'no_issue_flagged',
      expectedDefectDetected: false,
    });
    expect(missed.signal.cases[0]).toMatchObject({
      state: 'review_required',
      findings: ['distortion'],
    });
    expect(missed.combined.cases[0].state).toBe('review_required');
    const errored = scoring.scoreCalibration(labels, {
      results: { results: [{ ...row, response: { error: 'model unavailable' } }] },
    });
    expect(errored.signal.cases[0].state).toBe('review_required');
    expect(errored.combined.cases[0].state).toBe('error');
  });
  it('requires the frozen clean reference and rejects substituted or missing reference pairs', () => {
    const source = utils.writePcm16Wav({
      sampleRate: 24000,
      channels: 1,
      samples: new Int16Array(48000).fill(2000),
    });
    const { labels, row } = fixture(new Int16Array(24000).fill(2000));
    labels.source.sha256 = createHash('sha256').update(source).digest('hex');
    labels.cases[0] = {
      ...labels.cases[0],
      kind: 'truncation',
      expected: 'review_required',
      requirement: 'severe_control',
    };
    const originalVars = { ...row.testCase.vars };
    row.testCase.vars.audio_reference = source.toString('base64');
    row.testCase.vars.audio_reference_sha256 = labels.source.sha256;
    const correct = scoring.scoreCalibration(labels, { results: { results: [row] } });
    expect(correct.signal.cases[0]).toMatchObject({
      state: 'review_required',
      findings: ['cutoff'],
      referenceHashVerified: true,
      referenceSha256: labels.source.sha256,
    });
    for (const vars of [
      originalVars,
      { ...row.testCase.vars, audio_reference: originalVars.audio_reference },
      { audio_id: 'opaque' },
      { audio_id: 'opaque', audio_reference_sha256: labels.source.sha256 },
    ]) {
      const changed = scoring.scoreCalibration(labels, {
        results: { results: [{ ...row, testCase: { vars } }] },
      });
      expect(changed.signal.cases[0]).toMatchObject({
        state: 'error',
        inputHashVerified: true,
        error: expect.stringContaining('SHA-256'),
      });
      expect(changed.signalWithoutReference.cases[0].state).toBe('no_issue_flagged');
      expect(changed.combined.cases[0].state).toBe('error');
    }
  });
  it('scores native export redaction using frozen reference bytes and rejects a substituted reference file', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'voice-native-redaction-'));
    temporaryDirectories.push(directory);
    const source = utils.writePcm16Wav({
      sampleRate: 24000,
      channels: 1,
      samples: new Int16Array(48000).fill(2000),
    });
    const { labels, row } = fixture(new Int16Array(24000).fill(2000));
    labels.source.sha256 = createHash('sha256').update(source).digest('hex');
    labels.cases[0] = {
      ...labels.cases[0],
      kind: 'truncation',
      expected: 'review_required',
      requirement: 'severe_control',
    };
    const referencePath = path.join(directory, 'reference.wav');
    const recordingPath = path.join(directory, 'recording.wav');
    const messages = JSON.parse(row.prompt.raw);
    writeFileSync(recordingPath, Buffer.from(messages[0].content[0].input_audio.data, 'base64'));
    writeFileSync(referencePath, source);
    messages[0].content[0].input_audio.data = '[REDACTED]';
    const native = {
      ...row,
      prompt: { raw: JSON.stringify(messages) },
      testCase: {
        vars: {
          audio_id: 'opaque',
          audio_file: `file://${recordingPath}`,
          audio_reference: `file://${referencePath}`,
          audio_reference_sha256: '[REDACTED]',
        },
      },
    };
    const grade = scoring.scoreCalibration(labels, { results: { results: [native] } });
    expect(grade.signal.cases[0]).toMatchObject({
      state: 'review_required',
      findings: ['cutoff'],
      inputHashVerified: true,
      inputHashScope: 'referenced_local_file',
      referenceHashVerified: true,
      referenceHashScope: 'referenced_local_file_after_export_redaction',
      referenceSha256: labels.source.sha256,
    });
    native.testCase.vars.audio_reference = `file://${recordingPath}`;
    expect(
      scoring.scoreCalibration(labels, { results: { results: [native] } }).signal.cases[0],
    ).toMatchObject({ state: 'error', error: expect.stringContaining('SHA-256 mismatch') });
    native.testCase.vars.audio_reference = `file://${referencePath}`;
    native.testCase.vars.audio_reference_sha256 = '[redacted]';
    expect(
      scoring.scoreCalibration(labels, { results: { results: [native] } }).signal.cases[0],
    ).toMatchObject({ state: 'error', error: expect.stringContaining('frozen source SHA-256') });
  });
  it('binds natural-pause controls to the frozen pause source instead of the speech source', () => {
    const { labels, row } = fixture(new Int16Array(24000).fill(2000));
    labels.cases[0].kind = 'natural_pause_source';
    labels.source.sha256 = '0'.repeat(64);
    const legitimate = scoring.scoreCalibration(labels, { results: { results: [row] } });
    expect(legitimate.signal.cases[0]).toMatchObject({
      state: 'no_issue_flagged',
      referenceHashVerified: true,
      referenceSha256: labels.pauseSource.sha256,
    });
    const changed = scoring.scoreCalibration(
      { ...labels, pauseSource: { sha256: '0'.repeat(64) } },
      { results: { results: [row] } },
    );
    expect(changed.signal.cases[0]).toMatchObject({
      state: 'error',
      error: expect.stringContaining('frozen source SHA-256'),
    });
  });
  it('matches actual submitted bytes and fails missing, duplicate, malformed and substituted inputs', () => {
    const { labels, row } = fixture();
    expect(scoring.scoreCalibration(labels, { results: { results: [row] } })).toMatchObject({
      calibrationPassed: false,
      errors: 0,
      statusMatches: 1,
    });
    for (const rows of [
      [],
      [row, row],
      [{ ...row, response: { output: 'not JSON' } }],
      [{ ...row, prompt: { raw: '[]' } }],
    ]) {
      expect(scoring.scoreCalibration(labels, { results: { results: rows } })).toMatchObject({
        calibrationPassed: false,
        errors: 1,
        statusMatches: 0,
      });
    }
  });
  it('reports local-file hash provenance when the native export redacts audio bytes', () => {
    const { labels, row } = fixture();
    const directory = mkdtempSync(path.join(os.tmpdir(), 'voice-audio-score-'));
    temporaryDirectories.push(directory);
    const filename = path.join(directory, 'recording.wav');
    const messages = JSON.parse(row.prompt.raw);
    writeFileSync(filename, Buffer.from(messages[0].content[0].input_audio.data, 'base64'));
    messages[0].content[0].input_audio.data = '[REDACTED]';
    const result = scoring.scoreCalibration(labels, {
      results: {
        results: [
          {
            ...row,
            prompt: { raw: JSON.stringify(messages) },
            testCase: { vars: { audio_id: 'opaque', audio_file: `file://${filename}` } },
          },
        ],
      },
    });
    expect(result.cases[0]).toMatchObject({
      inputHashVerified: true,
      inputHashScope: 'referenced_local_file',
      statusMatches: true,
    });
  });
  it('rejects findings outside the verified WAV while preserving verified input provenance', () => {
    const { labels, row } = fixture(new Int16Array(24000).fill(1000));
    labels.cases.push({
      ...labels.cases[0],
      id: 'clipping',
      kind: 'severe_clipping',
      requirement: 'severe_control',
      expected: 'review_required',
    });
    const review = {
      ...clear,
      status: 'review_required',
      findings: [
        {
          type: 'distortion',
          severity: 'major',
          start_seconds: 0.2,
          end_seconds: 0.4,
          description: 'Distorted speech.',
        },
      ],
    };
    const clipping = {
      ...row,
      testCase: { vars: { audio_id: 'clipping' } },
      response: { output: JSON.stringify(review) },
    };
    expect(
      scoring.scoreCalibration(labels, { results: { results: [row, clipping] } }).calibrationPassed,
    ).toBe(true);
    review.findings[0].start_seconds = 600;
    review.findings[0].end_seconds = 601;
    clipping.response.output = JSON.stringify(review);
    const changed = scoring.scoreCalibration(labels, { results: { results: [row, clipping] } });
    expect(changed).toMatchObject({ calibrationPassed: false, errors: 1 });
    expect(changed.perDefect.distortion.truePositive).toBe(0);
    expect(changed.cases[1]).toMatchObject({
      state: 'error',
      error: expect.stringContaining('outside the recording duration'),
      inputHashVerified: true,
      inputHashScope: 'rendered_prompt',
      inputSha256: labels.cases[1].sha256,
    });
    const input = JSON.parse(row.prompt.raw)[0].content[0].input_audio.data;
    expect(validate(clipping.response.output, { vars: { audio_file: input } })).toMatchObject({
      pass: false,
      reason: expect.stringContaining('outside the recording duration'),
    });
  });
  it('counts false silence alarms on speech independently of a correct known-silence verdict', () => {
    const speech = fixture(new Int16Array(24000).fill(1000));
    const silent = fixture(new Int16Array(24000));
    silent.labels.cases[0] = {
      ...silent.labels.cases[0],
      id: 'silent',
      kind: 'silence',
      requirement: 'severe_control',
      expected: 'unratable',
    };
    silent.row.testCase.vars.audio_id = 'silent';
    const noSpeech = JSON.stringify({
      ...clear,
      status: 'unratable',
      intelligibility: 'no_speech',
      transcript: '',
    });
    silent.row.response.output = noSpeech;
    const labels = { version: 1, cases: [...speech.labels.cases, ...silent.labels.cases] };
    const results = { results: { results: [speech.row, silent.row] } };
    expect(scoring.scoreCalibration(labels, results)).toMatchObject({
      calibrationPassed: true,
      errors: 0,
      perDefect: { silence: { truePositive: 1, trueNegative: 1, falsePositive: 0 } },
    });
    speech.row.response.output = noSpeech;
    const falseAlarm = scoring.scoreCalibration(labels, results);
    expect(falseAlarm).toMatchObject({
      calibrationPassed: false,
      errors: 0,
      perDefect: { silence: { truePositive: 1, falsePositive: 1, trueNegative: 0 } },
    });
    expect(falseAlarm.cases[0]).toMatchObject({ predictedSilence: true });
    const input = JSON.parse(silent.row.prompt.raw)[0].content[0].input_audio.data;
    expect(validate(noSpeech, { vars: { audio_file: input } }).pass).toBe(false);
  });
  it('requires a severe-control verdict to be ratable even when it names the right defect', () => {
    const { labels, row } = fixture();
    labels.cases.push({
      ...labels.cases[0],
      id: 'clipping',
      kind: 'severe_clipping',
      requirement: 'severe_control',
      expected: 'review_required',
    });
    labels.cases.push({
      ...labels.cases[0],
      id: 'silence',
      kind: 'silence',
      requirement: 'severe_control',
      expected: 'unratable',
    });
    const clipping = {
      ...row,
      testCase: { vars: { audio_id: 'clipping' } },
      response: {
        output: JSON.stringify({
          ...clear,
          status: 'review_required',
          findings: [
            {
              type: 'distortion',
              severity: 'major',
              start_seconds: null,
              end_seconds: null,
              description: 'Distorted speech.',
            },
          ],
        }),
      },
    };
    const silence = {
      ...row,
      testCase: { vars: { audio_id: 'silence' } },
      response: {
        output: JSON.stringify({
          ...clear,
          status: 'unratable',
          intelligibility: 'no_speech',
          transcript: '',
        }),
      },
    };
    const baseline = scoring.scoreCalibration(labels, {
      results: { results: [row, clipping, silence] },
    });
    expect(baseline.calibrationPassed).toBe(true);
    const uncertain = JSON.parse(clipping.response.output);
    uncertain.status = 'unratable';
    clipping.response.output = JSON.stringify(uncertain);
    const changed = scoring.scoreCalibration(labels, {
      results: { results: [row, clipping, silence] },
    });
    expect(changed.perDefect.distortion.unknown).toBe(1);
    expect(changed.calibrationPassed).toBe(false);
    expect(changed.cases[2]).toMatchObject({ statusMatches: true, expectedDefectDetected: true });
  });
  it('counts a model failure on known silence and never calls unratable a detected dropout', () => {
    const { labels, row } = fixture();
    labels.cases[0] = {
      ...labels.cases[0],
      kind: 'silence',
      requirement: 'severe_control',
      expected: 'unratable',
    };
    const hallucination = scoring.scoreCalibration(labels, { results: { results: [row] } });
    expect(hallucination.calibrationPassed).toBe(false);
    expect(hallucination.cases[0].silenceHallucination).toBe(true);
    expect(hallucination.perDefect.silence.falseNegative).toBe(1);
    labels.cases[0] = { ...labels.cases[0], kind: 'gap_600ms', expected: 'review_required' };
    row.response.output = JSON.stringify({
      ...clear,
      status: 'unratable',
      intelligibility: 'no_speech',
      transcript: '',
    });
    const unknown = scoring.scoreCalibration(labels, { results: { results: [row] } });
    expect(unknown.calibrationPassed).toBe(false);
    expect(unknown.perDefect.dropout.unknown).toBe(1);
    expect(unknown.perDefect.dropout.truePositive).toBe(0);
  });
});

describe('independent PCM evidence', () => {
  const rate = 24000;
  function voice() {
    return Int16Array.from({ length: rate * 3 }, (_, index) => {
      const envelope = Math.min(1, index / 1000, (rate * 3 - index - 1) / 1000);
      return Math.round(envelope * 9000 * Math.sin(index / 17 + index ** 2 / 1000000));
    });
  }
  function parsed(samples: Int16Array) {
    return { samples, sampleRate: rate, channels: 1 };
  }
  it('catches erasures and nonzero attenuation from PCM independently of a clear model verdict', () => {
    const reference = parsed(voice());
    for (const duration of [80, 140, 200, 360, 900]) {
      for (const gain of [0, 0.01]) {
        const received = Int16Array.from(reference.samples);
        for (let index = rate; index < rate + Math.round((rate * duration) / 1000); index++) {
          received[index] = Math.round(received[index] * gain);
        }
        const grade = signal.analyzeAudioSignal(parsed(received), reference);
        expect(grade.state).toBe('review_required');
        expect(grade.findings).toContainEqual(
          expect.objectContaining({ type: 'dropout', evidence: 'reference_difference' }),
        );
        const input = utils.writePcm16Wav(parsed(received)).toString('base64');
        expect(validate(JSON.stringify(clear), { vars: { audio_file: input } }).pass).toBe(true);
      }
    }
  });
  it('does not call a faded natural pause, boundary silence, or global gain reduction a dropout', () => {
    const original = voice();
    const paused = Int16Array.from(original);
    const ramp = 480;
    paused.fill(0, rate, rate * 2);
    for (let index = 0; index < ramp; index++) {
      paused[rate - ramp + index] = Math.round(
        paused[rate - ramp + index] * (1 - index / (ramp - 1)),
      );
      paused[rate * 2 + index] = Math.round((paused[rate * 2 + index] * index) / (ramp - 1));
    }
    const padded = new Int16Array(original.length + rate);
    padded.set(original, rate / 2);
    for (const samples of [
      original,
      paused,
      padded,
      Int16Array.from(original, (value) => Math.round(value / 2)),
    ]) {
      const grade = signal.analyzeAudioSignal(parsed(samples));
      expect(grade.state).toBe('no_issue_flagged');
    }
    expect(signal.analyzeAudioSignal(parsed(paused), parsed(paused)).state).toBe(
      'no_issue_flagged',
    );
    expect(
      signal.analyzeAudioSignal(
        parsed(Int16Array.from(original, (value) => Math.round(value / 2))),
        parsed(original),
      ).state,
    ).toBe('no_issue_flagged');
  });
  it('detects unaligned exact fragment loops and clipping without a reference', () => {
    const original = voice();
    const start = 24317;
    const length = 3288; // 137 ms, deliberately not aligned to a 20 ms frame.
    const repeated = new Int16Array(original.length + length * 2);
    repeated.set(original.subarray(0, start), 0);
    for (let copy = 0; copy < 3; copy++) {
      repeated.set(original.subarray(start, start + length), start + copy * length);
    }
    repeated.set(original.subarray(start + length), start + length * 3);
    expect(signal.analyzeAudioSignal(parsed(repeated)).findings).toContainEqual(
      expect.objectContaining({ type: 'repetition' }),
    );
    const clipped = Int16Array.from(original, (value) =>
      Math.max(-32768, Math.min(32767, value * 10)),
    );
    expect(signal.analyzeAudioSignal(parsed(clipped)).findings).toContainEqual(
      expect.objectContaining({ type: 'distortion' }),
    );
  });
  it('proves a missing reference tail even at a zero crossing without guessing from capture boundaries', () => {
    const original = voice();
    let cut = rate;
    while (cut < rate + 1000 && Math.abs(original[cut - 1]) > 100) {
      cut++;
    }
    const truncated = parsed(original.slice(0, cut));
    expect(signal.analyzeAudioSignal(truncated).findings).not.toContainEqual(
      expect.objectContaining({ type: 'cutoff' }),
    );
    expect(signal.analyzeAudioSignal(truncated, parsed(original)).findings).toContainEqual(
      expect.objectContaining({ type: 'cutoff', evidence: 'reference_difference' }),
    );
  });
  it('keeps silence in one stereo channel separate from an entirely silent recording', () => {
    const original = voice();
    const stereo = new Int16Array(original.length * 2);
    for (let index = 0; index < original.length; index++) {
      stereo[index * 2] = original[index];
    }
    expect(
      signal.analyzeAudioSignal({ samples: stereo, channels: 2, sampleRate: rate }).state,
    ).toBe('no_issue_flagged');
    expect(signal.analyzeAudioSignal(parsed(new Int16Array(rate))).findings).toContainEqual(
      expect.objectContaining({ type: 'silence' }),
    );
  });
  it('rejects a substituted reference and never renders reference bytes or labels into the model prompt', () => {
    const bytes = utils.writePcm16Wav(parsed(voice()));
    const vars = {
      audio_id: 'opaque',
      audio_file: bytes.toString('base64'),
      audio_reference: bytes.toString('base64'),
      audio_reference_sha256: '0'.repeat(64),
    };
    expect(signal.default('', { vars })).toMatchObject({
      pass: false,
      reason: expect.stringContaining('SHA-256 mismatch'),
    });
    vars.audio_reference_sha256 = createHash('sha256').update(bytes).digest('hex');
    expect(signal.default('', { vars }).pass).toBe(true);
    const rendered = getNunjucksEngine().renderString(
      readFileSync(path.join(examplePath, 'audio-review-prompt.json'), 'utf8'),
      vars,
    );
    expect(rendered).not.toContain(vars.audio_reference_sha256);
    expect(
      JSON.parse(rendered)[1].content.filter(
        (item: { type: string }) => item.type === 'input_audio',
      ),
    ).toHaveLength(1);
  });
  it('binds historical underflow counters to the WAV and keeps them separate from audio-only detection', () => {
    const bytes = utils.writePcm16Wav(parsed(voice()));
    const recordingSha256 = createHash('sha256').update(bytes).digest('hex');
    const vars = {
      audio_file: bytes.toString('base64'),
      audio_view: 'isolated_caller',
      audio_transport: {
        version: 1,
        recordingSha256,
        participants: [{ role: 'caller', underflowAfterActiveAudioMs: 80, underflowEvents: 1 }],
      },
    };
    expect(signal.analyzeAudioSignal(parsed(voice())).state).toBe('no_issue_flagged');
    expect(signal.default('', { vars })).toMatchObject({
      pass: false,
      reason: expect.stringContaining('transport_counter'),
    });
    vars.audio_transport.participants[0].underflowAfterActiveAudioMs = 0;
    expect(signal.default('', { vars }).pass).toBe(true);
    vars.audio_transport.participants[0].role = 'target';
    expect(signal.default('', { vars })).toMatchObject({
      pass: false,
      reason: expect.stringContaining('roles'),
    });
    vars.audio_transport.participants[0].role = 'caller';
    vars.audio_transport.recordingSha256 = '0'.repeat(64);
    expect(signal.default('', { vars })).toMatchObject({
      pass: false,
      reason: expect.stringContaining('SHA-256 mismatch'),
    });
    vars.audio_transport.recordingSha256 = recordingSha256;
    vars.audio_transport.participants[0].underflowAfterActiveAudioMs = 4000;
    expect(signal.default('', { vars })).toMatchObject({
      pass: false,
      reason: expect.stringContaining('counters'),
    });
  });
  it('runs the standalone offline command on exported tests without API credentials', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'voice-signal-cli-'));
    temporaryDirectories.push(directory);
    const wav = path.join(directory, 'speech.wav');
    const tests = path.join(directory, 'tests.json');
    const out = path.join(directory, 'result.json');
    writeFileSync(wav, utils.writePcm16Wav(parsed(voice())));
    writeFileSync(
      tests,
      JSON.stringify([{ vars: { audio_id: 'opaque', audio_file: `file://${wav}` } }]),
    );
    const result = spawnSync(
      process.execPath,
      [path.join(examplePath, 'grade-audio-signal.js'), '--tests', tests, '--out', out],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(out, 'utf8'))).toMatchObject({
      dispositions: { no_issue_flagged: 1, error: 0 },
    });
    expect(
      spawnSync(
        process.execPath,
        [path.join(examplePath, 'grade-audio-signal.js'), '--tests', tests, '--out', out],
        { encoding: 'utf8' },
      ).status,
    ).toBe(1);
  });
});
