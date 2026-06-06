import { useCustomPoliciesMap } from '@app/hooks/useCustomPoliciesMap';
import { renderWithProviders } from '@app/utils/testutils';
import {
  deserializePolicyIdFromMetric,
  formatPolicyIdentifierAsMetric,
  isPolicyMetric,
} from '@promptfoo/redteam/plugins/policy/utils';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CustomMetrics from './CustomMetrics';

import type { AssertionHierarchyResult } from './assertionHierarchy';

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

  it('shows a filter hint tooltip for metric pills', async () => {
    const user = userEvent.setup();

    renderWithProviders(<CustomMetrics lookup={{ metric1: 10 }} />);

    await user.hover(screen.getByTestId('metric-name-metric1'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Click to filter by this metric');
  });

  it('exposes the filter hint from a keyboard-focusable metric control', async () => {
    renderWithProviders(<CustomMetrics lookup={{ metric1: 10 }} />);

    const metricButton = screen.getByRole('button', { name: 'Filter by metric metric1' });
    metricButton.focus();

    expect(metricButton).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Click to filter by this metric');
  });

  it('keeps the clickable button as the chip child so the whole chip area filters', () => {
    renderWithProviders(<CustomMetrics lookup={{ metric1: 10 }} />);

    const chip = screen.getByTestId('metric-metric1');
    const metricButton = screen.getByRole('button', { name: 'Filter by metric metric1' });

    // The button must be a direct child of the chip so the chip has no
    // non-clickable padding ring around the button.
    expect(metricButton.parentElement).toBe(chip);
    expect(metricButton).toHaveClass('metric-content');
  });

  it('keeps policy details alongside the filter hint tooltip', async () => {
    const user = userEvent.setup();
    const policyMetric = 'policy:policy-1';

    vi.mocked(isPolicyMetric).mockReturnValueOnce(true);
    vi.mocked(deserializePolicyIdFromMetric).mockReturnValueOnce('policy-1');
    vi.mocked(formatPolicyIdentifierAsMetric).mockReturnValueOnce('Reusable policy');
    vi.mocked(useCustomPoliciesMap).mockReturnValueOnce({
      'policy-1': {
        id: 'policy-1',
        name: 'Reusable policy',
        text: 'Must not expose sensitive data.',
      },
    });

    renderWithProviders(<CustomMetrics lookup={{ [policyMetric]: 10 }} />);

    await user.hover(screen.getByTestId(`metric-name-${policyMetric}`));

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Reusable policy');
    expect(tooltip).toHaveTextContent('Must not expose sensitive data.');
    expect(tooltip).toHaveTextContent('Click to filter by this policy');
    expect(
      screen.getByRole('button', { name: 'Filter by policy Reusable policy' }),
    ).toBeInTheDocument();
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

  it('sorts the full metric list before truncating visible metrics', async () => {
    const user = userEvent.setup();
    const lookup = {
      zebra: 3,
      alpha: 1,
      beta: 2,
    };

    renderWithProviders(<CustomMetrics lookup={lookup} truncationCount={2} />);

    expect(screen.getAllByTestId(/^metric-name-/).map((element) => element.textContent)).toEqual([
      'alpha',
      'beta',
    ]);
    expect(screen.queryByTestId('metric-name-zebra')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('toggle-show-more'));

    expect(screen.getAllByTestId(/^metric-name-/).map((element) => element.textContent)).toEqual([
      'alpha',
      'beta',
      'zebra',
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

  it('renders a "Show more..." button when metrics exceed truncationCount and calls onShowMore when clicked', async () => {
    const user = userEvent.setup();
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
    await user.click(showMoreButton);

    expect(onShowMore).toHaveBeenCalled();
  });

  it('displays 0 when counts contains a zero value for a metric', () => {
    const lookup = { metric1: 10 };
    const counts = { metric1: 0 };

    renderWithProviders(<CustomMetrics lookup={lookup} counts={counts} />);

    expect(screen.getByTestId('metric-value-metric1')).toHaveTextContent('10.00');
  });

  describe('buildMetricResultLookup integration', () => {
    it('renders AssertionChip with color coding when componentResults provided', () => {
      const lookup = { 'test-metric': 0.75 };
      const componentResults: AssertionHierarchyResult[] = [
        {
          pass: true,
          score: 0.75,
          reason: 'Passed',
          assertion: { type: 'equals', metric: 'test-metric' },
        },
      ];

      const { container } = renderWithProviders(
        <CustomMetrics lookup={lookup} componentResults={componentResults} />,
      );

      expect(screen.getByText('test-metric')).toBeInTheDocument();
      // Should use AssertionChip which has green styling for passed
      expect(container.querySelector('.bg-emerald-50')).toBeInTheDocument();
    });

    it('renders AssertionChip with red styling for failed assertions', () => {
      const lookup = { 'failed-metric': 0.3 };
      const componentResults: AssertionHierarchyResult[] = [
        {
          pass: false,
          score: 0.3,
          reason: 'Failed',
          assertion: { type: 'equals', metric: 'failed-metric' },
        },
      ];

      const { container } = renderWithProviders(
        <CustomMetrics lookup={lookup} componentResults={componentResults} />,
      );

      expect(screen.getByText('failed-metric')).toBeInTheDocument();
      // Should use AssertionChip which has red styling for failed
      expect(container.querySelector('.bg-red-50')).toBeInTheDocument();
    });

    it('keeps aggregated duplicate metrics neutral instead of selecting one result', () => {
      const lookup = { Accuracy: 0.5 };
      const componentResults: AssertionHierarchyResult[] = [
        {
          pass: true,
          score: 1,
          reason: 'Passed',
          assertion: { type: 'equals', metric: 'Accuracy' },
        },
        {
          pass: false,
          score: 0,
          reason: 'Failed',
          assertion: { type: 'equals', metric: 'Accuracy' },
        },
      ];

      renderWithProviders(<CustomMetrics lookup={lookup} componentResults={componentResults} />);

      expect(screen.getByTestId('metric-name-Accuracy')).toHaveTextContent('Accuracy');
      expect(screen.getByTestId('metric-value-Accuracy')).toHaveTextContent('0.50');
      expect(screen.queryByTestId('assertion-chip-Accuracy')).not.toBeInTheDocument();
    });

    it('identifies assert-sets and renders with chevron', () => {
      const lookup = { 'assert-set': 1 };
      const componentResults: AssertionHierarchyResult[] = [
        {
          pass: true,
          score: 1,
          reason: 'All passed',
          assertion: { type: 'equals', metric: 'assert-set' },
          metadata: { isAssertSet: true, assertSetThreshold: 1 },
        },
        {
          pass: true,
          score: 1,
          reason: 'Child passed',
          assertion: { type: 'equals', metric: 'child' },
          metadata: { parentAssertSetIndex: 0 },
        },
      ];

      renderWithProviders(<CustomMetrics lookup={lookup} componentResults={componentResults} />);

      expect(screen.getByText('assert-set')).toBeInTheDocument();
      // Assert-sets should have a chevron button for expansion
      expect(screen.getByLabelText('Show assert-set details')).toBeInTheDocument();
    });

    it('uses hierarchy result data for child metrics that are shown separately', () => {
      const lookup = { parent: 1, child: 1 };
      const componentResults: AssertionHierarchyResult[] = [
        {
          pass: true,
          score: 1,
          reason: 'Parent passed',
          assertion: { type: 'equals', metric: 'parent' },
          metadata: { isAssertSet: true },
        },
        {
          pass: true,
          score: 1,
          reason: 'Child passed',
          assertion: { type: 'equals', metric: 'child' },
          metadata: { parentAssertSetIndex: 0 },
        },
      ];

      renderWithProviders(<CustomMetrics lookup={lookup} componentResults={componentResults} />);

      expect(screen.getByText('parent')).toBeInTheDocument();
      expect(screen.getByText('child')).toBeInTheDocument();
      expect(screen.queryByTestId('metric-name-child')).not.toBeInTheDocument();
      expect(screen.getByTestId('assertion-chip-child')).toHaveClass('bg-emerald-50');
    });

    it('uses assertSetMetric from metadata as metric name', () => {
      const lookup = { 'metadata-metric': 1 };
      const componentResults: AssertionHierarchyResult[] = [
        {
          pass: true,
          score: 1,
          reason: 'Passed',
          assertion: { type: 'equals' },
          metadata: { assertSetMetric: 'metadata-metric', isAssertSet: true },
        },
      ];

      renderWithProviders(<CustomMetrics lookup={lookup} componentResults={componentResults} />);

      expect(screen.getByText('metadata-metric')).toBeInTheDocument();
    });

    it('falls back to assertion type when metric not available', () => {
      const lookup = { 'test-type': 0.5 };
      const componentResults: AssertionHierarchyResult[] = [
        {
          pass: true,
          score: 0.5,
          reason: 'Passed',
          assertion: { type: 'equals' },
        },
      ];

      renderWithProviders(<CustomMetrics lookup={lookup} componentResults={componentResults} />);

      expect(screen.getByText('test-type')).toBeInTheDocument();
    });

    it('handles empty componentResults gracefully', () => {
      const lookup = { metric1: 10 };

      renderWithProviders(<CustomMetrics lookup={lookup} componentResults={[]} />);

      // Should fall back to neutral styling
      expect(screen.getByTestId('metric-name-metric1')).toHaveTextContent('metric1');
    });

    it('handles null/undefined results in componentResults', () => {
      const lookup = { metric1: 10 };
      const componentResults: AssertionHierarchyResult[] = [
        null as unknown as AssertionHierarchyResult,
        {
          pass: true,
          score: 10,
          reason: 'Passed',
          assertion: { type: 'equals', metric: 'metric1' },
        },
      ];

      renderWithProviders(<CustomMetrics lookup={lookup} componentResults={componentResults} />);

      expect(screen.getByText('metric1')).toBeInTheDocument();
    });

    it('groups multiple children under same parent assert-set', () => {
      const lookup = { parent: 0.67 };
      const componentResults: AssertionHierarchyResult[] = [
        {
          pass: true,
          score: 0.67,
          reason: 'Parent passed',
          assertion: { type: 'equals', metric: 'parent' },
          metadata: { isAssertSet: true, assertSetThreshold: 0.5 },
        },
        {
          pass: true,
          score: 1,
          reason: 'Child 1 passed',
          assertion: { type: 'equals', metric: 'child1' },
          metadata: { parentAssertSetIndex: 0 },
        },
        {
          pass: false,
          score: 0,
          reason: 'Child 2 failed',
          assertion: { type: 'equals', metric: 'child2' },
          metadata: { parentAssertSetIndex: 0 },
        },
        {
          pass: true,
          score: 1,
          reason: 'Child 3 passed',
          assertion: { type: 'equals', metric: 'child3' },
          metadata: { parentAssertSetIndex: 0 },
        },
      ];

      renderWithProviders(<CustomMetrics lookup={lookup} componentResults={componentResults} />);

      expect(screen.getByText('parent')).toBeInTheDocument();
      // All three children should be associated with the parent
      // We can verify by checking the chevron exists for expansion
      expect(screen.getByLabelText('Show parent details')).toBeInTheDocument();
    });

    it('falls back to neutral styling when metric not in componentResults', () => {
      const lookup = { 'metric-not-in-results': 10, 'metric-in-results': 5 };
      const componentResults: AssertionHierarchyResult[] = [
        {
          pass: true,
          score: 5,
          reason: 'Passed',
          assertion: { type: 'equals', metric: 'metric-in-results' },
        },
      ];

      renderWithProviders(<CustomMetrics lookup={lookup} componentResults={componentResults} />);

      // Metric in results should use AssertionChip
      expect(screen.getByText('metric-in-results')).toBeInTheDocument();

      // Metric not in results should use fallback neutral styling
      const notInResults = screen.getByTestId('metric-name-metric-not-in-results');
      expect(notInResults).toBeInTheDocument();
      expect(notInResults.textContent).toBe('metric-not-in-results');
    });
  });
});
