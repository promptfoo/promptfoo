import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { getEnvBool, getEnvString } from '../../../../src/envars';
import { PromptfooHarmfulCompletionProvider } from '../../../../src/providers/promptfoo';
import {
  LLAMA_GUARD_REPLICATE_PROVIDER,
  UNALIGNED_PROVIDER_HARM_PLUGINS,
} from '../../../../src/redteam/constants';
import { REDTEAM_MODEL_CATEGORIES } from '../../../../src/redteam/plugins/harmful/constants';
import { getHarmfulTests } from '../../../../src/redteam/plugins/harmful/unaligned';
import { createMockProvider, type MockApiProvider } from '../../../factories/provider';

import type { HarmfulCategory } from '../../../../src/redteam/plugins/harmful/constants';

vi.mock('../../../../src/envars');

describe('harmful plugin', () => {
  let mockProvider: MockApiProvider;
  let mockCallApi: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider = createMockProvider();
    if (mockCallApi) {
      mockCallApi.mockRestore();
    }
    mockCallApi = vi.spyOn(PromptfooHarmfulCompletionProvider.prototype, 'callApi').mockReset();

    vi.mocked(getEnvBool).mockReset();
    vi.mocked(getEnvString).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (mockCallApi) {
      mockCallApi.mockRestore();
    }
  });

  describe('getHarmfulTests', () => {
    it('should handle unaligned provider plugins with multiple prompts', async () => {
      const unalignedPlugin = Object.keys(UNALIGNED_PROVIDER_HARM_PLUGINS)[0];

      mockCallApi.mockResolvedValueOnce({
        output: ['Test harmful output', 'Another test output'],
      });

      const result = await getHarmfulTests(
        {
          provider: mockProvider,
          purpose: 'test purpose',
          injectVar: 'testVar',
          n: 2,
          delayMs: 0,
        },
        unalignedPlugin as keyof typeof UNALIGNED_PROVIDER_HARM_PLUGINS,
      );

      expect(mockCallApi).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
      const prompts = result.map((r) => r.vars?.testVar);
      expect(prompts).toContain('Test harmful output');
      expect(prompts).toContain('Another test output');
    });

    it('should retry when not enough unique prompts are returned', async () => {
      const unalignedPlugin = Object.keys(UNALIGNED_PROVIDER_HARM_PLUGINS)[0];

      mockCallApi
        .mockResolvedValueOnce({ output: ['Test output'] })
        .mockResolvedValueOnce({ output: ['Test output'] })
        .mockResolvedValueOnce({ output: ['Another test output'] });

      const result = await getHarmfulTests(
        {
          provider: mockProvider,
          purpose: 'test purpose',
          injectVar: 'testVar',
          n: 2,
          delayMs: 0,
        },
        unalignedPlugin as keyof typeof UNALIGNED_PROVIDER_HARM_PLUGINS,
      );

      expect(mockCallApi).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(2);
      const prompts = result.map((r) => r.vars?.testVar);
      expect(prompts).toContain('Test output');
      expect(prompts).toContain('Another test output');
    });

    it('provenance-marks remote-materialized multi-input vars so they are not rendered locally', async () => {
      const unalignedPlugin = Object.keys(
        UNALIGNED_PROVIDER_HARM_PLUGINS,
      )[0] as keyof typeof UNALIGNED_PROVIDER_HARM_PLUGINS;

      // The remote unaligned-harmful provider returns multi-input JSON whose secondary input
      // embeds an environment template. Without provenance, only `__prompt`/the inject var is
      // skipped, so this value would resolve to a real env secret before the target call.
      mockCallApi.mockResolvedValueOnce({
        output: [
          JSON.stringify({
            testVar: 'Summarize the attached note.',
            secondary: '{{ env.PROBE_REMOTE_SECRET }}',
          }),
        ],
      });

      const result = await getHarmfulTests(
        {
          provider: mockProvider,
          purpose: 'test purpose',
          injectVar: 'testVar',
          n: 1,
          delayMs: 0,
          config: { inputs: { secondary: 'Secondary document input' } },
        },
        unalignedPlugin,
      );

      expect(result).toHaveLength(1);
      // The remote-derived secondary input round-trips verbatim (proving it is dangerous if rendered)...
      expect(result[0].vars?.secondary).toBe('{{ env.PROBE_REMOTE_SECRET }}');
      // ...and both the inject var and the materialized secondary input are marked remote-derived
      // so the evaluator skips their local rendering.
      const provenance = (result[0].metadata as Record<string, any> | undefined)
        ?.__promptfooRemoteGenerated;
      expect(provenance?.unsafeRenderVars).toEqual(
        expect.arrayContaining(['testVar', 'secondary']),
      );
    });

    it('should handle empty provider response', async () => {
      mockCallApi.mockResolvedValue({ output: [] });

      const result = await getHarmfulTests(
        {
          provider: mockProvider,
          purpose: 'test purpose',
          injectVar: 'testVar',
          n: 1,
          delayMs: 0,
        },
        'harmful:sex-crime',
      );

      expect(result).toHaveLength(0);
    });

    it('should respect delay parameter between API calls', async () => {
      const unalignedPlugin = Object.keys(UNALIGNED_PROVIDER_HARM_PLUGINS)[0];
      mockCallApi
        .mockResolvedValueOnce({ output: ['Test output'] })
        .mockResolvedValueOnce({ output: ['Another output'] });

      vi.useFakeTimers();
      try {
        const startTime = Date.now();
        const testsPromise = getHarmfulTests(
          {
            provider: mockProvider,
            purpose: 'test purpose',
            injectVar: 'testVar',
            n: 2,
            delayMs: 100,
          },
          unalignedPlugin as keyof typeof UNALIGNED_PROVIDER_HARM_PLUGINS,
        );

        await vi.runAllTimersAsync();
        await testsPromise;

        expect(Date.now() - startTime).toBeGreaterThanOrEqual(100);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should handle moderation assertions with OPENAI_API_KEY', async () => {
      vi.mocked(getEnvString).mockImplementation(function (key) {
        if (key === 'OPENAI_API_KEY') {
          return 'test-key';
        }
        return '';
      });

      mockCallApi.mockResolvedValueOnce({ output: ['Test output'] });

      const result = await getHarmfulTests(
        {
          provider: mockProvider,
          purpose: 'test purpose',
          injectVar: 'testVar',
          n: 1,
          delayMs: 0,
        },
        'harmful:sex-crime',
      );

      expect(result).toHaveLength(1);
      expect(result[0].vars?.testVar).toBe('Test output');
      expect(result[0].assert).toContainEqual(expect.objectContaining({ type: 'moderation' }));
    });

    it('should handle moderation assertions with REPLICATE_API_KEY', async () => {
      const mockCategory: HarmfulCategory = {
        key: 'harmful:privacy',
        prompt: 'test prompt',
        examples: 'example1',
        label: 'Privacy violations',
        description: 'test description',
      };
      vi.spyOn(REDTEAM_MODEL_CATEGORIES, 'find').mockReturnValue(mockCategory);

      vi.mocked(getEnvString).mockImplementation(function (key) {
        if (key === 'REPLICATE_API_KEY') {
          return 'test-key';
        }
        return '';
      });

      const mockOutput = 'Test output';
      vi.spyOn(PromptfooHarmfulCompletionProvider.prototype, 'callApi').mockResolvedValue({
        output: [mockOutput],
      });

      const result = await getHarmfulTests(
        {
          provider: mockProvider,
          purpose: 'test purpose',
          injectVar: 'testVar',
          n: 1,
          delayMs: 0,
        },
        'harmful:sex-crime',
      );

      expect(result).toHaveLength(1);
      expect(result[0].vars?.testVar).toBe('Test output');
      expect(result[0].assert).toContainEqual(
        expect.objectContaining({
          type: 'moderation',
          provider: LLAMA_GUARD_REPLICATE_PROVIDER,
        }),
      );
    });
  });
});
