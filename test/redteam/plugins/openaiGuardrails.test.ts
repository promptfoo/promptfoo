import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import logger from '../../../src/logger';
import { matchesLlmRubric } from '../../../src/matchers/llmGrading';
import { Plugins } from '../../../src/redteam/plugins/index';
import {
  fetchDataset,
  OpenAIGuardrailsGrader,
  OpenAIGuardrailsPlugin,
} from '../../../src/redteam/plugins/openaiGuardrails';

import type { ApiProvider, PluginConfig } from '../../../src/types/index';

vi.mock('../../../src/cache');
vi.mock('../../../src/logger');
vi.mock('../../../src/matchers/llmGrading', () => ({ matchesLlmRubric: vi.fn() }));

const rows = [
  { id: 'unsafe-1', data: 'Unsafe-labeled fixture one', expected_triggers: { Jailbreak: true } },
  { id: 'unsafe-2', data: 'Unsafe-labeled fixture two', expected_triggers: { Jailbreak: true } },
  { id: 'safe-1', data: 'Explain photosynthesis.', expected_triggers: { Jailbreak: false } },
  { id: 'safe-2', data: 'What is two plus two?', expected_triggers: { Jailbreak: false } },
];
const provider: ApiProvider = { id: () => 'fixture', callApi: async () => ({ output: '' }) };
function mockDataset(data: string, status = 200) {
  vi.mocked(fetchWithCache).mockResolvedValue({
    data,
    status,
    statusText: 'fixture',
    cached: false,
    deleteFromCache: async () => {},
  });
}
beforeEach(() => {
  mockDataset(rows.map((row) => JSON.stringify(row)).join('\n'));
});
afterEach(() => {
  vi.resetAllMocks();
});

describe('OpenAI Guardrails dataset', () => {
  it('filters unsafe rows and caps requests at available samples', async () => {
    const result = await fetchDataset(100);
    expect(result.map((test) => test.vars.id).sort()).toEqual(['unsafe-1', 'unsafe-2']);
    expect(fetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining('/293b1ae7dbfb278afc36e04fe6a4aba44f5c6582/'),
      {},
      expect.any(Number),
      'text',
    );
  });

  it('balances labels without duplicates and backfills an uneven dataset', async () => {
    mockDataset(
      rows
        .filter((row) => row.id !== 'safe-2')
        .map((row) => JSON.stringify(row))
        .join('\n'),
    );
    const balanced = await fetchDataset(2, true);
    expect(balanced.filter((test) => test.vars.isSafe)).toHaveLength(1);
    const all = await fetchDataset(4, true);
    expect(all).toHaveLength(3);
    expect(new Set(all.map((test) => test.vars.id)).size).toBe(3);
  });

  it('reads JSONL with blank lines and escaped newlines, reporting malformed rows', async () => {
    const row = { ...rows[0], data: 'Line one\nLine two' };
    mockDataset(
      `\n${JSON.stringify(row)}\r\ninvalid\n${JSON.stringify({ data: 'missing fields' })}\n`,
    );
    const result = await fetchDataset(3);
    expect(result).toHaveLength(1);
    expect(result[0].vars.prompt).toBe('Line one\nLine two');
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it.each([
    '',
    'invalid',
    JSON.stringify({ id: 'x', data: 'x', expected_triggers: { Jailbreak: 'false' } }),
  ])('returns no cases without valid rows', async (data) => {
    mockDataset(data);
    expect(await fetchDataset(2)).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });

  it('reports HTTP and transport failures without generating cases', async () => {
    mockDataset('unavailable', 503);
    expect(await fetchDataset(2)).toEqual([]);
    vi.mocked(fetchWithCache).mockRejectedValue(new Error('network unavailable'));
    expect(await fetchDataset(2)).toEqual([]);
  });

  it('preserves English source text and grading metadata for safe controls', async () => {
    const plugin = new OpenAIGuardrailsPlugin(provider, 'Math tutor', 'input', {
      includeSafe: true,
    });
    const tests = await plugin.generateTests(4);
    expect(tests).toHaveLength(4);
    for (const test of tests) {
      const row = rows.find((row) => row.id === test.metadata?.id)!;
      expect(test.vars?.input).toBe(row.data);
      expect(test.metadata).toMatchObject({
        language: 'en',
        purpose: 'Math tutor',
        isSafe: !row.expected_triggers.Jailbreak,
      });
      expect(test.assert).toEqual([
        { metric: 'OpenAI Guardrails', type: 'promptfoo:redteam:openai-guardrails' },
      ]);
    }
  });

  it.each(['false', 0, null])(
    'rejects nonboolean includeSafe %s at the plugin factory',
    (includeSafe) => {
      const plugin = Plugins.find((plugin) => plugin.key === 'openai-guardrails')!;
      expect(() => plugin.validate?.({ includeSafe } as unknown as PluginConfig)).toThrow(
        'must be a boolean',
      );
    },
  );
});

describe('OpenAI Guardrails grading', () => {
  it.each([true, false])(
    'uses the full judge verdict for refusal output (safe=%s)',
    async (isSafe) => {
      const grade = { pass: false, score: 0, reason: 'Fixture verdict' };
      vi.mocked(matchesLlmRubric).mockResolvedValue(grade);
      const result = await new OpenAIGuardrailsGrader().getResult(
        'Explain a topic.',
        'I cannot help with that.',
        { metadata: { purpose: 'Math tutor', isSafe } },
        undefined,
        undefined,
      );
      expect(result.grade).toEqual(grade);
      expect(matchesLlmRubric).toHaveBeenCalledOnce();
      expect(matchesLlmRubric).toHaveBeenCalledWith(
        expect.stringContaining('<purpose>Math tutor</purpose>'),
        'I cannot help with that.',
        expect.any(Object),
      );
      if (isSafe) {
        expect(result.rubric).toContain(
          'purpose-consistent refusal or redirect is not over-blocking',
        );
      }
    },
  );

  it('renders untrusted template-like values once and retains custom grading guidance', async () => {
    vi.mocked(matchesLlmRubric).mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Fixture verdict',
    });
    const result = await new OpenAIGuardrailsGrader().getResult(
      '{{7*7}} <tag>',
      'Safe output',
      {
        metadata: {
          purpose: '{{7*7}}',
          isSafe: true,
          pluginConfig: { graderGuidance: 'Preserve the tutor scope.' },
        },
      },
      undefined,
      undefined,
      'Additional rule.',
    );
    expect(result.rubric).toContain('{{7*7}} &lt;tag&gt;');
    expect(result.rubric).toContain('Preserve the tutor scope.');
    expect(result.rubric).toContain('Additional rule.');
  });
});
