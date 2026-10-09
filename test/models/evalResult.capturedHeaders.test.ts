import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { writeOutput } from '../../src/util/output';
import { createEvaluateResult } from '../factories/eval';
import { createTempDir, mockProcessEnv, removeTempDir } from '../util/utils';

import type { EvaluateResult } from '../../src/types/index';

const targetMetadata = {
  headers: {
    'Set-Cookie': 'synthetic-captured-session',
    'api-key': 'synthetic-captured-api-key',
    'content-type': 'application/json',
  },
  http: {
    status: 200,
    headers: { 'x-request-id': 'synthetic-captured-request', 'x-safe-debug': 'keep' },
    requestHeaders: { authorization: 'synthetic-captured-auth', accept: 'application/json' },
  },
  details: {
    headers: { 'set-cookie': 'ordinary domain headers' },
    http: { headers: { authorization: 'ordinary domain HTTP data' } },
    redteamTargetMetadata: {
      http: { requestHeaders: { authorization: 'ordinary nested snapshot data' } },
    },
  },
};
const redactedTargetMetadata = {
  ...targetMetadata,
  headers: {
    'Set-Cookie': '[REDACTED]',
    'api-key': '[REDACTED]',
    'content-type': 'application/json',
  },
  http: {
    status: 200,
    headers: { 'x-request-id': '[REDACTED]', 'x-safe-debug': 'keep' },
    requestHeaders: { authorization: '[REDACTED]', accept: 'application/json' },
  },
};

function makeInput() {
  const metadata = { redteamTargetMetadata: structuredClone(targetMetadata) };
  return createEvaluateResult({
    response: { output: { amount: 100, ...targetMetadata.details }, metadata },
    metadata,
    gradingResult: {
      pass: true,
      score: 1,
      reason: 'Synthetic numeric grade',
      metadata,
      componentResults: [{ pass: true, score: 1, reason: 'Synthetic component', metadata }],
    },
  });
}

function expectRedactedCaptures(
  result: Pick<EvaluateResult, 'response' | 'metadata' | 'gradingResult'>,
) {
  for (const captured of [
    result.response?.metadata?.redteamTargetMetadata,
    result.metadata?.redteamTargetMetadata,
    result.gradingResult?.metadata?.redteamTargetMetadata,
    result.gradingResult?.componentResults?.[0].metadata?.redteamTargetMetadata,
  ]) {
    expect(captured).toEqual(redactedTargetMetadata);
  }
  expect(result.response?.output).toEqual({ amount: 100, ...targetMetadata.details });
}

function resultFields(result: Pick<EvaluateResult, 'response' | 'metadata' | 'gradingResult'>) {
  return {
    response: result.response,
    metadata: result.metadata,
    gradingResult: result.gradingResult,
  };
}

describe('captured target headers at result boundaries', () => {
  let outputDir: string;
  let restoreEnv: () => void;

  beforeAll(async () => {
    await runDbMigrations();
  });
  beforeEach(() => {
    outputDir = createTempDir('promptfoo-captured-headers-');
    restoreEnv = mockProcessEnv({ PROMPTFOO_INLINE_MEDIA: 'true' });
  });
  afterEach(() => {
    restoreEnv();
    removeTempDir(outputDir);
  });

  it.each(['json', 'jsonl'] as const)(
    'redacts captured headers in actual no-write %s exports while preserving live values',
    async (format) => {
      const input = makeInput();
      const original = structuredClone(input);
      const record = new Eval({}, { id: crypto.randomUUID(), author: null });
      await record.addResult(input);
      const model = record.results[0];
      const liveFields = resultFields(model);
      const liveSnapshot = structuredClone(liveFields);
      expect(model.persisted).toBe(false);
      expect(model.response?.metadata?.redteamTargetMetadata).toEqual(targetMetadata);

      const outputPath = path.join(outputDir, `results.${format}`);
      await writeOutput(outputPath, record, null);
      const text = await readFile(outputPath, 'utf8');
      const exported = JSON.parse(text);
      expectRedactedCaptures(format === 'json' ? exported.results.results[0] : exported);
      expect(text).not.toContain('synthetic-captured-');
      expect(await EvalResult.findById(model.id)).toBeNull();
      expect(resultFields(model)).toEqual(liveSnapshot);
      expect(model.response).toBe(liveFields.response);
      expect(model.metadata).toBe(liveFields.metadata);
      expect(model.gradingResult).toBe(liveFields.gradingResult);
      expect(input).toEqual(original);
    },
  );

  it.each(['single', 'batch', 'save insert', 'save update'] as const)(
    'redacts captured headers in the %s database path without changing the input',
    async (boundary) => {
      const input = makeInput();
      const original = structuredClone(input);
      const evalId = crypto.randomUUID();
      let model: EvalResult;
      if (boundary === 'batch') {
        [model] = await EvalResult.createManyFromEvaluateResult([input], evalId);
      } else {
        model = await EvalResult.createFromEvaluateResult(evalId, input, {
          persist: boundary !== 'save insert',
        });
      }
      if (boundary === 'save insert' || boundary === 'save update') {
        if (boundary === 'save update') {
          Object.assign(model, resultFields(input));
        }
        const liveFields = resultFields(model);
        const liveSnapshot = structuredClone(liveFields);
        expect(model.persisted).toBe(boundary === 'save update');
        await model.save();
        expect(resultFields(model)).toEqual(liveSnapshot);
        expect(model.response).toBe(liveFields.response);
        expect(model.metadata).toBe(liveFields.metadata);
        expect(model.gradingResult).toBe(liveFields.gradingResult);
      }

      const readback = await EvalResult.findById(model.id);
      expect(readback).not.toBeNull();
      expectRedactedCaptures(readback!);
      expect(JSON.stringify(resultFields(readback!))).not.toContain('synthetic-captured-');
      expect(input).toEqual(original);
    },
  );

  it('preserves existing direct-header behavior when the captured snapshot is absent', async () => {
    const input = createEvaluateResult({
      response: {
        output: 'Synthetic output',
        metadata: {
          http: {
            status: 200,
            statusText: 'OK',
            headers: { 'set-cookie': 'direct-response-session' },
          },
        },
      },
      metadata: { headers: { 'set-cookie': 'user-authored result headers' } },
    });
    const model = await EvalResult.createFromEvaluateResult(crypto.randomUUID(), input, {
      persist: false,
    });
    const projected = model.toEvaluateResult();
    expect(projected.response).toBe(model.response);
    expect(projected.metadata).toBe(model.metadata);
    expect(projected.gradingResult).toBe(model.gradingResult);
    expect(projected.response?.metadata?.http?.headers?.['set-cookie']).toBe(
      'direct-response-session',
    );
    await model.save();
    const readback = await EvalResult.findById(model.id);
    expect(readback?.response?.metadata).toEqual(input.response?.metadata);
    expect(readback?.metadata).toEqual(input.metadata);
  });
});
