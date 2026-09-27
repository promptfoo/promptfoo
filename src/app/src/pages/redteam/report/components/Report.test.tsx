import { useMemo } from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { mockCallApiResponse } from '@app/tests/apiMocks';
import { mockWindowLocation } from '@app/tests/browserMocks';
import { callApi } from '@app/utils/api';
import { ResultFailureReason } from '@promptfoo/types';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import App from './Report';
import type { EvaluateResult, GradingResult, ResultsFile } from '@promptfoo/types';

// Helper to render with all needed providers
const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <TooltipProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </TooltipProvider>,
  );
};

vi.mock('@app/utils/api');
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});
vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: vi.fn(),
  }),
}));

vi.mock('./Overview', () => ({
  default: ({ categoryStats }: { categoryStats: any }) => {
    const total = Object.values(categoryStats).reduce(
      (sum: number, stat: any) => sum + stat.total,
      0,
    );
    const passes = Object.values(categoryStats).reduce(
      (sum: number, stat: any) => sum + stat.pass,
      0,
    );
    const failures = total - passes;
    return (
      <div>
        <div data-testid="overview-total">{total}</div>
        <div data-testid="overview-passes">{passes}</div>
        <div data-testid="overview-failures">{failures}</div>
        <div data-testid="overview-category-stats">{JSON.stringify(categoryStats)}</div>
      </div>
    );
  },
}));
vi.mock('@app/components/EnterpriseBanner', () => ({ default: () => null }));
vi.mock('./StrategyStats', () => ({ default: () => null }));
const reportGroupings = vi.hoisted(() => vi.fn());
vi.mock('./RiskCategories', () => ({
  default: (props: unknown) => {
    reportGroupings(props);
    return null;
  },
}));
vi.mock('./TestSuites', () => ({ default: () => null }));
vi.mock('./FrameworkCompliance', () => ({ default: () => null }));
vi.mock('./ReportDownloadButton', () => ({ default: () => null }));
vi.mock('./ReportSettingsDialogButton', () => ({ default: () => null }));
vi.mock('./ToolsDialog', () => ({ default: () => null }));

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
        // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
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
        // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
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
        // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
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
        // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
        useMemo(() => {
          if (!evalData) {
            return {};
          }

          const prompts = evalData.prompts || [];
          const selectedPrompt = prompts[0];

          return evalData.results.results.reduce<
            Record<string, { pass: number; fail: number; error: number }>
          >((acc, row) => {
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
          }, {});
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
        // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
        useMemo(() => {
          if (!evalData) {
            return {};
          }

          const prompts = evalData.prompts || [];
          const selectedPrompt = prompts[1];

          return evalData.results.results.reduce<
            Record<string, { pass: number; fail: number; error: number }>
          >((acc, row) => {
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
          }, {});
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
        // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
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
        // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
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
      expect(evalData.prompts?.[0]?.provider).toBe('Provider 0');
      expect(evalData.prompts?.[1]?.provider).toBe('Provider 1');
      expect(evalData.prompts?.[0]?.label).toBe('Prompt 0');
      expect(evalData.prompts?.[1]?.label).toBe('Prompt 1');
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
        // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
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
        // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
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

const createComponentMockResult = (
  promptIdx: number,
  pluginId: string,
  pass: boolean,
  componentResults?: GradingResult[],
): EvaluateResult =>
  ({
    promptIdx,
    promptId: `prompt-${promptIdx}`,
    success: pass,
    failureReason: pass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
    gradingResult: { pass, componentResults },
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
    testCase: {},
    score: pass ? 1 : 0,
    latencyMs: 1,
    namedScores: {},
    tokenUsage: { prompt: 1, completion: 1, total: 2 },
  }) as unknown as EvaluateResult;

const createComponentMockEvalData = (
  numPrompts: number,
  results: EvaluateResult[],
  numRequests = 10,
): ResultsFile =>
  ({
    version: 4,
    createdAt: '2025-01-01T00:00:00Z',
    config: { redteam: {} },
    prompts: Array.from({ length: numPrompts }, (_, i) => ({
      id: `prompt-${i}`,
      raw: '{{prompt}}',
      label: `Prompt ${i}`,
      provider: `Provider ${i}`,
      metrics: { tokenUsage: { total: 100, numRequests } },
    })),
    results: {
      version: 3,
      timestamp: '2025-01-01T00:00:00Z',
      results,
    },
  }) as unknown as ResultsFile;

describe('App component target selection', () => {
  const mockCallApi = callApi as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowLocation({ search: '?evalId=test-eval-id' });
  });

  it('should handle evalData with empty prompts array and non-zero selectedPromptIndex gracefully', async () => {
    const evalData: ResultsFile = {
      version: 4,
      createdAt: '2025-01-01T00:00:00Z',
      config: { redteam: {} },
      prompts: [],
      results: {
        version: 3,
        timestamp: '2025-01-01T00:00:00Z',
        results: [createComponentMockResult(0, 'plugin1', false)],
      },
    } as unknown as ResultsFile;
    mockCallApi.mockResolvedValue({
      json: () => Promise.resolve({ data: evalData }),
    });

    renderWithProviders(<App />);

    const overviewTotal = await screen.findByTestId('overview-total');
    expect(overviewTotal).toHaveTextContent('1');
  });

  it('should update displayed statistics when a different target is selected', async () => {
    const results = [
      createComponentMockResult(0, 'plugin1', true),
      createComponentMockResult(0, 'plugin2', false),
      createComponentMockResult(1, 'plugin1', true),
      createComponentMockResult(1, 'plugin2', false),
      createComponentMockResult(1, 'plugin3', false),
    ];
    const evalData = createComponentMockEvalData(2, results);
    mockCallApi.mockResolvedValue({
      json: () => Promise.resolve({ data: evalData }),
    });

    renderWithProviders(<App />);

    const dropdown = await screen.findByRole('combobox');
    expect(dropdown).toHaveTextContent('Target: Provider 0');

    expect(screen.getByTestId('overview-total')).toHaveTextContent('2');
    expect(screen.getByTestId('overview-passes')).toHaveTextContent('1');
    expect(screen.getByTestId('overview-failures')).toHaveTextContent('1');

    await userEvent.click(dropdown);

    const provider1Option = await screen.findByRole('option', { name: 'Provider 1' });
    await userEvent.click(provider1Option);

    await waitFor(() => {
      expect(dropdown).toHaveTextContent('Target: Provider 1');
    });

    expect(screen.getByTestId('overview-total')).toHaveTextContent('3');
    expect(screen.getByTestId('overview-passes')).toHaveTextContent('1');
    expect(screen.getByTestId('overview-failures')).toHaveTextContent('2');
  });
});

describe('App component target selector rendering', () => {
  const mockCallApi = callApi as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowLocation({ search: '?evalId=test-eval-id' });
  });

  it('should render the target selector dropdown when there are multiple prompts', async () => {
    const results = [
      createComponentMockResult(0, 'plugin1', true),
      createComponentMockResult(1, 'plugin1', false),
    ];
    const evalData = createComponentMockEvalData(2, results);
    mockCallApi.mockResolvedValue({
      json: () => Promise.resolve({ data: evalData }),
    });

    renderWithProviders(<App />);

    const dropdown = await screen.findByRole('combobox');
    expect(dropdown).toBeInTheDocument();
  });

  it('should render a static chip when there is only one prompt', async () => {
    const results = [createComponentMockResult(0, 'plugin1', true)];
    const evalData = createComponentMockEvalData(1, results);
    mockCallApi.mockResolvedValue({
      json: () => Promise.resolve({ data: evalData }),
    });

    renderWithProviders(<App />);

    const chip = await screen.findByText('Target:');
    expect(chip).toBeInTheDocument();

    const dropdown = screen.queryByRole('combobox');
    expect(dropdown).toBeNull();
  });

  it('shows target probes separately from the token usage breakdown', async () => {
    const user = userEvent.setup();
    const results = [createComponentMockResult(0, 'plugin1', true)];
    const evalData = createComponentMockEvalData(1, results);
    mockCallApi.mockResolvedValue({
      json: () => Promise.resolve({ data: evalData }),
    });

    renderWithProviders(<App />);

    expect(await screen.findByLabelText('10 target probes')).toHaveTextContent('Depth: 10 probes');
    const tokenBadge = screen.getByLabelText('100 total tokens');
    expect(tokenBadge).toHaveTextContent('Total Tokens: 100');

    await user.hover(tokenBadge);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Target Tokens: 100');
    expect(tooltip).toHaveTextContent('Attacker Tokens: 0');
    expect(tooltip).toHaveTextContent('Grading Tokens: 0');
  });

  it('preserves a reported target probe count of zero', async () => {
    const results = [createComponentMockResult(0, 'plugin1', true)];
    const evalData = createComponentMockEvalData(1, results, 0);
    mockCallApi.mockResolvedValue({
      json: () => Promise.resolve({ data: evalData }),
    });

    renderWithProviders(<App />);

    expect(await screen.findByLabelText('0 target probes')).toHaveTextContent('Depth: 0 probes');
  });

  it('counts scan-wide generation once across multiple targets', async () => {
    const user = userEvent.setup();
    const results = [
      createComponentMockResult(0, 'plugin1', true),
      createComponentMockResult(1, 'plugin1', false),
    ];
    const evalData = createComponentMockEvalData(2, results);
    evalData.results.stats = {
      successes: 1,
      failures: 1,
      errors: 0,
      tokenUsage: {
        total: 200,
        prompt: 150,
        completion: 50,
        cached: 0,
        numRequests: 20,
        completionDetails: {},
        assertions: {},
        generation: {
          total: 40,
          prompt: 30,
          completion: 10,
          cached: 0,
          numRequests: 1,
        },
      },
    };
    mockCallApi.mockResolvedValue({
      json: () => Promise.resolve({ data: evalData }),
    });

    renderWithProviders(<App />);

    const tokenBadge = await screen.findByLabelText('240 total tokens');
    expect(tokenBadge).toHaveTextContent('Total Tokens: 240');

    await user.hover(tokenBadge);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Target Tokens: 100');
    expect(tooltip).toHaveTextContent('Selected Target Subtotal: 100');
    expect(tooltip).toHaveTextContent('Generation Tokens (scan-wide): 40');
    expect(tooltip).toHaveTextContent('Scan Total Tokens: 240');

    await user.unhover(tokenBadge);
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Provider 1' }));

    expect(await screen.findByLabelText('240 total tokens')).toHaveTextContent('Total Tokens: 240');
  });

  it('shows unmetered generation requests without adding target probes or tokens', async () => {
    const user = userEvent.setup();
    const results = [createComponentMockResult(0, 'plugin1', true)];
    const evalData = createComponentMockEvalData(1, results);
    evalData.results.stats = {
      successes: 1,
      failures: 0,
      errors: 0,
      tokenUsage: {
        total: 100,
        prompt: 75,
        completion: 25,
        cached: 0,
        numRequests: 10,
        completionDetails: {},
        assertions: {},
        generation: {
          total: 0,
          prompt: 0,
          completion: 0,
          cached: 0,
          numRequests: 1,
        },
      },
    };
    mockCallApi.mockResolvedValue({
      json: () => Promise.resolve({ data: evalData }),
    });

    renderWithProviders(<App />);

    expect(await screen.findByLabelText('10 target probes')).toHaveTextContent('Depth: 10 probes');
    const tokenBadge = screen.getByLabelText('100 total tokens');

    await user.hover(tokenBadge);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Generation Tokens (scan-wide): Unavailable (1 request)');
    expect(tooltip).toHaveTextContent('Scan Total Tokens: 100');
  });

  it('keeps report header actions in normal flow on narrow screens', async () => {
    const results = [createComponentMockResult(0, 'plugin1', true)];
    const evalData = createComponentMockEvalData(1, results);
    mockCallApi.mockResolvedValue({
      json: () => Promise.resolve({ data: evalData }),
    });

    renderWithProviders(<App />);

    expect(await screen.findByTestId('report-header-card')).toHaveClass('sm:pr-48');
    expect(screen.getByTestId('report-header-actions')).toHaveClass(
      'mb-4',
      'justify-end',
      'sm:absolute',
      'sm:mb-0',
    );
  });

  it('allows embedded reports to shrink within narrow result views', async () => {
    const results = [createComponentMockResult(0, 'plugin1', true)];
    const evalData = createComponentMockEvalData(1, results);
    mockCallApi.mockResolvedValue({
      json: () => Promise.resolve({ data: evalData }),
    });

    const { container } = renderWithProviders(<App embedded />);

    await screen.findByTestId('overview-total');

    expect(container.querySelector('.mx-auto.max-w-7xl')).toHaveClass('w-full', 'min-w-0');
  });
});

