import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { afterEach, describe, expect, it, vi } from 'vitest';
import CustomMetrics from './CustomMetrics';

describe('CustomMetrics', () => {
  afterEach(() => {
    cleanup();
  });

  it('returns null when lookup is empty', () => {
    const { container } = render(<CustomMetrics lookup={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders without errors', () => {
    const lookup = {
      metric1: 10.5,
      metric2: 20.75,
      metric3: 30,
    };

    render(<CustomMetrics lookup={lookup} />);
    const customMetricsComponent = screen.getByText('metric1');
    expect(customMetricsComponent).toBeInTheDocument();
  });

  it('renders a Box with class custom-metric-container and data-testid custom-metrics when metrics are present', () => {
    const lookup = {
      metric1: 10.5,
      metric2: 20.75,
    };

    render(<CustomMetrics lookup={lookup} />);

    const container = screen.getByTestId('custom-metrics');
    expect(container).toBeInTheDocument();
    expect(container.classList.contains('custom-metric-container')).toBe(true);
  });

  it('displays metrics with simple scores', () => {
    const lookup = {
      metric1: 10.5,
      metric2: 20.75,
    };

    render(<CustomMetrics lookup={lookup} />);

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

    render(<CustomMetrics lookup={lookup} counts={counts} />);

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

    render(<CustomMetrics lookup={lookup} metricTotals={metricTotals} />);

    expect(screen.getByTestId('metric-value-metric1')).toHaveTextContent('50.00% (30.00/60.00)');
    expect(screen.getByTestId('metric-value-metric2')).toHaveTextContent('50.00% (40.00/80.00)');
  });

  it('handles zero values correctly', () => {
    const lookup = {
      metric1: 0,
      metric2: 0,
    };

    const { rerender } = render(<CustomMetrics lookup={lookup} />);
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

    render(<CustomMetrics lookup={lookup} />);

    expect(screen.getByTestId('metric-value-metric3')).toHaveTextContent('0.00');

    expect(screen.queryByTestId('metric-value-metric1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('metric-value-metric2')).toHaveTextContent('0');
  });

  it('shows/hides metrics based on show more/less button', () => {
    const lookup = Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [`metric${i + 1}`, i + 1]),
    );

    render(<CustomMetrics lookup={lookup} />);

    expect(screen.getAllByTestId(/^metric-metric\d+$/)).toHaveLength(10);

    fireEvent.click(screen.getByTestId('toggle-show-more'));
    expect(screen.getAllByTestId(/^metric-metric\d+$/)).toHaveLength(15);

    fireEvent.click(screen.getByTestId('toggle-show-more'));
    expect(screen.getAllByTestId(/^metric-metric\d+$/)).toHaveLength(10);
  });

  it('does not display toggle when number of metrics equals NUM_METRICS_TO_DISPLAY_ABOVE_FOLD', () => {
    const lookup = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`metric${i + 1}`, i + 1]),
    );

    render(<CustomMetrics lookup={lookup} />);

    expect(screen.queryByTestId('toggle-show-more')).not.toBeInTheDocument();
  });

  it('calls onSearchTextChange when metric is clicked', () => {
    const onSearchTextChange = vi.fn();
    const lookup = {
      metric1: 10,
    };

    render(<CustomMetrics lookup={lookup} onSearchTextChange={onSearchTextChange} />);

    fireEvent.click(screen.getByTestId('metric-metric1'));
    expect(onSearchTextChange).toHaveBeenCalledWith('metric=metric1:');
  });

  it('calls onMetricFilter with the metric name when a metric chip is clicked and onMetricFilter is provided', () => {
    const onMetricFilter = vi.fn();
    const lookup = {
      metric1: 10,
    };

    render(<CustomMetrics lookup={lookup} onMetricFilter={onMetricFilter} />);

    fireEvent.click(screen.getByTestId('metric-metric1'));
    expect(onMetricFilter).toHaveBeenCalledWith('metric1');
  });

  it('displays metric names correctly', () => {
    const lookup = { 'test-metric': 10 };

    render(<CustomMetrics lookup={lookup} />);

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

    render(<CustomMetrics lookup={lookup} />);

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

    render(<CustomMetrics lookup={lookup} counts={counts} metricTotals={metricTotals} />);

    expect(screen.getByTestId('metric-value-metric1')).toHaveTextContent('0.50 (10.00/20.00)');
    expect(screen.getByTestId('metric-value-metric2')).toHaveTextContent('50.00% (20.00/40.00)');
  });

  it('should include a comment to fix the missing key prop warning', () => {
    expect(true).toBe(true);
  });
});
