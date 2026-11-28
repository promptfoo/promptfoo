import './setup';

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { OpenAICodexSecurityProvider } from '../../src/providers/openai/codex-security';
import { sleep } from '../../src/util/time';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, TestSuite } from '../../src/types/index';

describeEvaluator('Codex Security import accounting', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-import-usage-'));
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  async function savedProvider(status: 'completed' | 'failed' = 'completed') {
    const report = {
      manifest: {
        documentType: 'codex-security.scan-manifest',
        schemaVersion: '1.0',
        scan: { id: 'recorded-scan', status },
      },
      findings: {
        documentType: 'codex-security.findings',
        schemaVersion: '1.0',
        scanId: 'recorded-scan',
        findings: [],
      },
      coverage: {
        documentType: 'codex-security.coverage',
        schemaVersion: '1.0',
        scanId: 'recorded-scan',
        mode: 'repository',
        completeness: 'complete',
      },
      cost: { estimatedUsd: 0.5, inputTokens: 100, outputTokens: 50 },
    };
    const reportFile = path.join(directory, 'report.json');
    await fs.writeFile(reportFile, JSON.stringify(report));
    return new OpenAICodexSecurityProvider({ config: { report_file: reportFile } });
  }

  it('does not apply fixed API delays to offline imports', async () => {
    const provider = await savedProvider();
    (provider as ApiProvider).delay = 1000;
    try {
      const suite: TestSuite = {
        providers: [provider],
        prompts: [toPrompt('Import')],
        tests: [{}],
      };
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      await evaluate(suite, record, { delay: 1000, timeoutMs: 200 });
      const summary = await record.toEvaluateSummary();
      expect(sleep).not.toHaveBeenCalled();
      expect(summary.results[0].success).toBe(true);
      expect(summary.results[0].response?.metadata?.codexSecurity?.source.kind).toBe(
        'saved-report',
      );
    } finally {
      await provider.shutdown();
    }
  });

  it.each(['completed', 'failed'] as const)(
    'exports one logical invocation and zero incurred requests for a %s report',
    async (status) => {
      const provider = await savedProvider(status);
      try {
        const suite: TestSuite = {
          providers: [provider],
          prompts: [toPrompt('Import recorded evidence')],
          tests: [{}],
        };
        const record = await Eval.create({}, suite.prompts, { id: randomUUID() });

        await evaluate(suite, record, {});
        const summary = await record.toEvaluateSummary();
        const row = summary.results[0];

        for (const usage of [
          summary.stats.tokenUsage,
          row.tokenUsage,
          row.response?.tokenUsage,
          record.prompts[0].metrics?.tokenUsage,
        ]) {
          expect(usage).toMatchObject({
            total: 0,
            numRequests: 1,
            incurredTokenUsage: { total: 0, numRequests: 0 },
          });
        }
        expect(row.response?.metadata?.codexSecurity).toMatchObject({
          status,
          cost: { baselineUsd: 0.5 },
          usage: { total: 150 },
        });
        expect(row.incurredCost).toBe(0);
        expect(row.cost).toBe(0);
        expect(row.response?.cost).toBeUndefined();
        expect(row.success).toBe(status === 'completed');
      } finally {
        await provider.shutdown();
      }
    },
  );

  it('keeps fresh grader requests and tokens in the incurred assertion breakdown', async () => {
    const provider = await savedProvider();
    const grader: ApiProvider = {
      id: () => 'fresh-grader',
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({ pass: true, score: 1, reason: 'Grading result' }),
        tokenUsage: { total: 7, prompt: 5, completion: 2, numRequests: 1 },
      }),
    };
    try {
      const suite: TestSuite = {
        providers: [provider],
        prompts: [toPrompt('Import recorded evidence')],
        tests: [{ assert: [{ type: 'llm-rubric', value: 'Review the report', provider: grader }] }],
      };
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });

      await evaluate(suite, record, {});
      const summary = await record.toEvaluateSummary();

      expect(grader.callApi).toHaveBeenCalledOnce();
      for (const usage of [
        summary.stats.tokenUsage,
        summary.results[0].tokenUsage,
        record.prompts[0].metrics?.tokenUsage,
      ]) {
        expect(usage).toMatchObject({
          total: 0,
          numRequests: 1,
          assertions: { total: 7, numRequests: 1 },
          incurredTokenUsage: {
            total: 0,
            numRequests: 0,
            assertions: { total: 7, numRequests: 1 },
          },
        });
      }
    } finally {
      await provider.shutdown();
    }
  });
});