describe('App component categoryStats calculation with moderation', () => {
  const mockCallApi = callApi as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowLocation({ search: '?evalId=test-eval-id' });
  });

  it('should correctly increment passWithFilter but not pass when moderation tests fail but other tests pass', async () => {
    const pluginId = 'testPlugin';
    const moderationFailure: GradingResult = {
      pass: false,
      score: 0,
      reason: 'Moderation failed',
      assertion: { type: 'moderation' },
    };
    const passingTest: GradingResult = {
      pass: true,
      score: 1,
      reason: 'Test passed',
      assertion: { type: 'equals' },
    };

    const results = [
      createComponentMockResult(0, pluginId, false, [moderationFailure, passingTest]),
    ];
    const evalData = createComponentMockEvalData(1, results);
    mockCallApi.mockResolvedValue({
      json: () => Promise.resolve({ data: evalData }),
    });

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('overview-category-stats')).toBeInTheDocument();
    });

    const categoryStatsElement = screen.getByTestId('overview-category-stats');
    const categoryStats = JSON.parse(categoryStatsElement.textContent);

    expect(categoryStats[pluginId]).toBeDefined();
    expect(categoryStats[pluginId].pass).toBe(0);
    expect(categoryStats[pluginId].passWithFilter).toBe(1);
    expect(categoryStats[pluginId].total).toBe(1);
    expect(categoryStats[pluginId].failCount).toBe(1);
  });
});

