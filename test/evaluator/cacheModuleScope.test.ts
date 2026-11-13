import './setup';

import { expect, it, vi } from 'vitest';
import { disableCache, enableCache } from '../../src/cache';
import { runEval } from '../../src/evaluator';
import { createEmptyTokenUsage } from '../../src/util/tokenUsageUtils';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider } from '../../src/types/providers';

describeEvaluator('evaluator cross-module cache policy', () => {
  it.each(['global', 'evaluation'] as const)(
    'disables providers from another module copy with the %s policy',
    async (policy) => {
      vi.resetModules();
      const providerCache = await import('../../src/cache');
      providerCache.enableCache();
      const observed: Array<{ enabled: boolean; bustCache?: boolean }> = [];
      const provider: ApiProvider = {
        id: () => 'cross-module-provider',
        async callApi(_prompt, context) {
          observed.push({
            enabled: providerCache.isCacheEnabled(),
            bustCache: context?.bustCache,
          });
          return { output: 'result', tokenUsage: createEmptyTokenUsage() };
        },
      };

      if (policy === 'global') {
        disableCache();
      }
      try {
        await runEval({
          provider,
          prompt: { raw: 'Test prompt', label: 'test-label' },
          delay: 0,
          nunjucksFilters: undefined,
          evaluateOptions: policy === 'evaluation' ? { cache: false } : {},
          testIdx: 0,
          promptIdx: 0,
          conversations: {},
          registers: {},
          isRedteam: false,
          test: { assert: [] },
          repeatIndex: 0,
        });
      } finally {
        enableCache();
      }

      expect(observed).toEqual([{ enabled: false, bustCache: true }]);
      expect(providerCache.isCacheEnabled()).toBe(true);
    },
  );
});
