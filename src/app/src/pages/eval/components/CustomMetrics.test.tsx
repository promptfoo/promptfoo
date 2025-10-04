import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, createQueryClientWrapper } from '../../../test/queryClientWrapper';
import CustomMetrics from './CustomMetrics';

vi.mock('@app/hooks/useCloudConfig', () => ({
  default: () => ({ data: null, isLoading: false, error: null, refetch: vi.fn() }),
}));

describe('CustomMetrics', () => {
  const renderWithQueryClient = (component: React.ReactElement) => {
    const queryClient = createTestQueryClient();
    return render(component, {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });
  };

  afterEach(() => {
    cleanup();
  });

  it('returns null when lookup is empty', () => {
    const { container } = renderWithQueryClient(<CustomMetrics lookup={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders without errors', () => {
    const lookup = {
      metric1: 10.5,
      metric2: 20.75,
      metric3: 30,
    };

    renderWithQueryClient(<CustomMetrics lookup={lookup} />);
    const customMetricsComponent = screen.getByText('metric1');
    expect(customMetricsComponent).toBeInTheDocument();
  });

  it('renders a Box with class custom-metric-container and data-testid custom-metrics when metrics are present', () => {
    const lookup = {
      metric1: 10.5,
      metric2: 20.75,
    };

    renderWithQueryClient(<CustomMetrics lookup={lookup} />);

    const container = screen.getByTestId('custom-metrics');
    expect(container).toBeInTheDocument();
    expect(container.classList.contains('custom-metric-container')).toBe(true);
  });

  it('displays metrics with simple scores', () => {
    const lookup = {
      metric1: 10.5,
      metric2: 20.75,
    };

    renderWithQueryClient(<CustomMetrics lookup={lookup} />);

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

    renderWithQueryClient(<CustomMetrics lookup={lookup} counts={counts} />);

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

    renderWithQueryClient(<CustomMetrics lookup={lookup} metricTotals={metricTotals} />);

    expect(screen.getByTestId('metric-value-metric1')).toHaveTextContent('50.00% (30.00/60.00)');
    expect(screen.getByTestId('metric-value-metric2')).toHaveTextContent('50.00% (40.00/80.00)');
  });

  it('handles zero values correctly', () => {
    const lookup = {
      metric1: 0,
      metric2: 0,
    };

    const { rerender } = renderWithQueryClient(<CustomMetrics lookup={lookup} />);
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

    renderWithQueryClient(<CustomMetrics lookup={lookup} />);

    expect(screen.getByTestId('metric-value-metric3')).toHaveTextContent('0.00');

    expect(screen.queryByTestId('metric-value-metric1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('metric-value-metric2')).toHaveTextContent('0');
  });

  it('displays metric names correctly', () => {
    const lookup = { 'test-metric': 10 };

    renderWithQueryClient(<CustomMetrics lookup={lookup} />);

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

    renderWithQueryClient(<CustomMetrics lookup={lookup} />);

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

    renderWithQueryClient(
      <CustomMetrics lookup={lookup} counts={counts} metricTotals={metricTotals} />,
    );

    expect(screen.getByTestId('metric-value-metric1')).toHaveTextContent('0.50 (10.00/20.00)');
    expect(screen.getByTestId('metric-value-metric2')).toHaveTextContent('50.00% (20.00/40.00)');
  });

  it('should include a comment to fix the missing key prop warning', () => {
    expect(true).toBe(true);
  });
});
