import { TooltipProvider } from '@app/components/ui/tooltip';
import { mockCallApiResponse } from '@app/tests/apiMocks';
import { mockWindowLocation } from '@app/tests/browserMocks';
import { ResultFailureReason } from '@promptfoo/types/results';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './Report';
import type { EvaluateResult, GradingResult, ResultsFile } from '@promptfoo/types';

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <TooltipProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </TooltipProvider>,
  );

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
vi.mock('./StrategyStats', () => ({
  default: ({ strategyStats }: { strategyStats: unknown }) => (
    <pre data-testid="strategy-stats">{JSON.stringify(strategyStats)}</pre>
  ),
}));
vi.mock('./RiskCategories', () => ({
  default: ({
    failuresByPlugin,
    passesByPlugin,
  }: {
    failuresByPlugin: unknown;
    passesByPlugin: unknown;
  }) => (
    <pre hidden data-testid="report-groups">
      {JSON.stringify({ failuresByPlugin, passesByPlugin })}
    </pre>
  ),
}));
vi.mock('./TestSuites', () => ({ default: () => null }));
vi.mock('./FrameworkCompliance', () => ({ default: () => null }));
vi.mock('./ReportDownloadButton', () => ({ default: () => null }));
vi.mock('./ReportSettingsDialogButton', () => ({ default: () => null }));
vi.mock('./ToolsDialog', () => ({ default: () => null }));

const readStrategyStats = () => JSON.parse(screen.getByTestId('strategy-stats').textContent!);

beforeEach(() => {
  vi.clearAllMocks();
  mockWindowLocation({ search: '?evalId=test-eval-id' });
});

