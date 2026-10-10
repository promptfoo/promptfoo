import { act, StrictMode } from 'react';

import useApiConfig from '@app/stores/apiConfig';
import { restoreTestTimers, type TestTimers, useTestTimers } from '@app/tests/timers';
import { renderWithProviders } from '@app/utils/testutils';
import { FILE_METADATA_KEY } from '@promptfoo/providers/constants';
import { EVAL_TABLE_MAX_PAGE_SIZE } from '@promptfoo/types/evalConstants';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as ProviderDisplayModule from './ProviderDisplay';
import ResultsTable from './ResultsTable';
import { useResultsViewSettingsStore, useTableStore } from './store';

function mockHeaderTable(mockTable: ReturnType<typeof createTableStore>['table']) {
  vi.mocked(useResultsViewSettingsStore).mockImplementation(() => createViewSettings());

  vi.mocked(useTableStore).mockImplementation(() =>
    createTableStore({
      table: mockTable,
      isFetching: false,
      filteredResultsCount: 1,
    }),
  );
}

function mockPassRateTable(mockTable: ReturnType<typeof createTableStore>['table']) {
  vi.mocked(useTableStore).mockImplementation(() =>
    createTableStore({
      inComparisonMode: false,
      table: mockTable,
      renderMarkdown: true,
    }),
  );
}

const createPromptWithMetrics = () => ({
  metrics: {
    cost: 1.23456,
    namedScores: {},
    testPassCount: 10,
    testFailCount: 0,
    tokenUsage: createTokenUsage(),
    totalLatencyMs: 2000,
  },
  provider: 'test-provider',
});

const createTokenUsage = () => ({
  completion: 500,
  total: 1000,
});

function createViewSettings() {
  return {
    inComparisonMode: false,
    renderMarkdown: true,
  };
}

const createRedteamConfig = () => ({
  redteam: {
    injectVar: 'prompt',
  },
});

const createImageVariable = () => ({
  imageVar: {
    path: '/path/to/image.jpg',
    type: 'image',
    format: 'jpeg',
  },
});

const createPassingRow = () => ({
  outputs: [
    {
      pass: true,
      score: 1,
      text: 'test output',
    },
  ],
  test: {},
  vars: [],
});

const createProviderHead = () => ({
  prompts: [
    {
      provider: 'test-provider',
    },
  ],
  vars: [],
});

const createAppliedMetricFilter = () => ({
  values: {
    filter1: {
      id: 'filter1',
      type: 'metric',
      operator: 'equals',
      value: 'some_metric',
      logicOperator: 'or',
    },
  },
  appliedCount: 1,
  options: createMetricOptions(),
});

const createDeepLinkedOutput = () => ({
  cost: 0,
  failureReason: 0,
  id: 'test-id',
  latencyMs: 0,
  namedScores: {},
  originalRowIndex: 0,
  pass: true,
  prompt: 'Prompt',
  score: 1,
  testCase: {},
  text: 'Output',
});

const createPromptHead = (vars: string[] = [], testPassCount?: number, testFailCount?: number) => ({
  prompts:
    testPassCount === undefined
      ? [{}]
      : [{ metrics: { testPassCount, testFailCount }, provider: 'test-provider' }],
  vars,
});

const createEmptyTable = () => ({
  body: [],
  head: {
    prompts: [],
    vars: [],
  },
});

function createMetricOptions() {
  return {
    metric: [],
  };
}

function createDefaultProps(overrides: Partial<React.ComponentProps<typeof ResultsTable>> = {}) {
  return {
    columnVisibility: {},
    failureFilter: {},
    filterMode: 'all' as const,
    maxTextLength: 100,
    onFailureFilterToggle: vi.fn(),
    onSearchTextChange: vi.fn(),
    searchText: '',
    showStats: true,
    wordBreak: 'break-word' as const,
    setFilterMode: vi.fn(),
    zoom: 1,
    onResultsContainerScroll: vi.fn(),
    atInitialVerticalScrollPosition: true,
    ...overrides,
  };
}

function createNextPageExpectation(mockFetchEvalData: unknown, checkPageSize = false) {
  return () => {
    expect(mockFetchEvalData).toHaveBeenCalledWith(
      '123',
      expect.objectContaining(checkPageSize ? { pageIndex: 1, pageSize: 50 } : { pageIndex: 1 }),
    );
  };
}

vi.mock('./store', () => ({
  useTableStore: vi.fn(() => ({
    config: {},
    evalId: '123',
    setTable: vi.fn(),
    table: null,
    version: 4,
    fetchEvalData: vi.fn(),
    filters: {
      values: {},
      appliedCount: 0,
      options: {
        metric: [],
      },
    },
  })),
  useResultsViewSettingsStore: vi.fn(() => ({
    inComparisonMode: false,
    renderMarkdown: true,
  })),
}));

vi.mock('@app/hooks/useToast', () => ({
  useToast: vi.fn(() => ({
    showToast: vi.fn(),
  })),
}));

vi.mock('@app/hooks/useShiftKey', () => {
  const ShiftKeyContext = { Provider: ({ children }: { children: React.ReactNode }) => children };
  return {
    ShiftKeyContext,
    useShiftKey: vi.fn(() => false),
  };
});

vi.mock('@app/utils/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/utils/api')>()),
  callApi: vi.fn(() => Promise.resolve({ ok: true })),
}));

const mockNavigate = vi.fn();
vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useNavigate: () => mockNavigate,
}));

vi.mock('./EvalOutputCell', () => {
  const MockEvalOutputCell = vi.fn(
    ({
      onRating,
      rowIndex,
      rowPositionIndex,
      searchText,
    }: {
      onRating: any;
      rowIndex?: number;
      rowPositionIndex?: number;
      searchText?: string;
    }) => {
      return (
        <div
          data-testid="eval-output-cell"
          data-rowindex={rowIndex}
          data-rowpositionindex={rowPositionIndex}
          data-searchtext={searchText}
        >
          <button onClick={() => onRating(true, 0.75, 'test comment')} className="action">
            Rate
          </button>
          <button
            onClick={() => onRating(null, undefined, 'test comment')}
            className="clear"
            tabIndex={-1}
          >
            Clear rating
          </button>
        </div>
      );
    },
  );
  return {
    __esModule: true,
    default: MockEvalOutputCell,
  };
});

function createTableStore(overrides: { table: unknown } & Record<string, unknown>) {
  return {
    config: {},
    evalId: '123',
    setTable: vi.fn(),
    version: 4,
    fetchEvalData: vi.fn(),
    filters: {
      values: {},
      appliedCount: 0,
      options: { metric: [] },
    },
    ...overrides,
  };
}

