import { afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { runDbMigrations } from '../../src/migrate';
import EvalResult, { sanitizeResultForJsonlArtifact } from '../../src/models/evalResult';
import { createEvaluateResult } from '../factories/eval';
import { createAtomicTestCase, createPrompt } from '../factories/testSuite';
import { mockProcessEnv } from '../util/utils';

const audio = {
  data: Buffer.from('synthetic target speech').toString('base64'),
  format: 'pcm16',
  transcript: 'synthetic private spoken output',
};
const targetMetadata = {
  audio,
  blobUris: [`promptfoo://blob/${'a'.repeat(64)}`],
  extraMedia: 'data:image/png;base64,c3ludGhldGlj',
  foo: 'preserved target metadata',
  details: { audio: { data: 'ordinary domain data', transcript: 'ordinary domain transcript' } },
  http: { status: 200, statusText: 'OK', headers: { 'set-cookie': 'synthetic-session' } },
};
let restoreEnv: () => void;
beforeAll(async () => {
  await runDbMigrations();
});
beforeEach(() => {
  restoreEnv = mockProcessEnv({ PROMPTFOO_INLINE_MEDIA: 'true' });
});
afterEach(() => {
  restoreEnv();
});

function makeInput(captured: boolean) {
  const metadata = captured
    ? { redteamTargetMetadata: structuredClone(targetMetadata) }
    : structuredClone(targetMetadata);
  return createEvaluateResult({
    prompt: createPrompt('Synthetic private prompt'),
    provider: { id: 'synthetic-target' },
    testCase: createAtomicTestCase({
      vars: { input: 'Synthetic private input' },
      providerOutput: '{"amount":100}',
    }),
    vars: { input: 'Synthetic private input' },
    response: { output: '{"amount":100}', audio: { ...audio }, metadata },
    metadata: { ...metadata, userOwned: 'user metadata remains separate' },
    gradingResult: { pass: true, score: 1, reason: 'Synthetic grade' },
  });
}

const cases = Array.from({ length: 32 }, (_, mask) => ({
  mask,
  flags: {
    shouldStripPromptText: Boolean(mask & 1),
    shouldStripResponseOutput: Boolean(mask & 2),
    shouldStripTestVars: Boolean(mask & 4),
    shouldStripGradingResult: Boolean(mask & 8),
    shouldStripMetadata: Boolean(mask & 16),
  },
}));

it.each(cases)(
  'projects captured target metadata like provider metadata for flag mask $mask',
  async ({ flags }) => {
    const direct = makeInput(false);
    const captured = makeInput(true);
    const directModel = await EvalResult.createFromEvaluateResult(
      'numeric-projection-direct',
      direct,
      { persist: false },
    );
    const capturedModel = await EvalResult.createFromEvaluateResult(
      'numeric-projection-captured',
      captured,
      { persist: false },
    );
    const pairs = [
      {
        direct: sanitizeResultForJsonlArtifact(direct, flags),
        captured: sanitizeResultForJsonlArtifact(captured, flags),
      },
      {
        direct: directModel.toEvaluateResult(flags),
        captured: capturedModel.toEvaluateResult(flags),
      },
    ];
    for (const pair of pairs) {
      const expectedMetadata = pair.direct.response?.metadata;
      expect(pair.captured.response?.metadata?.redteamTargetMetadata).toEqual(expectedMetadata);
      expect(pair.captured.metadata?.redteamTargetMetadata).toEqual(expectedMetadata);
      expect(pair.captured.response?.output).toBe(
        flags.shouldStripResponseOutput ? '[output stripped]' : '{"amount":100}',
      );
      expect(pair.captured.response?.audio).toEqual(
        flags.shouldStripResponseOutput ? undefined : audio,
      );
      expect(pair.captured.prompt.raw).toBe(
        flags.shouldStripPromptText ? '[prompt stripped]' : 'Synthetic private prompt',
      );
      expect(pair.captured.vars).toEqual(
        flags.shouldStripTestVars ? {} : { input: 'Synthetic private input' },
      );
      expect(pair.captured.gradingResult).toEqual(
        flags.shouldStripGradingResult ? null : captured.gradingResult,
      );
      if (!flags.shouldStripMetadata) {
        const snapshot = pair.captured.response?.metadata?.redteamTargetMetadata;
        expect(snapshot.details).toEqual(targetMetadata.details);
        expect(snapshot.foo).toBe(targetMetadata.foo);
        expect(pair.captured.metadata?.userOwned).toBe('user metadata remains separate');
        if (flags.shouldStripResponseOutput) {
          expect(snapshot).not.toHaveProperty('audio');
          expect(snapshot).not.toHaveProperty('blobUris');
          expect(snapshot.extraMedia).toBe('[output stripped]');
          expect(JSON.stringify(pair.captured)).not.toContain(audio.data);
          expect(JSON.stringify(pair.captured)).not.toContain(audio.transcript);
        } else {
          expect(snapshot.audio).toEqual(audio);
        }
      }
    }
    expect(captured.response?.audio).toEqual(audio);
    expect(captured.response?.metadata?.redteamTargetMetadata.audio).toEqual(audio);
    expect(capturedModel.response?.metadata?.redteamTargetMetadata.audio).toEqual(audio);
  },
);

it.each(['single', 'batch'])(
  'keeps stored/live data intact while projecting %s DB readback for export',
  async (mode) => {
    const input = makeInput(true);
    const evalId = `numeric-audio-${crypto.randomUUID()}`;
    const saved =
      mode === 'single'
        ? await EvalResult.createFromEvaluateResult(evalId, input, { persist: true })
        : (await EvalResult.createManyFromEvaluateResult([input], evalId))[0];
    const readback = (await EvalResult.findById(saved.id))!;
    expect(readback.response?.audio).toEqual(audio);
    expect(readback.response?.metadata?.redteamTargetMetadata.audio).toEqual(audio);
    const flags = {
      shouldStripPromptText: false,
      shouldStripResponseOutput: true,
      shouldStripTestVars: false,
      shouldStripGradingResult: false,
      shouldStripMetadata: false,
    };
    const json = JSON.stringify(readback.toEvaluateResult(flags));
    const jsonl = JSON.stringify(sanitizeResultForJsonlArtifact(input, flags));
    for (const exported of [json, jsonl]) {
      expect(exported).not.toContain(audio.data);
      expect(exported).not.toContain(audio.transcript);
      expect(exported).toContain('ordinary domain transcript');
    }
    expect(readback.response?.metadata?.redteamTargetMetadata.audio).toEqual(audio);
    expect(input.response?.metadata?.redteamTargetMetadata.audio).toEqual(audio);
  },
);
