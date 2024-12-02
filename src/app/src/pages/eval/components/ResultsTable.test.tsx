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
});