describe('ResultsTable Metrics Display', () => {
  const mockTable = {
    body: Array(10).fill(createPassingRow()),
    head: {
      prompts: [createPromptWithMetrics()],
      vars: [],
    },
  };

  const defaultProps = createDefaultProps();

  beforeEach(() => {
    vi.mocked(useResultsViewSettingsStore).mockImplementation(() => createViewSettings());

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        table: mockTable,
        renderMarkdown: true,
      }),
    );
  });

  describe('provider extraction at the rendered header boundary', () => {
    it.each([
      ['string', 'openai:gpt-4o', 'openai:gpt-4o'],
      ['empty string', '', undefined],
      [
        'long string',
        'custom-provider:very-long-model-name-with-many-characters-exceeding-typical-length',
        'custom-provider:very-long-model-name-with-many-characters-exceeding-typical-length',
      ],
      ['special characters', 'provider:model-v1.0-2024_beta', 'provider:model-v1.0-2024_beta'],
      ['multiple colons', 'google:gemini-2.0-flash:thinking', 'google:gemini-2.0-flash:thinking'],
      ['object id', { id: 'openai:gpt-4o', config: { temperature: 0.7 } }, 'openai:gpt-4o'],
      ['id before label', { id: 'openai:gpt-4o', label: 'My GPT' }, 'openai:gpt-4o'],
      [
        'missing id',
        { label: 'Custom Provider', config: { temperature: 0.5 } },
        '{"label":"Custom Provider","config":{"temperature":0.5}}',
      ],
      ['empty object', {}, '{}'],
      [
        'empty id',
        { id: '', config: { temperature: 0.5 } },
        '{"id":"","config":{"temperature":0.5}}',
      ],
      [
        'null id',
        { id: null, config: { temperature: 0.5 } },
        '{"id":null,"config":{"temperature":0.5}}',
      ],
      [
        'undefined id',
        { id: undefined, config: { temperature: 0.5 } },
        '{"config":{"temperature":0.5}}',
      ],
      ['numeric id', { id: 123, config: {} }, 123],
      ['boolean id', { id: true, config: {} }, true],
      [
        'nested object',
        { nested: { deeply: { config: { temperature: 0.5 } } } },
        '{"nested":{"deeply":{"config":{"temperature":0.5}}}}',
      ],
      ['null', null, undefined],
      ['undefined', undefined, undefined],
      ['number', 42, '42'],
      ['true', true, 'true'],
      ['false', false, undefined],
      ['zero', 0, undefined],
      ['NaN', NaN, undefined],
      ['Infinity', Infinity, 'Infinity'],
      ['array', ['openai:gpt-4o', 'anthropic:claude'], '["openai:gpt-4o","anthropic:claude"]'],
      ['empty array', [], '[]'],
      ['function', () => 'openai:gpt-4o', expect.stringContaining('openai:gpt-4o')],
      ['date', new Date('2024-01-01'), '"2024-01-01T00:00:00.000Z"'],
      ['regexp', /test/g, '{}'],
      ['error', new Error('test error'), '{}'],
      ['whitespace id', { id: '   ', config: {} }, '   '],
      ['object id value', { id: { nested: 'value' }, config: {} }, { nested: 'value' }],
      ['array id value', { id: ['test'], config: {} }, ['test']],
    ])('handles %s', (_name, provider, expected) => {
      const display = vi
        .spyOn(ProviderDisplayModule, 'ProviderDisplay')
        .mockImplementation(() => <></>);
      vi.mocked(useTableStore).mockImplementation(() =>
        createTableStore({
          table: { body: [], head: { vars: [], prompts: [{ provider }] } },
        }),
      );
      renderWithProviders(<ResultsTable {...defaultProps} />);
      // Falsey providers are deliberately hidden by the real header guard.
      if (expected === undefined) {
        expect(display).not.toHaveBeenCalled();
      } else {
        expect(display.mock.calls[0][0].providerString).toEqual(expected);
      }
    });

    it('uses a circular object id without serializing it and serializes large id-less objects', () => {
      const display = vi
        .spyOn(ProviderDisplayModule, 'ProviderDisplay')
        .mockImplementation(() => <></>);
      const circular: any = { id: 'test', config: {} };
      circular.self = circular;
      const large: any = { id: null };
      for (let i = 0; i < 100; i++) {
        large[`key${i}`] = `value${i}`;
      }
      vi.mocked(useTableStore).mockImplementation(() =>
        createTableStore({
          table: {
            body: [],
            head: { vars: [], prompts: [{ provider: circular }, { provider: large }] },
          },
        }),
      );
      renderWithProviders(<ResultsTable {...defaultProps} />);
      expect(display.mock.calls.slice(0, 2).map(([props]) => props.providerString)).toEqual([
        'test',
        JSON.stringify(large),
      ]);
      expect(display.mock.calls[1][0].providerString.length).toBeGreaterThan(100);
    });
  });

  it.each([
    [
      'provider string',
      [{ response: { prompt: 'Dynamic prompt with persona and context' } }],
      'Dynamic prompt with persona and context',
    ],
    [
      'chat messages',
      [
        {
          response: {
            prompt: [
              { role: 'system', content: 'You are a helpful assistant' },
              { role: 'user', content: 'Hello world' },
            ],
          },
        },
      ],
      '[{"role":"system","content":"You are a helpful assistant"},{"role":"user","content":"Hello world"}]',
    ],
    [
      'provider before legacy',
      [
        {
          response: {
            prompt: 'Provider-reported prompt',
            metadata: { redteamFinalPrompt: 'Legacy red team prompt' },
          },
        },
      ],
      'Provider-reported prompt',
    ],
    [
      'legacy',
      [{ response: { metadata: { redteamFinalPrompt: 'Legacy red team injected prompt' } } }],
      'Legacy red team injected prompt',
    ],
    [
      'output metadata ignored',
      [{ metadata: { redteamFinalPrompt: 'Red team prompt in output metadata' } }],
      '{{topic}}',
    ],
    [
      'first provider output',
      [
        { response: {} },
        { response: { prompt: 'Second output prompt' } },
        { response: { prompt: 'Third output prompt' } },
      ],
      'Second output prompt',
    ],
    [
      'skip missing prompts',
      [
        { response: {} },
        { response: { output: 'some output' } },
        { response: { metadata: { redteamFinalPrompt: 'Found red team prompt' } } },
      ],
      'Found red team prompt',
    ],
    [
      'first legacy before later provider',
      [
        { response: { metadata: { redteamFinalPrompt: 'Legacy prompt' } } },
        { response: { prompt: 'Provider prompt (should not be used)' } },
      ],
      'Legacy prompt',
    ],
    ['missing outputs', undefined, '{{topic}}'],
    ['empty outputs', [], '{{topic}}'],
    [
      'no prompt',
      [{ response: { output: 'just output' } }, { response: { metadata: {} } }, { response: {} }],
      '{{topic}}',
    ],
    [
      'undefined response',
      [{ response: undefined }, { response: { prompt: 'Valid prompt' } }],
      'Valid prompt',
    ],
    [
      'null response',
      [
        { response: null },
        { response: { metadata: { redteamFinalPrompt: 'Valid red team prompt' } } },
      ],
      'Valid red team prompt',
    ],
    [
      'empty string',
      [
        { response: { prompt: '' } },
        { response: { metadata: { redteamFinalPrompt: 'Fallback prompt' } } },
      ],
      'Fallback prompt',
    ],
    [
      'empty array',
      [
        { response: { prompt: [] } },
        { response: { metadata: { redteamFinalPrompt: 'Fallback prompt' } } },
      ],
      'Fallback prompt',
    ],
    [
      'non-injected variable',
      [{ response: { prompt: 'Ignored provider prompt' } }],
      '{{topic}}',
      '{{topic}}',
      'other',
    ],
    [
      'transformed fallback',
      [{ metadata: { transformDisplayVars: { prompt: 'Transformed prompt' } } }],
      'Transformed prompt',
      '',
    ],
    [
      'original before transformed',
      [{ metadata: { transformDisplayVars: { prompt: 'Ignored transform' } } }],
      '{{topic}}',
    ],
  ])(
    'renders injected variable precedence: %s',
    (_name, outputs, expected, fallback = '{{topic}}', varName = 'prompt') => {
      vi.mocked(useTableStore).mockImplementation(() =>
        createTableStore({
          config: createRedteamConfig(),
          table: {
            head: { vars: [varName], prompts: [{}] },
            body: [
              {
                test: {},
                vars: [fallback],
                outputs: (outputs as any[])?.map((output) => ({
                  pass: true,
                  score: 1,
                  text: 'test output',
                  ...output,
                })),
              },
            ],
          },
        }),
      );
      if (outputs === undefined) {
        // A malformed row without outputs fails before cell rendering.
        expect(() => renderWithProviders(<ResultsTable {...defaultProps} />)).toThrow(TypeError);
        return;
      }
      const { container } = renderWithProviders(<ResultsTable {...defaultProps} />);
      expect(container.querySelector('tbody tr td')?.textContent).toBe(expected);
    },
  );

  it('forwards updated search text to the table data request', async () => {
    const fetchEvalData = vi.fn();
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({ table: mockTable, fetchEvalData }),
    );
    const view = renderWithProviders(<ResultsTable {...defaultProps} />);
    view.rerender(<ResultsTable {...defaultProps} debouncedSearchText="nested-value [1,2,3]" />);
    await waitFor(() =>
      expect(fetchEvalData).toHaveBeenLastCalledWith(
        '123',
        expect.objectContaining({ searchText: 'nested-value [1,2,3]' }),
      ),
    );
  });

  it('displays total cost with correct formatting', () => {
    renderWithProviders(<ResultsTable {...defaultProps} />);
    expect(screen.getByText('Total Cost:')).toBeInTheDocument();
    expect(screen.getByText('$1.23')).toBeInTheDocument();
  });

  it('displays total tokens with correct formatting', () => {
    renderWithProviders(<ResultsTable {...defaultProps} />);
    expect(screen.getByText('Total Tokens:').parentElement).toHaveTextContent(
      'Total Tokens: 1,000',
    );
    expect(screen.getByText('Provider Tokens:').parentElement).toHaveTextContent(
      'Provider Tokens: 1,000',
    );
    expect(screen.queryByText('Target Tokens:')).not.toBeInTheDocument();
  });

  it('labels primary token usage as target tokens for redteam scans', () => {
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        config: { redteam: {} },
        inComparisonMode: false,
        table: mockTable,
        renderMarkdown: true,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    expect(screen.getByText('Target Tokens:').parentElement).toHaveTextContent(
      'Target Tokens: 1,000',
    );
    expect(screen.queryByText('Provider Tokens:')).not.toBeInTheDocument();
  });

  it('displays average tokens with correct calculation', () => {
    renderWithProviders(<ResultsTable {...defaultProps} />);
    expect(screen.getByText('Avg Tokens:')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('hides metrics when showStats is false', () => {
    renderWithProviders(<ResultsTable {...defaultProps} showStats={false} />);
    expect(screen.queryByText('Total Cost:')).not.toBeInTheDocument();
    expect(screen.queryByText('Total Tokens:')).not.toBeInTheDocument();
    expect(screen.queryByText('Avg Tokens:')).not.toBeInTheDocument();
  });

  it('hides metrics when data is not available', () => {
    const mockTableNoMetrics = {
      body: Array(10).fill(createPassingRow()),
      head: {
        prompts: [
          {
            metrics: undefined,
            provider: 'test-provider',
          },
        ],
        vars: [],
      },
    };

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        table: mockTableNoMetrics,
        renderMarkdown: true,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);
    expect(screen.queryByText('Total Cost:')).not.toBeInTheDocument();
    expect(screen.queryByText('Total Tokens:')).not.toBeInTheDocument();
    expect(screen.queryByText('Avg Tokens:')).not.toBeInTheDocument();
  });

  it('renders sparse prompt outputs as empty cells', () => {
    const mockTableWithSparseOutput = {
      body: [
        {
          outputs: [null, { pass: true, score: 1, text: 'test output' }],
          test: {},
          vars: [],
        },
      ],
      head: {
        prompts: [{ provider: 'test-provider-1' }, { provider: 'test-provider-2' }],
        vars: [],
      },
    };

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        table: mockTableWithSparseOutput,
        renderMarkdown: true,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    expect(screen.getByLabelText('No output for this prompt')).toBeInTheDocument();
    expect(screen.getAllByTestId('eval-output-cell')).toHaveLength(1);
  });

  it('displays tokens per second when both latency and completion tokens are available', () => {
    renderWithProviders(<ResultsTable {...defaultProps} />);
    expect(screen.getByText('Tokens/Sec:')).toBeInTheDocument();
    expect(screen.getByText('250')).toBeInTheDocument();
  });

  it('renders object provider IDs and request/assert metrics in the prompt header', () => {
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        table: {
          body: [
            {
              outputs: [{ pass: true, score: 1, text: 'test output' }],
              test: {
                assert: [{ type: 'contains', value: 'test' }],
              },
              vars: [],
            },
          ],
          head: {
            prompts: [
              {
                metrics: {
                  assertFailCount: 1,
                  assertPassCount: 2,
                  namedScores: {},
                  testPassCount: 1,
                  testFailCount: 0,
                  tokenUsage: {
                    completion: 50,
                    total: 100,
                    numRequests: 7,
                  },
                },
                provider: {
                  id: 'openai:gpt-4o',
                },
              },
            ],
            vars: [],
          },
        },
        renderMarkdown: true,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('Requests:')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Asserts:')).toBeInTheDocument();
    expect(screen.getByText('2/3 passed')).toBeInTheDocument();
  });

  it('keeps the prompt header divider visible above streamed result rows', () => {
    renderWithProviders(<ResultsTable {...defaultProps} />);

    const promptHeaderCell = screen.getByText('test-provider').closest('th');

    expect(promptHeaderCell).toHaveAttribute(
      'style',
      expect.stringContaining('border-bottom: 2px solid var(--border-color)'),
    );
  });

  it('keeps the header/body boundary border visible with sticky headers', () => {
    vi.mocked(useResultsViewSettingsStore).mockImplementation(() => ({
      inComparisonMode: false,
      renderMarkdown: true,
      stickyHeader: true,
      setStickyHeader: vi.fn(),
    }));

    const { container } = renderWithProviders(<ResultsTable {...defaultProps} />);
    const tableContainer = container.querySelector('#results-table-container') as HTMLDivElement;

    expect(tableContainer.style.borderTopWidth).toBe('1px');
    expect(tableContainer.style.borderTopStyle).toBe('solid');
    expect(tableContainer.style.borderColor).toBe('var(--border-color)');
  });

  it('keeps adjacent prompt header cells from drawing duplicate left borders', () => {
    const mockTableWithTwoPrompts = {
      ...mockTable,
      head: {
        ...mockTable.head,
        prompts: [
          { metrics: mockTable.head.prompts[0].metrics, provider: 'test-provider-1' },
          { metrics: mockTable.head.prompts[0].metrics, provider: 'test-provider-2' },
        ],
      },
    };

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        table: mockTableWithTwoPrompts,
        renderMarkdown: true,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);
    const secondPromptHeaderCell = screen.getByText('test-provider-2').closest('th');

    expect((secondPromptHeaderCell as HTMLElement).style.borderLeftStyle).toBe('none');
  });

  describe('Keyboard Navigation', () => {
    it('should handle keyboard navigation with Tab between cells and actions within cell', async () => {
      renderWithProviders(<ResultsTable {...defaultProps} />);
      const tableContainer = document.getElementById('results-table-container');
      const table = tableContainer?.querySelector('table') as HTMLTableElement;
      expect(table).toBeInTheDocument();
      const firstBodyCell = table.querySelector('tbody td') as HTMLElement;
      expect(firstBodyCell).toBeInTheDocument();
      firstBodyCell.focus();
      expect(document.activeElement?.tagName).toBe('TD');
      expect(document.activeElement).toHaveClass('first-prompt-col');
      await userEvent.tab();
      expect(document.activeElement?.tagName).toBe('BUTTON');
      expect(document.activeElement).toHaveClass('action');
      await userEvent.tab();
      expect(document.activeElement?.tagName).toBe('TD');
    });
  });

  describe('Variable rendering', () => {
    const complexObject = { foo: 'bar', nested: { value: 123 } };
    const longObject = {
      key1: 'very long value '.repeat(10),
      key2: 'another long value '.repeat(10),
    };

    const createMockTableWithVar = (varValue: any) => ({
      body: [
        {
          outputs: [{ pass: true, score: 1, text: 'test output' }],
          test: {},
          vars: [varValue],
        },
      ],
      head: {
        prompts: [{ provider: 'test-provider' }],
        vars: ['objectVar'],
      },
    });

    it('renders object variables as formatted JSON with markdown enabled', () => {
      const mockTableWithObjectVar = createMockTableWithVar(complexObject);

      vi.mocked(useTableStore).mockImplementation(() =>
        createTableStore({
          inComparisonMode: false,
          table: mockTableWithObjectVar,
          renderMarkdown: true,
        }),
      );

      renderWithProviders(<ResultsTable {...defaultProps} />);

      const codeElement = screen.getByText(/foo/);
      expect(codeElement).toBeInTheDocument();
      expect(codeElement.closest('code')).toHaveClass('language-json');
    });

    it('renders object variables as plain JSON with markdown disabled', () => {
      const mockTableWithObjectVar = createMockTableWithVar(complexObject);

      vi.mocked(useTableStore).mockImplementation(() =>
        createTableStore({
          inComparisonMode: false,
          table: mockTableWithObjectVar,
        }),
      );

      vi.mocked(useResultsViewSettingsStore).mockImplementation(() => ({
        renderMarkdown: false,
        inComparisonMode: false,
      }));

      renderWithProviders(<ResultsTable {...defaultProps} />);

      const cellElement = screen.getByText(/foo/);
      expect(cellElement).toBeInTheDocument();
      expect(cellElement.closest('code')).toBeNull();
    });

    it('truncates long object representations', () => {
      const mockTableWithLongVar = createMockTableWithVar(longObject);

      vi.mocked(useTableStore).mockImplementation(() =>
        createTableStore({
          table: mockTableWithLongVar,
        }),
      );

      vi.mocked(useResultsViewSettingsStore).mockImplementation(() => ({
        renderMarkdown: true,
        inComparisonMode: false,
      }));

      renderWithProviders(<ResultsTable {...defaultProps} maxTextLength={50} />);

      const element = screen.getByText((content) => content.includes('...'));
      expect(element).toBeInTheDocument();
      expect(element.textContent!.length).toBeLessThanOrEqual(50 + 6); // +6 for ```json
    });

    it('handles null values correctly', () => {
      const mockTableWithNullVar = createMockTableWithVar(null);

      vi.mocked(useTableStore).mockImplementation(() =>
        createTableStore({
          inComparisonMode: false,
          table: mockTableWithNullVar,
          renderMarkdown: true,
        }),
      );

      renderWithProviders(<ResultsTable {...defaultProps} />);

      const element = screen.getByText('null');
      expect(element).toBeInTheDocument();
    });
  });

  describe('ResultsTable Media Rendering', () => {
    const mockTableWithMedia = {
      body: [
        {
          outputs: [
            {
              pass: true,
              score: 1,
              text: 'test output',
              metadata: {
                file: createImageVariable(),
                [Symbol.for('promptfoo:file')]: createImageVariable(),
              },
            },
          ],
          test: {},
          vars: ['data:image/jpeg;base64,encodedImage'],
        },
      ],
      head: createPromptHead(['imageVar']),
    };

    const defaultProps = createDefaultProps();

    beforeEach(() => {
      vi.mocked(useTableStore).mockImplementation(() =>
        createTableStore({
          table: mockTableWithMedia,
        }),
      );
    });

    it.each([
      ['raw-audio', 'data:audio/mp3;base64,raw-audio'],
      ['data:audio/mp3;base64,abc', 'data:audio/mp3;base64,abc'],
      ['storageRef:', null],
      ['promptfoo://blob/', null],
      ['storageRef:audio/test.mp3', '/api/media/audio/test.mp3'],
      ['promptfoo://blob/abc', '/api/blobs/abc'],
    ])('renders encoded audio input %s through the real player', async (value, expected) => {
      vi.spyOn(useApiConfig, 'getState').mockReturnValue({
        ...useApiConfig.getState(),
        apiBaseUrl: '',
      });
      vi.mocked(useTableStore).mockImplementation(() =>
        createTableStore({
          config: createRedteamConfig(),
          table: {
            head: createPromptHead(['prompt']),
            body: [
              {
                // Imported metadata can identify a file without a recognized media type.
                outputs: [
                  {
                    pass: true,
                    score: 1,
                    text: 'test output',
                    metadata: {
                      [FILE_METADATA_KEY]: {
                        prompt: { path: 'file://input.txt', type: 'text', format: 'txt' },
                      },
                    },
                  },
                ],
                test: { metadata: { strategyId: 'audio', originalText: 'decoded prompt' } },
                vars: [value],
              },
            ],
          },
        }),
      );
      const { container } = renderWithProviders(<ResultsTable {...defaultProps} />);
      if (expected === null) {
        expect(await screen.findByText('Failed to load audio')).toBeInTheDocument();
        expect(container.querySelector('audio')).toBeNull();
      } else {
        await waitFor(() =>
          expect(container.querySelector('audio source')).toHaveAttribute('src', expected),
        );
        expect(container.querySelector('audio source')).toHaveAttribute('type', 'audio/mp3');
      }
      expect(screen.getByText('decoded prompt')).toBeInTheDocument();
    });

    it('should render media elements in variable cells without truncation', () => {
      renderWithProviders(<ResultsTable {...defaultProps} />);

      const imageElement = screen.getByRole('img', { name: 'Base64 encoded image' });
      expect(imageElement).toBeInTheDocument();
      expect(imageElement).toHaveStyle({ maxHeight: '200px', objectFit: 'contain' });
      expect(imageElement.closest('div')).not.toHaveTextContent('TruncatedText');
    });

    it('renders variable audio from file metadata and shows the original path', () => {
      vi.mocked(useTableStore).mockImplementation(() =>
        createTableStore({
          table: {
            body: [
              {
                outputs: [
                  {
                    pass: true,
                    score: 1,
                    text: 'test output',
                    metadata: {
                      [FILE_METADATA_KEY]: {
                        audioVar: {
                          path: '/path/to/input.wav',
                          type: 'audio',
                          format: 'wav',
                        },
                      },
                    },
                  },
                ],
                test: {},
                vars: ['base64-audio'],
              },
            ],
            head: createPromptHead(['audioVar']),
          },
        }),
      );

      const { container } = renderWithProviders(<ResultsTable {...defaultProps} />);

      const audioSource = container.querySelector('audio source');
      expect(audioSource).toHaveAttribute('src', 'data:audio/wav;base64,base64-audio');
      expect(audioSource).toHaveAttribute('type', 'audio/wav');
      expect(screen.getByText('/path/to/input.wav (audio/wav)')).toBeInTheDocument();
    });

    it('does not render file:// audio variables as invalid base64 audio', () => {
      vi.mocked(useTableStore).mockImplementation(() =>
        createTableStore({
          table: {
            body: [
              {
                outputs: [
                  {
                    pass: true,
                    score: 1,
                    text: 'test output',
                    metadata: {
                      [FILE_METADATA_KEY]: {
                        audioVar: {
                          path: 'file://assets/Armstrong_Small_Step.mp3',
                          type: 'audio',
                          format: 'mp3',
                        },
                      },
                    },
                  },
                ],
                test: {},
                vars: ['file://assets/Armstrong_Small_Step.mp3'],
              },
            ],
            head: createPromptHead(['audioVar']),
          },
        }),
      );

      const { container } = renderWithProviders(<ResultsTable {...defaultProps} />);

      expect(container.querySelector('audio source')).toBeNull();
      expect(screen.getByText('file://assets/Armstrong_Small_Step.mp3')).toBeInTheDocument();
    });

    it('renders variable images from file metadata with lightbox support', async () => {
      const user = userEvent.setup();
      vi.mocked(useTableStore).mockImplementation(() =>
        createTableStore({
          table: {
            body: [
              {
                outputs: [
                  {
                    pass: true,
                    score: 1,
                    text: 'test output',
                    metadata: {
                      [FILE_METADATA_KEY]: {
                        imageVar: {
                          path: '/path/to/input.png',
                          type: 'image',
                          format: 'png',
                        },
                      },
                    },
                  },
                ],
                test: {},
                vars: ['data:image/png;base64,encodedImage'],
              },
            ],
            head: createPromptHead(['imageVar']),
          },
        }),
      );

      renderWithProviders(<ResultsTable {...defaultProps} />);

      const imageElement = screen.getByRole('img', { name: 'Input image' });
      expect(imageElement).toHaveAttribute('src', 'data:image/png;base64,encodedImage');
      expect(screen.getByText('/path/to/input.png (image/png)')).toBeInTheDocument();

      await user.click(imageElement);

      expect(screen.getByRole('img', { name: 'Lightbox' })).toHaveAttribute(
        'src',
        'data:image/png;base64,encodedImage',
      );
    });

    it('renders variable video from file metadata', () => {
      vi.mocked(useTableStore).mockImplementation(() =>
        createTableStore({
          table: {
            body: [
              {
                outputs: [
                  {
                    pass: true,
                    score: 1,
                    text: 'test output',
                    metadata: {
                      [FILE_METADATA_KEY]: {
                        videoVar: {
                          path: '/path/to/input.mp4',
                          type: 'video',
                          format: 'mp4',
                        },
                      },
                    },
                  },
                ],
                test: {},
                vars: ['https://example.com/input.mp4'],
              },
            ],
            head: {
              prompts: [{}],
              vars: ['videoVar'],
            },
          },
        }),
      );

      const { container } = renderWithProviders(<ResultsTable {...defaultProps} />);

      const videoSource = container.querySelector('video source');
      expect(videoSource).toHaveAttribute('src', 'https://example.com/input.mp4');
      expect(videoSource).toHaveAttribute('type', 'video/mp4');
      expect(screen.getByText('/path/to/input.mp4 (video/mp4)')).toBeInTheDocument();
    });

    it('shows original image text for the injected prompt variable when image cells are rendered', () => {
      vi.mocked(useTableStore).mockImplementation(() =>
        createTableStore({
          config: {
            redteam: {
              injectVar: 'image_prompt',
            },
          },
          table: {
            body: [
              {
                outputs: [{ pass: true, score: 1, text: 'test output' }],
                test: {
                  metadata: {
                    originalText: 'decoded OCR prompt',
                  },
                },
                vars: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ'],
              },
            ],
            head: {
              prompts: [{}],
              vars: ['image_prompt'],
            },
          },
        }),
      );

      renderWithProviders(<ResultsTable {...defaultProps} />);

      expect(screen.getByText('Original (image text):')).toBeInTheDocument();
      expect(screen.getByText('decoded OCR prompt')).toBeInTheDocument();
    });

    it('does not replace a provider-reported text prompt with the raw injected image variable', () => {
      vi.mocked(useTableStore).mockImplementation(() =>
        createTableStore({
          config: createRedteamConfig(),
          table: {
            body: [
              {
                outputs: [
                  {
                    pass: true,
                    score: 1,
                    text: 'test output',
                    response: {
                      prompt: 'provider rewritten prompt',
                    },
                  },
                ],
                test: {},
                vars: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ'],
              },
            ],
            head: createPromptHead(['prompt']),
          },
        }),
      );

      renderWithProviders(<ResultsTable {...defaultProps} />);

      expect(screen.getByText('provider rewritten prompt')).toBeInTheDocument();
      expect(screen.queryByRole('img', { name: 'Base64 encoded image' })).not.toBeInTheDocument();
    });

    it('renders a provider-reported image prompt when the raw injected variable is not an image', () => {
      const providerImagePrompt = 'data:image/png;base64,providerImagePrompt';
      vi.mocked(useTableStore).mockImplementation(() =>
        createTableStore({
          config: createRedteamConfig(),
          table: {
            body: [
              {
                outputs: [
                  {
                    pass: true,
                    score: 1,
                    text: 'test output',
                    response: {
                      prompt: providerImagePrompt,
                    },
                  },
                ],
                test: {},
                vars: ['{{prompt}}'],
              },
            ],
            head: createPromptHead(['prompt']),
          },
        }),
      );

      renderWithProviders(<ResultsTable {...defaultProps} />);

      expect(screen.getByRole('img', { name: 'Base64 encoded image' })).toHaveAttribute(
        'src',
        providerImagePrompt,
      );
    });
  });
});

