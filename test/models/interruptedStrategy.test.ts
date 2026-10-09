import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult, {
  getStripFlags,
  sanitizeResultForJsonlArtifact,
} from '../../src/models/evalResult';
import { type EvaluateResult, type ProviderResponse, ResultFailureReason } from '../../src/types';
import { writeOutput } from '../../src/util/output';
import { createEvaluateResult } from '../factories/eval';

const audio = Buffer.alloc(2048, 81).toString('base64');
const credential = 'synthetic-checkpoint-credential';
const userMetadata = { nested: { http: { headers: { authorization: 'ordinary user value' } } } };

function checkpointFixture(): EvaluateResult {
  const completedTargetResponses = ['first', 'second'].map((name, index) => ({
    prompt: `private ${name} target prompt`,
    response: {
      output: `private ${name} target output`,
      raw: { text: `private ${name} raw output` },
      providerTransformedOutput: `private ${name} transformed output`,
      prompt:
        index === 0
          ? `private ${name} response prompt`
          : [{ role: 'user', content: 'private chat prompt' }],
      audio: { data: audio, format: 'wav' },
      turns: [
        {
          prompt: 'private turn prompt',
          output: 'private turn output',
          audio: { data: audio, format: 'wav' },
          input: 'preserved turn input',
          metadata: {
            http: {
              status: 200,
              statusText: 'OK',
              requestHeaders: { Authorization: credential },
              headers: { 'Set-Cookie': credential, 'Content-Type': 'application/json' },
            },
            userMetadata,
          },
        },
      ],
      cost: 0.25,
      tokenUsage: { total: 5, numRequests: 1 },
      metadata: {
        headers: { 'X-Api-Key': credential },
        http: {
          status: 200,
          statusText: 'OK',
          requestHeaders: { Authorization: credential, 'Content-Type': 'application/json' },
          headers: {
            'Set-Cookie': credential,
            'OpenAI-Organization': credential,
            'Content-Type': 'application/json',
          },
        },
        userMetadata,
      },
    } satisfies ProviderResponse & { turns: Array<ProviderResponse & { input: string }> },
  }));
  const metadata = { interruptedStrategy: true, completedTargetResponses, userMetadata };
  return createEvaluateResult({
    response: {
      ...completedTargetResponses[1].response,
      error: 'Evaluation paused before the strategy completed',
      metadata,
      cost: 0.5,
      tokenUsage: { total: 10, numRequests: 2 },
    },
    metadata,
    error: 'Evaluation paused before the strategy completed',
    failureReason: ResultFailureReason.ERROR,
    success: false,
    cost: 0.5,
  });
}

