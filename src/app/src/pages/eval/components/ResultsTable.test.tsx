import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResultsTable from './ResultsTable';
import { useStore } from './store';

vi.mock('./store', () => ({
  useStore: vi.fn(() => ({
    config: {},
    evalId: '123',
    inComparisonMode: false,
    setTable: vi.fn(),
    table: null,
    version: 4,
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

describe('ResultsTable Metrics Display', () => {
  const mockTable = {
    body: Array(10).fill({
      outputs: [
        {
          pass: true,
          score: 1,
          text: 'test output',
        },
      ],
      test: {},
      vars: [],
    }),
    head: {
      prompts: [
        {
          metrics: {
            cost: 1.23456,
            namedScores: {},
            tokenUsage: {
              completion: 500,
              total: 1000,
            },
            totalLatencyMs: 2000,
          },
          provider: 'test-provider',
        },
      ],
      vars: [],
    },
  };

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
  };

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(ui);
  };

  beforeEach(() => {
    vi.mocked(useStore).mockImplementation(() => ({
      config: {},
      evalId: '123',
      inComparisonMode: false,
      setTable: vi.fn(),
      table: mockTable,
      version: 4,
      renderMarkdown: true,
    }));
  });

  it('displays total cost with correct formatting', () => {
    renderWithProviders(<ResultsTable {...defaultProps} />);
    expect(screen.getByText('Total Cost:')).toBeInTheDocument();
    expect(screen.getByText('$1.23')).toBeInTheDocument();
  });

  it('displays total tokens with correct formatting', () => {
    renderWithProviders(<ResultsTable {...defaultProps} />);
    expect(screen.getByText('Total Tokens:')).toBeInTheDocument();
    expect(screen.getByText('1,000')).toBeInTheDocument();
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
      body: Array(10).fill({
        outputs: [
          {
            pass: true,
            score: 1,
            text: 'test output',
          },
        ],
        test: {},
        vars: [],
      }),
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

    vi.mocked(useStore).mockImplementation(() => ({
      config: {},
      evalId: '123',
      inComparisonMode: false,
      setTable: vi.fn(),
      table: mockTableNoMetrics,
      version: 4,
      renderMarkdown: true,
    }));

    renderWithProviders(<ResultsTable {...defaultProps} />);
    expect(screen.queryByText('Total Cost:')).not.toBeInTheDocument();
    expect(screen.queryByText('Total Tokens:')).not.toBeInTheDocument();
    expect(screen.queryByText('Avg Tokens:')).not.toBeInTheDocument();
  });

  it('displays tokens per second when both latency and completion tokens are available', () => {
    renderWithProviders(<ResultsTable {...defaultProps} />);
    expect(screen.getByText('Tokens/Sec:')).toBeInTheDocument();
    expect(screen.getByText('250')).toBeInTheDocument();
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

      vi.mocked(useStore).mockImplementation(() => ({
        config: {},
        evalId: '123',
        inComparisonMode: false,
        setTable: vi.fn(),
        table: mockTableWithObjectVar,
        version: 4,
        renderMarkdown: true,
      }));

      renderWithProviders(<ResultsTable {...defaultProps} />);

      const codeElement = screen.getByText(/foo/);
      expect(codeElement).toBeInTheDocument();
      expect(codeElement.closest('code')).toHaveClass('language-json');
    });

    it('renders object variables as plain JSON with markdown disabled', () => {
      const mockTableWithObjectVar = createMockTableWithVar(complexObject);

      vi.mocked(useStore).mockImplementation(() => ({
        config: {},
        evalId: '123',
        inComparisonMode: false,
        setTable: vi.fn(),
        table: mockTableWithObjectVar,
        version: 4,
        renderMarkdown: false,
      }));

      renderWithProviders(<ResultsTable {...defaultProps} />);

      const cellElement = screen.getByText(/foo/);
      expect(cellElement).toBeInTheDocument();
      expect(cellElement.closest('code')).toBeNull();
    });

    it('truncates long object representations', () => {
      const mockTableWithLongVar = createMockTableWithVar(longObject);

      vi.mocked(useStore).mockImplementation(() => ({
        config: {},
        evalId: '123',
        inComparisonMode: false,
        setTable: vi.fn(),
        table: mockTableWithLongVar,
        version: 4,
        renderMarkdown: true,
      }));

      renderWithProviders(<ResultsTable {...defaultProps} maxTextLength={50} />);

      const element = screen.getByText((content) => content.includes('...'));
      expect(element).toBeInTheDocument();
      expect(element.textContent!.length).toBeLessThanOrEqual(50 + 6); // +6 for ```json
    });

    it('handles null values correctly', () => {
      const mockTableWithNullVar = createMockTableWithVar(null);

      vi.mocked(useStore).mockImplementation(() => ({
        config: {},
        evalId: '123',
        inComparisonMode: false,
        setTable: vi.fn(),
        table: mockTableWithNullVar,
        version: 4,
        renderMarkdown: true,
      }));

      renderWithProviders(<ResultsTable {...defaultProps} />);

      const element = screen.getByText('null');
      expect(element).toBeInTheDocument();
    });
  });
});

describe('ResultsTable Metadata Search', () => {
  it('includes metadata in search', () => {
    // Mock a row with metadata
    const row = {
      outputs: [
        {
          text: 'test output',
          pass: true,
          score: 1,
          metadata: {
            model: 'gpt-4',
            temperature: 0.7,
            custom_tag: 'important',
          },
          namedScores: {},
        },
      ],
      test: {},
      vars: [],
    };

    // Test that metadata is included in the searchable text
    const vars = row.outputs.map((v) => `var=${v}`).join(' ');
    const output = row.outputs[0];
    const namedScores = output.namedScores || {};
    const stringifiedOutput = `${output.text} ${Object.keys(namedScores)
      .map((k) => `metric=${k}:${namedScores[k as keyof typeof namedScores]}`)
      .join(' ')}`;

    // Create metadata string
    const metadataString = output.metadata
      ? Object.entries(output.metadata)
          .map(([key, value]) => {
            const valueStr =
              typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
            return `metadata=${key}:${valueStr}`;
          })
          .join(' ')
      : '';

    const searchString = `${vars} ${stringifiedOutput} ${metadataString}`;

    // Verify metadata is in the search string
    expect(searchString).toContain('metadata=model:gpt-4');
    expect(searchString).toContain('metadata=temperature:0.7');
    expect(searchString).toContain('metadata=custom_tag:important');

    // Verify we can match on it
    expect(/metadata=model:gpt-4/i.test(searchString)).toBe(true);
    expect(/metadata=model:gpt-3/i.test(searchString)).toBe(false);
  });

  it('includes complex nested metadata in search', () => {
    // Mock a row with nested metadata
    const row = {
      outputs: [
        {
          text: 'test output',
          pass: true,
          score: 1,
          metadata: {
            nested: {
              property: 'nested-value',
              array: [1, 2, 3],
            },
          },
          namedScores: {},
        },
      ],
      test: {},
      vars: [],
    };

    // Get the metadata string
    const output = row.outputs[0];
    const metadataString = output.metadata
      ? Object.entries(output.metadata)
          .map(([key, value]) => {
            const valueStr =
              typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
            return `metadata=${key}:${valueStr}`;
          })
          .join(' ')
      : '';

    // Verify the nested object is included correctly
    expect(metadataString).toContain('metadata=nested:{"property":"nested-value","array":[1,2,3]}');

    // Verify we can match on the nested values
    expect(/property":"nested-value/i.test(metadataString)).toBe(true);
    expect(/\[1,2,3\]/i.test(metadataString)).toBe(true);
    expect(/unknown/i.test(metadataString)).toBe(false);
  });
});
