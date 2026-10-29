import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, it } from 'vitest';

import type { Assertion, GradingResult, TraceSpan } from '../../src/types';

const repoRoot = path.resolve(__dirname, '../..');
const cli = path.join(repoRoot, 'dist/src/main.js');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-hosted-export-'));
const evalId = 'eval-hosted-trace-export';
const traceId = 'abcdef0123456789abcdef0123456789';
const parentSpanId = '0123456789abcdef';
const args = { query: 'x'.repeat(480) };
const noDelete: Assertion = { type: 'not-trajectory:tool-used', value: 'delete' };

function runNode(state: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return execFileSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      IS_TESTING: 'false',
      PROMPTFOO_CONFIG_DIR: path.join(tempDir, state),
      PROMPTFOO_DISABLE_TELEMETRY: 'true',
      PROMPTFOO_DISABLE_UPDATE: 'true',
      ...env,
    },
  });
}

function exportEval(state: string, env?: NodeJS.ProcessEnv) {
  const file = path.join(tempDir, state + '-export.json');
  runNode(state, [cli, 'export', 'eval', evalId, '-o', file], env);
  return file;
}

// Read the restored result row through the CLI. The public JS assertion runner resolves
// its traceId against that same database, including spans whose exported values were shortened.
function regrade(state: string, file: string, assertions: Assertion[]): GradingResult[] {
  const result = runNode(state, [
    '--input-type=module',
    '-e',
    `
      import { readFileSync } from 'node:fs';
      import { assertions } from 'promptfoo';
      const [file, checks] = process.argv.slice(1);
      const [row] = JSON.parse(readFileSync(file, 'utf8')).results.results;
      const grades = await Promise.all(JSON.parse(checks).map(assertion => assertions.runAssertion({
        test: row.testCase, providerResponse: row.response, traceId: row.traceId, assertion,
      })));
      console.log(JSON.stringify(grades));
    `,
    file,
    JSON.stringify(assertions),
  ]);
  return JSON.parse(result.trim());
}

beforeAll(() => {
  if (!fs.existsSync(cli)) {
    throw new Error("Built CLI not found. Run 'npm run build' first.");
  }
  const seed = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../__fixtures__/sample-export.json'), 'utf8'),
  );
  seed.evalId = evalId;
  seed.results.results = [
    {
      ...seed.results.results[0],
      evaluationId: evalId,
      traceId,
      provider: { id: 'custom-hosted-target' },
      response: {
        output: 'done',
        metadata: {
          privateField: 'remove me',
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
    },
  ];
  seed.traces = [
    {
      traceId,
      evaluationId: evalId,
      testCaseId: 'case',
      spans: [
        {
          spanId: parentSpanId,
          name: 'provider',
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
            'gen_ai.tool.call.arguments': JSON.stringify(args),
            'tool.arguments': JSON.stringify(args),
          },
        },
      ],
    },
  ];
  const file = path.join(tempDir, 'seed.json');
  fs.writeFileSync(file, JSON.stringify(seed));
  runNode('source', [cli, 'import', file]);
});

afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

it('regrades hosted arguments against the bytes that survived export and import', () => {
  const file = exportEval('source');
  const attrs = JSON.parse(fs.readFileSync(file, 'utf8')).traces[0].spans.find(
    (span: TraceSpan) => span.parentSpanId === parentSpanId,
  ).attributes;
  expect(attrs['tool.arguments']).toBe(attrs['gen_ai.tool.call.arguments']);
  expect(() => JSON.parse(attrs['tool.arguments'])).toThrow(SyntaxError);

  const value = { name: 'lookup', args };
  const checks: Assertion[] = [
    { type: 'trajectory:tool-args-match', value },
    { type: 'not-trajectory:tool-args-match', value },
    noDelete,
  ];
  expect(regrade('source', file, checks).map((grade) => grade.pass)).toEqual([true, false, true]);
  runNode('restored', [cli, 'import', file]);
  expect(regrade('restored', exportEval('restored'), checks).map((grade) => grade.pass)).toEqual([
    false,
    false,
    true,
  ]);
});

it('preserves the unavailable verdict when metadata is stripped and the trace is detached', () => {
  const stripped = exportEval('source', { PROMPTFOO_STRIP_METADATA: 'true' });
  const data = JSON.parse(fs.readFileSync(stripped, 'utf8'));
  const unavailable = { hostedTrace: { source: 'openai:agents-api', status: 'unavailable' } };
  expect(data.results.results[0].response.metadata).toEqual(unavailable);
  delete data.traces;
  fs.writeFileSync(stripped, JSON.stringify(data));
  runNode('detached', [cli, 'import', stripped]);
  const file = exportEval('detached');
  const [row] = JSON.parse(fs.readFileSync(file, 'utf8')).results.results;
  expect(row.traceId).toBeUndefined();
  expect(row.response.metadata).toEqual(unavailable);
  expect(regrade('detached', file, [noDelete])).toMatchObject([
    { pass: false, reason: expect.stringContaining('OpenAI Agents API trace was unavailable') },
  ]);
});
