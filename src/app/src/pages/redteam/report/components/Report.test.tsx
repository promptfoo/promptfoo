import { useMemo } from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { callApi } from '@app/utils/api';
import { ResultFailureReason } from '@promptfoo/types';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
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
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
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
vi.mock('./RiskCategories', () => ({ default: () => null }));
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
        // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
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

const createComponentMockEvalData = (numPrompts: number, results: EvaluateResult[]): ResultsFile =>
  ({
    version: 4,
    createdAt: '2025-01-01T00:00:00Z',
    config: { redteam: {} },
    prompts: Array.from({ length: numPrompts }, (_, i) => ({
      id: `prompt-${i}`,
      raw: '{{prompt}}',
      label: `Prompt ${i}`,
      provider: `Provider ${i}`,
      metrics: { tokenUsage: { total: 100, numRequests: 10 } },
    })),
    results: {
      version: 3,
      timestamp: '2025-01-01T00:00:00Z',
      results,
    },
  }) as unknown as ResultsFile;

describe('App component target selection', () => {
  const mockCallApi = callApi as Mock;
  let originalWindowLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();
    originalWindowLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...originalWindowLocation,
        search: '?evalId=test-eval-id',
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalWindowLocation,
    });
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
  let originalWindowLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();
    originalWindowLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...originalWindowLocation,
        search: '?evalId=test-eval-id',
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalWindowLocation,
    });
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
});

describe('App component categoryStats calculation with moderation', () => {
  const mockCallApi = callApi as Mock;
  let originalWindowLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();
    originalWindowLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...originalWindowLocation,
        search: '?evalId=test-eval-id',
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalWindowLocation,
    });
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
  let originalWindowLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();
    originalWindowLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...originalWindowLocation,
        search: '?evalId=test-eval-id',
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalWindowLocation,
    });
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
