import { TooltipProvider } from '@app/components/ui/tooltip';
import { createMockResponse, mockCallApiResponse } from '@app/tests/apiMocks';
import { mockWindowLocation } from '@app/tests/browserMocks';
import { callApi } from '@app/utils/api';
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
      <MemoryRouter initialEntries={[`/reports${window.location.search}`]}>{ui}</MemoryRouter>
    </TooltipProvider>,
  );

vi.mock('@app/utils/api');
const mockRecordEvent = vi.hoisted(() => vi.fn());

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});
vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: mockRecordEvent,
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
    failuresByPlugin?: Record<string, { prompt: string }[]>;
    passesByPlugin?: Record<string, { prompt: string }[]>;
  }) => (
    <>
      <div data-testid="risk-categories-failure-prompts">
        {Object.values(failuresByPlugin ?? {})
          .flat()
          .map((failure) => failure.prompt)
          .join('|')}
      </div>
      <div data-testid="risk-categories-pass-prompts">
        {Object.values(passesByPlugin ?? {})
          .flat()
          .map((pass) => pass.prompt)
          .join('|')}
      </div>
      <pre hidden data-testid="report-groups">
        {JSON.stringify({ failuresByPlugin, passesByPlugin })}
      </pre>
    </>
  ),
}));
vi.mock('./TestSuites', () => ({ default: () => null }));
vi.mock('./FrameworkCompliance', () => ({
  default: ({ categoryStats }: { categoryStats: unknown }) => (
    <div data-testid="framework-category-stats">{JSON.stringify(categoryStats)}</div>
  ),
}));
vi.mock('./ReportDownloadButton', () => ({ default: () => null }));
vi.mock('./ReportSettingsDialogButton', () => ({ default: () => null }));

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
  const mockCallApi = vi.mocked(callApi);

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallApi.mockReset();
    mockWindowLocation({ search: '?evalId=test-eval-id' });
  });

  it('clears embedded actions when switching reports and unmounting', async () => {
    const evalData = createComponentMockEvalData(1, []);
    mockCallApi.mockResolvedValueOnce(createMockResponse({ data: evalData }));
    const onActionsReady = vi.fn();
    const wrap = (id: string) => (
      <TooltipProvider>
        <MemoryRouter>
          <App evalId={id} embedded onActionsReady={onActionsReady} />
        </MemoryRouter>
      </TooltipProvider>
    );
    const { rerender, unmount } = render(wrap('old'));
    await screen.findByTestId('overview-total');
    expect(onActionsReady).not.toHaveBeenLastCalledWith(null);
    mockCallApi.mockReturnValueOnce(new Promise(() => {}));
    rerender(wrap('new'));
    expect(onActionsReady).toHaveBeenLastCalledWith(null);
    unmount();
    expect(onActionsReady).toHaveBeenLastCalledWith(null);
  });

  it('loads complete tool schemas only when opened and reloads after closing', async () => {
    const evalData = createComponentMockEvalData(1, []);
    evalData.config.providers = [
      { id: 'echo', config: { tools: [{ type: 'function', function: { name: 'example' } }] } },
    ];
    const fullTools = [
      {
        type: 'function',
        function: {
          name: 'example',
          parameters: { type: 'object', properties: { value: { type: 'string' } } },
        },
      },
    ];
    mockCallApi.mockReset();
    mockCallApi.mockResolvedValueOnce(createMockResponse({ data: evalData }));
    mockCallApi.mockResolvedValue(createMockResponse({ data: fullTools }));
    renderWithProviders(<App evalId="test-eval-id" />);
    const button = await screen.findByText('Tools:');
    expect(mockCallApi).toHaveBeenCalledTimes(1);
    await userEvent.click(button);
    expect(await screen.findByRole('dialog', { name: 'Available Tools' })).toHaveTextContent(
      'value',
    );
    expect(mockCallApi).toHaveBeenLastCalledWith(
      '/results/test-eval-id/tools',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(button);
    await screen.findByRole('dialog', { name: 'Available Tools' });
    expect(mockCallApi).toHaveBeenCalledTimes(3);
  });

  it.each([
    { name: 'HTTP 503', response: createMockResponse(null, { status: 503 }) },
    { name: 'empty array', response: createMockResponse({ data: [] }) },
    { name: 'missing data', response: createMockResponse({}) },
    { name: 'null body', response: createMockResponse(null) },
    { name: 'non-array data', response: createMockResponse({ data: {} }) },
    { name: 'string data', response: createMockResponse({ data: 'Read' }) },
  ])('retries saved tool definitions after $name', async ({ response }) => {
    const evalData = createComponentMockEvalData(1, []);
    evalData.config.providers = [
      { id: 'echo', config: { tools: [{ type: 'function', function: { name: 'example' } }] } },
    ];
    mockCallApi.mockReset();
    mockCallApi.mockResolvedValueOnce(createMockResponse({ data: evalData }));
    mockCallApi.mockResolvedValueOnce(response);
    renderWithProviders(<App evalId="test-eval-id" />);
    const button = await screen.findByText('Tools:');
    await userEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Select Tools to retry');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    mockCallApi.mockResolvedValueOnce(
      createMockResponse({
        data: [
          { type: 'function', function: { name: 'recovered', parameters: { type: 'object' } } },
        ],
      }),
    );
    await userEvent.click(button);
    expect(await screen.findByRole('dialog', { name: 'Available Tools' })).toHaveTextContent(
      'recovered',
    );
    expect(mockCallApi).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([false, true])(
    'loads named tools with an empty first response: %s',
    async (emptyFirst) => {
      const evalData = createComponentMockEvalData(1, []);
      evalData.config.providers = [{ id: 'claude-agent-sdk', config: { tools: ['Read', 'Edit'] } }];
      mockCallApi.mockResolvedValueOnce(createMockResponse({ data: evalData }));
      if (emptyFirst) {
        mockCallApi.mockResolvedValueOnce(createMockResponse({ data: [] }));
      }
      mockCallApi.mockResolvedValueOnce(createMockResponse({ data: ['Read', 'Edit'] }));
      renderWithProviders(<App evalId="test-eval-id" />);
      const button = await screen.findByText('Tools:');
      await userEvent.click(button);
      if (emptyFirst) {
        expect(await screen.findByRole('alert')).toHaveTextContent('Select Tools to retry');
        await userEvent.click(button);
      }
      const dialog = await screen.findByRole('dialog', { name: 'Available Tools' });
      expect(dialog).toHaveTextContent('Read');
      expect(dialog).toHaveTextContent('Edit');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(mockCallApi).toHaveBeenCalledTimes(emptyFirst ? 3 : 2);
    },
  );

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

    renderWithProviders(<App evalId="test-eval-id" />);

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

    renderWithProviders(<App evalId="test-eval-id" />);

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

  it('should derive depth from compact result rows when request metrics are unavailable', async () => {
    const evalData = createComponentMockEvalData(1, [
      createComponentMockResult(0, 'plugin1', true),
      createComponentMockResult(0, 'plugin2', false),
    ]);
    evalData.prompts?.forEach((prompt) => {
      prompt.metrics = undefined;
    });
    mockCallApi.mockResolvedValue(createMockResponse({ data: evalData }));

    renderWithProviders(<App evalId="test-eval-id" />);

    expect(await screen.findByText(/2 probes/)).toBeInTheDocument();
  });

  it('surfaces the provider-reported final prompt for layer-mode failures', async () => {
    // Runtime layer transforms exclude the inject variable from transformDisplayVars. Multi-turn
    // attack providers expose the final attack through response.prompt/redteamFinalPrompt instead.
    const layerResult = {
      ...createComponentMockResult(0, 'plugin1', false),
      vars: { prompt: 'original attack seed' },
      response: {
        output: 'test output',
        prompt: 'INJECTED_LAYER_PAYLOAD',
        metadata: { transformDisplayVars: { embeddedInjection: 'display-only helper value' } },
      },
    } as unknown as EvaluateResult;
    const evalData = createComponentMockEvalData(1, [layerResult]);
    mockCallApi.mockResolvedValue(createMockResponse({ data: evalData }));

    renderWithProviders(<App evalId="test-eval-id" />);

    const failurePrompts = await screen.findByTestId('risk-categories-failure-prompts');
    expect(failurePrompts).toHaveTextContent('INJECTED_LAYER_PAYLOAD');
  });

  it('surfaces redteamFinalPrompt when a multi-turn provider does not report response.prompt', async () => {
    const layerResult = {
      ...createComponentMockResult(0, 'plugin1', false),
      vars: { prompt: 'original attack seed' },
      response: {
        output: 'test output',
        metadata: {
          redteamFinalPrompt: 'FINAL_MULTI_TURN_ATTACK',
          transformDisplayVars: { embeddedInjection: 'display-only helper value' },
        },
      },
    } as unknown as EvaluateResult;
    const evalData = createComponentMockEvalData(1, [layerResult]);
    mockCallApi.mockResolvedValue(createMockResponse({ data: evalData }));

    renderWithProviders(<App evalId="test-eval-id" />);

    const failurePrompts = await screen.findByTestId('risk-categories-failure-prompts');
    expect(failurePrompts).toHaveTextContent('FINAL_MULTI_TURN_ATTACK');
  });

  it('does not read inherited object properties as dynamic inject variables', async () => {
    const result = {
      ...createComponentMockResult(0, 'plugin1', false),
      vars: {},
    } as EvaluateResult;
    const evalData = createComponentMockEvalData(1, [result]);
    evalData.config.redteam = { injectVar: 'toString' };
    mockCallApi.mockResolvedValue(createMockResponse({ data: evalData }));

    renderWithProviders(<App evalId="test-eval-id" />);

    const failurePrompts = await screen.findByTestId('risk-categories-failure-prompts');
    expect(failurePrompts).toHaveTextContent('test');
    expect(failurePrompts).not.toHaveTextContent('function toString');
  });

  it('classifies compact rows by success when grading details are stripped', async () => {
    const passingResult = {
      ...createComponentMockResult(0, 'plugin1', true),
      gradingResult: undefined,
      vars: { prompt: 'PASS_WITHOUT_GRADING' },
    } as EvaluateResult;
    const failingResult = {
      ...createComponentMockResult(0, 'plugin1', false),
      gradingResult: undefined,
      vars: { prompt: 'FAIL_WITHOUT_GRADING' },
    } as EvaluateResult;
    const evalData = createComponentMockEvalData(1, [passingResult, failingResult]);
    mockCallApi.mockResolvedValue(createMockResponse({ data: evalData }));

    renderWithProviders(<App evalId="test-eval-id" />);

    const passPrompts = await screen.findByTestId('risk-categories-pass-prompts');
    const failurePrompts = screen.getByTestId('risk-categories-failure-prompts');
    expect(passPrompts).toHaveTextContent('PASS_WITHOUT_GRADING');
    expect(passPrompts).not.toHaveTextContent('FAIL_WITHOUT_GRADING');
    expect(failurePrompts).toHaveTextContent('FAIL_WITHOUT_GRADING');
    expect(failurePrompts).not.toHaveTextContent('PASS_WITHOUT_GRADING');
  });

  it('classifies historical test-case plugin identity and excludes policies from frameworks', async () => {
    const policyId = '550e8400-e29b-41d4-a716-446655440000';
    const historicalPluginResult = {
      ...createComponentMockResult(0, 'unused', false),
      metadata: undefined,
      testCase: { metadata: { pluginId: 'harmful:violent-crime' } },
      vars: {},
      gradingResult: null,
    } as EvaluateResult;
    const historicalPolicyResult = {
      ...createComponentMockResult(0, 'unused', false),
      metadata: undefined,
      testCase: { metadata: { pluginId: 'policy', policyId } },
      vars: {},
      gradingResult: null,
    } as EvaluateResult;
    const evalData = createComponentMockEvalData(1, [
      historicalPluginResult,
      historicalPolicyResult,
    ]);
    mockCallApi.mockResolvedValue(createMockResponse({ data: evalData }));

    renderWithProviders(<App evalId="test-eval-id" />);

    const categoryStats = JSON.parse(
      (await screen.findByTestId('overview-category-stats')).textContent,
    );
    const frameworkCategoryStats = JSON.parse(
      screen.getByTestId('framework-category-stats').textContent,
    );
    expect(categoryStats).toHaveProperty('harmful:violent-crime');
    expect(categoryStats).toHaveProperty(policyId);
    expect(frameworkCategoryStats).toHaveProperty('harmful:violent-crime');
    expect(frameworkCategoryStats).not.toHaveProperty(policyId);
  });
});