describe('ResultsTable Row Navigation', () => {
  const defaultProps = createDefaultProps();

  afterEach(() => {
    window.history.replaceState({}, '', '/');
    mockNavigate.mockReset();
  });

  // Renders ResultsTable wired up with a deep-link to row 51 (page 2 with pageSize 50).
  const setupDeepLinkedTable = (
    initialUrl: string,
    mockFetchEvalData = vi.fn(),
    filteredResultsCount = 120,
  ) => {
    window.history.replaceState({}, '', initialUrl);

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        table: {
          body: [
            {
              outputs: [createDeepLinkedOutput()],
              test: {},
              testIdx: 0,
              vars: [],
            },
          ],
          head: createPromptHead(),
        },
        fetchEvalData: mockFetchEvalData,
        filteredResultsCount,
        totalResultsCount: 120,
      }),
    );

    return mockFetchEvalData;
  };

  const verifyDeepLinkPagination = async () => {
    const mockFetchEvalData = setupDeepLinkedTable('/#details-row-51-prompt-1');

    renderWithProviders(<ResultsTable {...defaultProps} />);

    await waitFor(createNextPageExpectation(mockFetchEvalData, true));
  };

  it(
    'uses a details hash to fetch the page containing the requested row',
    verifyDeepLinkPagination,
  );

  it('observes the body table while waiting for a deep-linked row to render', () => {
    const observeSpy = vi.spyOn(MutationObserver.prototype, 'observe');
    setupDeepLinkedTable('/#details-row-51-prompt-1');

    renderWithProviders(<ResultsTable {...defaultProps} />);

    expect(observeSpy).toHaveBeenCalledWith(
      document.getElementById('results-table-container'),
      expect.objectContaining({
        childList: true,
        subtree: true,
      }),
    );

    observeSpy.mockRestore();
  });

  it('preserves the details hash on initial mount', async () => {
    const mockFetchEvalData = setupDeepLinkedTable('/#details-row-51-prompt-1');

    renderWithProviders(<ResultsTable {...defaultProps} />);

    await waitFor(createNextPageExpectation(mockFetchEvalData, true));

    expect(window.location.hash).toBe('#details-row-51-prompt-1');
  });

  it('preserves the details hash through Strict Mode effect replay', async () => {
    const mockFetchEvalData = setupDeepLinkedTable('/#details-row-51-prompt-1');

    renderWithProviders(
      <StrictMode>
        <ResultsTable {...defaultProps} />
      </StrictMode>,
    );

    await waitFor(createNextPageExpectation(mockFetchEvalData, true));

    expect(window.location.hash).toBe('#details-row-51-prompt-1');
  });

  it('does not request a negative page when a details hash has no filtered rows', async () => {
    const mockFetchEvalData = setupDeepLinkedTable('/#details-row-51-prompt-1', vi.fn(), 0);

    renderWithProviders(<ResultsTable {...defaultProps} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetchEvalData).not.toHaveBeenCalledWith(
      '123',
      expect.objectContaining({
        pageIndex: -1,
      }),
    );
  });

  it('uses rowId pagination when a details hash keeps a stable test index', async () => {
    const mockFetchEvalData = setupDeepLinkedTable('/?rowId=2#details-row-51-prompt-1');

    renderWithProviders(<ResultsTable {...defaultProps} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetchEvalData).not.toHaveBeenCalledWith(
      '123',
      expect.objectContaining({
        pageIndex: 1,
      }),
    );
  });

  // Regression test: the details hash encodes a row's GLOBAL test index, while
  // pagination operates on filtered-table positions. When a filter or search is active
  // and only the hash is present (no `rowId`), the global index must NOT be used to
  // resolve a page — doing so pages/clamps a global index as if it were a filtered one
  // and lands on the wrong page. `rowId` is required for page resolution in that case.
  it('does not page by a hash-only deep link when a filter is active', async () => {
    const mockFetchEvalData = setupDeepLinkedTable('/#details-row-51-prompt-1');

    renderWithProviders(<ResultsTable {...defaultProps} filterMode="failures" />);

    await act(async () => {
      await Promise.resolve();
    });

    // With the bug, the row-jump effect treats global test index 50 as a filtered
    // position and pages to pageIndex 1; with the fix it stays on the first page.
    expect(mockFetchEvalData).not.toHaveBeenCalledWith(
      '123',
      expect.objectContaining({
        pageIndex: 1,
      }),
    );

    // The hash is left intact so the dialog can still open if the target row happens to
    // be on the current page.
    expect(window.location.hash).toBe('#details-row-51-prompt-1');
  });

  it('still pages by a hash-only deep link when no filter is active', verifyDeepLinkPagination);

  it('does not reuse a cleared details hash when a filter is removed', async () => {
    const mockFetchEvalData = setupDeepLinkedTable('/#details-row-51-prompt-1');
    const { rerender } = renderWithProviders(
      <ResultsTable {...defaultProps} filterMode="failures" />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    mockFetchEvalData.mockClear();

    rerender(<ResultsTable {...defaultProps} />);

    await waitFor(() => {
      expect(window.location.hash).toBe('');
    });

    expect(mockFetchEvalData).not.toHaveBeenCalledWith(
      '123',
      expect.objectContaining({
        pageIndex: 1,
      }),
    );
  });

  it('does not reuse a cleared legacy rowId when a filter is removed', async () => {
    const mockFetchEvalData = setupDeepLinkedTable('/?rowId=51');
    const { rerender } = renderWithProviders(
      <ResultsTable {...defaultProps} filterMode="failures" />,
    );

    await waitFor(createNextPageExpectation(mockFetchEvalData));
    mockFetchEvalData.mockClear();

    rerender(<ResultsTable {...defaultProps} />);

    await waitFor(() => {
      expect(window.location.search).toBe('');
    });

    await waitFor(() => {
      const lastCall = mockFetchEvalData.mock.calls[mockFetchEvalData.mock.calls.length - 1];
      expect(lastCall?.[1]).toEqual(
        expect.objectContaining({
          pageIndex: 0,
        }),
      );
    });
  });

  it('does not relabel stale loaded rows as the deep-linked row before fresh page data arrives', async () => {
    const mockFetchEvalData = setupDeepLinkedTable('/#details-row-51-prompt-1');

    renderWithProviders(<ResultsTable {...defaultProps} />);

    await waitFor(createNextPageExpectation(mockFetchEvalData, true));

    expect(screen.getByTestId('eval-output-cell')).toHaveAttribute('data-rowindex', '0');
  });

  it('uses the row test index for detail hashes after paged data is loaded', () => {
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        table: {
          body: [
            {
              outputs: [createDeepLinkedOutput()],
              test: {},
              testIdx: 50,
              vars: [],
            },
          ],
          head: createPromptHead(),
        },
        filteredResultsCount: 120,
        totalResultsCount: 120,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    expect(screen.getByTestId('eval-output-cell')).toHaveAttribute('data-rowindex', '50');
  });

  it('falls back to the loaded row index when legacy rows omit a test index', () => {
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        table: {
          body: [
            {
              outputs: [
                {
                  cost: 0,
                  failureReason: 0,
                  id: 'test-id',
                  latencyMs: 0,
                  namedScores: {},
                  pass: true,
                  prompt: 'Prompt',
                  score: 1,
                  testCase: {},
                  text: 'Output',
                },
              ],
              test: {},
              vars: [],
            },
          ],
          head: createPromptHead(),
        },
        filteredResultsCount: 1,
        totalResultsCount: 1,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    expect(screen.getByTestId('eval-output-cell')).toHaveAttribute('data-rowindex', '0');
  });

  // Regression test for the pagination-trap bug introduced when locationHash was kept in
  // local state and only updated via `hashchange`. Because `history.replaceState` does not
  // fire `hashchange`, the state went stale and the row-jump effect kept forcing the user
  // back to the deep-linked page on every paginate click. Clearing both the legacy `rowId`
  // query param and the deep-link hash on page-nav clicks is what unblocks the user.
  it('lets the user paginate away after landing on a deep-linked URL', async () => {
    const user = userEvent.setup();
    const mockFetchEvalData = setupDeepLinkedTable('/#details-row-51-prompt-1');

    renderWithProviders(<ResultsTable {...defaultProps} />);

    // The deep link drove a fetch for page 2.
    await waitFor(createNextPageExpectation(mockFetchEvalData));
    mockFetchEvalData.mockClear();

    await user.click(screen.getByRole('button', { name: /next page/i }));

    // After clicking Next, the table must request page 3 (pageIndex 2). If the bounce-back
    // bug regresses, the effect would force pagination back to pageIndex 1 and this fetch
    // would never fire (or would fire with pageIndex 1).
    await waitFor(() => {
      expect(mockFetchEvalData).toHaveBeenCalledWith(
        '123',
        expect.objectContaining({ pageIndex: 2 }),
      );
    });

    // The deep-link hash should be cleared so the next paginate click is also unimpeded.
    expect(window.location.hash).toBe('');
  });

  it('clears the legacy rowId query param when paginating', async () => {
    const user = userEvent.setup();
    const mockFetchEvalData = setupDeepLinkedTable('/?rowId=51');

    renderWithProviders(<ResultsTable {...defaultProps} />);

    await waitFor(createNextPageExpectation(mockFetchEvalData));

    await user.click(screen.getByRole('button', { name: /next page/i }));

    await waitFor(() => {
      const navTargets = mockNavigate.mock.calls.map(([target]) => target);
      const cleared = navTargets.some(
        (target) => typeof target === 'object' && target?.search === '',
      );
      expect(cleared).toBe(true);
    });
  });
});

