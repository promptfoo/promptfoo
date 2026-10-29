import fs from 'node:fs';
import path from 'node:path';

import { Command } from 'commander';
import { afterAll, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions';
import { exportCommand } from '../../src/commands/export';
import { importCommand } from '../../src/commands/import';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { getTraceStore } from '../../src/tracing/store';
import { createEvaluateResult } from '../factories/eval';
import { createTempDir, removeTempDir } from '../util/utils';

import type { Assertion, TraceSpan } from '../../src/types';

const tempDir = createTempDir();
afterAll(() => removeTempDir(tempDir));

it('fails closed when a portable eval loses hosted argument or coverage evidence', async () => {
  await runDbMigrations();
  const traceId = 'abcdef0123456789abcdef0123456789';
  const parentSpanId = '0123456789abcdef';
  const args = { query: 'x'.repeat(480) };
  const raw = JSON.stringify(args);
  const row = createEvaluateResult({
    traceId,
    provider: { id: 'openai:agents-api' },
    response: {
      output: 'done',
      metadata: {
        hostedTrace: {
          source: 'openai:agents-api',
          status: 'imported',
          spanCount: 1,
          parentSpanId,
          includeToolArguments: true,
          toolArgumentsComplete: true,
        },
      },
    },
  });
  const evaluation = await Eval.create({}, [row.prompt]);
  await evaluation.addResult({ ...row, evaluationId: evaluation.id });
  const store = getTraceStore();
  await store.createTrace({ traceId, evaluationId: evaluation.id, testCaseId: 'case' });
  await store.addSpans(traceId, [
    {
      spanId: parentSpanId,
      name: 'provider openai:agents-api',
      startTime: 0,
      endTime: 2,
      attributes: {
        'promptfoo.openai.hosted_trace_requested': true,
        'promptfoo.span.role': 'target',
      },
    },
    {
      spanId: 'fedcba9876543210',
      parentSpanId,
      name: 'execute_tool lookup',
      startTime: 1,
      endTime: 2,
      attributes: {
        'promptfoo.openai.hosted_trace': parentSpanId,
        'gen_ai.operation.name': 'execute_tool',
        'gen_ai.tool.name': 'lookup',
        'tool.name': 'lookup',
        'gen_ai.tool.call.arguments': raw,
        'tool.arguments': raw,
      },
    },
  ]);

  const value = { name: 'lookup', args };
  const grade = async (assertion: Assertion) => {
    const [stored] = await EvalResult.findManyByEvalId(evaluation.id);
    const result = stored.toEvaluateResult();
    expect(result.traceId).toBeDefined();
    return runAssertion({
      traceId: result.traceId,
      test: result.testCase,
      providerResponse: result.response!,
      assertion,
    });
  };
  expect(await grade({ type: 'trajectory:tool-args-match', value })).toMatchObject({ pass: true });

  const file = path.join(tempDir, 'trace.json');
  const program = new Command();
  exportCommand(program);
  importCommand(program);
  await program.parseAsync(['export', 'eval', evaluation.id, '-o', file], { from: 'user' });
  const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
  const attrs = exported.traces[0].spans.find(
    (span: TraceSpan) => span.parentSpanId === parentSpanId,
  ).attributes;
  expect(attrs['tool.arguments']).toEqual(attrs['gen_ai.tool.call.arguments']);
  expect(() => JSON.parse(attrs['tool.arguments'])).toThrow(SyntaxError);
  await program.parseAsync(['import', file, '--force'], { from: 'user' });
  const reimported = await store.getTrace(traceId, { sanitizeAttributes: false });
  expect(
    reimported?.spans.find((span) => span.parentSpanId === parentSpanId)?.attributes?.[
      'tool.arguments'
    ],
  ).toBe(attrs['tool.arguments']);
  expect(await grade({ type: 'not-trajectory:tool-args-match', value })).toMatchObject({
    pass: false,
  });

  const noDelete: Assertion = { type: 'not-trajectory:tool-used', value: 'delete' };
  expect(await grade(noDelete)).toMatchObject({ pass: true });
  const stripped = path.join(tempDir, 'stripped.json');
  vi.stubEnv('PROMPTFOO_STRIP_METADATA', 'true');
  try {
    await program.parseAsync(['export', 'eval', evaluation.id, '-o', stripped], { from: 'user' });
  } finally {
    vi.unstubAllEnvs();
  }
  await program.parseAsync(['import', stripped, '--force'], { from: 'user' });
  const [restored] = await EvalResult.findManyByEvalId(evaluation.id);
  expect(restored.response?.metadata).toBeUndefined();
  expect(await grade(noDelete)).toMatchObject({ pass: false });
});
