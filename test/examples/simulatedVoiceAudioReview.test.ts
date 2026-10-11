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
  };
};
let calibration: {
  generateCalibration: (options: {
    source: string;
    pauseSource: string;
    out: string;
  }) => Promise<{ directory: string; cases: number; labelsSha256: string }>;
  createControls: (
    samples: Int16Array,
    rate: number,
  ) => Array<{ kind: string; samples: Int16Array; expected: string }>;
};
beforeAll(async () => {
  utils = await import(pathToFileURL(path.join(examplePath, 'audio-utils.js')).href);
  validate = (await import(pathToFileURL(path.join(examplePath, 'validate-audio-review.js')).href))
    .default;
  calibration = await import(pathToFileURL(path.join(examplePath, 'calibrate-audio.js')).href);
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
      expect(Object.keys(test.vars).sort()).toEqual(['audio_file', 'audio_id', 'audio_view']);
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
  function fixture() {
    const audio = utils.writePcm16Wav({
      sampleRate: 24000,
      channels: 1,
      samples: new Int16Array([1000, -1000]),
    });
    const labels = {
      version: 1,
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
      testCase: { vars: { audio_id: 'opaque' } },
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
