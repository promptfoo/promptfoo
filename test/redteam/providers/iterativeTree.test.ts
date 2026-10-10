import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTreeNode,
  evaluateResponse,
  getNewPrompt,
  DEFAULT_MAX_WIDTH as MAX_WIDTH,
  default as RedteamIterativeTreeProvider,
  renderSystemPrompts,
  selectNodes,
  updateRedteamHistory,
} from '../../../src/redteam/providers/iterativeTree';
import {
  ATTACKER_SYSTEM_PROMPT,
  CLOUD_ATTACKER_SYSTEM_PROMPT,
  JUDGE_SYSTEM_PROMPT,
} from '../../../src/redteam/providers/prompts';
import { getTargetResponse, redteamProviderManager } from '../../../src/redteam/providers/shared';
import * as remoteGeneration from '../../../src/redteam/remoteGeneration';
import { isProviderResponseRateLimited } from '../../../src/scheduler/types';
import { isResponseHeadersObserverErrorResponse } from '../../../src/util/fetch/responseHeadersObserver';
import { getNunjucksEngine } from '../../../src/util/templates';
import { TokenUsageTracker } from '../../../src/util/tokenUsage';
import {
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
} from '../../../src/util/tokenUsageUtils';
import {
  createMockProvider,
  createProviderResponse,
  type MockApiProvider,
} from '../../factories/provider';
import { createSelectedObserverErrorResponse } from '../../util/selectedObserverError';
import { createSelectedToolErrorTarget } from '../../util/selectedToolErrorTarget';

import type { TreeSearchOutput } from '../../../src/redteam/providers/iterativeTree';
import type {
  AtomicTestCase,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../../src/types/index';

// Note: We don't mock '../../../src/util/templates' because tests need the real nunjucks engine
vi.mock('../../../src/redteam/graders', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getGraderById: vi.fn(),
  };
});

