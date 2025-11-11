import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMemo } from 'react';
import type { ResultsFile, EvaluateResult } from '@promptfoo/types';

describe('Report filtering logic', () => {
  const createMockResult = (promptIdx: number, pluginId: string, pass: boolean): EvaluateResult =>
    ({
      promptIdx,
      success: pass,
      gradingResult: { pass },
      prompt: { raw: 'test', label: 'test' },
      response: { output: 'test output' },
      vars: { prompt: 'test prompt' },
      provider: {
        id: `provider-${promptIdx}`,
        label: `Provider ${promptIdx}`,
      },
      metadata: {
        pluginId,
      },
    }) as unknown as EvaluateResult;

  const createMockEvalData = (numPrompts: number, results: EvaluateResult[]): ResultsFile =>
    ({
      version: 4,
      createdAt: '2025-01-01T00:00:00Z',
      config: { redteam: {} },
      prompts: Array.from({ length: numPrompts }, (_, i) => ({
        id: `prompt-${i}`,
        raw: '{{prompt}}',
        label: `Prompt ${i}`,
        provider: `Provider ${i}`,
      })),
      results: {
        version: 3,
        timestamp: '2025-01-01T00:00:00Z',
        results,
      },
    }) as unknown as ResultsFile;

  describe('failuresByPlugin filtering', () => {
    it('should include all failures when only one prompt exists', () => {
      const results = [
        createMockResult(0, 'plugin1', false),
        createMockResult(0, 'plugin2', false),
      ];
      const evalData = createMockEvalData(1, results);
      const selectedPromptIndex = 0;

      // Simulate the useMemo logic
      const { result } = renderHook(() =>
        useMemo(() => {
          if (!evalData) {
            return {};
          }

          const prompts = evalData.prompts || [];
          const selectedPrompt = prompts[selectedPromptIndex];

          const failures: Record<string, any[]> = {};
          evalData.results.results.forEach((result) => {
            // Filter by selected target/provider if multiple targets exist
            if (prompts.length > 1 && selectedPrompt && result.promptIdx !== selectedPromptIndex) {
              return;
            }

            const pluginId = result.metadata?.pluginId;
            if (!pluginId) {
              return;
            }

            if (!result.success || !result.gradingResult?.pass) {
              if (!failures[pluginId]) {
                failures[pluginId] = [];
              }
              failures[pluginId].push(result);
            }
          });
          return failures;
        }, [evalData, selectedPromptIndex]),
      );

      expect(Object.keys(result.current)).toHaveLength(2);
      expect(result.current['plugin1']).toHaveLength(1);
      expect(result.current['plugin2']).toHaveLength(1);
    });

    it('should filter failures by promptIdx when multiple prompts exist', () => {
      const results = [
        createMockResult(0, 'plugin1', false), // Failure for prompt 0
        createMockResult(1, 'plugin1', false), // Failure for prompt 1
        createMockResult(0, 'plugin2', false), // Failure for prompt 0
        createMockResult(1, 'plugin2', true), // Pass for prompt 1
      ];
      const evalData = createMockEvalData(2, results);

      // Test selecting prompt 0
      const { result: result0 } = renderHook(() =>
        useMemo(() => {
          if (!evalData) {
            return {};
          }

          const prompts = evalData.prompts || [];
          const selectedPrompt = prompts[0];

          const failures: Record<string, any[]> = {};
          evalData.results.results.forEach((result) => {
            if (prompts.length > 1 && selectedPrompt && result.promptIdx !== 0) {
              return;
            }

            const pluginId = result.metadata?.pluginId;
            if (!pluginId) {
              return;
            }

            if (!result.success || !result.gradingResult?.pass) {
              if (!failures[pluginId]) {
                failures[pluginId] = [];
              }
              failures[pluginId].push(result);
            }
          });
          return failures;
        }, [evalData]),
      );

      // Should only include failures from prompt 0
      expect(Object.keys(result0.current)).toHaveLength(2);
      expect(result0.current['plugin1']).toHaveLength(1);
      expect(result0.current['plugin1'][0].promptIdx).toBe(0);
      expect(result0.current['plugin2']).toHaveLength(1);
      expect(result0.current['plugin2'][0].promptIdx).toBe(0);

      // Test selecting prompt 1
      const { result: result1 } = renderHook(() =>
        useMemo(() => {
          if (!evalData) {
            return {};
          }

          const prompts = evalData.prompts || [];
          const selectedPrompt = prompts[1];

          const failures: Record<string, any[]> = {};
          evalData.results.results.forEach((result) => {
            if (prompts.length > 1 && selectedPrompt && result.promptIdx !== 1) {
              return;
            }

            const pluginId = result.metadata?.pluginId;
            if (!pluginId) {
              return;
            }

            if (!result.success || !result.gradingResult?.pass) {
              if (!failures[pluginId]) {
                failures[pluginId] = [];
              }
              failures[pluginId].push(result);
            }
          });
          return failures;
        }, [evalData]),
      );

      // Should only include failures from prompt 1
      expect(Object.keys(result1.current)).toHaveLength(1);
      expect(result1.current['plugin1']).toHaveLength(1);
      expect(result1.current['plugin1'][0].promptIdx).toBe(1);
      expect(result1.current['plugin2']).toBeUndefined(); // Prompt 1 passed plugin2
    });
  });

  describe('categoryStats filtering', () => {
    it('should filter category stats by promptIdx when multiple prompts exist', () => {
      const results = [
        createMockResult(0, 'harmful:violent-crime', false),
        createMockResult(1, 'harmful:violent-crime', true),
        createMockResult(0, 'pii:direct', true),
        createMockResult(1, 'pii:direct', false),
      ];
      const evalData = createMockEvalData(2, results);

      // Test selecting prompt 0
      const { result: result0 } = renderHook(() =>
        useMemo(() => {
          if (!evalData) {
            return {};
          }

          const prompts = evalData.prompts || [];
          const selectedPrompt = prompts[0];

          return evalData.results.results.reduce(
            (acc, row) => {
              if (prompts.length > 1 && selectedPrompt && row.promptIdx !== 0) {
                return acc;
              }

              const pluginId = row.metadata?.pluginId;
              if (!pluginId) {
                return acc;
              }

              if (!acc[pluginId]) {
                acc[pluginId] = { pass: 0, fail: 0, error: 0 };
              }

              if (row.success && row.gradingResult?.pass) {
                acc[pluginId].pass++;
              } else {
                acc[pluginId].fail++;
              }

              return acc;
            },
            {} as Record<string, { pass: number; fail: number; error: number }>,
          );
        }, [evalData]),
      );

      // Prompt 0: violent-crime failed, pii:direct passed
      expect(result0.current['harmful:violent-crime']).toEqual({
        pass: 0,
        fail: 1,
        error: 0,
      });
      expect(result0.current['pii:direct']).toEqual({ pass: 1, fail: 0, error: 0 });

      // Test selecting prompt 1
      const { result: result1 } = renderHook(() =>
        useMemo(() => {
          if (!evalData) {
            return {};
          }

          const prompts = evalData.prompts || [];
          const selectedPrompt = prompts[1];

          return evalData.results.results.reduce(
            (acc, row) => {
              if (prompts.length > 1 && selectedPrompt && row.promptIdx !== 1) {
                return acc;
              }

              const pluginId = row.metadata?.pluginId;
              if (!pluginId) {
                return acc;
              }

              if (!acc[pluginId]) {
                acc[pluginId] = { pass: 0, fail: 0, error: 0 };
              }

              if (row.success && row.gradingResult?.pass) {
                acc[pluginId].pass++;
              } else {
                acc[pluginId].fail++;
              }

              return acc;
            },
            {} as Record<string, { pass: number; fail: number; error: number }>,
          );
        }, [evalData]),
      );

      // Prompt 1: violent-crime passed, pii:direct failed
      expect(result1.current['harmful:violent-crime']).toEqual({
        pass: 1,
        fail: 0,
        error: 0,
      });
      expect(result1.current['pii:direct']).toEqual({ pass: 0, fail: 1, error: 0 });
    });
  });

  describe('target selector behavior', () => {
    it('should not filter results when only one prompt exists', () => {
      const results = [
        createMockResult(0, 'plugin1', false),
        createMockResult(0, 'plugin2', true),
        createMockResult(0, 'plugin3', false),
      ];
      const evalData = createMockEvalData(1, results);
      const selectedPromptIndex = 0;

      const { result } = renderHook(() =>
        useMemo(() => {
          if (!evalData) {
            return {};
          }

          const prompts = evalData.prompts || [];
          const selectedPrompt = prompts[selectedPromptIndex];

          const failures: Record<string, any[]> = {};
          evalData.results.results.forEach((result) => {
            // Filter by selected target/provider if multiple targets exist
            if (prompts.length > 1 && selectedPrompt && result.promptIdx !== selectedPromptIndex) {
              return;
            }

            const pluginId = result.metadata?.pluginId;
            if (!pluginId) {
              return;
            }

            if (!result.success || !result.gradingResult?.pass) {
              if (!failures[pluginId]) {
                failures[pluginId] = [];
              }
              failures[pluginId].push(result);
            }
          });
          return failures;
        }, [evalData, selectedPromptIndex]),
      );

      // All failures should be included since there's only one prompt
      expect(Object.keys(result.current)).toHaveLength(2);
      expect(result.current['plugin1']).toHaveLength(1);
      expect(result.current['plugin3']).toHaveLength(1);
    });

    it('should handle edge case when selectedPromptIndex is out of bounds', () => {
      const results = [
        createMockResult(0, 'plugin1', false),
        createMockResult(1, 'plugin1', false),
      ];
      const evalData = createMockEvalData(2, results);
      const selectedPromptIndex = 999; // Out of bounds

      const { result } = renderHook(() =>
        useMemo(() => {
          if (!evalData) {
            return {};
          }

          const prompts = evalData.prompts || [];
          const selectedPrompt = prompts[selectedPromptIndex]; // undefined

          const failures: Record<string, any[]> = {};
          evalData.results.results.forEach((result) => {
            // Should handle undefined selectedPrompt gracefully
            if (prompts.length > 1 && selectedPrompt && result.promptIdx !== selectedPromptIndex) {
              return;
            }

            const pluginId = result.metadata?.pluginId;
            if (!pluginId) {
              return;
            }

            if (!result.success || !result.gradingResult?.pass) {
              if (!failures[pluginId]) {
                failures[pluginId] = [];
              }
              failures[pluginId].push(result);
            }
          });
          return failures;
        }, [evalData, selectedPromptIndex]),
      );

      // When selectedPrompt is undefined, filtering is skipped, so all failures included
      expect(Object.keys(result.current)).toHaveLength(1);
      expect(result.current['plugin1']).toHaveLength(2);
    });

    it('should correctly identify provider labels for each prompt', () => {
      const results = [
        createMockResult(0, 'plugin1', false),
        createMockResult(1, 'plugin1', false),
      ];
      const evalData = createMockEvalData(2, results);

      // Verify the mock data structure includes provider labels
      expect(evalData.prompts?.[0].provider).toBe('Provider 0');
      expect(evalData.prompts?.[1].provider).toBe('Provider 1');
      expect(evalData.prompts?.[0].label).toBe('Prompt 0');
      expect(evalData.prompts?.[1].label).toBe('Prompt 1');
    });
  });

  describe('passesByPlugin filtering', () => {
    it('should filter passes by promptIdx when multiple prompts exist', () => {
      const results = [
        createMockResult(0, 'plugin1', true), // Pass for prompt 0
        createMockResult(1, 'plugin1', false), // Fail for prompt 1
        createMockResult(0, 'plugin2', false), // Fail for prompt 0
        createMockResult(1, 'plugin2', true), // Pass for prompt 1
      ];
      const evalData = createMockEvalData(2, results);

      // Test selecting prompt 0
      const { result: result0 } = renderHook(() =>
        useMemo(() => {
          if (!evalData) {
            return {};
          }

          const prompts = evalData.prompts || [];
          const selectedPrompt = prompts[0];

          const passes: Record<string, any[]> = {};
          evalData.results.results.forEach((result) => {
            if (prompts.length > 1 && selectedPrompt && result.promptIdx !== 0) {
              return;
            }

            const pluginId = result.metadata?.pluginId;
            if (!pluginId) {
              return;
            }

            if (result.success && result.gradingResult?.pass) {
              if (!passes[pluginId]) {
                passes[pluginId] = [];
              }
              passes[pluginId].push(result);
            }
          });
          return passes;
        }, [evalData]),
      );

      // Prompt 0: plugin1 passed, plugin2 failed
      expect(Object.keys(result0.current)).toHaveLength(1);
      expect(result0.current['plugin1']).toHaveLength(1);
      expect(result0.current['plugin1'][0].promptIdx).toBe(0);
      expect(result0.current['plugin2']).toBeUndefined();

      // Test selecting prompt 1
      const { result: result1 } = renderHook(() =>
        useMemo(() => {
          if (!evalData) {
            return {};
          }

          const prompts = evalData.prompts || [];
          const selectedPrompt = prompts[1];

          const passes: Record<string, any[]> = {};
          evalData.results.results.forEach((result) => {
            if (prompts.length > 1 && selectedPrompt && result.promptIdx !== 1) {
              return;
            }

            const pluginId = result.metadata?.pluginId;
            if (!pluginId) {
              return;
            }

            if (result.success && result.gradingResult?.pass) {
              if (!passes[pluginId]) {
                passes[pluginId] = [];
              }
              passes[pluginId].push(result);
            }
          });
          return passes;
        }, [evalData]),
      );

      // Prompt 1: plugin1 failed, plugin2 passed
      expect(Object.keys(result1.current)).toHaveLength(1);
      expect(result1.current['plugin2']).toHaveLength(1);
      expect(result1.current['plugin2'][0].promptIdx).toBe(1);
      expect(result1.current['plugin1']).toBeUndefined();
    });
  });
});
