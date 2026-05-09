import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyRuntimeTransforms,
  RUNTIME_TRANSFORM_TOKEN_USAGE_KEY,
} from '../../../src/redteam/shared/runtimeTransform';

import type { Strategy } from '../../../src/redteam/strategies/types';
import type { TestCaseWithPlugin } from '../../../src/types';

describe('runtimeTransform', () => {
  const mockBase64Strategy: Strategy = {
    id: 'base64',
    action: vi.fn(async (testCases: TestCaseWithPlugin[]) =>
      testCases.map((tc) => ({
        ...tc,
        vars: {
          ...tc.vars,
          input: Buffer.from(String(tc.vars?.input || '')).toString('base64'),
        },
      })),
    ),
  };

  const mockAudioStrategy: Strategy = {
    id: 'audio',
    action: vi.fn(async (testCases: TestCaseWithPlugin[]) =>
      testCases.map((tc) => ({
        ...tc,
        vars: {
          ...tc.vars,
          input: 'data:audio/mp3;base64,SGVsbG9BdWRpbw==', // Mock audio data URL
        },
      })),
    ),
  };

  const mockImageStrategy: Strategy = {
    id: 'image',
    action: vi.fn(async (testCases: TestCaseWithPlugin[]) =>
      testCases.map((tc) => ({
        ...tc,
        vars: {
          ...tc.vars,
          input: 'data:image/png;base64,SGVsbG9JbWFnZQ==', // Mock image data URL
        },
      })),
    ),
  };

  const mockRawAudioStrategy: Strategy = {
    id: 'audio-raw',
    action: vi.fn(async (testCases: TestCaseWithPlugin[]) =>
      testCases.map((tc) => ({
        ...tc,
        vars: {
          ...tc.vars,
          input: 'SGVsbG9SYXdBdWRpbw==', // Raw base64 without data URL
        },
      })),
    ),
  };

  const mockStrategies: Strategy[] = [
    mockBase64Strategy,
    mockAudioStrategy,
    mockImageStrategy,
    mockRawAudioStrategy,
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('applyRuntimeTransforms', () => {
    it('should return original prompt when no layers provided', async () => {
      const result = await applyRuntimeTransforms('test prompt', 'input', [], mockStrategies);

      expect(result).toEqual({
        prompt: 'test prompt',
        originalPrompt: 'test prompt',
      });
    });

    it('should return original prompt when layers is empty array', async () => {
      const result = await applyRuntimeTransforms('test prompt', 'input', [], mockStrategies);

      expect(result.prompt).toBe('test prompt');
      expect(result.originalPrompt).toBe('test prompt');
      expect(result.audio).toBeUndefined();
      expect(result.image).toBeUndefined();
    });

    it('should apply single transform layer', async () => {
      const result = await applyRuntimeTransforms('hello', 'input', ['base64'], mockStrategies);

      expect(result.prompt).toBe('aGVsbG8='); // base64('hello')
      expect(result.originalPrompt).toBe('hello');
      expect(mockBase64Strategy.action).toHaveBeenCalledTimes(1);
    });

    it('should apply multiple transform layers in order', async () => {
      // First base64, then the second strategy would transform the base64 result
      // But for this test, let's just verify both are called
      const mockSecondStrategy: Strategy = {
        id: 'rot13',
        action: vi.fn(async (testCases) => testCases),
      };

      const strategies = [...mockStrategies, mockSecondStrategy];

      await applyRuntimeTransforms('hello', 'input', ['base64', 'rot13'], strategies);

      expect(mockBase64Strategy.action).toHaveBeenCalledTimes(1);
      expect(mockSecondStrategy.action).toHaveBeenCalledTimes(1);
    });

    it('should preserve auxiliary layer usage without exposing the private carrier metadata', async () => {
      const tokenStrategy: Strategy = {
        id: 'token-layer',
        action: vi.fn(async (testCases: TestCaseWithPlugin[]) =>
          testCases.map((tc) => ({
            ...tc,
            vars: {
              ...tc.vars,
              input: 'layered prompt',
            },
            metadata: {
              ...tc.metadata,
              [RUNTIME_TRANSFORM_TOKEN_USAGE_KEY]: {
                total: 9,
                prompt: 4,
                completion: 5,
                numRequests: 1,
              },
            },
          })),
        ),
      };

      const result = await applyRuntimeTransforms(
        'hello',
        'input',
        ['token-layer'],
        [tokenStrategy],
      );

      expect(result.tokenUsage).toMatchObject({
        total: 9,
        prompt: 4,
        completion: 5,
        numRequests: 0,
      });
      expect(result.metadata).not.toHaveProperty(RUNTIME_TRANSFORM_TOKEN_USAGE_KEY);
    });

    it('should preserve incremental providerTokenUsage from successful layers', async () => {
      const firstTokenLayer: Strategy = {
        id: 'first-token-layer',
        action: vi.fn(async (testCases: TestCaseWithPlugin[]) =>
          testCases.map((tc) => ({
            ...tc,
            metadata: {
              ...tc.metadata,
              providerTokenUsage: {
                total: 5,
                prompt: 3,
                completion: 2,
                numRequests: 1,
              },
            },
          })),
        ),
      };
      const secondTokenLayer: Strategy = {
        id: 'second-token-layer',
        action: vi.fn(async (testCases: TestCaseWithPlugin[]) =>
          testCases.map((tc) => ({
            ...tc,
            metadata: {
              ...tc.metadata,
              providerTokenUsage: {
                total: 12,
                prompt: 7,
                completion: 5,
                numRequests: 2,
              },
            },
          })),
        ),
      };

      const result = await applyRuntimeTransforms(
        'hello',
        'input',
        ['first-token-layer', 'second-token-layer'],
        [firstTokenLayer, secondTokenLayer],
      );

      expect(result.tokenUsage).toMatchObject({
        total: 12,
        prompt: 7,
        completion: 5,
        numRequests: 0,
      });
      expect(result.metadata?.providerTokenUsage).toMatchObject({
        total: 12,
        prompt: 7,
        completion: 5,
        numRequests: 2,
      });
    });

    it('should extract audio data from data URL', async () => {
      const result = await applyRuntimeTransforms('hello', 'input', ['audio'], mockStrategies);

      expect(result.audio).toEqual({
        data: 'SGVsbG9BdWRpbw==',
        format: 'mp3',
      });
      expect(result.originalPrompt).toBe('hello');
    });

    it('should extract image data from data URL', async () => {
      const result = await applyRuntimeTransforms('hello', 'input', ['image'], mockStrategies);

      expect(result.image).toEqual({
        data: 'SGVsbG9JbWFnZQ==',
        format: 'png',
      });
      expect(result.originalPrompt).toBe('hello');
    });

    it('should handle raw base64 audio (assume mp3 format)', async () => {
      // Create a strategy that mimics returning raw base64 audio
      const rawAudioStrategy: Strategy = {
        id: 'audio',
        action: vi.fn(async (testCases: TestCaseWithPlugin[]) =>
          testCases.map((tc) => ({
            ...tc,
            vars: {
              ...tc.vars,
              input: 'SGVsbG9SYXdBdWRpbw==', // Raw base64 without data URL prefix
            },
          })),
        ),
      };

      const strategies = [rawAudioStrategy];
      const result = await applyRuntimeTransforms('hello', 'input', ['audio'], strategies);

      expect(result.audio).toEqual({
        data: 'SGVsbG9SYXdBdWRpbw==',
        format: 'mp3', // Default format for raw base64
      });
    });

    it('should handle layer config objects', async () => {
      const result = await applyRuntimeTransforms(
        'hello',
        'input',
        [{ id: 'base64', config: { someOption: true } }],
        mockStrategies,
      );

      expect(result.prompt).toBe('aGVsbG8=');
      expect(mockBase64Strategy.action).toHaveBeenCalledWith(
        expect.any(Array),
        'input',
        expect.objectContaining({ someOption: true }),
      );
    });

    it('should skip unknown strategies with warning', async () => {
      const result = await applyRuntimeTransforms(
        'hello',
        'input',
        ['unknown-strategy', 'base64'],
        mockStrategies,
      );

      // Should still apply base64
      expect(result.prompt).toBe('aGVsbG8=');
      expect(mockBase64Strategy.action).toHaveBeenCalledTimes(1);
    });

    it('should return error when transform fails', async () => {
      const failingStrategy: Strategy = {
        id: 'failing',
        action: vi.fn(async () => {
          throw new Error('Transform failed');
        }),
      };

      const strategies = [...mockStrategies, failingStrategy];
      const result = await applyRuntimeTransforms('hello', 'input', ['failing'], strategies);

      expect(result.error).toContain('Transform failing failed');
      expect(result.prompt).toBe('hello'); // Returns original prompt on error
      expect(result.originalPrompt).toBe('hello');
    });

    it('should preserve failed layer usage when a transform throws it', async () => {
      const failingStrategy: Strategy = {
        id: 'failing-with-usage',
        action: vi.fn(async () => {
          throw Object.assign(new Error('Transform failed'), {
            tokenUsage: {
              total: 11,
              prompt: 7,
              completion: 4,
              numRequests: 1,
            },
          });
        }),
      };

      const result = await applyRuntimeTransforms(
        'hello',
        'input',
        ['failing-with-usage'],
        [failingStrategy],
      );

      expect(result.error).toContain('Transform failing-with-usage failed');
      expect(result.tokenUsage).toMatchObject({
        total: 11,
        prompt: 7,
        completion: 4,
        numRequests: 0,
      });
    });

    it('should preserve pluginId in metadata during transforms', async () => {
      let capturedTestCase: TestCaseWithPlugin | undefined;

      const inspectingStrategy: Strategy = {
        id: 'inspect',
        action: vi.fn(async (testCases: TestCaseWithPlugin[]) => {
          capturedTestCase = testCases[0];
          return testCases;
        }),
      };

      const strategies = [...mockStrategies, inspectingStrategy];
      await applyRuntimeTransforms('hello', 'input', ['inspect'], strategies, {
        originalTestCaseId: 'layer-row-1',
      });

      expect(capturedTestCase?.metadata?.pluginId).toBe('runtime-transform');
      expect(capturedTestCase?.metadata?.originalTestCaseId).toBe('layer-row-1');
    });

    it('should handle different inject variable names', async () => {
      await applyRuntimeTransforms('test', 'query', ['base64'], mockStrategies);

      // The strategy should receive the correct inject var name
      expect(mockBase64Strategy.action).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            vars: expect.objectContaining({ query: 'test' }),
          }),
        ]),
        'query',
        expect.any(Object),
      );
    });
  });
});