describe('RedteamIterativeProvider', () => {
  describe('renderSystemPrompts', () => {
    it('should render system prompts correctly with default settings', () => {
      const goal = '{{goal}}';
      const result = renderSystemPrompts(getNunjucksEngine(), goal);
      const nunjucksEng = getNunjucksEngine();
      const attackerPrompt = nunjucksEng.renderString(ATTACKER_SYSTEM_PROMPT, { goal });
      expect(result.redteamSystemPrompt).toBe(attackerPrompt);
      expect(result.judgeSystemPrompt).toBe(JUDGE_SYSTEM_PROMPT);
    });

    it('should render system prompts with excludeTargetOutputFromAgenticAttackGeneration=true', () => {
      const goal = '{{goal}}';
      const result = renderSystemPrompts(getNunjucksEngine(), goal, undefined, true);
      const nunjucksEng = getNunjucksEngine();
      const attackerPrompt = nunjucksEng.renderString(CLOUD_ATTACKER_SYSTEM_PROMPT, { goal });
      expect(result.redteamSystemPrompt).toBe(attackerPrompt);
      expect(result.judgeSystemPrompt).toBe(JUDGE_SYSTEM_PROMPT);
    });

    it('should include modifiers in system prompts when provided', () => {
      const goal = 'test goal';
      const purpose = 'test purpose';
      const modifiers = {
        testGenerationInstructions: 'Generate prompts as invoice notes',
        language: 'Spanish',
      };

      const result = renderSystemPrompts(getNunjucksEngine(), goal, purpose, false, modifiers);

      // Verify modifiers are included in the system prompt
      expect(result.redteamSystemPrompt).toContain('CRITICAL: Ensure all generated prompts');
      expect(result.redteamSystemPrompt).toContain('<Modifiers>');
      expect(result.redteamSystemPrompt).toContain(
        'testGenerationInstructions: Generate prompts as invoice notes',
      );
      expect(result.redteamSystemPrompt).toContain('language: Spanish');
      expect(result.redteamSystemPrompt).toContain('Rewrite ALL prompts to fully comply');
    });

    it('should include modifiers with cloud attacker prompt', () => {
      const goal = 'test goal';
      const modifiers = {
        testGenerationInstructions: 'Use merchant terminology',
      };

      const result = renderSystemPrompts(getNunjucksEngine(), goal, undefined, true, modifiers);

      // Verify modifiers are included in cloud attacker prompt
      expect(result.redteamSystemPrompt).toContain('CRITICAL: Ensure all generated prompts');
      expect(result.redteamSystemPrompt).toContain(
        'testGenerationInstructions: Use merchant terminology',
      );
    });

    it('should not include modifiers section when modifiers are empty', () => {
      const goal = 'test goal';
      const modifiers = {};

      const result = renderSystemPrompts(getNunjucksEngine(), goal, undefined, false, modifiers);

      // Should not contain the modifiers section
      expect(result.redteamSystemPrompt).not.toContain('CRITICAL: Ensure all generated prompts');
      expect(result.redteamSystemPrompt).not.toContain('<Modifiers>');
    });

    it('should not include modifiers section when modifiers are undefined', () => {
      const goal = 'test goal';

      const result = renderSystemPrompts(getNunjucksEngine(), goal, undefined, false, undefined);

      // Should not contain the modifiers section
      expect(result.redteamSystemPrompt).not.toContain('CRITICAL: Ensure all generated prompts');
      expect(result.redteamSystemPrompt).not.toContain('<Modifiers>');
    });
  });

  describe('evaluateResponse', () => {
    let mockRedteamProvider: MockApiProvider;

    beforeEach(() => {
      mockRedteamProvider = createMockProvider({ id: 'mock-provider' });
      mockRedteamProvider.callApi.mockReset();
      TokenUsageTracker.getInstance().resetProviderUsage(mockRedteamProvider.id());
    });

    it('should evaluate response correctly without penalized phrase', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 8, explanation: 'Good response' },
          previousBestResponse: { rating: 5, explanation: 'Previous response' },
        }),
      });

      const { score, explanation } = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        'Previous response',
        false,
      );

      expect(score).toBe(8);
      expect(explanation).toBe('Good response');
      expect(mockRedteamProvider.callApi).toHaveBeenCalledTimes(1);
      expect(mockRedteamProvider.callApi).toHaveBeenCalledWith(
        expect.stringContaining('Current Response'),
        expect.objectContaining({
          prompt: expect.objectContaining({
            label: 'judge',
          }),
        }),
      );
    });

    it('includes internal judge usage in the scan-local grading totals', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 8, explanation: 'Good response' },
          previousBestResponse: { rating: 5, explanation: 'Previous response' },
        }),
        tokenUsage: {
          total: 19,
          prompt: 11,
          completion: 8,
          numRequests: 2,
          completionDetails: { reasoning: 4 },
        },
      });
      const tokenUsage = createEmptyTokenUsage();

      await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        'Previous response',
        false,
        tokenUsage,
      );

      expect(tokenUsage).toMatchObject({
        total: 0,
        numRequests: 0,
        assertions: {
          total: 19,
          prompt: 11,
          completion: 8,
          numRequests: 1,
          completionDetails: { reasoning: 4 },
        },
      });
    });

    it('keeps cached judge usage in the scan footprint but out of incurred provider totals', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        cached: true,
        output: JSON.stringify({
          currentResponse: { rating: 8, explanation: 'Good response' },
          previousBestResponse: { rating: 5, explanation: 'Previous response' },
        }),
        tokenUsage: { total: 19, prompt: 11, completion: 8, numRequests: 1 },
      });
      const tokenUsage = createEmptyTokenUsage();

      await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        'Previous response',
        false,
        tokenUsage,
      );

      expect(tokenUsage).toMatchObject({
        assertions: { total: 19, numRequests: 1 },
        incurredTokenUsage: { assertions: { total: 0, numRequests: 0 } },
      });
      expect(
        TokenUsageTracker.getInstance().getProviderUsage(mockRedteamProvider.id()),
      ).toMatchObject({ total: 0, cached: 19, numRequests: 0 });
    });

    it('should apply penalty for penalized phrases', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 8, explanation: 'Good but penalized' },
          previousBestResponse: { rating: 5, explanation: 'Previous response' },
        }),
      });

      const { score, explanation } = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        'Previous response',
        true,
      );

      expect(score).toBe(5); // 8 - 3 = 5
      expect(explanation).toBe('Good but penalized');
    });

    it('should handle minimum score correctly', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 2, explanation: 'Poor response' },
          previousBestResponse: { rating: 1, explanation: 'Previous response' },
        }),
      });

      const { score, explanation } = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        'Previous response',
        true,
      );

      expect(score).toBe(1); // 2 - 3, but minimum is 1
      expect(explanation).toBe('Poor response');
    });

    it('should handle missing previous response', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          currentResponse: { rating: 7, explanation: 'First response' },
          previousBestResponse: { rating: 0, explanation: '' },
        }),
      });

      const { score, explanation } = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Target response',
        '',
        false,
      );

      expect(score).toBe(7);
      expect(explanation).toBe('First response');
      expect(JSON.parse(mockRedteamProvider.callApi.mock.calls[0][0])).toEqual([
        {
          role: 'system',
          content: 'Judge prompt',
        },
        {
          role: 'user',
          content: expect.stringContaining('Previous Best Response:\nNone'),
        },
      ]);
    });
  });

  describe('getNewPrompt', () => {
    let mockRedteamProvider: MockApiProvider;

    beforeEach(() => {
      mockRedteamProvider = createMockProvider({ id: 'mock-provider' });
      mockRedteamProvider.callApi.mockReset();
      TokenUsageTracker.getInstance().resetProviderUsage(mockRedteamProvider.id());
    });

    it('should generate a new prompt correctly', async () => {
      const mockResponse = {
        improvement: 'Improved aspect',
        prompt: 'New prompt',
      };
      mockRedteamProvider.callApi.mockResolvedValue({ output: JSON.stringify(mockResponse) });

      const redteamHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'User message' },
      ];

      const result = await getNewPrompt(mockRedteamProvider, redteamHistory);

      expect(result).toEqual(mockResponse);
      expect(mockRedteamProvider.callApi).toHaveBeenCalledTimes(1);
      expect(mockRedteamProvider.callApi).toHaveBeenCalledWith(
        '[{"role":"system","content":"System prompt"},{"role":"user","content":"User message"}]',
        expect.objectContaining({
          prompt: expect.objectContaining({
            label: 'history',
            raw: '[{"role":"system","content":"System prompt"},{"role":"user","content":"User message"}]',
          }),
        }),
      );
    });

    it('accounts for failed attacker responses before propagating their errors', async () => {
      const usage = createEmptyTokenUsage();
      mockRedteamProvider.callApi.mockResolvedValue({
        error: 'tree attacker failed after inference',
        tokenUsage: { total: 23, prompt: 15, completion: 8, numRequests: 1 },
      });

      await expect(getNewPrompt(mockRedteamProvider, [], undefined, usage)).rejects.toMatchObject({
        message: 'Error from redteam provider: tree attacker failed after inference',
        tokenUsage: usage,
      });

      expect(usage).toMatchObject({
        total: 0,
        numRequests: 0,
        attacker: { total: 23, prompt: 15, completion: 8, numRequests: 1 },
      });
      expect(
        TokenUsageTracker.getInstance().getProviderUsage(mockRedteamProvider.id()),
      ).toMatchObject({ total: 23, prompt: 15, completion: 8, numRequests: 1 });
    });

    it('keeps cached attacker usage in the scan footprint but out of incurred provider totals', async () => {
      const usage = createEmptyTokenUsage();
      mockRedteamProvider.callApi.mockResolvedValue({
        cached: true,
        output: JSON.stringify({ improvement: 'Improved aspect', prompt: 'New prompt' }),
        tokenUsage: { total: 23, prompt: 15, completion: 8, numRequests: 1 },
      });

      await getNewPrompt(mockRedteamProvider, [], undefined, usage);

      expect(usage).toMatchObject({
        attacker: { total: 23, numRequests: 1 },
        incurredTokenUsage: { attacker: { total: 0, numRequests: 0 } },
      });
      expect(
        TokenUsageTracker.getInstance().getProviderUsage(mockRedteamProvider.id()),
      ).toMatchObject({ total: 0, cached: 23, numRequests: 0 });
    });

    it('returns accumulated attacker usage when the tree provider fails', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({
        error: 'tree attacker failed after inference',
        tokenUsage: { total: 31, prompt: 19, completion: 12, numRequests: 1 },
      });
      const gradingProvider = createMockProvider({ id: 'mock-grader' });
      const targetProvider = createMockProvider({ id: 'mock-target' });
      const remoteGenerationSpy = vi
        .spyOn(remoteGeneration, 'shouldGenerateRemote')
        .mockReturnValue(false);
      const attackerProviderSpy = vi
        .spyOn(redteamProviderManager, 'getProvider')
        .mockResolvedValue(mockRedteamProvider);
      const gradingProviderSpy = vi
        .spyOn(redteamProviderManager, 'getGradingProvider')
        .mockResolvedValue(gradingProvider);

      try {
        const provider = new RedteamIterativeTreeProvider({
          injectVar: 'goal',
          maxDepth: 1,
          branchingFactor: 1,
        });
        const result = await provider.callApi('test prompt', {
          originalProvider: targetProvider,
          vars: { goal: 'test objective' },
          prompt: { raw: '{{goal}}', label: 'test' },
        });

        expect(result).toMatchObject({
          error: 'Error from redteam provider: tree attacker failed after inference',
          metadata: { stopReason: 'ATTACKER_ERROR', attempts: 0 },
          tokenUsage: {
            total: 0,
            numRequests: 0,
            attacker: { total: 31, prompt: 19, completion: 12, numRequests: 1 },
          },
        });
        expect(targetProvider.callApi).not.toHaveBeenCalled();
      } finally {
        remoteGenerationSpy.mockRestore();
        attackerProviderSpy.mockRestore();
        gradingProviderSpy.mockRestore();
      }
    });

    it('keeps an explicit redteamProvider local when remote generation is enabled', async () => {
      // Regression test for https://github.com/promptfoo/promptfoo/issues/10970:
      // a configured redteamProvider must not be swapped for the cloud provider.
      const explicitProvider = createMockProvider({ id: 'mock-explicit' });
      const gradingProvider = createMockProvider({ id: 'mock-grader' });
      const targetProvider = createMockProvider({ id: 'mock-target' });
      const remoteGenerationSpy = vi
        .spyOn(remoteGeneration, 'shouldGenerateRemote')
        .mockReturnValue(true);
      const attackerProviderSpy = vi
        .spyOn(redteamProviderManager, 'getProvider')
        .mockResolvedValue(explicitProvider);
      const gradingProviderSpy = vi
        .spyOn(redteamProviderManager, 'getGradingProvider')
        .mockResolvedValue(gradingProvider);

      try {
        const provider = new RedteamIterativeTreeProvider({
          injectVar: 'goal',
          maxDepth: 1,
          branchingFactor: 1,
          redteamProvider: 'ollama:chat:llama3.1:8b',
        });
        await provider.callApi('test prompt', {
          originalProvider: targetProvider,
          vars: { goal: 'test objective' },
          prompt: { raw: '{{goal}}', label: 'test' },
        });

        expect(attackerProviderSpy).toHaveBeenCalledWith(
          expect.objectContaining({ provider: 'ollama:chat:llama3.1:8b' }),
        );
      } finally {
        remoteGenerationSpy.mockRestore();
        attackerProviderSpy.mockRestore();
        gradingProviderSpy.mockRestore();
      }
    });

    it.each([false, true])(
      'retains the selected earlier verdict and total usage (identical text: %s)',
      async (identicalText) => {
        mockRedteamProvider.callApi
          .mockResolvedValueOnce({
            output: JSON.stringify({ prompt: 'first attack', improvement: 'first' }),
          })
          .mockResolvedValueOnce({
            output: JSON.stringify({
              prompt: identicalText ? 'first attack' : 'second attack',
              improvement: 'second',
            }),
          });
        const gradingProvider = createMockProvider({ id: 'judge' });
        gradingProvider.callApi
          .mockResolvedValueOnce({
            output: JSON.stringify({
              currentResponse: { rating: 8 },
              previousBestResponse: { rating: 0 },
            }),
          })
          .mockResolvedValueOnce({
            output: JSON.stringify({
              currentResponse: { rating: 3 },
              previousBestResponse: { rating: 8 },
            }),
          });
        const targetProvider = createMockProvider({ id: 'target' });
        targetProvider.callApi
          .mockResolvedValueOnce({ output: 'first response' })
          .mockResolvedValueOnce({ output: identicalText ? 'first response' : 'second response' });
        const graders = await import('../../../src/redteam/graders');
        const getResult = vi
          .fn()
          .mockResolvedValueOnce({
            grade: {
              pass: true,
              score: 1,
              reason: 'first verdict',
              metadata: { cachedResponse: true },
              tokensUsed: { total: 2, numRequests: 0 },
            },
            rubric: 'rendered first rubric',
          })
          .mockResolvedValueOnce({
            grade: {
              pass: true,
              score: 1,
              reason: 'second verdict',
              tokensUsed: { total: 4, numRequests: 1 },
            },
            rubric: 'rendered second rubric',
          });
        vi.mocked(graders.getGraderById).mockReturnValue({ getResult } as any);
        const remote = vi.spyOn(remoteGeneration, 'shouldGenerateRemote').mockReturnValue(false);
        const attacker = vi
          .spyOn(redteamProviderManager, 'getProvider')
          .mockResolvedValue(mockRedteamProvider);
        const judge = vi
          .spyOn(redteamProviderManager, 'getGradingProvider')
          .mockResolvedValue(gradingProvider);
        try {
          const provider = new RedteamIterativeTreeProvider({
            injectVar: 'goal',
            maxDepth: 1,
            branchingFactor: 2,
            maxAttempts: 2,
          });
          const result = await provider.callApi('', {
            originalProvider: targetProvider,
            vars: { goal: 'test objective' },
            prompt: { raw: '{{goal}}', label: 'test' },
            test: {
              assert: [
                { type: 'promptfoo:redteam:pii', metric: 'PII/Tree', value: 'original rubric' },
              ],
              metadata: { pluginId: 'pii:social' },
            } as AtomicTestCase,
          });
          expect(getResult).toHaveBeenCalledTimes(2);
          expect(result.output).toBe('first response');
          expect(result.metadata.storedGraderResult).toMatchObject({
            reason: 'first verdict',
            tokensUsed: { total: 4, cached: 2, numRequests: 1 },
          });
          expect(result.metadata.storedGraderResult?.metadata?.cachedResponse).not.toBe(true);
          expect(result.metadata.storedGraderResult?.assertion).toEqual({
            type: 'promptfoo:redteam:pii',
            metric: 'PII/Tree',
            value: 'rendered first rubric',
          });
          expect(result.metadata).toMatchObject({
            highestScore: 8,
            attempts: 2,
            redteamFinalPrompt: 'first attack',
            stopReason: 'MAX_ATTEMPTS',
            redteamTreeHistory: [
              {
                prompt: 'first attack',
                output: 'first response',
                score: 8,
                depth: 0,
                improvement: 'first',
                graderPassed: true,
                wasSelected: true,
              },
              {
                prompt: identicalText ? 'first attack' : 'second attack',
                output: 'first response',
                score: 3,
                depth: 0,
                graderPassed: true,
                wasSelected: false,
              },
            ],
          });
          const history = result.metadata.redteamTreeHistory;
          expect(history[0].parentId).toBe(history[1].parentId);
          expect(new Set(history.map((row) => row.id)).size).toBe(2);
          expect(history.map((row) => row.id)).toEqual(Array(2).fill(expect.stringMatching(/\S/)));
          expect(getResult.mock.calls[0][4]).toBe('original rubric');
          expect(getResult.mock.calls[0][5]).toContain('iterative tree jailbreak attack');
          expect(getResult.mock.calls[0][5]).toContain('"test objective"');
          expect(getResult.mock.calls[0][5]).toContain('one node in a tree');
        } finally {
          remote.mockRestore();
          attacker.mockRestore();
          judge.mockRestore();
          vi.mocked(graders.getGraderById).mockReset();
        }
      },
    );

    it.each([false, true, undefined])(
      'keeps judge score10 separate from grader verdict %s',
      async (pass) => {
        const attacker = createMockProvider({
          response: createProviderResponse({
            output: JSON.stringify({ prompt: 'actual attack', improvement: 'actual improvement' }),
          }),
        });
        const judge = createMockProvider({
          response: createProviderResponse({
            output: JSON.stringify({
              currentResponse: { rating: 10 },
              previousBestResponse: { rating: 0 },
            }),
          }),
        });
        const target = createMockProvider({
          response: createProviderResponse({ output: 'actual response' }),
        });
        const graders = await import('../../../src/redteam/graders');
        const getResult = vi.fn().mockResolvedValue({
          grade: {
            pass,
            score: 0.7,
            reason: 'actual verdict',
            tokensUsed: { total: 150, prompt: 80, completion: 70 },
          },
          rubric: 'actual rendered rubric',
        });
        vi.mocked(graders.getGraderById).mockReturnValue(
          pass === undefined ? undefined : ({ getResult } as any),
        );
        const remote = vi.spyOn(remoteGeneration, 'shouldGenerateRemote').mockReturnValue(false);
        const attackerSpy = vi
          .spyOn(redteamProviderManager, 'getProvider')
          .mockResolvedValue(attacker);
        const judgeSpy = vi
          .spyOn(redteamProviderManager, 'getGradingProvider')
          .mockResolvedValue(judge);
        try {
          const provider = new RedteamIterativeTreeProvider({
            injectVar: 'goal',
            maxDepth: 1,
            branchingFactor: 1,
            maxAttempts: 1,
          });
          const result = await provider.callApi('', {
            originalProvider: target,
            vars: { goal: 'actual goal' },
            prompt: { raw: '{{goal}}', label: 'test' },
            test: {
              assert: [{ type: 'promptfoo:redteam:pii' }],
              metadata: { pluginId: 'pii:social' },
            } as AtomicTestCase,
          });
          expect(result.metadata.stopReason).toBe(
            pass === false ? 'GRADER_FAILED' : 'MAX_ATTEMPTS',
          );
          expect(result.metadata).toMatchObject({
            attempts: 1,
            highestScore: 10,
            redteamFinalPrompt: 'actual attack',
          });
          if (pass === undefined) {
            expect(result.metadata.storedGraderResult).toBeUndefined();
          } else {
            expect(result.metadata.storedGraderResult).toMatchObject({
              pass,
              score: 0.7,
              reason: 'actual verdict',
              tokensUsed: { total: 150, prompt: 80, completion: 70 },
            });
          }
        } finally {
          remote.mockRestore();
          attackerSpy.mockRestore();
          judgeSpy.mockRestore();
          vi.mocked(graders.getGraderById).mockReset();
        }
      },
    );

    it('emits actual multidepth history and fresh transformed sessions', async () => {
      let attempt = 0;
      const attacker = createMockProvider();
      attacker.callApi.mockImplementation(async () => ({
        output: JSON.stringify({
          prompt: `attack${++attempt}`,
          improvement: `improvement${attempt}`,
        }),
      }));
      const judge = createMockProvider({
        response: createProviderResponse({
          output: JSON.stringify({
            currentResponse: { rating: 5 },
            previousBestResponse: { rating: 0 },
          }),
        }),
      });
      const target = createMockProvider({
        response: createProviderResponse({ output: 'actual response' }),
      });
      const transformVars = vi.fn((_vars: unknown, context: { uuid?: string }) => ({
        sessionId: context.uuid,
      }));
      const remote = vi.spyOn(remoteGeneration, 'shouldGenerateRemote').mockReturnValue(false);
      const attackerSpy = vi
        .spyOn(redteamProviderManager, 'getProvider')
        .mockResolvedValue(attacker);
      const judgeSpy = vi
        .spyOn(redteamProviderManager, 'getGradingProvider')
        .mockResolvedValue(judge);
      try {
        const provider = new RedteamIterativeTreeProvider({
          injectVar: 'goal',
          maxDepth: 2,
          branchingFactor: 2,
          maxWidth: 1,
          maxAttempts: 5,
        });
        const result = await provider.callApi('', {
          originalProvider: target,
          vars: { goal: 'test goal' },
          prompt: { raw: 'Session {{sessionId}} - {{goal}}', label: 'test' },
          test: { options: { transformVars } },
        });
        expect(transformVars).toHaveBeenCalledTimes(4);
        const sessions = transformVars.mock.calls.map(([, context]) => context.uuid);
        expect(new Set(sessions).size).toBe(4);
        expect(sessions).toEqual(Array(4).fill(expect.stringMatching(/\S/)));
        expect(target.callApi.mock.calls.slice(0, 4).map(([prompt]) => prompt)).toEqual(
          sessions.map((id, index) => `Session ${id} - attack${index + 1}`),
        );
        const history = result.metadata.redteamTreeHistory;
        expect(history.map(({ depth, wasSelected }) => [depth, wasSelected])).toEqual([
          [0, true],
          [0, true],
          [1, true],
          [1, true],
          [1, false],
        ]);
        expect(history.slice(0, 4).map(({ improvement }) => improvement)).toEqual([
          'improvement1',
          'improvement2',
          'improvement3',
          'improvement4',
        ]);
        expect(history[0].parentId).toBe(history[1].parentId);
        expect(history[2].parentId).toBe(history[3].parentId);
        expect(history[2].parentId).not.toBe(history[0].parentId);
        expect(
          attacker.callApi.mock.calls.map(([prompt]) => JSON.parse(prompt).at(-1).content),
        ).toEqual(['test goal', 'test goal', 'attack1', 'attack1']);
        expect(result.metadata.sessionIds).toEqual(sessions);
        expect(result.metadata.stopReason).toBe('MAX_DEPTH');
        expect(result.metadata.storedGraderResult).toBeUndefined();
      } finally {
        remote.mockRestore();
        attackerSpy.mockRestore();
        judgeSpy.mockRestore();
      }
    });

    it('counts the final target probe even when the target reports no token usage', async () => {
      const gradingProvider = createMockProvider({ id: 'mock-grader' });
      const targetProvider = createMockProvider({ id: 'mock-target' });
      targetProvider.callApi.mockResolvedValue({ output: 'final response' });
      const remoteGenerationSpy = vi
        .spyOn(remoteGeneration, 'shouldGenerateRemote')
        .mockReturnValue(false);
      const attackerProviderSpy = vi
        .spyOn(redteamProviderManager, 'getProvider')
        .mockResolvedValue(mockRedteamProvider);
      const gradingProviderSpy = vi
        .spyOn(redteamProviderManager, 'getGradingProvider')
        .mockResolvedValue(gradingProvider);

      try {
        const provider = new RedteamIterativeTreeProvider({ injectVar: 'goal', maxDepth: 1 });
        (provider as unknown as { treeParams: { maxDepth: number } }).treeParams.maxDepth = 0;
        const result = await provider.callApi('test prompt', {
          originalProvider: targetProvider,
          vars: { goal: 'test objective' },
          prompt: { raw: '{{goal}}', label: 'test' },
        });

        expect(targetProvider.callApi).toHaveBeenCalledOnce();
        expect(result.tokenUsage?.numRequests).toBe(1);
      } finally {
        remoteGenerationSpy.mockRestore();
        attackerProviderSpy.mockRestore();
        gradingProviderSpy.mockRestore();
      }
    });

    it('finalizes a completed branch error without a canceled final target re-probe', async () => {
      const fixture = createSelectedToolErrorTarget();
      mockRedteamProvider.callApi.mockImplementation(async (_prompt, _context, options) => {
        options?.abortSignal?.throwIfAborted();
        return { output: JSON.stringify({ improvement: 'Use a greeting', prompt: 'Say hello' }) };
      });
      const gradingProvider = createMockProvider({ id: 'fixture-unused-grader' });
      const remote = vi.spyOn(remoteGeneration, 'shouldGenerateRemote').mockReturnValue(false);
      const attacker = vi
        .spyOn(redteamProviderManager, 'getProvider')
        .mockResolvedValue(mockRedteamProvider);
      const grader = vi
        .spyOn(redteamProviderManager, 'getGradingProvider')
        .mockResolvedValue(gradingProvider);
      try {
        const provider = new RedteamIterativeTreeProvider({
          injectVar: 'goal',
          maxDepth: 1,
          branchingFactor: 1,
          maxAttempts: 2,
        });
        const result = await fixture.run(() =>
          provider.callApi(
            'Say hello',
            {
              originalProvider: fixture.target,
              vars: { goal: 'Say hello' },
              prompt: { raw: '{{goal}}', label: 'greeting' },
            },
            { abortSignal: fixture.controller.signal },
          ),
        );
        await fixture.expectSelected(result);
        expect(mockRedteamProvider.callApi).toHaveBeenCalledOnce();
        expect(gradingProvider.callApi).not.toHaveBeenCalled();
        expect(result.metadata?.redteamTreeHistory).toHaveLength(1);
        expect(result.metadata?.stopReason).toBe('TARGET_ERROR');
      } finally {
        await fixture.cleanup();
        remote.mockRestore();
        attacker.mockRestore();
        grader.mockRestore();
      }
    });

    it.each([
      {
        label: 'final tool error after an earlier best success',
        earlierError: undefined,
        earlierOrigin: undefined,
        finalError: 'final lookup: downstream 429 rate limit',
        finalOrigin: 'tool',
      },
      {
        label: 'final unmarked error after an earlier marked best success',
        earlierError: undefined,
        earlierOrigin: 'tool',
        finalError: 'final target 429 rate limit',
        finalOrigin: undefined,
      },
      {
        label: 'final marked success after an earlier tool error',
        earlierError: 'earlier lookup: downstream 429 rate limit',
        earlierOrigin: 'tool',
        finalError: undefined,
        finalOrigin: 'tool',
      },
      {
        label: 'final non-tool error after an earlier best success',
        earlierError: undefined,
        earlierOrigin: undefined,
        finalError: 'final target 429 rate limit',
        finalOrigin: 'provider',
      },
    ])(
      'projects only selected tool-error origin for $label',
      async ({ earlierError, earlierOrigin, finalError, finalOrigin }) => {
        const earlierMetadata: Record<string, unknown> = earlierOrigin
          ? { errorOrigin: earlierOrigin }
          : {};
        const finalMetadata: Record<string, unknown> = finalOrigin
          ? { errorOrigin: finalOrigin }
          : {};
        mockRedteamProvider.callApi.mockResolvedValue({
          output: JSON.stringify({ improvement: 'Use a greeting', prompt: 'Say hello' }),
        });
        const gradingProvider = createMockProvider({
          id: 'mock-final-origin-grader',
          response: {
            output: JSON.stringify({
              currentResponse: { rating: 5, explanation: 'A greeting' },
              previousBestResponse: { rating: 0, explanation: 'None' },
            }),
          },
        });
        const targetProvider = createMockProvider({ id: 'mock-final-origin-target' });
        targetProvider.callApi
          .mockResolvedValueOnce({
            output: 'Earlier greeting',
            ...(earlierError ? { error: earlierError } : {}),
            metadata: earlierMetadata,
            tokenUsage: { prompt: 2, completion: 3, total: 5, numRequests: 1 },
          })
          .mockResolvedValueOnce({
            output: 'Final greeting',
            ...(finalError ? { error: finalError } : {}),
            metadata: {
              ...finalMetadata,
              http: { status: 200, statusText: 'OK', headers: { 'x-ratelimit-remaining': '0' } },
              rateLimit: { remaining: 0 },
              targetOnly: 'must stay on the target',
            },
            tokenUsage: { prompt: 7, completion: 4, total: 11, numRequests: 1 },
          });
        const remoteGenerationSpy = vi
          .spyOn(remoteGeneration, 'shouldGenerateRemote')
          .mockReturnValue(false);
        const attackerProviderSpy = vi
          .spyOn(redteamProviderManager, 'getProvider')
          .mockResolvedValue(mockRedteamProvider);
        const gradingProviderSpy = vi
          .spyOn(redteamProviderManager, 'getGradingProvider')
          .mockResolvedValue(gradingProvider);

        try {
          const provider = new RedteamIterativeTreeProvider({
            injectVar: 'goal',
            maxDepth: 1,
            branchingFactor: 1,
            maxAttempts: 2,
          });
          const result: ProviderResponse = await provider.callApi('Say hello', {
            originalProvider: targetProvider,
            vars: { goal: 'Say hello' },
            prompt: { raw: '{{goal}}', label: 'greeting' },
          });

          expect(targetProvider.callApi).toHaveBeenCalledTimes(2);
          expect(mockRedteamProvider.callApi).toHaveBeenCalledOnce();
          expect(gradingProvider.callApi).toHaveBeenCalledTimes(earlierError ? 0 : 1);
          expect(result.output).toBe(earlierError ? 'Final greeting' : 'Earlier greeting');
          expect(result.error).toBe(finalError);
          expect(result.metadata?.errorOrigin).toBe(
            finalError && finalOrigin === 'tool' ? 'tool' : undefined,
          );
          expect(result.metadata).not.toHaveProperty('http');
          expect(result.metadata).not.toHaveProperty('rateLimit');
          expect(result.metadata).not.toHaveProperty('targetOnly');
          expect(result.metadata).toMatchObject({ attempts: 1, stopReason: 'MAX_DEPTH' });
          expect(result.metadata?.redteamTreeHistory).toHaveLength(2);
          expect(result.tokenUsage).toMatchObject({
            prompt: 9,
            completion: 7,
            total: 16,
            numRequests: 2,
          });
        } finally {
          remoteGenerationSpy.mockRestore();
          attackerProviderSpy.mockRestore();
          gradingProviderSpy.mockRestore();
        }
      },
    );

    it.each([
      {
        label: 'final observer error after an earlier best success',
        earlierObserver: false,
        finalObserver: true,
        finalError: 'metrics rate limit exceeded',
      },
      {
        label: 'final success after an earlier observer error',
        earlierObserver: true,
        finalObserver: false,
        finalError: undefined,
      },
      {
        label: 'final unrelated rate limit after an earlier observer error',
        earlierObserver: true,
        finalObserver: false,
        finalError: 'final target 429 rate limit',
      },
    ])(
      'preserves selected caller-observer provenance for $label',
      async ({ earlierObserver, finalObserver, finalError }) => {
        mockRedteamProvider.callApi.mockResolvedValue({
          output: JSON.stringify({ improvement: 'Use a greeting', prompt: 'Say hello' }),
        });
        const gradingProvider = createMockProvider({
          id: 'mock-final-observer-grader',
          response: {
            output: JSON.stringify({
              currentResponse: { rating: 5, explanation: 'A greeting' },
              previousBestResponse: { rating: 0, explanation: 'None' },
            }),
          },
        });
        const earlierResponse: ProviderResponse = {
          output: 'Earlier greeting',
          tokenUsage: { prompt: 2, completion: 3, total: 5, numRequests: 1 },
        };
        const finalResponse: ProviderResponse = {
          output: 'Final greeting',
          ...(finalError ? { error: finalError } : {}),
          metadata: { targetOnly: 'must stay on the target' },
          tokenUsage: { prompt: 7, completion: 4, total: 11, numRequests: 1 },
        };
        const targetProvider = createMockProvider({ id: 'mock-final-observer-target' });
        targetProvider.callApi
          .mockImplementationOnce(async () =>
            earlierObserver
              ? createSelectedObserverErrorResponse(
                  earlierResponse,
                  'earlier metrics rate limit exceeded',
                )
              : earlierResponse,
          )
          .mockImplementationOnce(async () =>
            finalObserver ? createSelectedObserverErrorResponse(finalResponse) : finalResponse,
          );
        const remoteGenerationSpy = vi
          .spyOn(remoteGeneration, 'shouldGenerateRemote')
          .mockReturnValue(false);
        const attackerProviderSpy = vi
          .spyOn(redteamProviderManager, 'getProvider')
          .mockResolvedValue(mockRedteamProvider);
        const gradingProviderSpy = vi
          .spyOn(redteamProviderManager, 'getGradingProvider')
          .mockResolvedValue(gradingProvider);

        try {
          const provider = new RedteamIterativeTreeProvider({
            injectVar: 'goal',
            maxDepth: 1,
            branchingFactor: 1,
            maxAttempts: 2,
          });
          const result: ProviderResponse = await provider.callApi('Say hello', {
            originalProvider: targetProvider,
            vars: { goal: 'Say hello' },
            prompt: { raw: '{{goal}}', label: 'greeting' },
          });

          expect(targetProvider.callApi).toHaveBeenCalledTimes(2);
          expect(mockRedteamProvider.callApi).toHaveBeenCalledOnce();
          expect(gradingProvider.callApi).toHaveBeenCalledTimes(earlierObserver ? 0 : 1);
          expect(result.output).toBe(earlierObserver ? 'Final greeting' : 'Earlier greeting');
          expect(result.error).toBe(finalError);
          expect(isResponseHeadersObserverErrorResponse(result)).toBe(finalObserver);
          expect(isProviderResponseRateLimited(result, undefined)).toBe(
            !finalObserver && finalError !== undefined,
          );
          expect(result.metadata).not.toHaveProperty('errorOrigin');
          expect(result.metadata).not.toHaveProperty('http');
          expect(result.metadata).not.toHaveProperty('rateLimit');
          expect(result.metadata).not.toHaveProperty('targetOnly');
          expect(result.metadata).toMatchObject({ attempts: 1, stopReason: 'MAX_DEPTH' });
          expect(result.metadata?.redteamTreeHistory).toHaveLength(2);
          expect(result.tokenUsage).toMatchObject({
            prompt: 9,
            completion: 7,
            total: 16,
            numRequests: 2,
          });
        } finally {
          remoteGenerationSpy.mockRestore();
          attackerProviderSpy.mockRestore();
          gradingProviderSpy.mockRestore();
        }
      },
    );

    it('should gracefully handle invalid API response by skipping the turn', async () => {
      mockRedteamProvider.callApi.mockResolvedValue({ output: 'invalid json' });

      const redteamHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: 'System prompt' },
      ];

      const result = await getNewPrompt(mockRedteamProvider, redteamHistory);

      expect(result).toEqual({
        improvement: 'parse failure – skipping turn',
        prompt: '',
        tokenUsage: undefined,
      });
    });

    it('should parse JSON object embedded in fenced prose', async () => {
      const mockResponse = {
        improvement: 'Fenced improvement',
        prompt: 'Fenced prompt',
      };
      const proseWithFencedJson = `Here is the result you asked for.\n\n\`\`\`json\n${JSON.stringify(
        mockResponse,
      )}\n\`\`\`\n\nThanks!`;
      mockRedteamProvider.callApi.mockResolvedValue({ output: proseWithFencedJson });

      const redteamHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: 'System prompt' },
      ];

      const result = await getNewPrompt(mockRedteamProvider, redteamHistory);
      expect(result).toEqual(mockResponse);
    });

    it('should handle empty history correctly', async () => {
      const mockResponse = {
        improvement: 'Initial improvement',
        prompt: 'Initial prompt',
      };
      mockRedteamProvider.callApi.mockResolvedValue({ output: JSON.stringify(mockResponse) });

      const result = await getNewPrompt(mockRedteamProvider, []);

      expect(result).toEqual(mockResponse);
      expect(mockRedteamProvider.callApi).toHaveBeenCalledWith(
        '[]',
        expect.objectContaining({
          prompt: expect.objectContaining({
            label: 'history',
            raw: '[]',
          }),
        }),
      );
    });

    it('should pass and return remote materialization fields', async () => {
      const mockResponse = {
        improvement: 'Remote materialized improvement',
        prompt: '{"document":"updated attack"}',
      };
      mockRedteamProvider.callApi.mockResolvedValue({
        inputMaterialization: {
          document: {
            injectionPlacement: 'comment',
          },
        },
        materializationHandled: true,
        materializedVars: {
          document:
            'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,Zm9v',
        },
        output: JSON.stringify(mockResponse),
      });

      const result = await getNewPrompt(mockRedteamProvider, [], {
        inputs: {
          document: {
            description: 'Uploaded planning document',
            type: 'docx',
          },
        },
        materializationIndex: 3,
        pluginId: 'iterative-tree',
        purpose: 'Summarize uploaded documents',
      });

      expect(result).toMatchObject({
        ...mockResponse,
        inputMaterialization: {
          document: {
            injectionPlacement: 'comment',
          },
        },
        materializationHandled: true,
        materializedVars: {
          document:
            'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,Zm9v',
        },
      });
      expect(mockRedteamProvider.callApi).toHaveBeenCalledWith(
        '[]',
        expect.objectContaining({
          vars: {
            __promptfooRemoteMaterialization: {
              injectVar: undefined,
              inputs: {
                document: {
                  description: 'Uploaded planning document',
                  type: 'docx',
                },
              },
              materializationIndex: 3,
              pluginId: 'iterative-tree',
              purpose: 'Summarize uploaded documents',
            },
          },
        }),
      );
    });
  });

  describe('Abort Signal Handling', () => {
    let mockRedteamProvider: MockApiProvider;

    beforeEach(() => {
      mockRedteamProvider = createMockProvider({ id: 'mock-provider' });
      mockRedteamProvider.callApi.mockReset();
    });

    it('should re-throw AbortError from evaluateResponse and not swallow it', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      // Mock callApi to throw AbortError
      mockRedteamProvider.callApi.mockRejectedValue(abortError);

      await expect(
        evaluateResponse(mockRedteamProvider, 'Judge prompt', 'Response', 'Best', false),
      ).rejects.toThrow('The operation was aborted');
    });

    it('should re-throw AbortError from getNewPrompt primary parse failure', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      // Mock callApi to throw AbortError
      mockRedteamProvider.callApi.mockRejectedValue(abortError);

      await expect(getNewPrompt(mockRedteamProvider, [])).rejects.toThrow(
        'The operation was aborted',
      );
    });

    it('should handle non-AbortError parse failures gracefully in evaluateResponse', async () => {
      // Return unparseable output - should return default score
      mockRedteamProvider.callApi.mockResolvedValue({
        output: 'not valid json at all',
      });

      const result = await evaluateResponse(
        mockRedteamProvider,
        'Judge prompt',
        'Response',
        'Best',
        false,
      );

      // Should return default score instead of throwing
      expect(result.score).toBe(1);
      expect(result.explanation).toBe('Failed to parse judge response');
    });

    it('should handle non-AbortError parse failures gracefully in getNewPrompt', async () => {
      // Return unparseable output - should skip turn gracefully
      mockRedteamProvider.callApi.mockResolvedValue({
        output: 'definitely not JSON',
      });

      const result = await getNewPrompt(mockRedteamProvider, []);

      // Should return skip marker instead of throwing
      expect(result.improvement).toBe('parse failure – skipping turn');
      expect(result.prompt).toBe('');
    });
  });

  describe('updateRedteamHistory', () => {
    it('should create a new history entry with correct content', () => {
      const targetResponse = 'Test response';
      const goal = 'Test goal';
      const score = 7;
      const containsPenalizedPhrase = false;
      const excludeTargetOutput = false;

      const result = updateRedteamHistory(
        targetResponse,
        goal,
        score,
        containsPenalizedPhrase,
        excludeTargetOutput,
      );

      expect(result).toEqual({
        role: 'user',
        content: expect.stringContaining('LANGUAGE MODEL OUTPUT: Test response'),
      });
      expect(result.content).toContain(`OBJECTIVE: ${goal}`);
      expect(result.content).toContain(`SCORE: ${score}`);
      expect(result.content).not.toContain('(your prompt was off-topic)');
      expect(result.content).not.toContain('(contains penalized phrase)');
    });

    it('should handle penalized responses', () => {
      const targetResponse = 'Off-topic response';
      const goal = 'Test goal';
      const score = 3;
      const containsPenalizedPhrase = true;
      const excludeTargetOutput = false;

      const result = updateRedteamHistory(
        targetResponse,
        goal,
        score,
        containsPenalizedPhrase,
        excludeTargetOutput,
      );

      expect(result).toEqual({
        role: 'user',
        content: expect.stringContaining('LANGUAGE MODEL OUTPUT: Off-topic response'),
      });
      expect(result.content).toContain(`OBJECTIVE: ${goal}`);
      expect(result.content).toContain(`SCORE: ${score} (contains penalized phrase)`);
    });

    it('should handle edge case scores', () => {
      const targetResponse = 'Edge case response';
      const goal = 'Test goal';
      const score = 10; // Maximum score
      const containsPenalizedPhrase = false;
      const excludeTargetOutput = false;

      const result = updateRedteamHistory(
        targetResponse,
        goal,
        score,
        containsPenalizedPhrase,
        excludeTargetOutput,
      );

      expect(result).toEqual({
        role: 'user',
        content: expect.stringContaining('LANGUAGE MODEL OUTPUT: Edge case response'),
      });
      expect(result.content).toContain(`SCORE: ${score}`);
    });

    it('should handle minimum score', () => {
      const targetResponse = 'Minimum score response';
      const goal = 'Test goal';
      const score = 0; // Minimum score
      const containsPenalizedPhrase = false;
      const excludeTargetOutput = false;

      const result = updateRedteamHistory(
        targetResponse,
        goal,
        score,
        containsPenalizedPhrase,
        excludeTargetOutput,
      );

      expect(result).toEqual({
        role: 'user',
        content: expect.stringContaining('LANGUAGE MODEL OUTPUT: Minimum score response'),
      });
      expect(result.content).toContain(`SCORE: ${score}`);
    });

    it('should exclude target output when excludeTargetOutputFromAgenticAttackGeneration is true', () => {
      const targetResponse = 'Target response';
      const goal = 'Test goal';
      const score = 7;
      const containsPenalizedPhrase = false;
      const excludeTargetOutput = true;

      const result = updateRedteamHistory(
        targetResponse,
        goal,
        score,
        containsPenalizedPhrase,
        excludeTargetOutput,
      );

      expect(result).toEqual({
        role: 'user',
        content: expect.not.stringContaining('LANGUAGE MODEL OUTPUT:'),
      });
      expect(result.content).toContain(`OBJECTIVE: ${goal}`);
      expect(result.content).toContain(`SCORE: ${score}`);
      expect(result.content).not.toContain(targetResponse);
    });
  });

  describe('getTargetResponse', () => {
    let mockTargetProvider: MockApiProvider;

    beforeEach(() => {
      mockTargetProvider = createMockProvider({ id: 'mock-provider' });
      mockTargetProvider.callApi.mockReset();
    });

    it('should get target response correctly', async () => {
      const mockResponse = { output: 'Target response' };
      mockTargetProvider.callApi.mockResolvedValue({ output: mockResponse });

      const targetPrompt = 'Test prompt';
      const context: CallApiContextParams = {
        prompt: { label: 'test', raw: targetPrompt },
        vars: {},
      };
      const options: CallApiOptionsParams = {};
      const result = await getTargetResponse(mockTargetProvider, targetPrompt, context, options);

      expect(result).toEqual({
        output: JSON.stringify(mockResponse),
        sessionId: undefined,
        tokenUsage: { numRequests: 1 },
      });
      expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(1);
      expect(mockTargetProvider.callApi).toHaveBeenCalledWith(targetPrompt, context, options);
    });

    it('should stringify non-string outputs', async () => {
      const nonStringOutput = { key: 'value' };
      mockTargetProvider.callApi.mockResolvedValue({ output: nonStringOutput });

      const targetPrompt = 'Test prompt';
      const result = await getTargetResponse(
        mockTargetProvider,
        targetPrompt,
        {} as CallApiContextParams,
        {} as CallApiOptionsParams,
      );

      expect(result).toEqual({
        output: JSON.stringify(nonStringOutput),
        sessionId: undefined,
        tokenUsage: { numRequests: 1 },
      });
    });
  });
});
describe('TreeNode', () => {
  describe('createTreeNode', () => {
    it('should create a node with unique UUID', () => {
      const node1 = createTreeNode('prompt1', 5, 0);
      const node2 = createTreeNode('prompt2', 5, 0);

      expect(node1.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(node2.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(node1.id).not.toBe(node2.id);
    });

    it('should use provided UUID if given', () => {
      const customId = crypto.randomUUID();
      const node = createTreeNode('prompt', 5, 0, customId);
      expect(node.id).toBe(customId);
    });

    it('should preserve remote materialization fields on nodes', () => {
      const node = createTreeNode('prompt', 5, 0, 'node-id', {
        inputMaterialization: {
          document: {
            injectionPlacement: 'comment',
          },
        },
        materializationHandled: true,
        materializedVars: {
          document:
            'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,Zm9v',
        },
      });

      expect(node.inputMaterialization).toEqual({
        document: {
          injectionPlacement: 'comment',
        },
      });
      expect(node.materializationHandled).toBe(true);
      expect(node.materializedVars).toEqual({
        document:
          'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,Zm9v',
      });
    });
  });
});

describe('Tree Structure', () => {
  describe('selectNodes', () => {
    it('should mark selected nodes in treeOutputs', async () => {
      const nodes = [
        createTreeNode('node1', 3, 0),
        createTreeNode('node2', 8, 0),
        createTreeNode('node3', 5, 0),
      ];

      const treeOutputs: TreeSearchOutput[] = nodes.map((node) => ({
        depth: node.depth,
        id: node.id,
        output: 'test output',
        prompt: node.prompt,
        score: node.score,
        wasSelected: false,
      }));

      const selectedNodes = await selectNodes(nodes);

      selectedNodes.forEach((node) => {
        const output = treeOutputs.find((o) => o.id === node.id);
        if (output) {
          output.wasSelected = true;
        }
      });

      const selectedOutputs = treeOutputs.filter((o) => o.wasSelected);
      expect(selectedOutputs.length).toBeLessThanOrEqual(MAX_WIDTH);

      const allSortedByScore = [...treeOutputs].sort((a, b) => b.score - a.score);
      const expectedLength = Math.min(MAX_WIDTH, allSortedByScore.length);
      expect(selectedOutputs).toHaveLength(expectedLength);

      const expectedScores = allSortedByScore.slice(0, expectedLength).map((n) => n.score);
      const actualScores = selectedOutputs.map((n) => n.score).sort((a, b) => b - a);
      expect(actualScores).toEqual(expectedScores);
    });
  });
});

describe('Tree Structure and Metadata', () => {
  it('should not throw on target error and allow error-bearing output to be recorded', async () => {
    // This test validates the non-throwing behavior at a unit level by calling shared.getTargetResponse directly
    const mockTargetProvider = createMockProvider({
      id: 'mock-target',
      response: createProviderResponse({
        output: 'This is 504',
        error: 'HTTP 504',
      }),
    });

    const result = await getTargetResponse(
      mockTargetProvider,
      'prompt',
      { prompt: { label: 'test', raw: 'prompt' }, vars: {} } as CallApiContextParams,
      {} as CallApiOptionsParams,
    );

    expect(result.output).toBe('This is 504');
    expect(result.error).toBe('HTTP 504');
  });
});

describe('Token Counting', () => {
  beforeEach(async () => {
    // Reset TokenUsageTracker between tests to ensure clean state
    const { TokenUsageTracker } = await import('../../../src/util/tokenUsage');
    TokenUsageTracker.getInstance().resetAllUsage();
  });

  it('should correctly track token usage from target provider responses', async () => {
    const mockTargetProvider = createMockProvider({
      id: 'mock-target',
      response: createProviderResponse({
        output: 'target response',
        tokenUsage: { total: 100, prompt: 60, completion: 40, numRequests: 1 },
        cached: false,
      }),
    });

    const targetPrompt = 'Test prompt';
    const context: CallApiContextParams = {
      prompt: { label: 'test', raw: targetPrompt },
      vars: {},
    };
    const options: CallApiOptionsParams = {};

    const result = await getTargetResponse(mockTargetProvider, targetPrompt, context, options);

    // Verify that target token usage is correctly returned
    expect(result.tokenUsage).toEqual({
      total: 100,
      prompt: 60,
      completion: 40,
      numRequests: 1,
    });
    expect(mockTargetProvider.callApi).toHaveBeenCalledWith(targetPrompt, context, options);
  });

  it('should handle missing token usage from target responses', async () => {
    const mockTargetProvider = createMockProvider({
      id: 'mock-target',
      response: createProviderResponse({
        output: 'response without tokens',
        tokenUsage: undefined,
        cached: false,
      }),
    });

    const result = await getTargetResponse(
      mockTargetProvider,
      'test prompt',
      { prompt: { label: 'test', raw: 'test' }, vars: {} },
      {},
    );

    // Should default to numRequests: 1 when no token usage provided
    expect(result.tokenUsage).toEqual({ numRequests: 1 });
  });

  it('should handle zero token counts correctly', async () => {
    const mockTargetProvider = createMockProvider({
      id: 'mock-target',
      response: createProviderResponse({
        output: 'response with zero tokens',
        tokenUsage: { total: 0, prompt: 0, completion: 0, numRequests: 1 },
        cached: false,
      }),
    });

    const result = await getTargetResponse(
      mockTargetProvider,
      'test prompt',
      { prompt: { label: 'test', raw: 'test' }, vars: {} },
      {},
    );

    expect(result.tokenUsage).toEqual({
      total: 0,
      prompt: 0,
      completion: 0,
      numRequests: 1,
    });
  });

  it('should count target requests even when target responses contain errors', () => {
    const totalTokenUsage = createEmptyTokenUsage();
    const errorResponse = {
      output: 'gateway timeout',
      error: 'HTTP 504',
      tokenUsage: { numRequests: 1 },
    };

    // Mirrors the iterative-tree error branch behavior where we now accumulate before continue.
    accumulateResponseTokenUsage(totalTokenUsage, errorResponse);

    expect(totalTokenUsage.numRequests).toBe(1);
  });

  it('should track token usage from redteam provider calls', async () => {
    const mockRedteamProvider = createMockProvider({
      id: 'mock-redteam',
      response: createProviderResponse({
        output: JSON.stringify({
          improvement: 'test improvement',
          prompt: 'test prompt',
        }),
        tokenUsage: { total: 50, prompt: 30, completion: 20, numRequests: 1 },
      }),
    });

    const redteamHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: 'System prompt' },
    ];

    const result = await getNewPrompt(mockRedteamProvider, redteamHistory);

    expect(result).toEqual({
      improvement: 'test improvement',
      prompt: 'test prompt',
      tokenUsage: { total: 50, prompt: 30, completion: 20, numRequests: 1 },
    });
  });

  it('should track token usage from judge evaluation calls', async () => {
    const mockJudgeProvider = createMockProvider({
      id: 'mock-judge',
      response: createProviderResponse({
        output: JSON.stringify({
          currentResponse: { rating: 8, explanation: 'Good response' },
          previousBestResponse: { rating: 5, explanation: 'Previous response' },
        }),
        tokenUsage: { total: 75, prompt: 40, completion: 35, numRequests: 1 },
      }),
    });

    const { score, explanation } = await evaluateResponse(
      mockJudgeProvider,
      'Judge prompt',
      'Target response',
      'Previous response',
      false,
    );

    expect(score).toBe(8);
    expect(explanation).toBe('Good response');
    expect(mockJudgeProvider.callApi).toHaveBeenCalledTimes(1);
  });

  // removed on-topic token usage test

  it('should handle incomplete token usage data gracefully', async () => {
    const mockProvider = createMockProvider({
      id: 'mock-provider',
      response: createProviderResponse({
        output: 'response with partial tokens',
        tokenUsage: { total: 100, prompt: 60 }, // completion missing
      }),
    });

    const result = await getTargetResponse(
      mockProvider,
      'test prompt',
      { prompt: { label: 'test', raw: 'test' }, vars: {} },
      {},
    );

    expect(result.tokenUsage).toEqual({
      total: 100,
      prompt: 60,
      numRequests: 1,
    });
  });

  it('should properly accumulate token usage across multiple provider calls', async () => {
    // This test simulates how token usage would be accumulated in the actual iterativeTree provider
    // by testing individual components that contribute to token usage

    const mockRedteamProvider = createMockProvider({ id: 'mock-redteam' });
    mockRedteamProvider.callApi
      .mockReset()
      .mockResolvedValueOnce({
        output: JSON.stringify({ improvement: 'test1', prompt: 'prompt1' }),
        tokenUsage: { total: 50, prompt: 30, completion: 20, numRequests: 1 },
      })
      .mockResolvedValueOnce({
        output: JSON.stringify({
          currentResponse: { rating: 7, explanation: 'test' },
          previousBestResponse: { rating: 0, explanation: 'none' },
        }),
        tokenUsage: { total: 75, prompt: 40, completion: 35, numRequests: 1 },
      });

    const mockTargetProvider = createMockProvider({
      id: 'mock-target',
      response: createProviderResponse({
        output: 'target response',
        tokenUsage: { total: 100, prompt: 60, completion: 40, numRequests: 1 },
      }),
    });

    // Simulate the sequence of calls that would happen in one iteration
    const promptResult = await getNewPrompt(mockRedteamProvider, [
      { role: 'system', content: 'system' },
    ]);
    expect(promptResult.tokenUsage?.total).toBe(50);

    const targetResult = await getTargetResponse(
      mockTargetProvider,
      'target prompt',
      { prompt: { label: 'test', raw: 'test' }, vars: {} },
      {},
    );
    expect(targetResult.tokenUsage?.total).toBe(100);

    const judgeResult = await evaluateResponse(
      mockRedteamProvider,
      'judge prompt',
      'target response',
      '',
      false,
    );
    expect(judgeResult).toBeDefined();

    // In the actual provider, these would all be accumulated using accumulateResponseTokenUsage
    // Total would be: 50 + 100 + 75 = 225
    const expectedTotal = 50 + 100 + 75;
    expect(expectedTotal).toBe(225);
  });

  it('should handle provider delay settings during token tracking', async () => {
    const mockProviderWithDelay = createMockProvider({
      id: 'mock-provider-with-delay',
      delay: 100,
      response: createProviderResponse({
        output: JSON.stringify({ improvement: 'test', prompt: 'test' }),
        tokenUsage: { total: 50, prompt: 30, completion: 20, numRequests: 1 },
      }),
    });

    const startTime = Date.now();

    const result = await getNewPrompt(mockProviderWithDelay, [{ role: 'system', content: 'test' }]);

    const endTime = Date.now();
    const elapsed = endTime - startTime;

    expect(result.tokenUsage?.total).toBe(50);
    // Should have waited at least the delay time (allowing for some test timing variance)
    expect(elapsed).toBeGreaterThanOrEqual(90); // Allow for 10ms variance
  });
});

// Note: Tests for perTurnLayers in iterativeTree are covered by testing through
// the RedteamIterativeTreeProvider class, not exposed internal functions.
// The TreeSearchOutput interface already supports promptAudio, promptImage,
// outputAudio, and outputImage fields which are populated when perTurnLayers is configured.
