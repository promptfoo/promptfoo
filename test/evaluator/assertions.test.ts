import './setup';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import * as blobExtractor from '../../src/blobs/extractor';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import Eval from '../../src/models/eval';
import { redteamProviderManager } from '../../src/redteam/providers/shared';
import { type ApiProvider, ResultFailureReason, type TestSuite } from '../../src/types/index';
import {
  mockApiProvider,
  mockGradingApiProviderFails,
  mockGradingApiProviderPasses,
  toPrompt,
} from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator assertions', () => {
  it.each([
    {
      plugin: 'connector-parameter-exfil',
      pathKey: 'connectorSinkLedgerPath',
      leak: JSON.stringify({ canaryInParameters: true }) + '\n',
    },
    { plugin: 'network-egress-bypass', pathKey: 'trapLogPath', leak: 'POST /private HTTP/1.1\n' },
  ] as const)(
    'keeps $plugin evidence while a later setup hook resets its ledger',
    async ({ plugin, pathKey, leak }) => {
      const { sleep } =
        await vi.importActual<typeof import('../../src/util/time')>('../../src/util/time');
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'concurrent-ledger-hooks-'));
      const ledger = path.join(directory, 'ledger');
      fs.writeFileSync(ledger, '');
      let hookCalls = 0;
      const events: string[] = [];
      vi.mocked(runExtensionHook).mockImplementation(async (_extensions, phase, context) => {
        if (phase === 'beforeEach' && 'test' in context) {
          hookCalls++;
          if (context.test.vars?.index === 1) {
            await sleep(50);
          }
          fs.writeFileSync(ledger, '');
          events.push(`hook-${context.test.vars?.index}`);
        }
        return context;
      });
      vi.mocked(mockApiProvider.callApi).mockImplementation(async (_prompt, context) => {
        const index = Number(context?.vars.index);
        events.push(`target-${index}`);
        if (index === 0) {
          fs.appendFileSync(ledger, leak);
          await sleep(100);
        }
        return { output: 'Public report' };
      });
      const suite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [toPrompt('Inspect public report')],
        extensions: ['file://reset-ledger.js'],
        tests: [0, 1].map((index) => ({
          vars: { index },
          metadata: { purpose: 'Keep private data within its approved boundary' },
          assert: [
            { type: `promptfoo:redteam:coding-agent:${plugin}`, value: { [pathKey]: ledger } },
          ],
        })),
      };
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      await redteamProviderManager.setGradingProvider(mockGradingApiProviderPasses);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const pending = evaluate(suite, record, { maxConcurrency: 2, timeoutMs: 10000 });
        await vi.waitFor(() => expect(hookCalls).toBe(2));
        await vi.advanceTimersByTimeAsync(500);
        await pending;
        const { results } = await record.toEvaluateSummary();
        expect(results).toHaveLength(2);
        const first = results.find((row) => row.testCase.vars?.index === 0)!;
        const second = results.find((row) => row.testCase.vars?.index === 1)!;
        expect(first.success, JSON.stringify(events)).toBe(false);
        expect(first.failureReason).toBe(ResultFailureReason.ASSERT);
        expect(second.success).toBe(true);
        expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
        redteamProviderManager.clearProvider();
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it('rejects select-best when privacy checks omit candidate responses', async () => {
    const suite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('First'), toPrompt('Second')],
      tests: [
        {
          assert: [
            {
              type: 'promptfoo:redteam:coding-agent:trace-redaction',
              value: { rawReceipt: 'PRIVATE_COMPARISON_RECEIPT' },
            },
            { type: 'select-best', value: 'Most helpful' },
          ],
        },
      ],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await expect(evaluate(suite, record, {})).rejects.toThrow(/select-best.*redaction/);
    expect(mockApiProvider.callApi).not.toHaveBeenCalled();
  });

  it.each(['deadline', 'cancel'] as const)(
    'stops protected receipt preparation on %s without running later hooks or targets',
    async (mode) => {
      const controller = new AbortController();
      let hookCalls = 0;
      vi.mocked(runExtensionHook).mockImplementation(async (_extensions, phase, context) => {
        if (phase === 'beforeEach') {
          hookCalls++;
          await new Promise(() => {});
        }
        return context;
      });
      const suite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [toPrompt('Inspect receipts')],
        extensions: ['file://hook.js'],
        tests: [0, 1].map(() => ({
          assert: [
            {
              type: 'promptfoo:redteam:coding-agent:trace-redaction',
              value: { rawReceiptPath: 'missing-receipt' },
            },
          ],
        })),
      };
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        let completed = false;
        const pending = evaluate(suite, record, {
          timeoutMs: 10000,
          maxEvalTimeMs: mode === 'deadline' ? 25 : 0,
          abortSignal: controller.signal,
        }).finally(() => {
          completed = true;
        });
        await vi.waitFor(() => expect(hookCalls).toBe(1));
        if (mode === 'cancel') {
          controller.abort();
        }
        await vi.advanceTimersByTimeAsync(25);
        await vi.waitFor(() => expect(completed).toBe(true));
        await pending;
        expect(hookCalls).toBe(1);
        expect(mockApiProvider.callApi).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it.each(
    (['coding-agent:trace-redaction', 'harness:artifact-redaction'] as const).flatMap((plugin) =>
      (['llm-rubric', 'promptfoo:redteam:excessive-agency'] as const).map((companion) => ({
        plugin,
        companion,
      })),
    ),
  )(
    'gives $companion only the public $plugin prompt and response',
    async ({ plugin, companion }) => {
      const secret = 'PRIVATE_SIBLING_GRADER_RECEIPT';
      vi.mocked(mockApiProvider.callApi).mockResolvedValue({ output: secret });
      const suite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [toPrompt('Inspect {{rawReceipt}}')],
        tests: [
          {
            vars: { rawReceipt: secret },
            metadata: { purpose: 'Inspect public reports' },
            assert: [
              {
                type: 'assert-set',
                assert: [
                  { type: `promptfoo:redteam:${plugin}`, value: { rawReceipt: secret } },
                  {
                    type: companion,
                    ...(companion === 'llm-rubric' && {
                      transform: 'context.prompt.label + String(output)',
                    }),
                    value: 'The report is readable.',
                    provider: mockGradingApiProviderPasses,
                  },
                ],
              },
            ],
          },
        ],
      };
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      await redteamProviderManager.setGradingProvider(mockGradingApiProviderPasses);
      try {
        await evaluate(suite, record, { maxConcurrency: 1 });
      } finally {
        redteamProviderManager.clearProvider();
      }
      const calls = vi.mocked(mockGradingApiProviderPasses.callApi).mock.calls;
      expect(vi.mocked(mockApiProvider.callApi).mock.calls[0][0]).toBe(`Inspect ${secret}`);
      expect(calls).toHaveLength(1);
      expect(JSON.stringify(calls[0])).not.toContain(secret);
      expect(calls[0][0]).toContain('[Response omitted for trace/artifact redaction.]');
      const summary = await record.toEvaluateSummary();
      expect(summary.results[0].gradingResult?.reason).toContain('raw sensitive value');
      expect(JSON.stringify(summary)).not.toContain(secret);
    },
  );

  it.each(
    (
      [
        'coding-agent:trace-redaction',
        'harness:artifact-redaction',
        'coding-agent:trace-log-exfil',
      ] as const
    ).flatMap((plugin) => [1, 2].map((maxConcurrency) => ({ plugin, maxConcurrency }))),
  )(
    'snapshots all $plugin receipts before targets run at concurrency $maxConcurrency',
    async ({ plugin, maxConcurrency }) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'protected-receipts-'));
      try {
        const secrets = ['PRIVATE_FIRST_RECEIPT_VALUE', 'PRIVATE_SECOND_RECEIPT_VALUE'];
        const receipts = secrets.map((secret, index) => {
          const receipt = path.join(directory, `receipt-${index}`);
          fs.writeFileSync(receipt, secret);
          return receipt;
        });
        const artifacts = secrets.map((_, index) => path.join(directory, `report-${index}`));
        let targetCalls = 0;
        vi.mocked(mockApiProvider.callApi).mockImplementation(async () => {
          if (targetCalls++ === 0) {
            receipts.forEach((receipt, index) => {
              fs.copyFileSync(receipt, artifacts[index]);
              fs.writeFileSync(receipt, 'DECOY_RECEIPT_FROM_TARGET');
            });
          }
          return { output: 'Clean public report' };
        });
        const testSuite: TestSuite = {
          providers: [mockApiProvider],
          prompts: [toPrompt('Inspect the public report')],
          tests: receipts.map((receipt, index) => ({
            vars: { receipt },
            assert: [
              {
                type: 'assert-set',
                assert: [
                  {
                    type: `promptfoo:redteam:${plugin}`,
                    value:
                      plugin === 'coding-agent:trace-log-exfil'
                        ? { traceLogReceiptPath: receipt, traceLogArtifactPath: artifacts[index] }
                        : index === 0
                          ? { rawReceiptPaths: [receipt], redactedArtifactPath: artifacts[index] }
                          : { redactedArtifact: { receiptPath: receipt, path: artifacts[index] } },
                  },
                ],
              },
            ],
          })),
        };
        const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
        await evaluate(testSuite, evalRecord, { maxConcurrency });
        const summary = await evalRecord.toEvaluateSummary();
        expect(targetCalls).toBe(2);
        expect(summary.results).toHaveLength(2);
        for (const result of summary.results) {
          expect(result).toMatchObject({
            success: false,
            failureReason: ResultFailureReason.ASSERT,
          });
          expect(result.gradingResult?.reason).toContain('raw sensitive value');
        }
        for (const secret of secrets) {
          expect(JSON.stringify(summary)).not.toContain(secret);
        }
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it.each(
    (['coding-agent:trace-redaction', 'harness:artifact-redaction'] as const).flatMap((plugin) =>
      [1, 2].flatMap((maxConcurrency) =>
        ['missing', 'existing', 'unconfigured', 'declared-shared'].map((initial) => ({
          plugin,
          maxConcurrency,
          initial,
        })),
      ),
    ),
  )(
    'captures $initial receipts initialized by beforeEach for $plugin at concurrency $maxConcurrency',
    async ({ plugin, maxConcurrency, initial }) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-receipts-'));
      try {
        const secrets = ['PRIVATE_HOOK_FIRST_RECEIPT', 'PRIVATE_HOOK_SECOND_RECEIPT'];
        const receipts = secrets.map((_, index) =>
          path.join(directory, `receipt-${initial === 'declared-shared' ? 'shared' : index}`),
        );
        if (initial === 'existing') {
          receipts.forEach((file) => fs.writeFileSync(file, 'PRIVATE_INITIAL_RECEIPT'));
        }
        const events: string[] = [];
        vi.mocked(runExtensionHook).mockImplementation(async (_extensions, phase, context) => {
          if (phase === 'beforeEach' && 'test' in context) {
            const index = Number(context.test.vars?.index);
            fs.writeFileSync(receipts[index], secrets[index]);
            if (initial.startsWith('unconfigured')) {
              context.test.assert = [
                {
                  type: `promptfoo:redteam:${plugin}`,
                  value: { rawReceiptPath: receipts[index] },
                },
              ];
            }
            events.push(`hook-${index}`);
          }
          return context;
        });
        vi.mocked(mockApiProvider.callApi).mockImplementation(async (_prompt, context) => {
          const index = Number(context?.vars.index);
          events.push(`target-${index}`);
          receipts.forEach((file) => fs.writeFileSync(file, 'DECOY_FROM_TARGET'));
          return { output: secrets[index] };
        });
        const suite: TestSuite = {
          providers: [mockApiProvider],
          prompts: [toPrompt('Inspect protected receipts')],
          extensions: ['file://initialize-receipts.js'],
          tests: receipts.map((receipt, index) => ({
            vars: { index },
            assert: initial.startsWith('unconfigured')
              ? undefined
              : [{ type: `promptfoo:redteam:${plugin}`, value: { rawReceiptPath: receipt } }],
          })),
        };
        const evalRecord = await Eval.create({}, suite.prompts, { id: randomUUID() });
        await evaluate(suite, evalRecord, { maxConcurrency, timeoutMs: 10000 });
        const summary = await evalRecord.toEvaluateSummary();
        expect(summary.results).toHaveLength(2);
        expect(
          summary.results.every(
            (row) => !row.success && row.failureReason === ResultFailureReason.ASSERT,
          ),
        ).toBe(true);
        expect(
          summary.results.every((row) => row.gradingResult?.reason.includes('raw sensitive value')),
        ).toBe(true);
        if (!initial.startsWith('unconfigured')) {
          expect(events.slice(0, 2)).toEqual(['hook-0', 'hook-1']);
        }
        expect(events.filter((event) => event.startsWith('hook-'))).toEqual(['hook-0', 'hook-1']);
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it.each(
    ['receipt', 'static plan', 'vars', 'assertion value'].flatMap((source) =>
      ['repeat', 'prompts', 'providers'].map((expansion) => ({ source, expansion })),
    ),
  )(
    'captures each $source across $expansion with beforeAll extensions',
    async ({ source, expansion }) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-receipt-'));
      try {
        const receipt = path.join(directory, source === 'static plan' ? 'receipt.json' : 'receipt');
        let hookCalls = 0;
        let targetCalls = 0;
        const secrets = ['PRIVATE_FIRST_REPEAT_RECEIPT', 'PRIVATE_SECOND_REPEAT_RECEIPT'];
        vi.mocked(runExtensionHook).mockImplementation(async (extensions, phase, context) => {
          if (phase === 'beforeAll' && 'suite' in context) {
            return { suite: { ...context.suite, extensions: ['file://prepared-hook.js'] } };
          }
          if (phase === 'beforeEach' && 'test' in context) {
            expect(extensions).toEqual(['file://prepared-hook.js']);
            const id = hookCalls++;
            const secret = secrets[id];
            if (source === 'vars') {
              context.test.vars!.id = id;
            }
            if (source === 'assertion value') {
              const assertion = context.test.assert![0];
              if (assertion.type === 'assert-set') {
                throw new Error('Expected a single privacy assertion');
              }
              (assertion.value as { rawReceiptPath: string }).rawReceiptPath = path.join(
                directory,
                `receipt-${id}`,
              );
            }
            fs.writeFileSync(
              source === 'vars' || source === 'assertion value'
                ? path.join(directory, `receipt-${id}`)
                : receipt,
              source === 'static plan' ? JSON.stringify({ rawReceipt: secret }) : secret,
            );
          }
          return context;
        });
        vi.mocked(mockApiProvider.callApi).mockImplementation(async () => {
          expect(hookCalls).toBe(2);
          fs.writeFileSync(receipt, 'PRIVATE_TARGET_DECOY_RECEIPT');
          return { output: secrets[targetCalls++] };
        });
        const suite: TestSuite = {
          providers:
            expansion === 'providers'
              ? [mockApiProvider, { ...mockApiProvider, id: () => 'second-target' }]
              : [mockApiProvider],
          prompts:
            expansion === 'prompts'
              ? [toPrompt('Inspect receipts'), toPrompt('Inspect receipts again')]
              : [toPrompt('Inspect receipts')],
          extensions: ['file://original-hook.js'],
          tests: [
            {
              vars: { id: 'initial' },
              assert: [
                {
                  type: 'promptfoo:redteam:coding-agent:trace-redaction',
                  value:
                    source === 'static plan'
                      ? `file://${receipt}`
                      : {
                          rawReceiptPath:
                            source === 'vars' ? path.join(directory, 'receipt-{{id}}') : receipt,
                        },
                },
              ],
            },
          ],
        };
        const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
        await evaluate(suite, record, {
          repeat: expansion === 'repeat' ? 2 : 1,
          maxConcurrency: 2,
          timeoutMs: 10000,
        });
        const summary = await record.toEvaluateSummary();
        expect(hookCalls).toBe(2);
        expect(targetCalls).toBe(2);
        expect(
          summary.results.every(
            (result) =>
              !result.success && result.gradingResult?.reason.includes('raw sensitive value'),
          ),
        ).toBe(true);
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it.each([false, true])(
    'preserves hook errors for file receipt tests: %s',
    async (protectedReceipt) => {
      const error = new Error('Fixture setup failed');
      let hookCalls = 0;
      vi.mocked(runExtensionHook).mockImplementation(async (_extensions, phase, context) => {
        if (phase === 'beforeEach') {
          hookCalls++;
          throw error;
        }
        return context;
      });
      const suite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [toPrompt('Inspect receipts')],
        extensions: ['file://hook.js'],
        tests: [
          {
            assert: protectedReceipt
              ? [
                  {
                    type: 'promptfoo:redteam:coding-agent:trace-redaction',
                    value: { rawReceiptPath: 'missing-receipt' },
                  },
                ]
              : [{ type: 'equals', value: 'Clean' }],
          },
        ],
      };
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      await expect(
        evaluate(suite, record, { maxConcurrency: 1, timeoutMs: 10000 }),
      ).rejects.toThrow(error);
      expect(hookCalls).toBe(1);
      expect(mockApiProvider.callApi).not.toHaveBeenCalled();
    },
  );

  it('stops all targets when a receipt hook times out and later rewrites the shared file', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'late-receipt-hook-'));
    const receipt = path.join(directory, 'receipt');
    let hookCalls = 0;
    let finishHook!: () => void;
    const lateHook = new Promise<void>((resolve) => {
      finishHook = resolve;
    });
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, phase, context) => {
      if (phase === 'beforeEach') {
        const call = ++hookCalls;
        if (call === 1) {
          await lateHook;
        }
        fs.writeFileSync(receipt, call === 1 ? 'LATE_UNCAPTURED_RECEIPT' : 'CAPTURED_RECEIPT');
      }
      return context;
    });
    vi.mocked(mockApiProvider.callApi).mockImplementation(async () => {
      return { output: fs.readFileSync(receipt, 'utf8') };
    });
    const suite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Inspect')],
      extensions: ['file://hook.js'],
      tests: [0, 1].map(() => ({
        assert: [
          {
            type: 'promptfoo:redteam:coding-agent:trace-redaction',
            value: { rawReceiptPath: receipt },
          },
        ],
      })),
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pending = evaluate(suite, record, { maxConcurrency: 1, timeoutMs: 25 });
      await vi.waitFor(() => expect(hookCalls).toBe(1));
      await vi.advanceTimersByTimeAsync(25);
      finishHook();
      await pending;
      expect(mockApiProvider.callApi).not.toHaveBeenCalled();
      expect(fs.readFileSync(receipt, 'utf8')).toBe('LATE_UNCAPTURED_RECEIPT');
      const summary = await record.toEvaluateSummary();
      expect(summary.results).toHaveLength(2);
      expect(summary.results.every((row) => row.failureReason === ResultFailureReason.ERROR)).toBe(
        true,
      );
    } finally {
      vi.useRealTimers();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([false, true])(
    'preserves hook timeouts for file receipt tests: %s',
    async (protectedReceipt) => {
      let hookCalls = 0;
      vi.mocked(runExtensionHook).mockImplementation(async (_extensions, phase, context) => {
        if (phase === 'beforeEach') {
          hookCalls++;
          await new Promise(() => {});
        }
        return context;
      });
      const suite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [toPrompt('Inspect receipts')],
        extensions: ['file://hook.js'],
        tests: [
          {
            assert: protectedReceipt
              ? [
                  {
                    type: 'promptfoo:redteam:coding-agent:trace-redaction',
                    value: { rawReceiptPath: 'missing-receipt' },
                  },
                ]
              : [{ type: 'equals', value: 'Clean' }],
          },
        ],
      };
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const pending = evaluate(suite, record, { maxConcurrency: 1, timeoutMs: 25 });
        await vi.waitFor(() => expect(hookCalls).toBe(1));
        await vi.advanceTimersByTimeAsync(25);
        await pending;
      } finally {
        vi.useRealTimers();
      }
      const summary = await record.toEvaluateSummary();
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]).toMatchObject({
        success: false,
        failureReason: ResultFailureReason.ERROR,
      });
      expect(summary.results[0].error).toContain(
        protectedReceipt
          ? 'Error details omitted for trace/artifact redaction.'
          : 'Evaluation timed out after 25ms',
      );
      expect(hookCalls).toBe(1);
      expect(mockApiProvider.callApi).not.toHaveBeenCalled();
    },
  );

  it.each(['missing', 'invalid'])(
    'rejects a receipt that was %s before the target supplied a decoy',
    async (initial) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'missing-receipt-'));
      try {
        const receipt = path.join(directory, 'receipt');
        if (initial === 'invalid') {
          fs.writeFileSync(receipt, '');
        }
        vi.mocked(mockApiProvider.callApi).mockImplementation(async () => {
          fs.writeFileSync(receipt, 'DECOY_RECEIPT_FROM_TARGET');
          return { output: 'Clean public report' };
        });
        const testSuite: TestSuite = {
          providers: [mockApiProvider],
          prompts: [toPrompt('Inspect the public report')],
          tests: [
            {
              assert: [
                {
                  type: 'promptfoo:redteam:coding-agent:trace-redaction',
                  value: { rawReceiptPath: receipt },
                },
              ],
            },
          ],
        };
        const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
        await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
        const summary = await evalRecord.toEvaluateSummary();
        expect(summary.results[0]).toMatchObject({
          success: false,
          failureReason: ResultFailureReason.ASSERT,
        });
        expect(JSON.stringify(summary)).toContain('verifier-sidecar-failed');
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it.each(['coding-agent:trace-redaction', 'harness:artifact-redaction'] as const)(
    'keeps %s output out of later conversation and register state',
    async (plugin) => {
      const secret = 'PRIVATE_STATE_RECEIPT';
      vi.mocked(mockApiProvider.callApi)
        .mockResolvedValueOnce({ output: secret })
        .mockResolvedValueOnce({ output: 'Clean' });
      const testSuite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [toPrompt('Inspect report. {{ saved }} {{ _conversation[0].response.output }}')],
        tests: [
          {
            options: { storeOutputAs: 'saved' },
            assert: [{ type: `promptfoo:redteam:${plugin}`, value: { rawReceipt: secret } }],
          },
          { assert: [{ type: 'equals', value: 'Clean' }] },
        ],
      };
      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
      await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
      const summary = await evalRecord.toEvaluateSummary();
      expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
      expect(vi.mocked(mockApiProvider.callApi).mock.calls[1][0]).not.toContain(secret);
      expect(summary.results[0].failureReason).toBe(ResultFailureReason.ASSERT);
      expect(summary.results[1].success).toBe(true);
      expect(JSON.stringify(summary)).not.toContain(secret);
    },
  );

  it.each(['coding-agent:trace-redaction', 'harness:artifact-redaction'] as const)(
    'does not write private output media to blobs for %s',
    async (plugin) => {
      const extract = vi.spyOn(blobExtractor, 'extractAndStoreBinaryData');
      try {
        const output = `data:image/png;base64,${Buffer.alloc(2048, 1).toString('base64')}`;
        vi.mocked(mockApiProvider.callApi).mockResolvedValue({ output });
        const testSuite: TestSuite = {
          providers: [mockApiProvider],
          prompts: [toPrompt('Inspect the public report')],
          tests: [{ assert: [{ type: `promptfoo:redteam:${plugin}` }] }],
        };
        const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
        await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
        const summary = await evalRecord.toEvaluateSummary();
        expect(
          extract.mock.calls.some(([response]) => JSON.stringify(response)?.includes(output)),
        ).toBe(false);
        expect(summary.results[0]).toMatchObject({
          success: false,
          failureReason: ResultFailureReason.ERROR,
        });
        expect(JSON.stringify(summary)).not.toContain(output);
        expect(JSON.stringify(summary)).not.toContain('promptfoo://blob/');
      } finally {
        extract.mockRestore();
      }
    },
  );

  it.each(['failed', 'aborted'])(
    'preserves completed audio output when grading is %s',
    async (outcome) => {
      const abortController = new AbortController();
      vi.mocked(mockApiProvider.callApi).mockResolvedValue({
        output: 'Hello.',
        audio: { data: Buffer.alloc(2048, 1).toString('base64'), format: 'wav' },
        cost: 0.25,
        tokenUsage: { prompt: 5, completion: 10, total: 15, numRequests: 1 },
      });
      const grader: ApiProvider = {
        id: () => 'audio-grader',
        getAudioInputFormat: () => 'openai',
        callApi: vi.fn(async () => {
          const error = new Error('Grading interrupted');
          if (outcome === 'aborted') {
            error.name = 'AbortError';
            abortController.abort(error);
          }
          throw error;
        }),
      };
      const testSuite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [toPrompt('Say hello')],
        tests: [
          { assert: [{ type: 'llm-rubric', value: 'The speaker sounds calm.', provider: grader }] },
        ],
      };
      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
      await evaluate(testSuite, evalRecord, {
        maxConcurrency: 1,
        abortSignal: abortController.signal,
      });
      const summary = await evalRecord.toEvaluateSummary();
      expect(summary.results).toHaveLength(1);
      const row = summary.results[0];
      expect(row.success).toBe(false);
      expect(row.failureReason).toBe(ResultFailureReason.ERROR);
      expect(row.error).toContain('Grading interrupted');
      expect(row.response?.output).toBe('Hello.');
      expect(row.response?.audio?.blobRef).toBeDefined();
      expect(row.response?.audio?.data).toBeUndefined();
      expect(row.cost).toBe(0.25);
      expect(row.tokenUsage?.total).toBe(15);
    },
  );

  it('runs different audio graders serially at maxConcurrency 1', async () => {
    vi.mocked(mockApiProvider.callApi).mockResolvedValue({
      output: 'Hello.',
      audio: { data: Buffer.alloc(2048, 1).toString('base64'), format: 'wav' },
    });
    let activeCalls = 0;
    let maximumActiveCalls = 0;
    const graders: ApiProvider[] = ['first-grader', 'second-grader'].map((id) => ({
      id: () => id,
      getAudioInputFormat: () => 'openai',
      callApi: vi.fn(async () => {
        maximumActiveCalls = Math.max(maximumActiveCalls, ++activeCalls);
        await new Promise<void>((resolve) => setImmediate(resolve));
        activeCalls--;
        return { output: '{"pass":true,"score":1}' };
      }),
    }));
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Say hello')],
      tests: [
        {
          assert: graders.map((provider) => ({
            type: 'llm-rubric',
            value: 'The speaker sounds calm.',
            provider,
          })),
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary.stats.successes).toBe(1);
    for (const grader of graders) {
      expect(grader.callApi).toHaveBeenCalledTimes(1);
    }
    expect(maximumActiveCalls).toBe(1);
  });

  it('finishes audio grading before collecting the next serial target response', async () => {
    const callOrder: string[] = [];
    vi.mocked(mockApiProvider.callApi).mockImplementation(async () => {
      callOrder.push('target');
      return {
        output: 'Hello.',
        audio: { data: Buffer.alloc(2048, 1).toString('base64'), format: 'wav' },
      };
    });
    const grader: ApiProvider = {
      id: () => 'audio-grader',
      getAudioInputFormat: () => 'openai',
      callApi: vi.fn(async () => {
        callOrder.push('grader');
        return { output: '{"pass":true,"score":1}' };
      }),
    };
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Say hello')],
      tests: Array.from({ length: 3 }, () => ({
        assert: [{ type: 'llm-rubric', value: 'The speaker sounds calm.', provider: grader }],
      })),
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary.stats.successes).toBe(3);
    expect(callOrder).toEqual(['target', 'grader', 'target', 'grader', 'target', 'grader']);
    for (const row of summary.results) {
      expect(row.response?.audio?.blobRef).toBeDefined();
      expect(row.response?.audio?.data).toBeUndefined();
    }
  });

  it('processes mixed audio and text rows once across grading flushes', async () => {
    const kinds = ['text', 'audio', 'text', 'audio', 'text'];
    const callOrder: string[] = [];
    vi.mocked(mockApiProvider.callApi).mockImplementation(async (prompt) => {
      callOrder.push(`target:${prompt}`);
      return {
        output: prompt,
        ...(prompt.includes('audio') && {
          audio: { data: Buffer.alloc(2048, 1).toString('base64'), format: 'wav' },
        }),
      };
    });
    const grader: ApiProvider = {
      id: () => 'mixed-grader',
      getAudioInputFormat: () => 'openai',
      callApi: vi.fn(async (_prompt, context) => {
        callOrder.push(`grader:${context?.vars.output}`);
        return { output: '{"pass":true,"score":1}' };
      }),
    };
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('{{index}} {{kind}}')],
      tests: kinds.map((kind, index) => ({
        vars: { kind, index },
        assert: [{ type: 'llm-rubric', value: 'The response is clear.', provider: grader }],
      })),
    };
    const progress = vi.fn();
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1, progressCallback: progress });
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary.stats.successes).toBe(kinds.length);
    expect(summary.results).toHaveLength(kinds.length);
    expect(grader.callApi).toHaveBeenCalledTimes(kinds.length);
    expect(progress).toHaveBeenCalledTimes(kinds.length);
    expect(callOrder).toEqual([
      'target:0 text',
      'target:1 audio',
      'grader:0 text',
      'grader:1 audio',
      'target:2 text',
      'target:3 audio',
      'grader:2 text',
      'grader:3 audio',
      'target:4 text',
      'grader:4 text',
    ]);
  });

  it.each([1, 2])(
    'grades native audio after blob extraction with concurrency %s',
    async (maxConcurrency) => {
      const audioData = Buffer.alloc(2048, 1).toString('base64');
      vi.mocked(mockApiProvider.callApi).mockResolvedValue({
        output: 'Hello.',
        audio: { data: audioData, format: 'wav', transcript: 'Hello.' },
      });
      const grader: ApiProvider = {
        ...mockGradingApiProviderPasses,
        getAudioInputFormat: () => 'openai',
      };
      const testSuite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [toPrompt('Say hello')],
        tests: [
          { assert: [{ type: 'llm-rubric', value: 'The speaker sounds calm.', provider: grader }] },
        ],
      };
      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
      await evaluate(testSuite, evalRecord, { maxConcurrency });
      const summary = await evalRecord.toEvaluateSummary();
      expect(summary.results[0].success).toBe(true);
      expect(summary.results[0].response?.audio?.blobRef).toBeDefined();
      expect(summary.results[0].response?.audio?.data).toBeUndefined();
      const messages = JSON.parse(vi.mocked(grader.callApi).mock.calls[0][0]);
      expect(messages.flatMap((message: { content: unknown }) => message.content)).toContainEqual({
        type: 'input_audio',
        input_audio: { data: audioData, format: 'wav' },
      });
    },
  );

  it('evaluate with expected value matching output', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Test output',
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].success).toBe(true);
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with expected value not matching output', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Different output',
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(0);
    expect(summary.stats.failures).toBe(1);
    expect(summary.results[0].success).toBe(false);
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with fn: expected value', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'javascript',
              value: 'output === "Test output";',
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].success).toBe(true);
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with fn: expected value not matching output', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'javascript',
              value: 'output === "Different output";',
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(0);
    expect(summary.stats.failures).toBe(1);
    expect(summary.results[0].success).toBe(false);
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with grading expected value', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'llm-rubric',
              value: 'output is a test output',
            },
          ],
        },
      ],
      defaultTest: {
        options: {
          provider: mockGradingApiProviderPasses,
        },
      },
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].success).toBe(true);
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('reuses a configured LiteLLM provider ID for both G-Eval calls', async () => {
    const configuredLiteLLM: ApiProvider = {
      id: vi.fn().mockReturnValue('litellm:gemini-pro'),
      config: { apiBaseUrl: 'http://localhost:4000', temperature: 0 },
      callApi: vi.fn().mockImplementation(async (_prompt, context) => ({
        output:
          context?.prompt?.label === 'g-eval-steps'
            ? JSON.stringify({ steps: ['Check factual accuracy'] })
            : JSON.stringify({ score: 10, reason: 'The answer is accurate' }),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      })),
    };
    const testSuite: TestSuite = {
      providers: [mockApiProvider, configuredLiteLLM],
      prompts: [toPrompt('What is the capital of France?')],
      tests: [
        {
          providers: ['test-provider'],
          assert: [
            {
              type: 'g-eval',
              value: 'The answer identifies the capital correctly',
              provider: 'litellm:gemini-pro',
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(configuredLiteLLM.callApi).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(configuredLiteLLM.callApi).mock.calls.map(([, context]) => context?.prompt?.label),
    ).toEqual(['g-eval-steps', 'g-eval']);
    expect(summary.stats.successes).toBe(1);
  });

  it('reuses configured graders in typed defaults and scenario assertion sets', async () => {
    const configuredGrader: ApiProvider = {
      id: vi.fn().mockReturnValue('litellm:judge'),
      label: 'Configured grader',
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({ pass: true, score: 1, reason: 'The output passes' }),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };
    const testSuite: TestSuite = {
      providers: [mockApiProvider, configuredGrader],
      prompts: [toPrompt('Test prompt')],
      defaultTest: {
        options: { provider: { text: 'Configured grader' } },
      },
      scenarios: [
        {
          config: [{}],
          tests: [
            {
              providers: ['test-provider'],
              assert: [
                {
                  type: 'assert-set',
                  assert: [
                    { type: 'llm-rubric', value: 'Use the default grader option' },
                    {
                      type: 'llm-rubric',
                      value: 'Use the explicit configured grader ID option',
                      provider: { text: { id: 'litellm:judge' } },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(configuredGrader.callApi).toHaveBeenCalledTimes(2);
    expect(summary.stats.successes).toBe(1);
  });

  it('routes an assertion provider id to the id-matching provider when a sibling label collides', async () => {
    const judgeById: ApiProvider = {
      id: vi.fn().mockReturnValue('judge'),
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({ pass: true, score: 1, reason: 'Passes via id-matched judge.' }),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };
    const judgeByLabel: ApiProvider = {
      id: vi.fn().mockReturnValue('litellm:judge'),
      label: 'judge',
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({ pass: false, score: 0, reason: 'Should never be called.' }),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };
    const testSuite: TestSuite = {
      providers: [mockApiProvider, judgeById, judgeByLabel],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          providers: ['test-provider'],
          assert: [{ type: 'llm-rubric', value: 'Use the id-matched judge', provider: 'judge' }],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(judgeById.callApi).toHaveBeenCalledTimes(1);
    expect(judgeByLabel.callApi).not.toHaveBeenCalled();
    expect(summary.stats.successes).toBe(1);
  });

  it('preserves suite env for typed graders inherited from defaultTest assertions', async () => {
    const testSuite: TestSuite = {
      env: { LITELLM_API_BASE: 'echo' },
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{ providers: ['test-provider'] }],
      defaultTest: {
        assert: [
          {
            type: 'llm-rubric',
            value: 'Grade the test output',
            rubricPrompt: '{"pass":true,"score":1,"reason":"Resolved suite env"}',
            provider: {
              text: {
                id: '{{ env.LITELLM_API_BASE }}',
              },
            },
          },
        ],
      },
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(1);
    expect(summary.results[0].success).toBe(true);
  });

  it('reuses configured text and embedding graders for answer relevance', async () => {
    const textJudge: ApiProvider = {
      id: vi.fn().mockReturnValue('litellm:text-judge'),
      callApi: vi.fn().mockResolvedValue({ output: 'Test prompt' }),
    };
    const embeddingJudge: ApiProvider = {
      id: vi.fn().mockReturnValue('litellm:embedding:judge'),
      callApi: vi.fn().mockResolvedValue({ output: '' }),
      callEmbeddingApi: vi.fn().mockResolvedValue({ embedding: [1, 0] }),
    };
    const testSuite: TestSuite = {
      providers: [mockApiProvider, textJudge, embeddingJudge],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          providers: ['test-provider'],
          assert: [
            {
              type: 'answer-relevance',
              threshold: 0.8,
              provider: {
                text: 'litellm:text-judge',
                embedding: 'litellm:embedding:judge',
              },
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(textJudge.callApi).toHaveBeenCalledTimes(3);
    expect(embeddingJudge.callEmbeddingApi).toHaveBeenCalledTimes(4);
    expect(summary.stats.successes).toBe(1);
  });

  it('evaluate with grading expected value does not pass', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'llm-rubric',
              value: 'output is a test output',
            },
          ],
        },
      ],
      defaultTest: {
        options: {
          provider: mockGradingApiProviderFails,
        },
      },
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(0);
    expect(summary.stats.failures).toBe(1);
    expect(summary.results[0].success).toBe(false);
    expect(summary.results[0].response?.output).toBe('Test output');
  });
});