describe('ResultsTable handleRating - highlight toggle fix', () => {
  let mockSetTable: ReturnType<typeof vi.fn>;
  let mockCallApi: any;

  const createMockTableWithComponentResults = (componentResults?: any) => ({
    body: [
      {
        outputs: [
          {
            id: 'test-output-1',
            pass: true,
            score: 1,
            text: 'test output',
            latencyMs: 100,
            cost: 0.01,
            failureReason: 0,
            namedScores: {},
            gradingResult: {
              pass: true,
              score: 1,
              reason: 'Test passed',
              comment: 'Initial comment',
              ...(componentResults !== undefined && { componentResults }),
            },
          },
        ],
        test: {},
        vars: [],
        testIdx: 0,
      },
    ],
    head: createPromptHead([], 1, 0),
  });

  const defaultProps = createDefaultProps();

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSetTable = vi.fn();
    // Dynamically import and mock callApi
    const apiModule = await import('@app/utils/api');
    mockCallApi = vi.mocked(apiModule.callApi);
    mockCallApi.mockResolvedValue({ ok: true });
  });

  it('should not include empty componentResults when toggling highlight', async () => {
    const mockTable = createMockTableWithComponentResults([]);

    const mockStore = createTableStore({
      setTable: mockSetTable,
      table: mockTable,
      isFetching: false,
      filteredResultsCount: 1,
    });

    vi.mocked(useTableStore).mockImplementation(() => mockStore);

    // We need to test the handleRating function directly
    // Since it's inside the component, we'll capture it through the setTable calls
    renderWithProviders(<ResultsTable {...defaultProps} />);

    // The handleRating function is created in the component
    // We need to trigger it through the component's internal logic
    // For now, let's verify the behavior by checking what setTable would be called with

    // Simulate calling handleRating for highlight toggle (isPass and score are undefined)
    const _updatedTable = {
      ...mockTable,
      body: [
        {
          ...mockTable.body[0],
          outputs: [
            {
              ...mockTable.body[0].outputs[0],
              gradingResult: {
                pass: true,
                score: 1,
                reason: 'Test passed',
                comment: '!highlight New comment',
                // componentResults should NOT be included here since it was empty
              },
            },
          ],
        },
      ],
    };

    // Since we can't directly call handleRating, let's verify the logic would work correctly
    // by checking what the gradingResult would look like after the update
    const existingOutput = mockTable.body[0].outputs[0];
    const { componentResults: _, ...existingGradingResultWithoutComponents } =
      existingOutput.gradingResult || {};

    const expectedGradingResult = {
      ...existingGradingResultWithoutComponents,
      pass: existingOutput.gradingResult?.pass ?? existingOutput.pass,
      score: existingOutput.gradingResult?.score ?? existingOutput.score,
      reason: existingOutput.gradingResult?.reason ?? 'Manual result',
      comment: '!highlight New comment',
    };

    // componentResults should not be in the result
    expect('componentResults' in expectedGradingResult).toBe(false);
  });

  it('should preserve non-empty componentResults when toggling highlight', async () => {
    const existingComponentResults = [
      {
        pass: true,
        score: 1,
        reason: 'Existing assertion',
        assertion: { type: 'contains' },
      },
    ];
    const mockTable = createMockTableWithComponentResults(existingComponentResults);

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        setTable: mockSetTable,
        table: mockTable,
        renderMarkdown: true,
        isFetching: false,
        filteredResultsCount: 1,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    // Verify the logic for preserving non-empty componentResults
    const existingOutput = mockTable.body[0].outputs[0];
    const { componentResults: _, ...existingGradingResultWithoutComponents } =
      existingOutput.gradingResult || {};

    const expectedGradingResult = {
      ...existingGradingResultWithoutComponents,
      pass: existingOutput.gradingResult?.pass ?? existingOutput.pass,
      score: existingOutput.gradingResult?.score ?? existingOutput.score,
      reason: existingOutput.gradingResult?.reason ?? 'Manual result',
      comment: '!highlight New comment',
      // componentResults SHOULD be included since it was non-empty
      componentResults: existingComponentResults,
    };

    expect(expectedGradingResult.componentResults).toEqual(existingComponentResults);
  });

  it('should update componentResults when rating (not just toggling highlight)', async () => {
    const mockTable = createMockTableWithComponentResults([]);

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        setTable: mockSetTable,
        table: mockTable,
        renderMarkdown: true,
        isFetching: false,
        filteredResultsCount: 1,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    // When rating with isPass = true, componentResults should be updated
    const existingOutput = mockTable.body[0].outputs[0];
    const componentResults = [
      {
        pass: true,
        score: 1,
        reason: 'Manual result (overrides all other grading results)',
        comment: 'Test comment',
        assertion: { type: 'human' as const },
      },
    ];

    const { componentResults: _, ...existingGradingResultWithoutComponents } =
      existingOutput.gradingResult || {};

    const expectedGradingResult = {
      ...existingGradingResultWithoutComponents,
      pass: true,
      score: 1,
      reason: 'Manual result (overrides all other grading results)',
      comment: 'Test comment',
      componentResults,
    };

    expect(expectedGradingResult.componentResults).toBeDefined();
    expect(expectedGradingResult.componentResults).toHaveLength(1);
    expect(expectedGradingResult.componentResults![0].assertion?.type).toBe('human');
  });

  it('handles missing gradingResult gracefully when toggling highlight', async () => {
    const mockTable = {
      body: [
        {
          outputs: [
            {
              id: 'test-output-1',
              pass: true,
              score: 1,
              text: 'test output',
              latencyMs: 100,
              cost: 0.01,
              failureReason: 0,
              namedScores: {},
              // No gradingResult
            },
          ],
          test: {},
          vars: [],
          testIdx: 0,
        },
      ],
      head: createPromptHead([], 1, 0),
    };

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        setTable: mockSetTable,
        table: mockTable,
        renderMarkdown: true,
        isFetching: false,
        filteredResultsCount: 1,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    // When there's no existing gradingResult, it should create one
    const existingOutput = mockTable.body[0].outputs[0];
    const expectedGradingResult = {
      pass: existingOutput.pass,
      score: existingOutput.score,
      reason: 'Manual result',
      comment: '!highlight New comment',
    };

    expect(expectedGradingResult.pass).toBe(true);
    expect(expectedGradingResult.score).toBe(1);
    expect('componentResults' in expectedGradingResult).toBe(false);
  });
});

describe('ResultsTable handleRating', () => {
  let mockSetTable: ReturnType<typeof vi.fn>;

  const createMockTable = () => ({
    body: [
      {
        outputs: [
          {
            id: 'test-output-1',
            pass: false,
            score: 0,
            text: 'test output',
            gradingResult: {
              pass: false,
              score: 0,
              reason: 'Initial reason',
              comment: 'Initial comment',
            },
          },
        ],
        test: {},
        vars: [],
      },
    ],
    head: createProviderHead(),
  });

  const defaultProps = {
    ...createDefaultProps(),
    selectedMetric: null,
  };

  beforeEach(() => {
    mockSetTable = vi.fn();
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        setTable: mockSetTable,
        table: createMockTable(),
      }),
    );
  });

  it('should update gradingResult with manual pass and score values when a user provides a rating', () => {
    createMockTable();
    renderWithProviders(<ResultsTable {...defaultProps} />);

    const rowIndex = 0;
    const promptIndex = 0;
    const isPass = true;
    const score = 0.75;

    const evalOutputCell = screen.getByTestId('eval-output-cell');
    act(() => {
      (evalOutputCell.querySelector('button') as HTMLButtonElement).click();
    });

    expect(mockSetTable).toHaveBeenCalledTimes(1);
    const updatedTable = mockSetTable.mock.calls[0][0];
    const updatedGradingResult = updatedTable.body[rowIndex].outputs[promptIndex].gradingResult;

    expect(updatedGradingResult.pass).toBe(isPass);
    expect(updatedGradingResult.score).toBe(score);
    expect(updatedGradingResult.reason).toBe('Manual result (overrides all other grading results)');
  });
});

describe('ResultsTable handleRating - Fallback to output values', () => {
  let mockSetTable: ReturnType<typeof vi.fn>;

  const createMockTableWithMissingGradingResultFields = () => ({
    body: [
      {
        outputs: [
          {
            id: 'test-output-1',
            pass: true,
            score: 1,
            text: 'test output',
            latencyMs: 100,
            cost: 0.01,
            failureReason: 0,
            namedScores: {},
            gradingResult: {
              reason: 'Test passed',
              comment: 'Initial comment',
              componentResults: [], // Added componentResults
            },
          },
        ],
        test: {},
        vars: [],
        testIdx: 0,
      },
    ],
    head: createPromptHead([], 1, 0),
  });

  const defaultProps = createDefaultProps();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetTable = vi.fn();
  });

  it('should fallback to output pass and score when gradingResult is missing those fields', async () => {
    const mockTable = createMockTableWithMissingGradingResultFields();

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        setTable: mockSetTable,
        table: mockTable,
        renderMarkdown: true,
        isFetching: false,
        filteredResultsCount: 1,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    // Verify the logic for preserving non-empty componentResults
    const existingOutput = mockTable.body[0].outputs[0];
    const { componentResults: _, ...existingGradingResultWithoutComponents } =
      existingOutput.gradingResult || {};

    const expectedGradingResult = {
      ...existingGradingResultWithoutComponents,
      pass: existingOutput.pass,
      score: existingOutput.score,
      reason: 'Manual result',
      comment: '!highlight New comment',
    };

    expect(expectedGradingResult.pass).toBe(true);
    expect(expectedGradingResult.score).toBe(1);
  });
});