describe('Report filtering logic', () => {
  const readGroups = () =>
    JSON.parse(screen.getByTestId('report-groups').textContent!) as {
      failuresByPlugin: Record<string, { result: EvaluateResult }[]>;
      passesByPlugin: Record<string, { result: EvaluateResult }[]>;
    };

  async function renderReportData(numPrompts: number, results: EvaluateResult[]) {
    mockCallApiResponse({ data: createComponentMockEvalData(numPrompts, results) });
    const view = renderWithProviders(<App evalId="first" />);
    await screen.findByTestId('report-groups');
    return view;
  }

  async function selectTarget(provider = 'Provider 1') {
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: provider }));
    await waitFor(() =>
      expect(screen.getByRole('combobox')).toHaveTextContent(`Target: ${provider}`),
    );
  }

  describe('failuresByPlugin filtering', () => {
    it('should include all failures when only one prompt exists', async () => {
      await renderReportData(1, [
        createComponentMockResult(0, 'plugin1', false),
        createComponentMockResult(0, 'plugin2', false),
      ]);
      const failures = readGroups().failuresByPlugin;
      expect(Object.keys(failures)).toHaveLength(2);
      expect(failures.plugin1).toHaveLength(1);
      expect(failures.plugin2).toHaveLength(1);
      expect(readStrategyStats()).toEqual({ basic: { pass: 0, total: 2, failCount: 2 } });
    });

    it('should filter failures by promptIdx when multiple prompts exist', async () => {
      await renderReportData(2, [
        createComponentMockResult(0, 'plugin1', false),
        createComponentMockResult(1, 'plugin1', false),
        createComponentMockResult(0, 'plugin2', false),
        createComponentMockResult(1, 'plugin2', true),
      ]);
      const first = readGroups().failuresByPlugin;
      expect(Object.keys(first)).toHaveLength(2);
      expect(first.plugin1).toHaveLength(1);
      expect(first.plugin1[0].result.promptIdx).toBe(0);
      expect(first.plugin2).toHaveLength(1);
      expect(first.plugin2[0].result.promptIdx).toBe(0);
      await selectTarget();
      const second = readGroups().failuresByPlugin;
      expect(Object.keys(second)).toHaveLength(1);
      expect(second.plugin1).toHaveLength(1);
      expect(second.plugin1[0].result.promptIdx).toBe(1);
      expect(second.plugin2).toBeUndefined();
      expect(readStrategyStats()).toEqual({ basic: { pass: 1, total: 2, failCount: 1 } });
    });
  });

  describe('categoryStats filtering', () => {
    it('should filter category stats by promptIdx when multiple prompts exist', async () => {
      await renderReportData(2, [
        createComponentMockResult(0, 'harmful:violent-crime', false),
        createComponentMockResult(1, 'harmful:violent-crime', true),
        createComponentMockResult(0, 'pii:direct', true),
        createComponentMockResult(1, 'pii:direct', false),
      ]);
      expect(JSON.parse(screen.getByTestId('overview-category-stats').textContent!)).toEqual({
        'harmful:violent-crime': { pass: 0, total: 1, passWithFilter: 0, failCount: 1 },
        'pii:direct': { pass: 1, total: 1, passWithFilter: 1, failCount: 0 },
      });
      await selectTarget();
      expect(JSON.parse(screen.getByTestId('overview-category-stats').textContent!)).toEqual({
        'harmful:violent-crime': { pass: 1, total: 1, passWithFilter: 1, failCount: 0 },
        'pii:direct': { pass: 0, total: 1, passWithFilter: 0, failCount: 1 },
      });
    });
  });

  describe('target selector behavior', () => {
    it('should not filter results when only one prompt exists', async () => {
      await renderReportData(1, [
        createComponentMockResult(0, 'plugin1', false),
        createComponentMockResult(0, 'plugin2', true),
        createComponentMockResult(0, 'plugin3', false),
      ]);
      const failures = readGroups().failuresByPlugin;
      expect(Object.keys(failures)).toHaveLength(2);
      expect(failures.plugin1).toHaveLength(1);
      expect(failures.plugin3).toHaveLength(1);
    });

    it('should handle edge case when selectedPromptIndex is out of bounds', async () => {
      const results = [
        createComponentMockResult(0, 'plugin1', false),
        createComponentMockResult(1, 'plugin1', false),
      ];
      const { rerender } = await renderReportData(3, results);
      await selectTarget('Provider 2');
      mockCallApiResponse({ data: createComponentMockEvalData(2, results) });
      rerender(
        <TooltipProvider>
          <MemoryRouter>
            <App evalId="second" />
          </MemoryRouter>
        </TooltipProvider>,
      );
      await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());
      const failures = readGroups().failuresByPlugin;
      expect(Object.keys(failures)).toHaveLength(1);
      expect(failures.plugin1).toHaveLength(2);
    });

    it('should correctly identify provider labels for each prompt', async () => {
      await renderReportData(2, [
        createComponentMockResult(0, 'plugin1', false),
        createComponentMockResult(1, 'plugin1', false),
      ]);
      expect(screen.getByRole('combobox')).toHaveTextContent('Target: Provider 0');
      await selectTarget();
      expect(screen.getByRole('combobox')).toHaveTextContent('Target: Provider 1');
    });
  });

  describe('passesByPlugin filtering', () => {
    it('should filter passes by promptIdx when multiple prompts exist', async () => {
      await renderReportData(2, [
        createComponentMockResult(0, 'plugin1', true),
        createComponentMockResult(1, 'plugin1', false),
        createComponentMockResult(0, 'plugin2', false),
        createComponentMockResult(1, 'plugin2', true),
      ]);
      const first = readGroups().passesByPlugin;
      expect(Object.keys(first)).toHaveLength(1);
      expect(first.plugin1).toHaveLength(1);
      expect(first.plugin1[0].result.promptIdx).toBe(0);
      expect(first.plugin2).toBeUndefined();
      await selectTarget();
      const second = readGroups().passesByPlugin;
      expect(Object.keys(second)).toHaveLength(1);
      expect(second.plugin2).toHaveLength(1);
      expect(second.plugin2[0].result.promptIdx).toBe(1);
      expect(second.plugin1).toBeUndefined();
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
    mockCallApiResponse({ data: evalData });

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
    mockCallApiResponse({ data: evalData });

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
  it('should render the target selector dropdown when there are multiple prompts', async () => {
    const results = [
      createComponentMockResult(0, 'plugin1', true),
      createComponentMockResult(1, 'plugin1', false),
    ];
    const evalData = createComponentMockEvalData(2, results);
    mockCallApiResponse({ data: evalData });

    renderWithProviders(<App />);

    const dropdown = await screen.findByRole('combobox');
    expect(dropdown).toBeInTheDocument();
  });

  it('should render a static chip when there is only one prompt', async () => {
    const results = [createComponentMockResult(0, 'plugin1', true)];
    const evalData = createComponentMockEvalData(1, results);
    mockCallApiResponse({ data: evalData });

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
    mockCallApiResponse({ data: evalData });

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
    mockCallApiResponse({ data: evalData });

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
    mockCallApiResponse({ data: evalData });

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
    mockCallApiResponse({ data: evalData });

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
    mockCallApiResponse({ data: evalData });

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
    mockCallApiResponse({ data: evalData });

    const { container } = renderWithProviders(<App embedded />);

    await screen.findByTestId('overview-total');

    expect(container.querySelector('.mx-auto.max-w-7xl')).toHaveClass('w-full', 'min-w-0');
  });
});

describe('App component categoryStats calculation with moderation', () => {
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
    mockCallApiResponse({ data: evalData });

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
  it('excludes provider errors and composes category, strategy, status, and search filters', async () => {
    const user = userEvent.setup();
    const customFailure = createComponentMockResult(0, 'pii:direct', false);
    const customPass = createComponentMockResult(0, 'pii:direct', true);
    const basicFailure = createComponentMockResult(0, 'pii:direct', false);
    const otherCategory = createComponentMockResult(0, 'harmful:violent-crime', false);
    const providerError = createComponentMockResult(0, 'pii:direct', false);
    for (const result of [customFailure, customPass, otherCategory, providerError]) {
      result.testCase.metadata = { strategyId: 'custom' };
    }
    customFailure.response = { output: 'Selected failure output' };
    providerError.error = 'transport unavailable';
    providerError.failureReason = ResultFailureReason.ERROR;
    mockCallApiResponse({
      data: createComponentMockEvalData(1, [
        customFailure,
        customPass,
        basicFailure,
        otherCategory,
        providerError,
      ]),
    });
    renderWithProviders(<App />);
    const readGroups = () => JSON.parse(screen.getByTestId('report-groups').textContent!);
    await screen.findByTestId('report-groups');
    expect(JSON.stringify(readGroups())).not.toContain('transport unavailable');
    expect(readGroups().failuresByPlugin['pii:direct']).toHaveLength(2);
    expect(readStrategyStats()).toEqual({
      custom: { pass: 1, total: 3, failCount: 2 },
      basic: { pass: 0, total: 1, failCount: 1 },
    });

    await user.click(screen.getAllByLabelText('filter results')[0]);
    const [status, category, strategy] = screen.getAllByRole('combobox');
    await user.click(category);
    await user.click(await screen.findByRole('option', { name: 'pii:direct' }));
    expect(Object.keys(readGroups().failuresByPlugin)).toEqual(['pii:direct']);
    expect(readStrategyStats()).toEqual({
      custom: { pass: 1, total: 2, failCount: 1 },
      basic: { pass: 0, total: 1, failCount: 1 },
    });

    await user.click(strategy);
    await user.click(await screen.findByRole('option', { name: 'custom' }));
    expect(readStrategyStats()).toEqual({ custom: { pass: 1, total: 2, failCount: 1 } });
    expect(screen.getByTestId('overview-total')).toHaveTextContent('2');

    await user.click(status);
    await user.click(await screen.findByRole('option', { name: 'Pass Only' }));
    expect(readGroups().failuresByPlugin).toEqual({});
    expect(readStrategyStats()).toEqual({ custom: { pass: 1, total: 1, failCount: 0 } });

    await user.click(status);
    await user.click(await screen.findByRole('option', { name: 'Fail Only' }));
    expect(readGroups().passesByPlugin).toEqual({});
    expect(readStrategyStats()).toEqual({ custom: { pass: 0, total: 1, failCount: 1 } });
    expect(screen.getByTestId('overview-total')).toHaveTextContent('1');

    const search = screen.getByPlaceholderText('Search prompts & outputs');
    await user.type(search, 'SELECTED');
    expect(readStrategyStats()).toEqual({ custom: { pass: 0, total: 1, failCount: 1 } });
    await user.clear(search);
    await user.type(search, 'missing');
    expect(readGroups()).toEqual({ failuresByPlugin: {}, passesByPlugin: {} });
    expect(readStrategyStats()).toEqual({});
    expect(screen.getByTestId('overview-total')).toHaveTextContent('0');
  });

  it('should open filter panel without errors when filter button is clicked', async () => {
    // Regression test for #7246 - clicking filter button caused Radix UI error
    // due to SelectItem components with empty string values
    const results = [
      createComponentMockResult(0, 'harmful:violent-crime', false),
      createComponentMockResult(0, 'pii:direct', true),
    ];
    const evalData = createComponentMockEvalData(1, results);
    mockCallApiResponse({ data: evalData });

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
    const search = screen.getByPlaceholderText('Search prompts & outputs');
    expect(readStrategyStats()).toEqual({ basic: { pass: 1, total: 2, failCount: 1 } });
    await userEvent.type(search, 'prompt');
    expect(readStrategyStats()).toEqual({ basic: { pass: 1, total: 2, failCount: 1 } });
    await userEvent.clear(search);
    await userEvent.type(search, 'missing');
    expect(readStrategyStats()).toEqual({});
    expect(screen.getByTestId('overview-total')).toHaveTextContent('0');
    await userEvent.clear(search);
    expect(screen.getByTestId('overview-total')).toHaveTextContent('2');
  });

  it('should not use empty string values in Select components', async () => {
    // Regression test for #7246 - Radix UI requires SelectItem values to be non-empty
    const results = [
      createComponentMockResult(0, 'harmful:violent-crime', false),
      createComponentMockResult(0, 'pii:direct', true),
    ];
    results[1].testCase.metadata = { strategyId: 'custom' };
    const evalData = createComponentMockEvalData(1, results);
    mockCallApiResponse({ data: evalData });

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

    expect(readStrategyStats()).toEqual({
      basic: { pass: 0, total: 1, failCount: 1 },
      custom: { pass: 1, total: 1, failCount: 0 },
    });

    // If we got here without errors, the fix is working
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });
});