describe('App component report loading', () => {
  const mockCallApi = vi.mocked(callApi);

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallApi.mockReset();
    mockRecordEvent.mockReset();
    mockWindowLocation({ search: '' });
  });

  it('aborts an obsolete request and loads data for the current evalId', async () => {
    const evalData = createComponentMockEvalData(1, [
      createComponentMockResult(0, 'plugin1', true),
    ]);
    evalData.config.description = 'Evaluation two';
    mockCallApi
      .mockImplementationOnce((_path, options) => {
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        });
      })
      .mockResolvedValueOnce(createMockResponse({ data: evalData }));

    const renderReport = (evalId: string) => (
      <TooltipProvider>
        <MemoryRouter>
          <App evalId={evalId} />
        </MemoryRouter>
      </TooltipProvider>
    );
    const { rerender } = render(renderReport('eval-one'));

    await waitFor(() => {
      expect(mockCallApi).toHaveBeenNthCalledWith(
        1,
        '/results/eval-one?includeTraces=false&resultProjection=redteamReport',
        expect.objectContaining({
          cache: 'no-store',
          signal: expect.any(AbortSignal),
        }),
      );
    });
    const firstSignal = mockCallApi.mock.calls[0][1]?.signal as AbortSignal;

    rerender(renderReport('eval-two'));

    await waitFor(() => {
      expect(mockCallApi).toHaveBeenNthCalledWith(
        2,
        '/results/eval-two?includeTraces=false&resultProjection=redteamReport',
        expect.objectContaining({
          cache: 'no-store',
          signal: expect.any(AbortSignal),
        }),
      );
    });
    expect(firstSignal.aborted).toBe(true);
    expect(await screen.findAllByText('Evaluation two')).not.toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retries the same report request in place after a transient failure', async () => {
    const evalData = createComponentMockEvalData(1, [
      createComponentMockResult(0, 'plugin1', true),
    ]);
    mockCallApi
      .mockResolvedValueOnce(createMockResponse(null, { status: 503 }))
      .mockResolvedValueOnce(createMockResponse({ data: evalData }));

    renderWithProviders(<App evalId="eval-retry" />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unable to load report data');
    expect(alert).toHaveAttribute('aria-live', 'assertive');

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('overview-total')).toHaveTextContent('1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockCallApi).toHaveBeenCalledTimes(2);
    expect(mockCallApi.mock.calls.map(([path]) => path)).toEqual([
      '/results/eval-retry?includeTraces=false&resultProjection=redteamReport',
      '/results/eval-retry?includeTraces=false&resultProjection=redteamReport',
    ]);
  });

  it('keeps a successfully loaded report when telemetry throws', async () => {
    const evalData = createComponentMockEvalData(1, [
      createComponentMockResult(0, 'plugin1', true),
    ]);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRecordEvent.mockImplementationOnce(() => {
      throw new Error('telemetry unavailable');
    });
    mockCallApi.mockResolvedValue(createMockResponse({ data: evalData }));

    try {
      renderWithProviders(<App evalId="eval-telemetry" />);

      expect(await screen.findByTestId('overview-total')).toHaveTextContent('1');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to record red team report telemetry:',
        expect.any(Error),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('does not present a clean report when aggregate stats exist without result rows', async () => {
    const evalData = createComponentMockEvalData(1, []);
    evalData.results.stats = {
      successes: 597,
      failures: 410,
      errors: 1,
    } as any;
    mockCallApi.mockResolvedValue(createMockResponse({ data: evalData }));

    renderWithProviders(<App evalId="eval-incomplete" />);

    const status = await screen.findByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Report data incomplete');
    expect(status).toHaveTextContent(/aggregate stats for 1,008 tests/);
    expect(status).toHaveTextContent(/no detailed result rows are available/);
    expect(screen.queryByTestId('overview-total')).not.toBeInTheDocument();
  });

  it('rejects a partially projected report when aggregate stats exceed detailed rows', async () => {
    const evalData = createComponentMockEvalData(1, [
      createComponentMockResult(0, 'plugin1', true),
    ]);
    evalData.results.stats = {
      successes: 2,
      failures: 0,
      errors: 0,
    } as any;
    mockCallApi.mockResolvedValue(createMockResponse({ data: evalData }));

    renderWithProviders(<App evalId="eval-partial" />);

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/aggregate stats for 2 tests/);
    expect(status).toHaveTextContent(/only 1 detailed result row is available/);
    expect(screen.queryByTestId('overview-total')).not.toBeInTheDocument();
  });

  it('rejects duplicate retry coordinates as incomplete report data', async () => {
    const retry = createComponentMockResult(0, 'plugin1', true);
    const evalData = createComponentMockEvalData(1, [retry, { ...retry, id: 'retry-2' }]);
    evalData.results.stats = { successes: 2, failures: 0, errors: 0 } as any;
    mockCallApi.mockResolvedValue(createMockResponse({ data: evalData }));

    renderWithProviders(<App evalId="eval-duplicate-retry" />);

    expect(await screen.findByRole('status')).toHaveTextContent('Report data incomplete');
    expect(screen.queryByTestId('overview-total')).not.toBeInTheDocument();
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

    renderWithProviders(<App evalId="test-eval-id" />);

    const dropdown = await screen.findByRole('combobox');
    expect(dropdown).toBeInTheDocument();
  });

  it('should render a static chip when there is only one prompt', async () => {
    const results = [createComponentMockResult(0, 'plugin1', true)];
    const evalData = createComponentMockEvalData(1, results);
    mockCallApiResponse({ data: evalData });

    renderWithProviders(<App evalId="test-eval-id" />);

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

    renderWithProviders(<App evalId="test-eval-id" />);

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

    renderWithProviders(<App evalId="test-eval-id" />);

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

    renderWithProviders(<App evalId="test-eval-id" />);

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

    renderWithProviders(<App evalId="test-eval-id" />);

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

    renderWithProviders(<App evalId="test-eval-id" />);

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

    const { container } = renderWithProviders(<App evalId="test-eval-id" embedded />);

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

    renderWithProviders(<App evalId="test-eval-id" />);

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
    renderWithProviders(<App evalId="test-eval-id" />);
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

    renderWithProviders(<App evalId="test-eval-id" />);

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
    expect(screen.getByPlaceholderText('Search preview text')).toBeInTheDocument();
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

    renderWithProviders(<App evalId="test-eval-id" />);

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