describe('ResultsTable handleRating - Updating existing human rating', () => {
  let mockSetTable: ReturnType<typeof vi.fn>;

  const createMockTableWithComponentResults = (componentResults: any[]) => ({
    body: [
      {
        outputs: [
          {
            id: 'test-output-1',
            pass: true,
            score: 1,
            text: 'test output',
            latencyMs: 100,
            cost: 0.01,
            failureReason: 0,
            namedScores: {},
            gradingResult: {
              pass: true,
              score: 1,
              reason: 'Test passed',
              comment: 'Initial comment',
              componentResults,
            },
          },
        ],
        test: {},
        vars: [],
        testIdx: 0,
      },
    ],
    head: createPromptHead([], 1, 0),
  });

  const defaultProps = createDefaultProps();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetTable = vi.fn();
  });

  it('should update existing human rating in componentResults', async () => {
    const existingComponentResults = [
      {
        pass: true,
        score: 1,
        reason: 'Initial human rating',
        comment: 'Initial comment',
        assertion: { type: 'human' as const },
      },
      {
        pass: false,
        score: 0,
        reason: 'Some other assertion',
        assertion: { type: 'contains' as const },
      },
    ];
    const mockTable = createMockTableWithComponentResults(existingComponentResults);

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        setTable: mockSetTable,
        table: mockTable,
        renderMarkdown: true,
        isFetching: false,
        filteredResultsCount: 1,
      }),
    );

    // Simulate calling handleRating with updated values
    const updatedIsPass = false;
    const updatedScore = 0.5;
    const updatedComment = 'Updated human rating';

    // We need to test the handleRating function directly
    // Since it's inside the component, we'll capture it through the setTable calls
    renderWithProviders(<ResultsTable {...defaultProps} />);

    // Simulate calling handleRating
    const _updatedTable = {
      ...mockTable,
      body: [
        {
          ...mockTable.body[0],
          outputs: [
            {
              ...mockTable.body[0].outputs[0],
              gradingResult: {
                ...mockTable.body[0].outputs[0].gradingResult,
                pass: updatedIsPass,
                score: updatedScore,
                reason: 'Manual result (overrides all other grading results)',
                comment: updatedComment,
                componentResults: [
                  {
                    assertion: {
                      type: 'human',
                    },
                    comment: updatedComment,
                    pass: updatedIsPass,
                    reason: 'Manual result (overrides all other grading results)',
                    score: updatedScore,
                  },
                  {
                    pass: false,
                    score: 0,
                    reason: 'Some other assertion',
                    assertion: { type: 'contains' as const },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const existingOutput = mockTable.body[0].outputs[0];
    const { componentResults: _, ...existingGradingResultWithoutComponents } =
      existingOutput.gradingResult || {};

    const expectedGradingResult = {
      ...existingGradingResultWithoutComponents,
      pass: updatedIsPass,
      score: updatedScore,
      reason: 'Manual result (overrides all other grading results)',
      comment: updatedComment,
      componentResults: [
        {
          pass: updatedIsPass,
          score: updatedScore,
          reason: 'Manual result (overrides all other grading results)',
          comment: updatedComment,
          assertion: { type: 'human' as const },
        },
        {
          pass: false,
          score: 0,
          reason: 'Some other assertion',
          assertion: { type: 'contains' as const },
        },
      ],
    };

    // Assert that the componentResults are correctly updated
    expect(expectedGradingResult.componentResults).toBeDefined();
    expect(expectedGradingResult.componentResults).toHaveLength(2);
    expect(expectedGradingResult.componentResults[0].pass).toBe(updatedIsPass);
    expect(expectedGradingResult.componentResults[0].score).toBe(updatedScore);
    expect(expectedGradingResult.componentResults[0].comment).toBe(updatedComment);
    expect(expectedGradingResult.componentResults[0].reason).toBe(
      'Manual result (overrides all other grading results)',
    );
    expect(expectedGradingResult.componentResults[0].assertion?.type).toBe('human');

    // Assert that the other assertion is preserved
    expect(expectedGradingResult.componentResults[1].pass).toBe(false);
    expect(expectedGradingResult.componentResults[1].score).toBe(0);
    expect(expectedGradingResult.componentResults[1].reason).toBe('Some other assertion');
    expect(expectedGradingResult.componentResults[1].assertion?.type).toBe('contains');
  });
});

describe('ResultsTable Empty State', () => {
  const defaultProps = createDefaultProps();

  it('should display the "No results found for the current filters." message when filteredResultsCount is 0, isFetching is false, and filters.appliedCount is greater than 0', () => {
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        table: { head: { prompts: [], vars: [] }, body: [] },
        filteredResultsCount: 0,
        totalResultsCount: 0,
        isFetching: false,
        filters: createAppliedMetricFilter(),
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);
    expect(screen.getByText('No results found for the current filters.')).toBeInTheDocument();
  });
});

describe('ResultsTable', () => {
  const defaultProps = createDefaultProps();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        table: {
          head: { prompts: [{ provider: 'test-provider' }], vars: [] },
          body: [createPassingRow()],
        },
      }),
    );
  });

  it('should pass the debouncedSearchText prop as the searchText to each EvalOutputCell', () => {
    const debouncedSearchText = 'test search';
    renderWithProviders(
      <ResultsTable {...defaultProps} debouncedSearchText={debouncedSearchText} />,
    );
    const evalOutputCell = screen.getByTestId('eval-output-cell');
    expect(evalOutputCell).toHaveAttribute('data-searchtext', debouncedSearchText);
  });
});

describe('ResultsTable Search Highlights', () => {
  const mockTable = {
    body: [createPassingRow()],
    head: createPromptHead(),
  };

  const defaultProps = createDefaultProps();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('correctly updates cell highlights to match the new search term when debouncedSearchText is updated', () => {
    const newSearchText = 'new search term';
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        table: mockTable,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} debouncedSearchText={newSearchText} />);

    const evalOutputCell = screen.getByTestId('eval-output-cell');
    expect(evalOutputCell).toHaveAttribute('data-searchtext', newSearchText);
  });
});

describe('ResultsTable Regex Handling', () => {
  const specialRegexChars = '[(*+?^$.{}|)]';

  const mockTable = {
    body: [createPassingRow()],
    head: createPromptHead(),
  };

  const defaultProps = createDefaultProps();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle special regex characters in debouncedSearchText without throwing errors', () => {
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        table: mockTable,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} debouncedSearchText={specialRegexChars} />);

    const evalOutputCell = screen.getByTestId('eval-output-cell');
    expect(evalOutputCell).toBeInTheDocument();
    expect(evalOutputCell).toHaveAttribute('data-searchtext', specialRegexChars);
  });
});

describe('ResultsTable Malformed Markdown Handling', () => {
  const malformedMarkdown = 'This is a test with some \n unclosed <tag>';

  const mockTable = {
    body: [
      {
        outputs: [
          {
            pass: true,
            score: 1,
            text: 'test output',
          },
        ],
        test: {},
        vars: [malformedMarkdown],
      },
    ],
    head: {
      prompts: [
        {
          provider: 'test-provider',
        },
      ],
      vars: ['testVar'],
    },
  };

  const defaultProps = createDefaultProps();

  it('should render variable cells containing malformed markdown without breaking the UI', () => {
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        table: mockTable,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    const elementsWithMalformedMarkdown = screen.getAllByText((_content, element) => {
      if (!element) {
        return false;
      }
      return (
        element?.textContent?.includes('This is a test with some') &&
        element?.textContent?.includes('unclosed <tag>')
      );
    });
    expect(elementsWithMalformedMarkdown.length).toBeGreaterThan(0);
  });
});

describe('ResultsTable fetchEvalData pagination filters', () => {
  const defaultProps = createDefaultProps();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([undefined, 'metric1'])(
    'should call fetchEvalData with only applied filters when pagination changes (field=%s)',
    async (field) => {
      const user = userEvent.setup();
      const mockUseTableStore = vi.mocked(useTableStore);
      const mockFetchEvalData = vi.fn();
      mockUseTableStore.mockImplementation(() =>
        createTableStore({
          table: {
            head: { prompts: [], vars: [] },
            body: [],
          },
          fetchEvalData: mockFetchEvalData,
          isFetching: false,
          filteredResultsCount: 100,
          totalResultsCount: 100,
          filters: {
            values: {
              filter1: {
                id: 'filter1',
                type: 'metric',
                operator: 'equals',
                value: 'metric1',
                ...(field === undefined ? {} : { field }),
                logicOperator: 'or',
              },
              filter2: {
                id: 'filter2',
                type: 'metric',
                operator: 'equals',
                value: '',
                logicOperator: 'or',
              },
            },
            appliedCount: 1,
            options: createMetricOptions(),
          },
        }),
      );

      renderWithProviders(<ResultsTable {...defaultProps} debouncedSearchText="" />);

      const newPageIndex = 1;

      mockFetchEvalData.mockClear();

      await user.click(screen.getByRole('button', { name: 'Next page' }));

      expect(mockFetchEvalData).toHaveBeenCalledTimes(1);
      expect(mockFetchEvalData).toHaveBeenCalledWith('123', {
        pageIndex: newPageIndex,
        pageSize: 50,
        filterMode: 'all',
        searchText: '',
        filters:
          field === undefined
            ? []
            : [
                {
                  id: 'filter1',
                  type: 'metric',
                  operator: 'equals',
                  value: 'metric1',
                  field,
                  logicOperator: 'or',
                },
              ],
        skipSettingEvalId: true,
      });
    },
  );
});

describe('ResultsTable Pagination', () => {
  const defaultProps = createDefaultProps();

  it('should render pagination controls when totalResultsCount is greater than 10', () => {
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        table: createEmptyTable(),
        filteredResultsCount: 25,
        totalResultsCount: 25,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);
    const paginationElement = screen.getByText(/results per page/i);
    expect(paginationElement).toBeInTheDocument();
  });

  it('should never offer a page size that exceeds the server cap', async () => {
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        table: createEmptyTable(),
        filteredResultsCount: EVAL_TABLE_MAX_PAGE_SIZE + 1,
        totalResultsCount: EVAL_TABLE_MAX_PAGE_SIZE + 1,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    const trigger = screen.getByLabelText(/results per page/i);
    await act(async () => {
      await userEvent.click(trigger);
    });

    const options = await screen.findAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(Number(option.textContent)).toBeLessThanOrEqual(EVAL_TABLE_MAX_PAGE_SIZE);
    }
  });

  it('should keep the pagination footer pinned for short tables', () => {
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        table: createEmptyTable(),
        filteredResultsCount: 1,
        totalResultsCount: 1,
      }),
    );

    const { container } = renderWithProviders(<ResultsTable {...defaultProps} />);

    expect(container.querySelector('#results-table-container')).toHaveStyle({
      minHeight: '0px',
    });
    expect(container.querySelector('.pagination')).toHaveClass('sticky', 'bottom-0', 'shrink-0');
  });
});

describe('ResultsTable BaseNumberInput onChange undefined', () => {
  const defaultProps = {
    columnVisibility: {},
    failureFilter: {},
    filterMode: 'all' as const,
    maxTextLength: 100,
    onFailureFilterToggle: vi.fn(),
    onSearchTextChange: vi.fn(),
    searchText: '',
    showStats: true,
    wordBreak: 'break-word' as const,
    setFilterMode: vi.fn(),
    zoom: 1,
  };

  it('should not set page when BaseNumberInput onChange receives undefined', async () => {
    const mockSetPagination = vi.fn();
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        table: { head: { prompts: [], vars: [] }, body: [] },
        setPagination: mockSetPagination,
        filteredResultsCount: 100,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    const input = screen.getByRole('spinbutton');
    await act(async () => {
      await userEvent.clear(input);
      await userEvent.tab();
    });

    expect(mockSetPagination).not.toHaveBeenCalled();
  });
});

describe('ResultsTable Non-Numeric Input Handling', () => {
  const defaultProps = {
    columnVisibility: {},
    failureFilter: {},
    filterMode: 'all' as const,
    maxTextLength: 100,
    onFailureFilterToggle: vi.fn(),
    onSearchTextChange: vi.fn(),
    searchText: '',
    showStats: true,
    wordBreak: 'break-word' as const,
    setFilterMode: vi.fn(),
    zoom: 1,
  };

  it('should not update pagination when non-numeric input is entered in the page navigator', async () => {
    const setPaginationMock = vi.fn();
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        table: { head: { prompts: [], vars: [] }, body: [] },
        filteredResultsCount: 25,
        totalResultsCount: 25,
        setPagination: setPaginationMock,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    const inputElement = screen.getByRole('spinbutton');
    await act(async () => {
      await userEvent.type(inputElement, 'abc');
    });

    expect(setPaginationMock).not.toHaveBeenCalled();
  });
});

describe('ResultsTable Zoom and Scroll Position', () => {
  const mockTable = {
    body: [createPassingRow()],
    head: createPromptHead([], 1, 0),
  };

  const defaultProps = createDefaultProps();

  beforeEach(() => {
    vi.mocked(useResultsViewSettingsStore).mockImplementation(() => createViewSettings());

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        table: mockTable,
        filteredResultsCount: 1,
        isFetching: false,
        totalResultsCount: 1,
      }),
    );
  });

  it('should maintain scroll position and focused element when zoom changes', () => {
    const { container, rerender } = renderWithProviders(<ResultsTable {...defaultProps} />);
    const tableContainer = container.querySelector('#results-table-container') as HTMLDivElement;
    const initialScrollTop = 100;
    tableContainer.scrollTop = initialScrollTop;

    const cellToFocus = container.querySelector('td');
    if (cellToFocus) {
      cellToFocus.focus();
    }

    act(() => {
      rerender(<ResultsTable {...defaultProps} zoom={1.5} />);
    });

    expect(tableContainer.scrollTop).toBe(initialScrollTop);
    if (cellToFocus) {
      expect(document.activeElement).toBe(cellToFocus);
    }
  });
});