describe('Filter panel regression tests', () => {
  const mockCallApi = callApi as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowLocation({ search: '?evalId=test-eval-id' });
  });

  it('should open filter panel without errors when filter button is clicked', async () => {
    // Regression test for #7246 - clicking filter button caused Radix UI error
    // due to SelectItem components with empty string values
    const results = [
      createComponentMockResult(0, 'harmful:violent-crime', false),
      createComponentMockResult(0, 'pii:direct', true),
    ];
    const evalData = createComponentMockEvalData(1, results);
    mockCallApi.mockResolvedValue({
      json: () => Promise.resolve({ data: evalData }),
    });

    renderWithProviders(<App />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.queryByText('Waiting for report data')).not.toBeInTheDocument();
    });

    // Find and click the filter button (there are two, one in sticky header and one in main content)
    const filterButtons = screen.getAllByLabelText('filter results');
    await userEvent.click(filterButtons[0]);

    // Verify filter panel is visible (proves no Radix UI error was thrown)
    await waitFor(() => {
      expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    // Verify filter controls are rendered
    expect(screen.getByPlaceholderText('Search prompts & outputs')).toBeInTheDocument();
    expect(screen.getByText('Risk Categories')).toBeInTheDocument();
    expect(screen.getByText('Strategies')).toBeInTheDocument();
  });

  it('should not use empty string values in Select components', async () => {
    // Regression test for #7246 - Radix UI requires SelectItem values to be non-empty
    const results = [
      createComponentMockResult(0, 'harmful:violent-crime', false),
      createComponentMockResult(0, 'pii:direct', true),
    ];
    const evalData = createComponentMockEvalData(1, results);
    mockCallApi.mockResolvedValue({
      json: () => Promise.resolve({ data: evalData }),
    });

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Waiting for report data')).not.toBeInTheDocument();
    });

    // Open filter panel (there are two filter buttons, use the first one)
    const filterButtons = screen.getAllByLabelText('filter results');
    await userEvent.click(filterButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    // Get all comboboxes (Select triggers) - there's Status, Risk Categories, and Strategies
    const comboboxes = screen.getAllByRole('combobox');

    // Open Risk Categories dropdown (should be the second combobox after Status)
    const categorySelect = comboboxes.find((box) => box.textContent?.includes('Risk Categories'));
    expect(categorySelect).toBeDefined();
    await userEvent.click(categorySelect!);

    // Verify "All Categories" option exists and click it
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'All Categories' })).toBeInTheDocument();
    });

    // Click "All Categories" - this would throw an error if value was ""
    const allCategoriesOption = screen.getByRole('option', { name: 'All Categories' });
    await userEvent.click(allCategoriesOption);

    // Wait for dropdown to close
    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'All Categories' })).not.toBeInTheDocument();
    });

    // Open Strategies dropdown
    const strategiesSelect = comboboxes.find((box) => box.textContent?.includes('Strategies'));
    expect(strategiesSelect).toBeDefined();
    await userEvent.click(strategiesSelect!);

    // Verify "All Strategies" option exists and click it
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'All Strategies' })).toBeInTheDocument();
    });

    // Click "All Strategies" - this would throw an error if value was ""
    const allStrategiesOption = screen.getByRole('option', { name: 'All Strategies' });
    await userEvent.click(allStrategiesOption);

    // If we got here without errors, the fix is working
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });
});

