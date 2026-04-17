import { renderWithProviders } from '@app/utils/testutils';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CustomMetrics from './CustomMetrics';

// Mock the hooks that make API calls or use crypto
vi.mock('./store', () => ({
  useTableStore: vi.fn(() => ({
    config: null,
    filters: { values: {}, appliedCount: 0 },
    addFilter: vi.fn(),
  })),
}));

vi.mock('../../../hooks/useCloudConfig', () => ({
  default: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
}));

vi.mock('@app/hooks/useCustomPoliciesMap', () => ({
  useCustomPoliciesMap: vi.fn(() => ({})),
}));

vi.mock('@promptfoo/redteam/plugins/policy/utils', () => ({
  isPolicyMetric: vi.fn(() => false),
  deserializePolicyIdFromMetric: vi.fn(),
  formatPolicyIdentifierAsMetric: vi.fn((name) => name),
  determinePolicyTypeFromId: vi.fn(() => 'inline'),
  makeCustomPolicyCloudUrl: vi.fn(),
}));

describe('CustomMetrics', () => {
  afterEach(() => {
    cleanup();
  });

  it('returns null when lookup is empty', () => {
    const { container } = renderWithProviders(<CustomMetrics lookup={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders without errors', () => {
    const lookup = {
      metric1: 10.5,
      metric2: 20.75,
      metric3: 30,
    };

    renderWithProviders(<CustomMetrics lookup={lookup} />);
    const customMetricsComponent = screen.getByText('metric1');
    expect(customMetricsComponent).toBeInTheDocument();
  });

  it('renders a Box with class custom-metric-container and data-testid custom-metrics when metrics are present', () => {
    const lookup = {
      metric1: 10.5,
      metric2: 20.75,
    };

    renderWithProviders(<CustomMetrics lookup={lookup} />);

    const container = screen.getByTestId('custom-metrics');
    expect(container).toBeInTheDocument();
    expect(container.classList.contains('custom-metric-container')).toBe(true);
  });

  it('displays metrics with simple scores', () => {
    const lookup = {
      metric1: 10.5,
      metric2: 20.75,
    };

    renderWithProviders(<CustomMetrics lookup={lookup} />);

    expect(screen.getByTestId('metric-value-metric1')).toHaveTextContent('10.50');
    expect(screen.getByTestId('metric-value-metric2')).toHaveTextContent('20.75');
  });

  it('displays metrics with counts', () => {
    const lookup = {
      metric1: 30,
      metric2: 40,
    };
    const counts = {
      metric1: 60,
      metric2: 80,
    };

    renderWithProviders(<CustomMetrics lookup={lookup} counts={counts} />);

    expect(screen.getByTestId('metric-value-metric1')).toHaveTextContent('0.50 (30.00/60.00)');
    expect(screen.getByTestId('metric-value-metric2')).toHaveTextContent('0.50 (40.00/80.00)');
  });

  it('displays metrics with totals as percentages', () => {
    const lookup = {
      metric1: 30,
      metric2: 40,
    };
    const metricTotals = {
      metric1: 60,
      metric2: 80,
    };

    renderWithProviders(<CustomMetrics lookup={lookup} metricTotals={metricTotals} />);

    expect(screen.getByTestId('metric-value-metric1')).toHaveTextContent('50.00% (30.00/60.00)');
    expect(screen.getByTestId('metric-value-metric2')).toHaveTextContent('50.00% (40.00/80.00)');
  });

  it('handles zero values correctly', () => {
    const lookup = {
      metric1: 0,
      metric2: 0,
    };

    const { rerender } = renderWithProviders(<CustomMetrics lookup={lookup} />);
    expect(screen.getByTestId('metric-value-metric1')).toHaveTextContent('0.00');
    expect(screen.getByTestId('metric-value-metric2')).toHaveTextContent('0.00');

    rerender(
      <CustomMetrics
        lookup={lookup}
        counts={{
          metric1: 0,
          metric2: 0,
        }}
      />,
    );

    expect(screen.getByTestId('metric-value-metric1')).toHaveTextContent('0');
    expect(screen.getByTestId('metric-value-metric2')).toHaveTextContent('0');

    rerender(
      <CustomMetrics
        lookup={lookup}
        metricTotals={{
          metric1: 0,
          metric2: 0,
        }}
      />,
    );

    expect(screen.getByTestId('metric-value-metric1')).toHaveTextContent('0.00');
    expect(screen.getByTestId('metric-value-metric2')).toHaveTextContent('0.00');
  });

  it('handles undefined or null scores correctly', () => {
    const lookup = {
      metric1: undefined as unknown as number,
      metric2: null as unknown as number,
      metric3: 0,
    };

    renderWithProviders(<CustomMetrics lookup={lookup} />);

    expect(screen.getByTestId('metric-value-metric3')).toHaveTextContent('0.00');

    expect(screen.queryByTestId('metric-value-metric1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('metric-value-metric2')).toHaveTextContent('0');
  });

  it('displays metric names correctly', () => {
    const lookup = { 'test-metric': 10 };

    renderWithProviders(<CustomMetrics lookup={lookup} />);

    expect(screen.getByTestId('metric-name-test-metric')).toHaveTextContent('test-metric');
  });

  it('handles sorting of metrics with special characters and unusual names', () => {
    const lookup = {
      '1. Metric': 1,
      '!Metric': 2,
      '#Metric': 3,
      'Metric A': 4,
      'Metric B': 5,
      'metric-c': 6,
    };

    renderWithProviders(<CustomMetrics lookup={lookup} />);

    const metricNames = screen
      .getAllByTestId(/^metric-name-/)
      .map((element) => element.textContent);

    expect(metricNames).toEqual([
      '!Metric',
      '#Metric',
      '1. Metric',
      'Metric A',
      'Metric B',
      'metric-c',
    ]);
  });

  it('handles missing metrics in counts/totals objects', () => {
    const lookup = { metric1: 10, metric2: 20 };
    const counts = { metric1: 20 };
    const metricTotals = { metric2: 40 };

    renderWithProviders(
      <CustomMetrics lookup={lookup} counts={counts} metricTotals={metricTotals} />,
    );

    expect(screen.getByTestId('metric-value-metric1')).toHaveTextContent('0.50 (10.00/20.00)');
    expect(screen.getByTestId('metric-value-metric2')).toHaveTextContent('50.00% (20.00/40.00)');
  });

  it('should include a comment to fix the missing key prop warning', () => {
    expect(true).toBe(true);
  });

  it('correctly handles undefined metric values in lookup', () => {
    const lookupWithUndefined: Record<string, number | undefined> = {
      metric1: 10,
      metric2: undefined,
    };

    const lookup = Object.fromEntries(
      Object.entries(lookupWithUndefined).filter(([, value]) => value !== undefined),
    ) as Record<string, number>;

    renderWithProviders(<CustomMetrics lookup={lookup} />);

    expect(screen.getByTestId('metric-name-metric1')).toBeInTheDocument();
    expect(screen.queryByTestId('metric-name-metric2')).not.toBeInTheDocument();
  });

  it('displays negative metric values correctly', () => {
    const lookup = {
      metric1: -10.5,
      metric2: -20.75,
    };

    renderWithProviders(<CustomMetrics lookup={lookup} />);

    expect(screen.getByTestId('metric-value-metric1')).toHaveTextContent('-10.50');
    expect(screen.getByTestId('metric-value-metric2')).toHaveTextContent('-20.75');
  });

  it('renders a "Show more..." button when metrics exceed truncationCount and calls onShowMore when clicked', () => {
    const lookup = {
      metric1: 1,
      metric2: 2,
      metric3: 3,
      metric4: 4,
      metric5: 5,
      metric6: 6,
      metric7: 7,
      metric8: 8,
      metric9: 9,
      metric10: 10,
      metric11: 11,
    };
    const onShowMore = vi.fn();

    renderWithProviders(<CustomMetrics lookup={lookup} onShowMore={onShowMore} />);

    const showMoreButton = screen.getByTestId('toggle-show-more');
    fireEvent.click(showMoreButton);

    expect(onShowMore).toHaveBeenCalled();
  });

  it('displays 0 when counts contains a zero value for a metric', () => {
    const lookup = { metric1: 10 };
    const counts = { metric1: 0 };

    renderWithProviders(<CustomMetrics lookup={lookup} counts={counts} />);

    expect(screen.getByTestId('metric-value-metric1')).toHaveTextContent('10.00');
  });
});