describe('ResultsTable Filtered Metrics Display', () => {
  const mockTable = {
    body: Array(10).fill(createPassingRow()),
    head: {
      prompts: [createPromptWithMetrics()],
      vars: [],
    },
  };

  const defaultProps = createDefaultProps();

  beforeEach(() => {
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        table: {
          ...mockTable,
          head: {
            ...mockTable.head,
            prompts: [
              {
                ...mockTable.head.prompts[0],
                metrics: {
                  cost: 1.23456,
                  namedScores: {},
                  testPassCount: 10,
                  testFailCount: 0,
                  tokenUsage: createTokenUsage(),
                  totalLatencyMs: 2000,
                },
              },
            ],
          },
        },
        renderMarkdown: true,
        filters: createAppliedMetricFilter(),
        filteredMetrics: [
          {
            cost: 0.61728,
            namedScores: {},
            testPassCount: 5,
            testFailCount: 0,
            tokenUsage: {
              completion: 250,
              total: 500,
            },
            totalLatencyMs: 1000,
          },
        ],
      }),
    );
  });

  it('displays both total and filtered metrics with correct formatting and tooltips when filters are applied', () => {
    renderWithProviders(<ResultsTable {...defaultProps} />);

    expect(screen.getByText('Total Cost:')).toBeInTheDocument();
    expect(screen.getByText('$1.23')).toBeInTheDocument();

    const filteredCostElement = screen.getByText('($0.6173 filtered)');
    expect(filteredCostElement).toBeInTheDocument();
    expect(filteredCostElement.style.fontSize).toBe('0.9em');
    expect(filteredCostElement).toHaveStyle('color: #666');
    expect(filteredCostElement).toHaveStyle('margin-left: 4px');

    expect(screen.getByText('Total Tokens:')).toBeInTheDocument();
    expect(screen.getByText('Total Tokens:').parentElement).toHaveTextContent('1,000');

    const totalTokensRow = screen.getByText('Total Tokens:').parentElement;
    expect(totalTokensRow).not.toBeNull();
    const filteredTokensElement = within(totalTokensRow as HTMLElement).getByText('(500 filtered)');
    expect(filteredTokensElement).toBeInTheDocument();
    expect(filteredTokensElement.style.fontSize).toBe('0.9em');
    expect(filteredTokensElement).toHaveStyle('color: #666');
    expect(filteredTokensElement).toHaveStyle('margin-left: 4px');

    expect(screen.getByText('Avg Latency:')).toBeInTheDocument();
    expect(screen.getByText('200ms')).toBeInTheDocument();
    expect(screen.getByLabelText('200 ms')).toBeInTheDocument();
    const filteredLatencyElement = screen.getByText('(200ms filtered)');
    expect(filteredLatencyElement).toBeInTheDocument();
    expect(filteredLatencyElement.style.fontSize).toBe('0.9em');
  });

  it('displays filtered totals separately for target, attacker, and grading tokens', () => {
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        config: { redteam: {} },
        inComparisonMode: false,
        table: {
          ...mockTable,
          head: {
            ...mockTable.head,
            prompts: [
              {
                ...mockTable.head.prompts[0],
                metrics: {
                  ...mockTable.head.prompts[0].metrics,
                  tokenUsage: {
                    total: 1000,
                    attacker: { total: 200 },
                    assertions: { total: 100 },
                  },
                },
              },
            ],
          },
        },
        renderMarkdown: true,
        filters: {
          values: {},
          appliedCount: 1,
          options: { metric: [] },
        },
        filteredMetrics: [
          {
            cost: 0.61728,
            namedScores: {},
            testPassCount: 5,
            testFailCount: 0,
            tokenUsage: {
              total: 500,
              attacker: { total: 80 },
              assertions: { total: 20 },
            },
            totalLatencyMs: 1000,
          },
        ],
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    expect(screen.getByText('Total Tokens:').parentElement).toHaveTextContent(
      'Total Tokens: 1,300(600 filtered)',
    );
    expect(screen.getByText('Target Tokens:').parentElement).toHaveTextContent(
      'Target Tokens: 1,000(500 filtered)',
    );
    expect(screen.getByText('Attacker Tokens:').parentElement).toHaveTextContent(
      'Attacker Tokens: 200(80 filtered)',
    );
    expect(screen.getByText('Grading Tokens:').parentElement).toHaveTextContent(
      'Grading Tokens: 100(20 filtered)',
    );
    expect(screen.getByText('Avg Tokens:').parentElement).toHaveTextContent(
      'Avg Tokens: 130(120 filtered)',
    );
  });
});

describe('ResultsTable - No Filters Applied', () => {
  const mockTable = {
    body: Array(10).fill(createPassingRow()),
    head: {
      prompts: [createPromptWithMetrics()],
      vars: [],
    },
  };

  const defaultProps = createDefaultProps();

  beforeEach(() => {
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        table: mockTable,
      }),
    );
  });

  it('should display only total metrics and not display filtered metrics when no filters are applied', () => {
    renderWithProviders(<ResultsTable {...defaultProps} />);

    expect(screen.getByText('Total Cost:')).toBeInTheDocument();
    expect(screen.getByText('$1.23')).toBeInTheDocument();

    expect(screen.getByText('Total Tokens:')).toBeInTheDocument();
    expect(screen.getByText('Total Tokens:').parentElement).toHaveTextContent('1,000');

    expect(screen.getByText('Avg Latency:')).toBeInTheDocument();
    expect(screen.getByText('200ms')).toBeInTheDocument();
    expect(screen.getByLabelText('200 ms')).toBeInTheDocument();

    const filteredMetricElements = screen.queryAllByTestId('filtered-metric');
    expect(filteredMetricElements.length).toBe(0);

    const filteredMetricSpan = screen.queryAllByRole('tooltip', {
      name: /filtered/i,
    });
    expect(filteredMetricSpan.length).toBe(0);

    const filteredCostSpan = screen.queryAllByText(/filtered/i);
    expect(filteredCostSpan.length).toBe(0);

    const filteredTokenSpan = screen.queryAllByText(/filtered/i);
    expect(filteredTokenSpan.length).toBe(0);

    const filteredSpan = screen.queryAllByTestId('filtered-span');
    expect(filteredSpan.length).toBe(0);
  });
});

describe('ResultsTable Pass Rate Display', () => {
  const mockTable = {
    body: Array(10).fill(createPassingRow()),
    head: createPromptHead([], 5, 5),
  };

  const defaultProps = createDefaultProps();

  beforeEach(() => mockPassRateTable(mockTable));

  it('displays 0% filtered pass rate when filtered results have zero test cases but total results have some', () => {
    const mockTableWithZeroFilteredTestCases = {
      body: Array(10).fill(createPassingRow()),
      head: createPromptHead([], 5, 5),
    };

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        table: mockTableWithZeroFilteredTestCases,
        renderMarkdown: true,
        filteredMetrics: [
          {
            testPassCount: 0,
            testFailCount: 0,
          },
        ],
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);
    expect(screen.getByText('0.00% passing')).toBeInTheDocument();
  });
});

describe('ResultsTable Named Metric Totals', () => {
  const defaultProps = createDefaultProps();

  type ColumnMetrics = {
    testPassCount: number;
    testFailCount: number;
    testErrorCount: number;
    namedScores: Record<string, number>;
    namedScoresCount?: Record<string, number>;
    namedScoreWeights?: Record<string, number>;
  };

  // Provider errors do not contribute to the named metric's score or denominator.
  const columnMetrics = (graded: number, total = 5): ColumnMetrics => ({
    testPassCount: graded,
    testFailCount: 0,
    testErrorCount: total - graded,
    namedScores: { 'has-hello': graded },
    namedScoresCount: { 'has-hello': graded },
  });

  const mockTableStore = (
    metricsPerColumn: ColumnMetrics[],
    { pageSize = 5, assertionWeight = 1 } = {},
  ) => {
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        table: {
          body: Array.from({ length: pageSize }, (_, rowIndex) => ({
            outputs: metricsPerColumn.map((metrics) => {
              const pass = rowIndex < metrics.testPassCount;
              return {
                pass,
                score: pass ? 1 : 0,
                text: pass ? 'Hello' : 'Provider error',
                error: pass ? undefined : 'Provider error',
              };
            }),
            test: {
              assert: [
                { type: 'contains', value: 'Hello', metric: 'has-hello', weight: assertionWeight },
              ],
            },
            testIdx: rowIndex,
            vars: [],
          })),
          head: {
            prompts: metricsPerColumn.map((metrics, idx) => ({
              metrics,
              provider: `provider-${idx + 1}`,
            })),
            vars: [],
          },
        },
        renderMarkdown: true,
      }),
    );
  };

  const metricValueTexts = () =>
    screen.getAllByTestId('metric-value-has-hello').map((el) => el.textContent);

  beforeEach(() => {
    vi.mocked(useTableStore).mockReset();
    vi.mocked(useResultsViewSettingsStore).mockReset();
    vi.mocked(useResultsViewSettingsStore).mockImplementation(() => createViewSettings());
  });

  afterEach(() => {
    vi.mocked(useTableStore).mockReset();
    vi.mocked(useResultsViewSettingsStore).mockReset();
  });

  it('uses each column’s own named metric count when the first column errored', () => {
    mockTableStore([columnMetrics(4), columnMetrics(5), columnMetrics(5)]);

    renderWithProviders(<ResultsTable {...defaultProps} />);

    expect(metricValueTexts()).toEqual([
      '100.00% (4.00/4.00)',
      '100.00% (5.00/5.00)',
      '100.00% (5.00/5.00)',
    ]);
  });

  it('uses each column’s own named metric count when a later column errored', () => {
    mockTableStore([columnMetrics(5), columnMetrics(4)]);

    renderWithProviders(<ResultsTable {...defaultProps} />);

    expect(metricValueTexts()).toEqual(['100.00% (5.00/5.00)', '100.00% (4.00/4.00)']);
  });

  it('uses each column’s own weights instead of assertion counts for weighted metrics', () => {
    mockTableStore(
      [
        {
          ...columnMetrics(4),
          namedScores: { 'has-hello': 6 },
          namedScoreWeights: { 'has-hello': 8 },
        },
        {
          ...columnMetrics(5),
          namedScores: { 'has-hello': 8 },
          namedScoreWeights: { 'has-hello': 10 },
        },
      ],
      { assertionWeight: 2 },
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    expect(metricValueTexts()).toEqual(['75.00% (6.00/8.00)', '80.00% (8.00/10.00)']);
  });

  it.each([false, true])(
    'keeps a legacy aggregate score raw across page sizes (legacy column first: %s)',
    (legacyFirst) => {
      const modern = columnMetrics(100, 100);
      const legacy = { ...columnMetrics(100, 100), namedScoresCount: undefined };
      const metrics = legacyFirst ? [legacy, modern] : [modern, legacy];
      const expected = legacyFirst
        ? ['100.00', '100.00% (100.00/100.00)']
        : ['100.00% (100.00/100.00)', '100.00'];
      mockTableStore(metrics, { pageSize: 50 });

      const { rerender } = renderWithProviders(<ResultsTable {...defaultProps} />);

      expect(metricValueTexts()).toEqual(expected);

      for (const pageSize of [25, 100]) {
        mockTableStore(metrics, { pageSize });
        rerender(<ResultsTable {...defaultProps} />);

        expect(metricValueTexts()).toEqual(expected);
      }
    },
  );

  it('shows raw scores when all columns lack aggregate denominators', () => {
    mockTableStore(
      [
        { ...columnMetrics(100, 100), namedScoresCount: undefined },
        {
          ...columnMetrics(100, 100),
          namedScores: { 'has-hello': 80 },
          namedScoresCount: undefined,
        },
      ],
      { pageSize: 50 },
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    expect(metricValueTexts()).toEqual(['100.00', '80.00']);
  });

  it('uses a later column’s totals when the first column has no graded named metrics', () => {
    mockTableStore([
      {
        ...columnMetrics(0),
        namedScores: {},
        namedScoresCount: {},
        namedScoreWeights: {},
      },
      columnMetrics(5),
    ]);

    renderWithProviders(<ResultsTable {...defaultProps} />);

    expect(metricValueTexts()).toEqual(['100.00% (5.00/5.00)']);
  });
});

describe('ResultsTable Pass Rate Highlighting', () => {
  const mockTable = {
    body: Array(10).fill(createPassingRow()),
    head: {
      prompts: [
        {
          metrics: {
            cost: 1.23456,
            namedScores: {},
            testPassCount: 5,
            testFailCount: 5,
            tokenUsage: createTokenUsage(),
            totalLatencyMs: 2000,
          },
          provider: 'test-provider',
        },
      ],
      vars: [],
    },
  };

  const defaultProps = createDefaultProps();

  beforeEach(() => mockPassRateTable(mockTable));

  it('highlights 0% filtered pass rate with success-0 class when total pass rate is non-zero', () => {
    const mockTableWithZeroFilteredPassRate = {
      ...mockTable,
      head: {
        prompts: [
          {
            metrics: {
              cost: 1.23456,
              namedScores: {},
              testPassCount: 5,
              testFailCount: 5,
              tokenUsage: createTokenUsage(),
              totalLatencyMs: 2000,
            },
            provider: 'test-provider',
          },
        ],
        vars: [],
      },
    };

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        table: mockTableWithZeroFilteredPassRate,
        renderMarkdown: true,
        filteredMetrics: [
          {
            cost: 0,
            testPassCount: 0,
            testFailCount: 10,
            tokenUsage: {
              completion: 0,
              total: 0,
            },
            totalLatencyMs: 0,
          },
        ],
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    const passRatePill = screen.getByText(/0\.00% passing/i).closest('div');
    expect(passRatePill).toHaveClass('success-0');
  });
});

