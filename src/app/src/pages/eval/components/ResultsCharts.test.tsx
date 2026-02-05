import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResultsCharts from './ResultsCharts';
import { useTableStore } from './store';

// Mock Chart.js
vi.mock('chart.js', () => {
  const ChartMock = vi.fn().mockImplementation(function () {
    return {
      destroy: vi.fn(),
    };
  });

  // Add static properties to the mock constructor
  (ChartMock as any).register = vi.fn();
  (ChartMock as any).defaults = {
    color: '#666',
  };

  return {
    Chart: ChartMock,
    BarController: vi.fn(),
    LineController: vi.fn(),
    ScatterController: vi.fn(),
    CategoryScale: vi.fn(),
    LinearScale: vi.fn(),
    BarElement: vi.fn(),
    LineElement: vi.fn(),
    PointElement: vi.fn(),
    Tooltip: vi.fn(),
    Colors: vi.fn(),
  };
});

// Mock the store
vi.mock('./store', () => ({
  useTableStore: vi.fn(),
}));

// Mock API calls
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

describe('ResultsCharts', () => {
  const defaultProps = {
    handleHideCharts: vi.fn(),
  };

  // Helper function to calculate scores using the same logic as ResultsView
  const calculateScores = (table: any): number[] => {
    return table.body
      .flatMap((row: any) => row.outputs.map((output: any) => output?.score))
      .filter((score: any): score is number => typeof score === 'number' && !Number.isNaN(score));
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call handleHideCharts when the close button is clicked', () => {
    const mockTable = {
      head: {
        prompts: [
          { provider: 'test-provider-1', metrics: { namedScores: {} } },
          { provider: 'test-provider-2', metrics: { namedScores: {} } },
        ],
        vars: [],
      },
      body: [
        {
          outputs: [
            { score: 0.8, pass: true, text: 'valid output' },
            { score: 0.9, pass: true, text: 'valid output' },
          ],
          vars: [],
        },
        {
          outputs: [
            { score: 0.6, pass: true, text: 'another valid' },
            { score: 0.7, pass: true, text: 'another valid' },
          ],
          vars: [],
        },
      ],
    };

    // Calculate scores using the same logic as ResultsView
    const scores = calculateScores(mockTable);

    vi.mocked(useTableStore).mockReturnValue({
      table: mockTable,
      evalId: 'test-eval',
      config: { description: 'test config' },
      setTable: vi.fn(),
      fetchEvalData: vi.fn(),
    });

    const handleHideCharts = vi.fn();

    render(<ResultsCharts {...defaultProps} handleHideCharts={handleHideCharts} scores={scores} />);

    const closeButton = screen.getByRole('button');
    fireEvent.click(closeButton);

    expect(handleHideCharts).toHaveBeenCalled();
  });

  it('should render without errors with a large number of providers', () => {
    const numProviders = 12;
    const prompts = Array.from({ length: numProviders }, (_, i) => ({
      provider: `provider-${i + 1}`,
      metrics: { namedScores: {} },
    }));
    const mockTable = {
      head: {
        prompts: prompts,
        vars: [],
      },
      body: [
        {
          outputs: prompts.map((_, i) => ({
            score: 0.5 + i * 0.04,
            pass: true,
            text: 'valid output',
          })),
          vars: [],
        },
        {
          outputs: prompts.map((_, i) => ({
            score: 0.6 + i * 0.03,
            pass: true,
            text: 'valid output',
          })),
          vars: [],
        },
      ],
    };

    // Calculate scores using the same logic as ResultsView
    const scores = calculateScores(mockTable);

    vi.mocked(useTableStore).mockReturnValue({
      table: mockTable,
      evalId: 'test-eval',
      config: { description: 'test config' },
      setTable: vi.fn(),
      fetchEvalData: vi.fn(),
    });

    const { container } = render(<ResultsCharts {...defaultProps} scores={scores} />);

    expect(() => render(<ResultsCharts {...defaultProps} scores={scores} />)).not.toThrow();

    const canvasElements = container.querySelectorAll('canvas');
    expect(canvasElements.length).toBeGreaterThan(0);
  });

  it('should render without errors in a constrained space', () => {
    const mockTable = {
      head: {
        prompts: [
          { provider: 'test-provider-1', metrics: { namedScores: {} } },
          { provider: 'test-provider-2', metrics: { namedScores: {} } },
        ],
        vars: [],
      },
      body: [
        {
          outputs: [
            { score: 0.8, pass: true, text: 'valid output' },
            { score: 0.9, pass: true, text: 'valid output' },
          ],
          vars: [],
        },
        {
          outputs: [
            { score: 0.6, pass: true, text: 'another valid' },
            { score: 0.7, pass: true, text: 'another valid' },
          ],
          vars: [],
        },
      ],
    };

    // Calculate scores using the same logic as ResultsView
    const scores = calculateScores(mockTable);

    vi.mocked(useTableStore).mockReturnValue({
      table: mockTable,
      evalId: 'test-eval',
      config: { description: 'test config' },
      setTable: vi.fn(),
      fetchEvalData: vi.fn(),
    });

    const { container } = render(<ResultsCharts {...defaultProps} scores={scores} />);

    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle extremely long provider IDs in histogram chart labels and tooltips', () => {
    const longProviderId =
      'this-is-an-extremely-long-provider-id-that-should-not-cause-overflow-or-layout-issues';
    const mockTable = {
      head: {
        prompts: [
          { provider: longProviderId, metrics: { namedScores: {} } },
          { provider: 'test-provider-2', metrics: { namedScores: {} } },
        ],
        vars: [],
      },
      body: [
        {
          outputs: [
            { score: 0.8, pass: true, text: 'valid output' },
            { score: 0.9, pass: true, text: 'valid output' },
          ],
          vars: [],
        },
        {
          outputs: [
            { score: 0.6, pass: true, text: 'another valid' },
            { score: 0.7, pass: true, text: 'another valid' },
          ],
          vars: [],
        },
      ],
    };

    // Calculate scores using the same logic as ResultsView
    const scores = calculateScores(mockTable);

    vi.mocked(useTableStore).mockReturnValue({
      table: mockTable,
      evalId: 'test-eval',
      config: { description: 'test config' },
      setTable: vi.fn(),
      fetchEvalData: vi.fn(),
    });

    expect(() => {
      render(<ResultsCharts {...defaultProps} scores={scores} />);
    }).not.toThrow();
  });

  it('should render without errors when scores array has a single data point', () => {
    const mockTable = {
      head: {
        prompts: [
          { provider: 'test-provider-1', metrics: { namedScores: {} } },
          { provider: 'test-provider-2', metrics: { namedScores: {} } },
        ],
        vars: [],
      },
      body: [
        {
          outputs: [
            { score: 0.8, pass: true, text: 'valid output' },
            { score: 0.8, pass: true, text: 'valid output' },
          ],
          vars: [],
        },
      ],
    };

    const scores = calculateScores(mockTable);

    vi.mocked(useTableStore).mockReturnValue({
      table: mockTable,
      evalId: 'test-eval',
      config: { description: 'test config' },
      setTable: vi.fn(),
      fetchEvalData: vi.fn(),
    });

    const { container } = render(<ResultsCharts {...defaultProps} scores={scores} />);

    expect(() => render(<ResultsCharts {...defaultProps} scores={scores} />)).not.toThrow();

    const canvasElements = container.querySelectorAll('canvas');
    expect(canvasElements.length).toBeGreaterThan(0);
  });

  it('handles table data where some prompts are missing the provider property', () => {
    const mockTable = {
      head: {
        prompts: [
          { provider: 'test-provider-1', metrics: { namedScores: {} } },
          { metrics: { namedScores: {} } },
        ],
        vars: [],
      },
      body: [
        {
          outputs: [
            { score: 0.8, pass: true, text: 'valid output' },
            { score: 0.9, pass: true, text: 'valid output' },
          ],
          vars: [],
        },
        {
          outputs: [
            { score: 0.6, pass: true, text: 'another valid' },
            { score: 0.7, pass: true, text: 'another valid' },
          ],
          vars: [],
        },
      ],
    };

    // Calculate scores using the same logic as ResultsView
    const scores = calculateScores(mockTable);

    vi.mocked(useTableStore).mockReturnValue({
      table: mockTable,
      evalId: 'test-eval',
      config: { description: 'test config' },
      setTable: vi.fn(),
      fetchEvalData: vi.fn(),
    });

    const { container } = render(<ResultsCharts {...defaultProps} scores={scores} />);

    const canvasElements = container.querySelectorAll('canvas');
    expect(canvasElements.length).toBeGreaterThan(0);
  });

  describe('Null Safety and Data Validation', () => {
    it('handles null outputs gracefully', () => {
      const mockTableWithNullOutputs = {
        head: {
          prompts: [{ provider: 'test-provider-1' }, { provider: 'test-provider-2' }],
          vars: [],
        },
        body: [
          {
            outputs: [null, { score: 0.8, pass: true, text: 'valid output' }],
            vars: [],
          },
          {
            outputs: [{ score: 0.6, pass: true, text: 'another valid' }, null],
            vars: [],
          },
        ],
      };

      // Calculate scores using the same logic as ResultsView
      const scores = calculateScores(mockTableWithNullOutputs);

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTableWithNullOutputs,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      });

      expect(() => {
        render(<ResultsCharts {...defaultProps} scores={scores} />);
      }).not.toThrow();
    });

    it('handles empty recentEvals array gracefully', () => {
      const mockTable = {
        head: {
          prompts: [{ provider: 'test-provider-1' }, { provider: 'test-provider-2' }],
          vars: [],
        },
        body: [
          {
            outputs: [
              { score: 0.9, pass: true, text: 'test 1' },
              { score: 0.8, pass: true, text: 'test 2' },
            ],
            vars: [],
          },
          {
            outputs: [
              { score: 0.7, pass: true, text: 'test 3' },
              { score: 0.6, pass: false, text: 'test 4' },
            ],
            vars: [],
          },
        ],
      };

      // Calculate scores using the same logic as ResultsView
      const scores = mockTable.body
        .flatMap((row) => row.outputs.map((output) => output?.score))
        .filter((score) => typeof score === 'number' && !Number.isNaN(score));

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTable,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      });

      const { container } = render(<ResultsCharts {...defaultProps} scores={scores} />);

      expect(container).toBeDefined();

      expect(screen.queryByText('PerformanceOverTimeChart')).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('handles outputs array with missing elements', () => {
      const mockTableMissingOutputs = {
        head: {
          prompts: [{ provider: 'test-provider-1' }, { provider: 'test-provider-2' }],
          vars: [],
        },
        body: [
          {
            outputs: [{ score: 0.9, pass: true, text: 'test 1' }], // Missing second output
            vars: [],
          },
          {
            outputs: [
              { score: 0.7, pass: true, text: 'test 2' },
              { score: 0.6, pass: false, text: 'test 3' },
            ],
            vars: [],
          },
        ],
      };

      // Calculate scores using the same logic as ResultsView
      const scores = calculateScores(mockTableMissingOutputs);

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTableMissingOutputs,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      });

      expect(() => {
        render(<ResultsCharts {...defaultProps} scores={scores} />);
      }).not.toThrow();
    });

    it('handles very large score values', () => {
      const mockTableLargeScores = {
        head: {
          prompts: [{ provider: 'test-provider-1' }, { provider: 'test-provider-2' }],
          vars: [],
        },
        body: [
          {
            outputs: [
              { score: 1000000, pass: true, text: 'large score 1' },
              { score: 999999, pass: true, text: 'large score 2' },
            ],
            vars: [],
          },
        ],
      };

      // Calculate scores using the same logic as ResultsView
      const scores = calculateScores(mockTableLargeScores);

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTableLargeScores,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      });

      expect(() => {
        render(<ResultsCharts {...defaultProps} scores={scores} />);
      }).not.toThrow();
    });

    it('handles negative score values', () => {
      const mockTableNegativeScores = {
        head: {
          prompts: [{ provider: 'test-provider-1' }, { provider: 'test-provider-2' }],
          vars: [],
        },
        body: [
          {
            outputs: [
              { score: -0.5, pass: false, text: 'negative score 1' },
              { score: 0.5, pass: true, text: 'positive score' },
            ],
            vars: [],
          },
        ],
      };

      // Calculate scores using the same logic as ResultsView
      const scores = calculateScores(mockTableNegativeScores);

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTableNegativeScores,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      });

      expect(() => {
        render(<ResultsCharts {...defaultProps} scores={scores} />);
      }).not.toThrow();
    });
  });

  describe('Chart Type Selection', () => {
    it('shows MetricChart when scores are limited but named scores exist', () => {
      const mockTableWithNamedScores = {
        head: {
          prompts: [
            {
              provider: 'test-provider-1',
              metrics: {
                namedScores: {
                  accuracy: 0.9,
                  precision: 0.8,
                  recall: 0.7,
                },
              },
            },
            {
              provider: 'test-provider-2',
              metrics: {
                namedScores: {
                  accuracy: 0.8,
                  precision: 0.7,
                  recall: 0.6,
                },
              },
            },
          ],
          vars: [],
        },
        body: [
          {
            outputs: [
              { score: 0.9, pass: true, text: 'test 1' },
              { score: 0.8, pass: true, text: 'test 2' },
            ],
            vars: [],
          },
          {
            outputs: [
              { score: 0.7, pass: true, text: 'test 3' },
              { score: 0.9, pass: true, text: 'test 4' }, // Only 3 unique scores: 0.7, 0.8, 0.9
            ],
            vars: [],
          },
        ],
      };

      // Calculate scores using the same logic as ResultsView
      const scores = calculateScores(mockTableWithNamedScores);

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTableWithNamedScores,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      });

      const { container } = render(<ResultsCharts {...defaultProps} scores={scores} />);

      // Should render charts (the specific chart type logic is tested indirectly)
      const canvasElements = container.querySelectorAll('canvas');
      expect(canvasElements.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('handles empty columnVisibility and includes all prompts', () => {
    const mockTable = {
      head: {
        prompts: [{ provider: 'test-provider-1' }, { provider: 'test-provider-2' }],
        vars: [],
      },
      body: [
        {
          outputs: [
            { score: 0.9, pass: true, text: 'test 1' },
            { score: 0.8, pass: true, text: 'test 2' },
          ],
          vars: [],
        },
        {
          outputs: [
            { score: 0.7, pass: true, text: 'test 3' },
            { score: 0.6, pass: false, text: 'test 4' },
          ],
          vars: [],
        },
      ],
    };

    // Calculate scores using the same logic as ResultsView
    const scores = calculateScores(mockTable);

    vi.mocked(useTableStore).mockReturnValue({
      table: mockTable,
      evalId: 'test-eval',
      config: { description: 'test config' },
      setTable: vi.fn(),
      fetchEvalData: vi.fn(),
    });

    const { container } = render(<ResultsCharts {...defaultProps} scores={scores} />);

    const canvasElements = container.querySelectorAll('canvas');
    expect(canvasElements.length).toBeGreaterThanOrEqual(3);
  });
});