function expectSafeCheckpoint(metadata: NonNullable<ProviderResponse['metadata']>) {
  expect(metadata.interruptedStrategy).toBe(true);
  expect(metadata.completedTargetResponses).toHaveLength(2);
  expect(metadata.userMetadata).toEqual(userMetadata);
  for (const entry of metadata.completedTargetResponses) {
    expect(entry.prompt).toContain('target prompt');
    expect(entry.response.output).toContain('target output');
    expect(entry.response.audio.data).toBeUndefined();
    expect(entry.response.audio.blobRef.uri).toMatch(/^promptfoo:\/\/blob\//);
    expect(entry.response.turns[0].audio.data).toBeUndefined();
    expect(entry.response.turns[0].audio.blobRef).toEqual(entry.response.audio.blobRef);
    expect(entry.response.turns[0].metadata.http.requestHeaders.Authorization).toBe('[REDACTED]');
    expect(entry.response.turns[0].metadata.http.headers['Set-Cookie']).toBe('[REDACTED]');
    expect(entry.response.turns[0].metadata.userMetadata).toEqual(userMetadata);
    expect(entry.response.metadata.headers['X-Api-Key']).toBe('[REDACTED]');
    expect(entry.response.metadata.http.requestHeaders.Authorization).toBe('[REDACTED]');
    expect(entry.response.metadata.http.headers['Set-Cookie']).toBe('[REDACTED]');
    expect(entry.response.metadata.http.headers['OpenAI-Organization']).toBe('[REDACTED]');
    expect(entry.response.metadata.http.headers['Content-Type']).toBe('application/json');
    expect(entry.response.metadata.userMetadata).toEqual(userMetadata);
    expect(entry.response.cost).toBe(0.25);
    expect(entry.response.tokenUsage).toEqual({ total: 5, numRequests: 1 });
  }
}

function expectProjectedCheckpoint(
  metadata: NonNullable<ProviderResponse['metadata']>,
  stripPrompt: boolean,
  stripOutput: boolean,
) {
  for (const entry of metadata.completedTargetResponses) {
    expect(entry.prompt).toEqual(
      stripPrompt ? '[prompt stripped]' : expect.stringContaining('target prompt'),
    );
    expect(entry.response.prompt).toEqual(stripPrompt ? '[prompt stripped]' : expect.anything());
    expect(entry.response.output).toEqual(
      stripOutput ? '[output stripped]' : expect.stringContaining('target output'),
    );
    for (const field of ['raw', 'providerTransformedOutput', 'audio']) {
      expect(field in entry.response).toBe(!stripOutput);
    }
    expect(entry.response.turns[0]).toMatchObject({
      prompt: stripPrompt ? '[prompt stripped]' : 'private turn prompt',
      output: stripOutput ? '[output stripped]' : 'private turn output',
      input: 'preserved turn input',
    });
    expect('audio' in entry.response.turns[0]).toBe(!stripOutput);
    expect(entry.response.turns[0].metadata.http.requestHeaders.Authorization).toBe('[REDACTED]');
    expect(entry.response.turns[0].metadata.http.headers['Set-Cookie']).toBe('[REDACTED]');
    expect(entry.response.turns[0].metadata.userMetadata).toEqual(userMetadata);
    expect(entry.response.metadata.http.requestHeaders.Authorization).toBe('[REDACTED]');
    expect(entry.response.metadata.userMetadata).toEqual(userMetadata);
  }
}

describe('interrupted strategy checkpoints', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(['single', 'batch', 'save new', 'save existing'] as const)(
    'protects both checkpoint copies through %s SQLite persistence',
    async (mode) => {
      const input = checkpointFixture();
      const original = structuredClone(input);
      const evalId = (await Eval.create({}, [input.prompt], { id: randomUUID() })).id;
      let row: EvalResult;
      if (mode === 'batch') {
        [row] = await EvalResult.createManyFromEvaluateResult([input], evalId);
      } else {
        row = await EvalResult.createFromEvaluateResult(evalId, input, {
          persist: mode !== 'save new',
        });
        if (mode === 'save existing') {
          row.response = input.response;
          row.metadata = input.metadata!;
        }
        if (mode.startsWith('save')) {
          await row.save();
        }
      }
      const saved = await EvalResult.findById(row.id);
      expect(saved).not.toBeNull();
      expectSafeCheckpoint(saved!.response!.metadata!);
      expectSafeCheckpoint(saved!.metadata);
      expect(saved!.cost).toBe(0.5);
      expect(saved!.response!.tokenUsage).toEqual({ total: 10, numRequests: 2 });
      expect(await EvalResult.getCompletedIndexPairs(evalId)).toEqual(new Set(['0:0']));
      expect(input).toEqual(original);
    },
  );

  describe.each(['model', 'jsonl'] as const)('%s checkpoint projections', (boundary) => {
    it.each([
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ])(
      'applies stripPrompt=%s and stripOutput=%s independently to both copies',
      async (stripPrompt, stripOutput) => {
        const input = checkpointFixture();
        const evalId = (await Eval.create({}, [input.prompt], { id: randomUUID() })).id;
        const row = await EvalResult.createFromEvaluateResult(evalId, input, { persist: false });
        const original = structuredClone({ response: row.response, metadata: row.metadata });
        const flags = {
          shouldStripPromptText: stripPrompt,
          shouldStripResponseOutput: stripOutput,
          shouldStripMetadata: false,
          shouldStripTestVars: false,
          shouldStripGradingResult: false,
        };
        const projected =
          boundary === 'model'
            ? row.toEvaluateResult(flags)
            : sanitizeResultForJsonlArtifact(input, flags);
        for (const metadata of [projected.response!.metadata!, projected.metadata!]) {
          expectProjectedCheckpoint(metadata, stripPrompt, stripOutput);
        }
        expect({ response: row.response, metadata: row.metadata }).toEqual(original);
        expect(
          row.response!.metadata!.completedTargetResponses[0].response.metadata.http.requestHeaders
            .Authorization,
        ).toBe(credential);
      },
    );
  });

  it('protects an independent result checkpoint when hooks replace response metadata', async () => {
    const input = checkpointFixture();
    input.response!.metadata = { hookMetadata: 'replacement' };
    const record = await Eval.create({}, [input.prompt], { id: randomUUID() });
    const row = await EvalResult.createFromEvaluateResult(record.id, input);
    const saved = await EvalResult.findById(row.id);
    expect(saved!.response!.metadata).toEqual({ hookMetadata: 'replacement' });
    expectSafeCheckpoint(saved!.metadata);
    const projected = saved!.toEvaluateResult({
      ...getStripFlags(),
      shouldStripResponseOutput: true,
    });
    expect(projected.metadata!.completedTargetResponses[0].response.output).toBe(
      '[output stripped]',
    );
  });

  it('redacts credential-shaped checkpoint prompts in non-persisted model exports', async () => {
    const input = checkpointFixture();
    const prompt = JSON.stringify({ apiKey: credential, content: 'ordinary prompt' });
    for (const entry of input.metadata!.completedTargetResponses) {
      entry.prompt = prompt;
      entry.response.prompt = [{ role: 'user', content: prompt }];
      entry.response.turns[0].prompt = prompt;
    }
    const original = structuredClone(input);
    const record = await Eval.create({}, [input.prompt], { id: randomUUID() });
    const row = await EvalResult.createFromEvaluateResult(record.id, input, { persist: false });
    const exported = row.toEvaluateResult();
    for (const metadata of [exported.response!.metadata!, exported.metadata!]) {
      const entry = metadata.completedTargetResponses[0];
      expect(JSON.parse(entry.prompt)).toEqual({
        apiKey: '[REDACTED]',
        content: 'ordinary prompt',
      });
      expect(JSON.parse(entry.response.prompt[0].content)).toEqual({
        apiKey: '[REDACTED]',
        content: 'ordinary prompt',
      });
      expect(JSON.parse(entry.response.turns[0].prompt)).toEqual({
        apiKey: '[REDACTED]',
        content: 'ordinary prompt',
      });
      expect(entry.response.output).toContain('target output');
    }
    expect(input).toEqual(original);
    expect(row.metadata.completedTargetResponses[0].prompt).toBe(prompt);
  });

  it.each([
    ['batch', true],
    ['save', true],
    ['save', false],
  ] as const)(
    'normalizes circular raw SDK payloads before %s persistence with inlineMedia=%s',
    async (mode, inlineMedia) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inlineMedia));
      const input = checkpointFixture();
      const raw: { status: number; request?: unknown } = { status: 200 };
      raw.request = raw;
      const record = await Eval.create({}, [input.prompt], { id: randomUUID() });
      let row: EvalResult;
      if (mode === 'batch') {
        input.response!.raw = raw;
        [row] = await EvalResult.createManyFromEvaluateResult([input], record.id);
      } else {
        row = await EvalResult.createFromEvaluateResult(record.id, input, { persist: false });
        row.response!.raw = raw;
        await row.save();
      }
      const saved = await EvalResult.findById(row.id);
      expect(saved!.response!.raw.status).toBe(200);
      expect(saved!.response!.raw.request).not.toBe(saved!.response!.raw);
      expect(raw.request).toBe(raw);
      for (const metadata of [saved!.response!.metadata!, saved!.metadata]) {
        const response = metadata.completedTargetResponses[0].response;
        if (inlineMedia) {
          expect(response.audio.data).toBe(audio);
          expect(response.audio.blobRef).toBeUndefined();
        } else {
          expect(response.audio.data).toBeUndefined();
          expect(response.audio.blobRef.uri).toMatch(/^promptfoo:\/\/blob\//);
        }
        expect(response.metadata.http.requestHeaders.Authorization).toBe('[REDACTED]');
      }
    },
  );

  describe.each(['insert', 'update'] as const)('saved media policy on save %s', (mode) => {
    it.each([
      ['true', false, true],
      ['false', true, false],
      [undefined, true, true],
      [undefined, false, false],
    ] as const)(
      'honors saved inline=%s over ambient inline=%s',
      async (savedInline, ambientInline, expectedInline) => {
        const input = checkpointFixture();
        const record = await Eval.create(
          { env: savedInline === undefined ? {} : { PROMPTFOO_INLINE_MEDIA: savedInline } },
          [input.prompt],
          { id: randomUUID() },
        );
        const row = await cliState.withEnv({ PROMPTFOO_INLINE_MEDIA: 'true' }, () =>
          EvalResult.createFromEvaluateResult(record.id, input, { persist: mode === 'update' }),
        );
        const originalResponse = structuredClone(row.response);
        vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(ambientInline));
        row.gradingResult = { pass: false, score: 0.5, reason: 'Synthetic manual rating' };
        row.score = 0.5;
        await row.save();
        const saved = await EvalResult.findById(row.id);
        const exported = saved!.toEvaluateResult();
        const responses = [
          exported.response!,
          exported.response!.metadata!.completedTargetResponses[0].response,
          exported.metadata!.completedTargetResponses[0].response,
        ];
        for (const response of responses) {
          expect(response.audio?.data).toBe(expectedInline ? audio : undefined);
          expect(Boolean(response.audio?.blobRef)).toBe(!expectedInline);
        }
        expect(saved!.gradingResult?.reason).toBe('Synthetic manual rating');
        expect(saved!.cost).toBe(0.5);
        expect(
          saved!.metadata.completedTargetResponses[0].response.metadata.http.headers['Set-Cookie'],
        ).toBe('[REDACTED]');
        expect(row.response).toEqual(originalResponse);
      },
    );
  });

  it('keeps opposite ordinary-audio save policies isolated during concurrent rating updates', async () => {
    vi.stubEnv('PROMPTFOO_INLINE_MEDIA', 'true');
    const rows = await Promise.all(
      ['true', 'false'].map(async (inline) => {
        const input = createEvaluateResult({
          response: { output: 'ordinary audio', audio: { data: audio, format: 'wav' } },
          metadata: {},
        });
        const record = await Eval.create(
          { env: { PROMPTFOO_INLINE_MEDIA: inline } },
          [input.prompt],
          { id: randomUUID() },
        );
        return EvalResult.createFromEvaluateResult(record.id, input);
      }),
    );
    for (const row of rows) {
      row.gradingResult = { pass: false, score: 0, reason: 'Concurrent manual rating' };
    }
    await Promise.all(rows.map((row) => row.save()));
    const [inline, external] = await Promise.all(rows.map((row) => EvalResult.findById(row.id)));
    expect(inline!.response!.audio!.data).toBe(audio);
    expect(inline!.response!.audio!.blobRef).toBeUndefined();
    expect(external!.response!.audio!.data).toBeUndefined();
    expect(external!.response!.audio!.blobRef?.uri).toMatch(/^promptfoo:\/\/blob\//);
    expect(process.env.PROMPTFOO_INLINE_MEDIA).toBe('true');
    for (const row of rows) {
      expect(row.response!.audio!.data).toBe(audio);
    }
  });

  it.each(['json', 'jsonl'])(
    'strips persisted checkpoint payloads in real %s exports',
    async (extension) => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'pf-checkpoint-'));
      try {
        const input = checkpointFixture();
        const record = await Eval.create(
          {
            env: {
              PROMPTFOO_STRIP_PROMPT_TEXT: 'true',
              PROMPTFOO_STRIP_RESPONSE_OUTPUT: 'true',
            },
          },
          [input.prompt],
          { id: randomUUID() },
        );
        await EvalResult.createFromEvaluateResult(record.id, input);
        const filePath = path.join(directory, `result.${extension}`);
        await writeOutput(filePath, record, null);
        const text = await readFile(filePath, 'utf8');
        const parsed = JSON.parse(text);
        const result = extension === 'json' ? parsed.results.results[0] : parsed;
        for (const metadata of [result.response.metadata, result.metadata]) {
          expect(metadata.interruptedStrategy).toBe(true);
          expect(metadata.completedTargetResponses).toHaveLength(2);
          expect(metadata.completedTargetResponses[0].prompt).toBe('[prompt stripped]');
          expect(metadata.completedTargetResponses[0].response.output).toBe('[output stripped]');
        }
        expect(text).not.toContain('private');
        expect(text).not.toContain(credential);
        expect(text).not.toContain('promptfoo://blob/');
        expect(text).not.toContain(audio);
        expect(result.cost).toBe(0.5);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it('does not interpret an arbitrary similarly named user metadata array as a checkpoint', () => {
    const input = checkpointFixture();
    delete input.response!.metadata!.interruptedStrategy;
    delete input.metadata!.interruptedStrategy;
    const projected = sanitizeResultForJsonlArtifact(input);
    expect(
      projected.response!.metadata!.completedTargetResponses[0].response.metadata.http
        .requestHeaders.Authorization,
    ).toBe(credential);
    expect(projected.metadata!.completedTargetResponses).toEqual(
      input.metadata!.completedTargetResponses,
    );
  });
});