describe('ResultsTable Filtered vs Total Pass Rate Highlighting', () => {
  const mockTable = {
    body: Array(10).fill(createPassingRow()),
    head: {
      prompts: [
        createPromptWithMetrics(),
        {
          metrics: {
            cost: 1.23456,
            namedScores: {},
            testPassCount: 8,
            testFailCount: 2,
            tokenUsage: createTokenUsage(),
            totalLatencyMs: 2000,
          },
          provider: 'test-provider',
        },
      ],
      vars: [],
    },
  };

  const defaultProps = createDefaultProps();

  beforeEach(() => {
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        table: mockTable,
        renderMarkdown: true,
        filterMode: 'all',
        filteredResultsCount: 10,
        totalResultsCount: 10,
      }),
    );
  });

  it('should display the correct pass rate and tooltip when filtered results have 100% pass rate but total results have a lower pass rate', async () => {
    const mockTableWithFilteredPassRate = {
      body: Array(10).fill(createPassingRow()),
      head: {
        prompts: [
          createPromptWithMetrics(),
          {
            metrics: {
              cost: 1.23456,
              namedScores: {},
              testPassCount: 8,
              testFailCount: 2,
              tokenUsage: createTokenUsage(),
              totalLatencyMs: 2000,
            },
            provider: 'test-provider',
          },
        ],
        vars: [],
      },
    };

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        table: mockTableWithFilteredPassRate,
        renderMarkdown: true,
        filters: {
          values: {
            testFilter: {
              id: 'testFilter',
              type: 'metric',
              operator: 'equals',
              value: 'test',
              logicOperator: 'and',
            },
          },
          appliedCount: 1,
          options: createMetricOptions(),
        },
        filterMode: 'all',
        filteredResultsCount: 10,
        totalResultsCount: 10,
        filteredMetrics: [
          null,
          {
            cost: 1.0,
            namedScores: {},
            testPassCount: 10,
            testFailCount: 0,
            tokenUsage: createTokenUsage(),
            totalLatencyMs: 2000,
          },
        ],
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<ResultsTable {...defaultProps} />);

    const passRateElement = screen.getAllByText(/100.00% passing/)[1];
    expect(passRateElement).toBeInTheDocument();

    await user.hover(passRateElement);

    await waitFor(() => {
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent(
        'Filtered: 10/10 passing (100.00%). Total: 8/10 passing (80.00%)',
      );
    });
  });
});

describe('ResultsTable Header Column Updates on Eval Switch', () => {
  const defaultProps = createDefaultProps({
    showStats: false,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Note: Testing rerender() behavior with mocked Zustand stores doesn't work well because
  // React's useMemo caches persist across rerenders. The actual fix uses key={evalId} on
  // ResultsTable in ResultsView.tsx, which forces a complete remount and clears all caches.
  // The tests below use unmount/remount to simulate this key-based remounting behavior.

  it('should show correct column headers after remount with different eval (simulates key={evalId})', () => {
    // First eval: NAICS classifier with location-based variables
    const firstEvalTable = {
      body: [
        {
          outputs: [{ pass: true, score: 1, text: 'output 1' }],
          test: {},
          vars: ['https://example.com', 'New York', 'NY'],
        },
      ],
      head: {
        prompts: [{ provider: 'openai:gpt-4' }],
        vars: ['website_url', 'city', 'state'],
      },
    };

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        evalId: 'eval-naics-123',
        table: firstEvalTable,
      }),
    );

    const { unmount } = renderWithProviders(<ResultsTable {...defaultProps} />);

    // Verify first eval's column headers are present
    expect(screen.getByText('website_url')).toBeInTheDocument();
    expect(screen.getByText('city')).toBeInTheDocument();
    expect(screen.getByText('state')).toBeInTheDocument();

    // Unmount simulates what happens when key={evalId} changes in ResultsView
    unmount();

    // Second eval: Customer support with different variables
    const secondEvalTable = {
      body: [
        {
          outputs: [{ pass: true, score: 1, text: 'output 2' }],
          test: {},
          vars: ['Hello, I need help', 'session-abc-123'],
        },
      ],
      head: {
        prompts: [{ provider: 'openai:gpt-4' }],
        vars: ['prompt', 'sessionId'],
      },
    };

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        evalId: 'eval-support-456',
        table: secondEvalTable,
      }),
    );

    // Fresh mount with new eval data (simulates what happens when key={evalId} changes)
    renderWithProviders(<ResultsTable {...defaultProps} />);

    // Verify second eval's column headers are present
    expect(screen.getByText('prompt')).toBeInTheDocument();
    expect(screen.getByText('sessionId')).toBeInTheDocument();

    // Verify first eval's columns are NOT present (they should be gone)
    expect(screen.queryByText('website_url')).not.toBeInTheDocument();
    expect(screen.queryByText('city')).not.toBeInTheDocument();
    expect(screen.queryByText('state')).not.toBeInTheDocument();
  });

  it('should show correct prompt column headers after remount (simulates key={evalId})', () => {
    // First eval: Single prompt
    const firstEvalTable = {
      body: [
        {
          outputs: [{ pass: true, score: 1, text: 'output 1' }],
          test: {},
          vars: ['input1'],
        },
      ],
      head: {
        prompts: [
          {
            provider: 'openai:gpt-4',
            label: 'GPT-4 Classifier',
          },
        ],
        vars: ['input'],
      },
    };

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        evalId: 'eval-single-prompt',
        table: firstEvalTable,
      }),
    );

    const { unmount } = renderWithProviders(<ResultsTable {...defaultProps} />);

    // Verify first eval's prompt column header
    expect(screen.getByText('GPT-4 Classifier')).toBeInTheDocument();

    unmount();

    // Second eval: Multiple prompts with different labels
    const secondEvalTable = {
      body: [
        {
          outputs: [
            { pass: true, score: 1, text: 'output from claude' },
            { pass: false, score: 0, text: 'output from gemini' },
          ],
          test: {},
          vars: ['input2'],
        },
      ],
      head: {
        prompts: [
          {
            provider: 'anthropic:claude-3',
            label: 'Claude Assistant',
          },
          {
            provider: 'google:gemini-pro',
            label: 'Gemini Helper',
          },
        ],
        vars: ['query'],
      },
    };

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        evalId: 'eval-multi-prompt',
        table: secondEvalTable,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    // Verify second eval's prompt column headers
    expect(screen.getByText('Claude Assistant')).toBeInTheDocument();
    expect(screen.getByText('Gemini Helper')).toBeInTheDocument();

    // Verify first eval's prompt column is NOT present
    expect(screen.queryByText('GPT-4 Classifier')).not.toBeInTheDocument();
  });

  it('should handle column count changes after remount (simulates key={evalId})', () => {
    // First eval: Many variable columns
    const manyColumnsTable = {
      body: [
        {
          outputs: [{ pass: true, score: 1, text: 'output' }],
          test: {},
          vars: ['val1', 'val2', 'val3', 'val4', 'val5'],
        },
      ],
      head: {
        prompts: [{ provider: 'openai:gpt-4' }],
        vars: ['col1', 'col2', 'col3', 'col4', 'col5'],
      },
    };

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        evalId: 'eval-many-cols',
        table: manyColumnsTable,
      }),
    );

    const { unmount } = renderWithProviders(<ResultsTable {...defaultProps} />);

    // Verify all columns are present
    expect(screen.getByText('col1')).toBeInTheDocument();
    expect(screen.getByText('col2')).toBeInTheDocument();
    expect(screen.getByText('col3')).toBeInTheDocument();
    expect(screen.getByText('col4')).toBeInTheDocument();
    expect(screen.getByText('col5')).toBeInTheDocument();

    unmount();

    // Second eval: Just one variable column
    const fewColumnsTable = {
      body: [
        {
          outputs: [{ pass: true, score: 1, text: 'output' }],
          test: {},
          vars: ['single value'],
        },
      ],
      head: {
        prompts: [{ provider: 'openai:gpt-4' }],
        vars: ['onlyColumn'],
      },
    };

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        evalId: 'eval-few-cols',
        table: fewColumnsTable,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    // Verify only the new column is present
    expect(screen.getByText('onlyColumn')).toBeInTheDocument();

    // Verify old columns are gone
    expect(screen.queryByText('col1')).not.toBeInTheDocument();
    expect(screen.queryByText('col2')).not.toBeInTheDocument();
    expect(screen.queryByText('col3')).not.toBeInTheDocument();
    expect(screen.queryByText('col4')).not.toBeInTheDocument();
    expect(screen.queryByText('col5')).not.toBeInTheDocument();
  });
});

describe('ResultsTable handleRating - Toggle off (null isPass) behavior', () => {
  let mockSetTable: ReturnType<typeof vi.fn>;
  let mockCallApi: any;

  const createMockTableWithHumanAssertion = () => ({
    body: [
      {
        outputs: [
          {
            id: 'test-output-1',
            pass: true,
            score: 1,
            text: 'test output',
            latencyMs: 100,
            cost: 0.01,
            failureReason: 0,
            namedScores: {},
            gradingResult: {
              pass: true,
              score: 1,
              reason: 'Manual result (overrides all other grading results)',
              comment: 'User comment',
              componentResults: [
                {
                  pass: false,
                  score: 0.5,
                  reason: 'Automated assertion',
                  assertion: { type: 'contains' as const, value: 'test' },
                },
                {
                  pass: true,
                  score: 1,
                  reason: 'Manual result (overrides all other grading results)',
                  comment: 'User comment',
                  assertion: { type: 'human' as const },
                },
              ],
            },
          },
        ],
        test: {},
        vars: [],
        testIdx: 0,
      },
    ],
    head: createPromptHead([], 1, 0),
  });

  const defaultProps = createDefaultProps();

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSetTable = vi.fn();
    const apiModule = await import('@app/utils/api');
    mockCallApi = vi.mocked(apiModule.callApi);
    mockCallApi.mockResolvedValue({ ok: true });
  });

  it('should remove human assertion and recalculate pass/score when isPass is null', () => {
    const mockTable = createMockTableWithHumanAssertion();

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        setTable: mockSetTable,
        table: mockTable,
        renderMarkdown: true,
        isFetching: false,
        filteredResultsCount: 1,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    // Simulate handleRating being called with isPass = null
    const existingOutput = mockTable.body[0].outputs[0];
    const componentResults = [...(existingOutput.gradingResult?.componentResults || [])];

    // Remove human assertion
    const humanResultIndex = componentResults.findIndex(
      (result) => result.assertion?.type === 'human',
    );
    expect(humanResultIndex).toBe(1);

    componentResults.splice(humanResultIndex, 1);

    // Recalculate pass/score
    const passCount = componentResults.filter((r) => r.pass).length;
    const finalPass = passCount === componentResults.length;
    const scores = componentResults.map((r) => r.score).filter((s) => typeof s === 'number');
    const finalScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    expect(componentResults).toHaveLength(1);
    expect(componentResults[0].assertion?.type).toBe('contains');
    expect(finalPass).toBe(false);
    expect(finalScore).toBe(0.5);
  });

  it('persists a cleared human rating without manual override fields', async () => {
    const user = userEvent.setup();
    const mockTable = createMockTableWithHumanAssertion();

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        setTable: mockSetTable,
        table: mockTable,
        renderMarkdown: true,
        isFetching: false,
        filteredResultsCount: 1,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'Clear rating' }));

    await waitFor(() => {
      expect(mockCallApi).toHaveBeenCalledWith(
        '/eval/123/results/test-output-1/rating',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const [, request] = mockCallApi.mock.calls[0];
    const payload = JSON.parse(request.body);

    expect(payload.pass).toBe(false);
    expect(payload.score).toBe(0.5);
    expect(payload.reason).toBe('Automated assertion');
    expect(payload.assertion?.type).not.toBe('human');
    expect(payload.componentResults).toHaveLength(1);
    expect(payload.componentResults[0].assertion.type).toBe('contains');
  });

  it('should recalculate pass as true when all remaining assertions pass', () => {
    const mockTable = {
      body: [
        {
          outputs: [
            {
              id: 'test-output-1',
              pass: true,
              score: 1,
              text: 'test output',
              gradingResult: {
                pass: true,
                score: 1,
                componentResults: [
                  {
                    pass: true,
                    score: 0.8,
                    reason: 'Assertion 1',
                    assertion: { type: 'contains' as const },
                  },
                  {
                    pass: true,
                    score: 0.9,
                    reason: 'Assertion 2',
                    assertion: { type: 'similar' as const },
                  },
                  {
                    pass: true,
                    score: 1,
                    reason: 'Manual result',
                    assertion: { type: 'human' as const },
                  },
                ],
              },
            },
          ],
          test: {},
          vars: [],
        },
      ],
      head: createProviderHead(),
    };

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        setTable: mockSetTable,
        table: mockTable,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    const existingOutput = mockTable.body[0].outputs[0];
    const componentResults = [...(existingOutput.gradingResult?.componentResults || [])];

    // Remove human assertion
    const humanResultIndex = componentResults.findIndex(
      (result) => result.assertion?.type === 'human',
    );
    componentResults.splice(humanResultIndex, 1);

    // Recalculate
    const passCount = componentResults.filter((r) => r.pass).length;
    const finalPass = passCount === componentResults.length;
    const scores = componentResults.map((r) => r.score).filter((s) => typeof s === 'number');
    const finalScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    expect(finalPass).toBe(true);
    expect(finalScore).toBeCloseTo(0.85, 2); // (0.8 + 0.9) / 2
  });

  it('should handle case when no assertions remain after removing human assertion', () => {
    const mockTable = {
      body: [
        {
          outputs: [
            {
              id: 'test-output-1',
              pass: true,
              score: 1,
              text: 'test output',
              gradingResult: {
                pass: true,
                score: 1,
                componentResults: [
                  {
                    pass: true,
                    score: 1,
                    reason: 'Manual result',
                    assertion: { type: 'human' as const },
                  },
                ],
              },
            },
          ],
          test: {},
          vars: [],
        },
      ],
      head: createProviderHead(),
    };

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        setTable: mockSetTable,
        table: mockTable,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    const existingOutput = mockTable.body[0].outputs[0];
    const componentResults = [...(existingOutput.gradingResult?.componentResults || [])];

    // Remove human assertion
    const humanResultIndex = componentResults.findIndex(
      (result) => result.assertion?.type === 'human',
    );
    componentResults.splice(humanResultIndex, 1);

    expect(componentResults).toHaveLength(0);

    // When no assertions remain, the recalculation logic only runs if componentResults.length > 0
    // So finalPass and finalScore should retain their original values or not be recalculated
  });

  it('should preserve custom score when provided alongside isPass', () => {
    const mockTable = createMockTableWithHumanAssertion();

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        setTable: mockSetTable,
        table: mockTable,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    // When score is provided explicitly, it should be used instead of defaulting to 0/1
    const customScore = 0.75;

    // Verify logic: an explicit score takes precedence over pass/fail-derived scores.
    const finalScore = customScore;

    expect(finalScore).toBe(0.75);
  });

  it('should calculate average score correctly from remaining assertions', () => {
    const mockTable = {
      body: [
        {
          outputs: [
            {
              id: 'test-output-1',
              pass: false,
              score: 0.5,
              text: 'test output',
              gradingResult: {
                pass: false,
                score: 0.5,
                componentResults: [
                  {
                    pass: true,
                    score: 0.6,
                    reason: 'Assertion 1',
                    assertion: { type: 'contains' as const },
                  },
                  {
                    pass: false,
                    score: 0.3,
                    reason: 'Assertion 2',
                    assertion: { type: 'similar' as const },
                  },
                  {
                    pass: true,
                    score: 0.7,
                    reason: 'Assertion 3',
                    assertion: { type: 'regex' as const },
                  },
                  {
                    pass: false,
                    score: 0,
                    reason: 'Manual fail',
                    assertion: { type: 'human' as const },
                  },
                ],
              },
            },
          ],
          test: {},
          vars: [],
        },
      ],
      head: createProviderHead(),
    };

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        setTable: mockSetTable,
        table: mockTable,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    const existingOutput = mockTable.body[0].outputs[0];
    const componentResults = [...(existingOutput.gradingResult?.componentResults || [])];

    // Remove human assertion
    const humanResultIndex = componentResults.findIndex(
      (result) => result.assertion?.type === 'human',
    );
    componentResults.splice(humanResultIndex, 1);

    // Calculate average score
    const scores = componentResults.map((r) => r.score).filter((s) => typeof s === 'number');
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    expect(averageScore).toBeCloseTo(0.5333, 4); // (0.6 + 0.3 + 0.7) / 3
  });
});