describe('Report attack prompt groupings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowLocation({ search: '?evalId=test-eval-id' });
  });

  const cases = [
    {
      name: 'provider string',
      response: { prompt: 'actual string' },
      metadata: { redteamFinalPrompt: 'older result' },
      expected: 'actual string',
    },
    {
      name: 'provider chat',
      response: { prompt: [{ role: 'user', content: 'actual chat' }] },
      expected: '[{"role":"user","content":"actual chat"}]',
    },
    {
      name: 'response legacy',
      response: { metadata: { redteamFinalPrompt: 'response legacy' } },
      expected: 'response legacy',
    },
    {
      name: 'result legacy',
      response: {},
      metadata: { redteamFinalPrompt: 'result legacy' },
      expected: 'result legacy',
    },
    {
      name: 'empty provider fallback',
      response: { prompt: '' },
      metadata: { redteamFinalPrompt: 'result fallback' },
      expected: 'result fallback',
    },
    { name: 'seed fallback', response: {}, expected: 'seed prompt' },
    {
      name: 'result structured legacy 0',
      response: {},
      metadata: { redteamFinalPrompt: { query: 'historic' } },
      expected: '[object Object]',
    },
    {
      name: 'result structured legacy 1',
      response: {},
      metadata: { redteamFinalPrompt: ['historic', 'array'] },
      expected: 'historic,array',
    },
    {
      name: 'result structured legacy 2',
      response: {},
      metadata: { redteamFinalPrompt: 37 },
      expected: '37',
    },
    {
      name: 'result structured legacy 3',
      response: {},
      metadata: { redteamFinalPrompt: true },
      expected: 'true',
    },
    {
      name: 'result structured legacy 4',
      response: {},
      metadata: { redteamFinalPrompt: 0 },
      expected: 'seed prompt',
    },
    {
      name: 'result structured legacy 5',
      response: {},
      metadata: { redteamFinalPrompt: false },
      expected: 'seed prompt',
    },
    {
      name: 'result structured legacy 6',
      response: {},
      metadata: { redteamFinalPrompt: [] },
      expected: 'test',
    },
    {
      name: 'result structured legacy 7',
      response: {},
      metadata: { redteamFinalPrompt: null },
      expected: 'seed prompt',
    },
    {
      name: 'response structured legacy 0',
      response: { metadata: { redteamFinalPrompt: { query: 'historic' } } },
      expected: '[object Object]',
    },
    {
      name: 'response structured legacy 1',
      response: { metadata: { redteamFinalPrompt: ['historic', 'array'] } },
      expected: 'historic,array',
    },
    {
      name: 'response structured legacy 2',
      response: { metadata: { redteamFinalPrompt: 37 } },
      expected: '37',
    },
    {
      name: 'response structured legacy 3',
      response: { metadata: { redteamFinalPrompt: true } },
      expected: 'true',
    },
    {
      name: 'response structured legacy 4',
      response: { metadata: { redteamFinalPrompt: 0 } },
      expected: 'seed prompt',
    },
    {
      name: 'response structured legacy 5',
      response: { metadata: { redteamFinalPrompt: false } },
      expected: 'seed prompt',
    },
    {
      name: 'response structured legacy 6',
      response: { metadata: { redteamFinalPrompt: [] } },
      expected: 'test',
    },
    {
      name: 'response structured legacy 7',
      response: { metadata: { redteamFinalPrompt: null } },
      expected: 'seed prompt',
    },
  ];

  it.each(cases)(
    'uses $name in both groupings without mutating input',
    async ({ response, metadata, expected }) => {
      const results = [false, true].map((pass, testIdx) => ({
        ...createComponentMockResult(0, 'plugin1', pass),
        testIdx,
        vars: Object.freeze({ prompt: 'seed prompt' }),
        response: { output: 'safe output', ...response },
        metadata: { pluginId: 'plugin1', ...metadata },
      })) as EvaluateResult[];
      const evalData = createComponentMockEvalData(1, results);
      mockCallApiResponse({ data: evalData });
      renderWithProviders(<App />);
      await screen.findByTestId('overview-total');
      const groups = reportGroupings.mock.lastCall![0];
      expect(groups.failuresByPlugin.plugin1[0].prompt).toBe(expected);
      expect(groups.passesByPlugin.plugin1[0].prompt).toBe(expected);
      expect(results.map((result) => result.vars)).toEqual([
        { prompt: 'seed prompt' },
        { prompt: 'seed prompt' },
      ]);
    },
  );

  it('preserves custom injectVar, query and raw prompt fallbacks', async () => {
    const resultInputs: EvaluateResult[] = [
      {
        ...createComponentMockResult(0, 'custom', false),
        vars: { attack: 'custom injection', query: 'old query' },
      },
      {
        ...createComponentMockResult(0, 'query', true),
        vars: { query: 'old query', prompt: 'old prompt' },
      },
      {
        ...createComponentMockResult(0, 'raw', false),
        vars: {},
        prompt: { raw: 'raw fallback', label: 'raw' },
      },
    ];
    const results = resultInputs.map((result, testIdx) => ({
      ...result,
      testIdx,
      vars: Object.freeze(result.vars),
    }));
    const evalData = createComponentMockEvalData(1, results);
    evalData.config.redteam!.injectVar = 'attack';
    mockCallApiResponse({ data: evalData });
    renderWithProviders(<App />);
    await screen.findByTestId('overview-total');
    const groups = reportGroupings.mock.lastCall![0];
    expect(groups.failuresByPlugin.custom[0].prompt).toBe('custom injection');
    expect(groups.passesByPlugin.query[0].prompt).toBe('old query');
    expect(groups.failuresByPlugin.raw[0].prompt).toBe('raw fallback');
  });

  it.each([
    { vars: {}, response: { prompt: 'stripped secret' }, expected: '[prompt stripped]' },
    {
      vars: {},
      response: { metadata: { redteamFinalPrompt: 'stripped secret' } },
      expected: '[prompt stripped]',
    },
    {
      vars: {},
      metadata: { redteamFinalPrompt: 'stripped secret' },
      expected: '[prompt stripped]',
    },
    {
      vars: { harmCategory: 'harm' },
      response: { prompt: 'unselected actual' },
      expected: '[prompt stripped]',
    },
    {
      vars: { custom: 'custom seed', other: 'other' },
      response: { prompt: 'unselected actual' },
      expected: '[prompt stripped]',
    },
    {
      vars: { query: '', prompt: '' },
      response: { prompt: 'unselected actual' },
      expected: '[prompt stripped]',
    },
  ])(
    'retains prompt display eligibility for $vars',
    async ({ vars, response, metadata, expected }) => {
      const results = [false, true].map((pass, testIdx) => ({
        ...createComponentMockResult(0, 'plugin1', pass),
        testIdx,
        vars: Object.freeze(vars as EvaluateResult['vars']),
        response: { output: 'safe output', ...response },
        prompt: { raw: '[prompt stripped]', label: 'stripped' },
        metadata: { pluginId: 'plugin1', ...metadata },
      })) as EvaluateResult[];
      mockCallApiResponse({ data: createComponentMockEvalData(1, results) });
      renderWithProviders(<App />);
      await screen.findByTestId('overview-total');
      const groups = reportGroupings.mock.lastCall![0];
      expect(groups.failuresByPlugin.plugin1[0].prompt).toBe(expected);
      expect(groups.passesByPlugin.plugin1[0].prompt).toBe(expected);
      expect(results.map((result) => result.vars)).toEqual([vars, vars]);
    },
  );

  it('uses runtime transform display variables without changing saved variables', async () => {
    const results = [false, true].map((pass, testIdx) => ({
      ...createComponentMockResult(0, 'plugin1', pass),
      testIdx,
      vars: Object.freeze({}),
      response: {
        output: 'safe output',
        metadata: { transformDisplayVars: { prompt: 'runtime injection' } },
      },
    }));
    mockCallApiResponse({ data: createComponentMockEvalData(1, results) });
    renderWithProviders(<App />);
    await screen.findByTestId('overview-total');
    const groups = reportGroupings.mock.lastCall![0];
    expect(groups.failuresByPlugin.plugin1[0].prompt).toBe('runtime injection');
    expect(groups.passesByPlugin.plugin1[0].prompt).toBe('runtime injection');
    expect(results.map((result) => result.vars)).toEqual([{}, {}]);
  });

  it('searches actual attacks after switching targets and returning', async () => {
    const user = userEvent.setup();
    const results = [0, 1].flatMap((promptIdx) =>
      [false, true].map((pass, testIdx) => ({
        ...createComponentMockResult(promptIdx, 'plugin1', pass),
        testIdx,
        vars: Object.freeze({ prompt: `seed ${promptIdx}` }),
        response: { prompt: `attack target ${promptIdx}`, output: 'safe output' },
      })),
    );
    const evalData = createComponentMockEvalData(2, results);
    mockCallApiResponse({ data: evalData });
    renderWithProviders(<App />);
    const selector = await screen.findByRole('combobox');
    await user.click(selector);
    await user.click(await screen.findByRole('option', { name: 'Provider 1' }));
    await user.click(screen.getAllByLabelText('filter results')[0]);
    const search = screen.getByPlaceholderText('Search prompts & outputs');
    await user.type(search, 'attack target 1');
    expect(screen.getByTestId('overview-total')).toHaveTextContent('2');
    expect(reportGroupings.mock.lastCall![0].failuresByPlugin.plugin1[0].prompt).toBe(
      'attack target 1',
    );
    expect(reportGroupings.mock.lastCall![0].passesByPlugin.plugin1[0].prompt).toBe(
      'attack target 1',
    );
    await user.clear(search);
    await user.type(search, 'seed 1');
    expect(screen.getByTestId('overview-total')).toHaveTextContent('0');
    await user.clear(search);
    await user.click(selector);
    await user.click(await screen.findByRole('option', { name: 'Provider 0' }));
    await user.type(search, 'attack target 0');
    expect(screen.getByTestId('overview-total')).toHaveTextContent('2');
  });
});
