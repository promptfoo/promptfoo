import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResultsCharts from './ResultsCharts';
import { useTableStore } from './store';

// Mock Chart.js
vi.mock('chart.js', () => {
  const ChartMock = vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
  }));

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

// Mock MUI theme
vi.mock('@mui/material/styles', () => ({
  useTheme: vi.fn(() => ({
    palette: {
      mode: 'light',
    },
  })),
}));

// Mock the store
vi.mock('./store', () => ({
  useTableStore: vi.fn(),
}));

// Mock API calls
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

describe('ResultsCharts', () => {
  const defaultProps = {
    handleHideCharts: vi.fn(),
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

    vi.mocked(useTableStore).mockReturnValue({
      table: mockTable,
      evalId: 'test-eval',
      config: { description: 'test config' },
      setTable: vi.fn(),
      fetchEvalData: vi.fn(),
    });

    const handleHideCharts = vi.fn();

    render(<ResultsCharts {...defaultProps} handleHideCharts={handleHideCharts} />);

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

    vi.mocked(useTableStore).mockReturnValue({
      table: mockTable,
      evalId: 'test-eval',
      config: { description: 'test config' },
      setTable: vi.fn(),
      fetchEvalData: vi.fn(),
    });

    const { container } = render(<ResultsCharts {...defaultProps} />);

    expect(() => render(<ResultsCharts {...defaultProps} />)).not.toThrow();

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

    vi.mocked(useTableStore).mockReturnValue({
      table: mockTable,
      evalId: 'test-eval',
      config: { description: 'test config' },
      setTable: vi.fn(),
      fetchEvalData: vi.fn(),
    });

    const { container } = render(<ResultsCharts {...defaultProps} />);

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

    vi.mocked(useTableStore).mockReturnValue({
      table: mockTable,
      evalId: 'test-eval',
      config: { description: 'test config' },
      setTable: vi.fn(),
      fetchEvalData: vi.fn(),
    });

    expect(() => {
      render(<ResultsCharts {...defaultProps} />);
    }).not.toThrow();
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

    vi.mocked(useTableStore).mockReturnValue({
      table: mockTable,
      evalId: 'test-eval',
      config: { description: 'test config' },
      setTable: vi.fn(),
      fetchEvalData: vi.fn(),
    });

    const { container } = render(<ResultsCharts {...defaultProps} />);

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

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTableWithNullOutputs,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      });

      expect(() => {
        render(<ResultsCharts {...defaultProps} />);
      }).not.toThrow();
    });

    it('handles outputs with non-numeric scores', () => {
      const mockTableWithInvalidScores = {
        head: {
          prompts: [{ provider: 'test-provider-1' }, { provider: 'test-provider-2' }],
          vars: [],
        },
        body: [
          {
            outputs: [
              { score: 'invalid', pass: true, text: 'invalid score' },
              { score: 0.8, pass: true, text: 'valid output' },
            ],
            vars: [],
          },
          {
            outputs: [
              { score: null, pass: false, text: 'null score' },
              { score: undefined, pass: true, text: 'undefined score' },
            ],
            vars: [],
          },
        ],
      };

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTableWithInvalidScores,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      });

      expect(() => {
        render(<ResultsCharts {...defaultProps} />);
      }).not.toThrow();
    });

    it('does not render charts when all scores are invalid', () => {
      const mockTableWithNoValidScores = {
        head: {
          prompts: [{ provider: 'test-provider-1' }, { provider: 'test-provider-2' }],
          vars: [],
        },
        body: [
          {
            outputs: [
              { score: null, pass: true, text: 'no score 1' },
              { score: 'invalid', pass: true, text: 'no score 2' },
            ],
            vars: [],
          },
          {
            outputs: [
              { score: undefined, pass: false, text: 'no score 3' },
              { score: Number.NaN, pass: true, text: 'no score 4' },
            ],
            vars: [],
          },
        ],
      };

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTableWithNoValidScores,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      });

      const { container } = render(<ResultsCharts {...defaultProps} />);

      // Should not render charts when all scores are invalid (returns null)
      expect(container.firstChild).toBeNull();
    });

    it('filters out invalid scores and renders charts with valid data', () => {
      const mockTableWithMixedScores = {
        head: {
          prompts: [{ provider: 'test-provider-1' }, { provider: 'test-provider-2' }],
          vars: [],
        },
        body: [
          {
            outputs: [
              { score: 0.9, pass: true, text: 'valid 1' },
              { score: 0.8, pass: true, text: 'valid 2' },
            ],
            vars: [],
          },
          {
            outputs: [
              { score: null, pass: false, text: 'invalid 1' },
              { score: 0.7, pass: true, text: 'valid 3' },
            ],
            vars: [],
          },
          {
            outputs: [
              { score: 0.6, pass: true, text: 'valid 4' },
              { score: 'invalid', pass: true, text: 'invalid 2' },
            ],
            vars: [],
          },
        ],
      };

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTableWithMixedScores,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      });

      const { container } = render(<ResultsCharts {...defaultProps} />);

      // Should render charts (canvas elements) since we have valid scores
      const canvasElements = container.querySelectorAll('canvas');
      expect(canvasElements.length).toBeGreaterThan(0);

      // Should not show "no data" messages
      expect(screen.queryByText('No score data available for histogram')).not.toBeInTheDocument();
      expect(
        screen.queryByText('No score data available for scatter plot'),
      ).not.toBeInTheDocument();
    });

    it('does not render charts if all scores are the same value', () => {
      const mockTableWithUniformScores = {
        head: {
          prompts: [{ provider: 'test-provider-1' }, { provider: 'test-provider-2' }],
          vars: [],
        },
        body: [
          {
            outputs: [
              { score: 0.75, pass: true, text: 'test 1' },
              { score: 0.75, pass: true, text: 'test 2' },
            ],
            vars: [],
          },
          {
            outputs: [
              { score: 0.75, pass: true, text: 'test 3' },
              { score: 0.75, pass: true, text: 'test 4' },
            ],
            vars: [],
          },
        ],
      };

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTableWithUniformScores,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      });

      const { container } = render(<ResultsCharts {...defaultProps} />);

      expect(container.firstChild).toBeNull();
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

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTable,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      });

      const { container } = render(<ResultsCharts {...defaultProps} />);

      expect(container).toBeDefined();

      expect(screen.queryByText('PerformanceOverTimeChart')).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty table body', () => {
      const mockEmptyTable = {
        head: {
          prompts: [{ provider: 'test-provider-1' }, { provider: 'test-provider-2' }],
          vars: [],
        },
        body: [],
      };

      vi.mocked(useTableStore).mockReturnValue({
        table: mockEmptyTable,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      });

      expect(() => {
        render(<ResultsCharts {...defaultProps} />);
      }).not.toThrow();
    });

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

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTableMissingOutputs,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      });

      expect(() => {
        render(<ResultsCharts {...defaultProps} />);
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

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTableLargeScores,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      });

      expect(() => {
        render(<ResultsCharts {...defaultProps} />);
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

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTableNegativeScores,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      });

      expect(() => {
        render(<ResultsCharts {...defaultProps} />);
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

      vi.mocked(useTableStore).mockReturnValue({
        table: mockTableWithNamedScores,
        evalId: 'test-eval',
        config: { description: 'test config' },
        setTable: vi.fn(),
        fetchEvalData: vi.fn(),
      });

      const { container } = render(<ResultsCharts {...defaultProps} />);

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

    vi.mocked(useTableStore).mockReturnValue({
      table: mockTable,
      evalId: 'test-eval',
      config: { description: 'test config' },
      setTable: vi.fn(),
      fetchEvalData: vi.fn(),
    });

    const { container } = render(<ResultsCharts {...defaultProps} />);

    const canvasElements = container.querySelectorAll('canvas');
    expect(canvasElements.length).toBeGreaterThanOrEqual(3);
  });
});