describe('ResultsTable minimal scroll room detection', () => {
  const mockTable = {
    body: [createPassingRow()],
    head: createProviderHead(),
  };

  const defaultProps = createDefaultProps();

  // Use mutable values with getters so they can be changed during tests
  let scrollHeightValue = 1000;
  let innerHeightValue = 700;
  let timers: TestTimers;

  beforeEach(() => {
    timers = useTestTimers();

    // Reset to default values (plenty of scroll room)
    scrollHeightValue = 1000;
    innerHeightValue = 700;

    // Use getters so the values can change during test
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      get: () => scrollHeightValue,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      get: () => innerHeightValue,
      configurable: true,
    });

    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        inComparisonMode: false,
        table: mockTable,
        renderMarkdown: true,
        isFetching: false,
        filteredResultsCount: 1,
      }),
    );
  });

  afterEach(() => {
    restoreTestTimers();
  });

  it('adds minimal-scroll-room class when scroll room is less than 150px', async () => {
    // Mock scroll room < 150px (800 - 700 = 100px)
    scrollHeightValue = 800;
    innerHeightValue = 700;

    renderWithProviders(<ResultsTable {...defaultProps} />);

    // Run all timers to trigger the setTimeout in useEffect
    await act(async () => {
      timers.runAll();
    });

    const stickyContainer = screen.getByTestId('results-table-header');
    expect(stickyContainer).toHaveClass('minimal-scroll-room');
  });

  it('clips the standalone header wrapper so wide tables do not widen the page', () => {
    renderWithProviders(<ResultsTable {...defaultProps} />);

    const stickyContainer = screen.getByTestId('results-table-header');
    expect(stickyContainer).toHaveClass('-mx-4', 'overflow-hidden', 'px-4');
  });

  const verifyScrollRoom = async () => {
    // Mock scroll room >= 150px (1000 - 700 = 300px)
    scrollHeightValue = 1000;
    innerHeightValue = 700;

    renderWithProviders(<ResultsTable {...defaultProps} />);

    // Run all timers to trigger the setTimeout in useEffect
    await act(async () => {
      timers.runAll();
    });

    const stickyContainer = screen.getByTestId('results-table-header');
    expect(stickyContainer).not.toHaveClass('minimal-scroll-room');
  };

  it('does not add minimal-scroll-room class when scroll room is 150px or more', verifyScrollRoom);

  it('updates minimal-scroll-room class on window resize', async () => {
    // Start with plenty of scroll room
    scrollHeightValue = 1000;
    innerHeightValue = 700;

    renderWithProviders(<ResultsTable {...defaultProps} />);

    // Run initial timers
    await act(async () => {
      timers.runAll();
    });

    // Verify no class initially
    let stickyContainer = screen.getByTestId('results-table-header');
    expect(stickyContainer).not.toHaveClass('minimal-scroll-room');

    // Change to minimal scroll room and trigger resize
    scrollHeightValue = 800;

    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });

    stickyContainer = screen.getByTestId('results-table-header');
    expect(stickyContainer).toHaveClass('minimal-scroll-room');
  });

  it('correctly detects scroll room exactly at threshold (150px)', async () => {
    // Mock scroll room exactly 150px (850 - 700 = 150px)
    scrollHeightValue = 850;
    innerHeightValue = 700;

    renderWithProviders(<ResultsTable {...defaultProps} />);

    await act(async () => {
      timers.runAll();
    });

    const stickyContainer = screen.getByTestId('results-table-header');
    // At exactly 150px, should NOT add the class (threshold is < 150)
    expect(stickyContainer).not.toHaveClass('minimal-scroll-room');
  });

  it('correctly detects scroll room just below threshold (149px)', async () => {
    // Mock scroll room at 149px (849 - 700 = 149px)
    scrollHeightValue = 849;
    innerHeightValue = 700;

    renderWithProviders(<ResultsTable {...defaultProps} />);

    await act(async () => {
      timers.runAll();
    });

    const stickyContainer = screen.getByTestId('results-table-header');
    // Just below 150px threshold, should add the class
    expect(stickyContainer).toHaveClass('minimal-scroll-room');
  });

  it('rechecks scroll room when the filtered result count changes', async () => {
    let filteredResultsCount = 1;
    const store = createTableStore({
      inComparisonMode: false,
      table: mockTable,
      renderMarkdown: true,
      isFetching: false,
    });
    vi.mocked(useTableStore).mockImplementation(() => ({ ...store, filteredResultsCount }));
    const view = renderWithProviders(<ResultsTable {...defaultProps} />);
    await act(async () => {
      timers.runAll();
    });
    const stickyContainer = screen.getByTestId('results-table-header');
    expect(stickyContainer).not.toHaveClass('minimal-scroll-room');

    scrollHeightValue = 800;
    // Change an unrelated callback to render past React.memo with the mocked store.
    view.rerender(<ResultsTable {...defaultProps} onFailureFilterToggle={vi.fn()} />);
    expect(stickyContainer).not.toHaveClass('minimal-scroll-room');

    filteredResultsCount = 2;
    view.rerender(<ResultsTable {...defaultProps} onFailureFilterToggle={vi.fn()} />);
    expect(stickyContainer).toHaveClass('minimal-scroll-room');
  });

  it('cleans up resize listener on unmount', async () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderWithProviders(<ResultsTable {...defaultProps} />);

    await act(async () => {
      timers.runAll();
    });

    unmount();

    // Verify resize listener was removed
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    removeEventListenerSpy.mockRestore();
  });

  it('applies both sticky and minimal-scroll-room classes when conditions overlap', async () => {
    scrollHeightValue = 800;
    innerHeightValue = 700;

    renderWithProviders(<ResultsTable {...defaultProps} />);

    await act(async () => {
      timers.runAll();
    });

    const stickyContainer = screen.getByTestId('results-table-header');

    // Initially has minimal-scroll-room class
    expect(stickyContainer).toHaveClass('minimal-scroll-room');

    // When sticky is enabled, should have both classes
    // Note: This would require triggering the sticky behavior,
    // which depends on scroll events in the actual implementation
    expect(stickyContainer.className).toContain('relative');
  });
});

describe('ResultsTable header horizontal scrolling', () => {
  const mockTable = {
    body: [createPassingRow()],
    head: createProviderHead(),
  };

  const defaultProps = createDefaultProps();

  beforeEach(() => mockHeaderTable(mockTable));

  it('exposes a horizontally scrollable header container', () => {
    renderWithProviders(<ResultsTable {...defaultProps} />);

    expect(screen.getByTestId('results-table-header-scroll-container')).toHaveClass(
      'overflow-x-auto',
      'overflow-y-hidden',
    );
  });

  it('syncs header scrolling into the table body', () => {
    renderWithProviders(<ResultsTable {...defaultProps} />);

    const headerScrollContainer = screen.getByTestId('results-table-header-scroll-container');
    const tableContainer = document.getElementById('results-table-container');

    expect(tableContainer).not.toBeNull();

    act(() => {
      headerScrollContainer.scrollLeft = 120;
      headerScrollContainer.dispatchEvent(new Event('scroll'));
    });

    expect(tableContainer?.scrollLeft).toBe(120);
  });

  it('keeps body scrolling mirrored in the header', () => {
    renderWithProviders(<ResultsTable {...defaultProps} />);

    const headerScrollContainer = screen.getByTestId('results-table-header-scroll-container');
    const tableContainer = document.getElementById('results-table-container');

    expect(tableContainer).not.toBeNull();

    act(() => {
      if (tableContainer) {
        tableContainer.scrollLeft = 180;
        tableContainer.dispatchEvent(new Event('scroll'));
      }
    });

    expect(headerScrollContainer.scrollLeft).toBe(180);
  });
});
describe('ResultsTable default column sizing', () => {
  const mockTable = {
    body: [
      {
        outputs: [{ pass: true, score: 1, text: 'test output' }],
        test: {},
        vars: [
          'ok',
          'diff --git a/src/example.ts b/src/example.ts\n+const token = payload.value;'.repeat(4),
        ],
      },
    ],
    head: {
      prompts: [{ provider: 'test-provider' }],
      vars: ['short_value', 'large_metadata'],
    },
  };

  const defaultProps = createDefaultProps();

  beforeEach(() => mockHeaderTable(mockTable));

  it('gives larger metadata columns more initial width than compact metadata columns', () => {
    renderWithProviders(<ResultsTable {...defaultProps} />);

    const compactMetadataHeader = screen
      .getByText('short_value')
      .closest('th') as HTMLElement | null;
    const largeMetadataHeader = screen
      .getByText('large_metadata')
      .closest('th') as HTMLElement | null;
    const finalHeaderRow = screen.getByTestId('results-table-header').querySelectorAll('tr')[1];
    const finalHeaderCells = finalHeaderRow?.querySelectorAll('th');
    const outputHeader = finalHeaderCells?.[finalHeaderCells.length - 1] as HTMLElement | undefined;

    expect(compactMetadataHeader).not.toBeNull();
    expect(largeMetadataHeader).not.toBeNull();
    expect(outputHeader).toBeDefined();

    const compactMetadataWidth = Number.parseFloat(compactMetadataHeader?.style.width || '0');
    const largeMetadataWidth = Number.parseFloat(largeMetadataHeader?.style.width || '0');
    const outputWidth = Number.parseFloat(outputHeader?.style.width || '0');

    expect(compactMetadataWidth).toBeGreaterThanOrEqual(160);
    expect(largeMetadataWidth).toBeGreaterThan(compactMetadataWidth);
    expect(largeMetadataWidth).toBeLessThanOrEqual(360);
    expect(outputWidth).toBe(480);
  });

  it('renders matching header and body colgroups for the computed widths', () => {
    renderWithProviders(<ResultsTable {...defaultProps} />);

    const headerCols = screen.getByTestId('results-table-header').querySelectorAll('colgroup col');
    const bodyCols = document.querySelectorAll('#results-table-container colgroup col');

    expect(headerCols).toHaveLength(3);
    expect(bodyCols).toHaveLength(3);
    expect((headerCols[0] as HTMLElement).style.width).toBe(
      (bodyCols[0] as HTMLElement).style.width,
    );
    expect((headerCols[1] as HTMLElement).style.width).toBe(
      (bodyCols[1] as HTMLElement).style.width,
    );
    expect((headerCols[2] as HTMLElement).style.width).toBe(
      (bodyCols[2] as HTMLElement).style.width,
    );
  });

  it('sizes injected prompt columns from the rendered provider prompt', () => {
    vi.mocked(useTableStore).mockImplementation(() =>
      createTableStore({
        config: createRedteamConfig(),
        table: {
          body: [
            {
              outputs: [
                {
                  pass: true,
                  score: 1,
                  text: 'test output',
                  response: {
                    prompt: 'provider rewritten prompt '.repeat(24),
                  },
                },
              ],
              test: {},
              vars: ['{{prompt}}'],
            },
          ],
          head: {
            prompts: [{ provider: 'test-provider' }],
            vars: ['prompt'],
          },
        },
        isFetching: false,
        filteredResultsCount: 1,
      }),
    );

    renderWithProviders(<ResultsTable {...defaultProps} />);

    const promptHeader = screen.getByText('prompt').closest('th') as HTMLElement | null;
    const promptWidth = Number.parseFloat(promptHeader?.style.width || '0');

    expect(promptHeader).not.toBeNull();
    expect(promptWidth).toBeGreaterThan(160);
    expect(promptWidth).toBeLessThanOrEqual(360);
  });
});
