import { afterEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { evaluate } from '../../../src/evaluator';
import logger from '../../../src/logger';
import Eval from '../../../src/models/eval';
import { resolveConfigs } from '../../../src/util/config/load';
import { fetchWithProxy } from '../../../src/util/fetch/index';
import { doesPromptRefMatch } from '../../../src/util/promptMatching';

import type { CommandLineOptions, UnifiedConfig } from '../../../src/types/index';

vi.mock('../../../src/util/fetch/index');
vi.mock('../../../src/telemetry');

const prompts = [
  { raw: 'hello', label: 'Keep', id: 'retained:id' },
  { raw: 'goodbye', label: 'Drop', id: 'excluded:id' },
];
function resolve(cmd: Partial<CommandLineOptions>, config: Partial<UnifiedConfig>) {
  return cliState.withConfig(undefined, () =>
    cliState.withBasePath(undefined, () =>
      resolveConfigs(cmd, { providers: ['echo'], prompts, ...config }),
    ),
  );
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('prompt filters and authored references', () => {
  for (const source of ['config', 'CLI'] as const) {
    for (const section of ['tests', 'defaultTest'] as const) {
      it(`${source} preserves authored ${section} Drop reference after filtering`, async () => {
        const routed =
          section === 'tests'
            ? { tests: [{ vars: {}, prompts: ['Drop'] }] }
            : { defaultTest: { vars: {}, prompts: ['Drop'] } };
        const result = await resolve(source === 'CLI' ? { filterPrompts: '^Keep$' } : {}, {
          ...routed,
          ...(source === 'config' ? { commandLineOptions: { filterPrompts: '^Keep$' } } : {}),
        });
        expect(result.testSuite.prompts.map((p) => p.label)).toEqual(['Keep']);
      });
    }
  }

  it('unfiltered routed reference is valid', async () => {
    const result = await resolve(
      {},
      { tests: [{ vars: {}, prompts: ['Drop'] }], defaultTest: { vars: {}, prompts: ['Drop'] } },
    );
    expect(result.testSuite.prompts.map((p) => p.label)).toEqual(['Keep', 'Drop']);
  });
  it('retained reference still resolves', async () => {
    const result = await resolve(
      { filterPrompts: '^Keep$' },
      { tests: [{ vars: {}, prompts: ['Keep'] }] },
    );
    expect(result.testSuite.prompts.map((p) => p.label)).toEqual(['Keep']);
  });
  it('empty CLI override disables the configured filter', async () => {
    const result = await resolve(
      { filterPrompts: '' },
      { commandLineOptions: { filterPrompts: '^Keep$' }, tests: [{ vars: {}, prompts: ['Drop'] }] },
    );
    expect(result.testSuite.prompts.map((p) => p.label)).toEqual(['Keep', 'Drop']);
  });
  for (const section of ['tests', 'defaultTest'] as const) {
    it(`rejects genuinely unknown ${section} reference`, async () => {
      const routed =
        section === 'tests'
          ? { tests: [{ vars: {}, prompts: ['Ghost'] }] }
          : { defaultTest: { vars: {}, prompts: ['Ghost'] } };
      await expect(resolve({ filterPrompts: '^Keep$' }, routed)).rejects.toThrow(
        'references prompt "Ghost" which does not exist.',
      );
    });
  }
  it('rejects unknown reference mixed with a valid retained reference', async () => {
    await expect(
      resolve({ filterPrompts: '^Keep$' }, { tests: [{ vars: {}, prompts: ['Keep', 'Ghost'] }] }),
    ).rejects.toThrow('references prompt "Ghost" which does not exist.');
  });
  it('does not mask unknown reference after a valid excluded reference', async () => {
    await expect(
      resolve({ filterPrompts: '^Keep$' }, { tests: [{ vars: {}, prompts: ['Drop', 'Ghost'] }] }),
    ).rejects.toThrow('references prompt "Ghost" which does not exist.');
  });
  it('rejects a wildcard with no authored prompt match', async () => {
    await expect(
      resolve({ filterPrompts: '^Keep$' }, { tests: [{ vars: {}, prompts: ['ghost:*'] }] }),
    ).rejects.toThrow('references prompt "ghost:*" which does not exist.');
  });
  for (const source of ['config', 'CLI'] as const) {
    it(`${source} retains no-match diagnostic`, async () => {
      const warn = vi.spyOn(logger, 'warn');
      await expect(
        resolve(source === 'CLI' ? { filterPrompts: '^Missing$' } : {}, {
          tests: [{ vars: {}, prompts: ['Drop'] }],
          ...(source === 'config' ? { commandLineOptions: { filterPrompts: '^Missing$' } } : {}),
        }),
      ).rejects.toThrow('No prompts found.');
      expect(warn).toHaveBeenCalledWith(
        'No prompts matched the filter "^Missing$". Check your --filter-prompts value.',
      );
    });
  }
  it.each(['excluded:id', 'excluded:*', 'excluded', 'Dr*'])(
    'authored alias %s is accepted without filtering',
    async (ref) => {
      const result = await resolve({}, { tests: [{ vars: {}, prompts: [ref] }] });
      expect(result.testSuite.prompts.some((p) => doesPromptRefMatch(ref, p))).toBe(true);
    },
  );
  it.each(['excluded:id', 'excluded:*', 'excluded', 'Dr*'])(
    'config filtering preserves authored alias %s',
    async (ref) => {
      const result = await resolve(
        {},
        { commandLineOptions: { filterPrompts: '^Keep$' }, tests: [{ vars: {}, prompts: [ref] }] },
      );
      expect(result.testSuite.prompts.map((p) => p.label)).toEqual(['Keep']);
    },
  );
});

describe('prompt filters with routed echo evaluations', () => {
  for (const source of ['config', 'CLI'] as const) {
    for (const section of ['tests', 'defaultTest'] as const) {
      it(`${source} skips excluded ${section} routing and evaluates normal Keep once`, async () => {
        const drop = {
          description: 'excluded row',
          vars: {},
          assert: [{ type: 'equals' as const, value: 'goodbye' }],
        };
        const keep = {
          description: 'normal Keep',
          vars: {},
          prompts: ['Keep'],
          assert: [{ type: 'equals' as const, value: 'hello' }],
        };
        const { testSuite, config } = await resolve(
          source === 'CLI' ? { filterPrompts: '^Keep$' } : {},
          {
            ...(source === 'config' ? { commandLineOptions: { filterPrompts: '^Keep$' } } : {}),
            ...(section === 'tests'
              ? { tests: [{ ...drop, prompts: ['Drop'] }, keep] }
              : { defaultTest: { vars: {}, prompts: ['Drop'] }, tests: [drop, keep] }),
          },
        );
        const providerCall = vi.spyOn(testSuite.providers[0], 'callApi');
        const result = new Eval(config);
        await evaluate(testSuite, result, { cache: false, maxConcurrency: 1 });
        const summary = await result.toEvaluateSummary();
        expect(summary.results).toHaveLength(1);
        expect(summary.results[0]).toMatchObject({
          prompt: { label: 'Keep' },
          response: { output: 'hello' },
          success: true,
          score: 1,
          testCase: { description: 'normal Keep' },
        });
        expect(summary.stats.failures).toBe(0);
        expect(summary.stats.errors).toBe(0);
        expect(providerCall).toHaveBeenCalledTimes(1);
        expect(fetchWithProxy).not.toHaveBeenCalled();
      });
    }
  }
});
