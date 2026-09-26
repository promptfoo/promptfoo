import {
  deserializePolicyIdFromMetric,
  determinePolicyTypeFromId,
  formatPolicyIdentifierAsMetric,
  isPolicyMetric,
  makeCustomPolicyCloudUrl,
} from '@promptfoo/redteam/plugins/policy/utils';
import './CustomMetrics.css';

import { useState } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useCustomPoliciesMap } from '@app/hooks/useCustomPoliciesMap';
import { ExternalLink } from 'lucide-react';
import useCloudConfig from '../../../hooks/useCloudConfig';
import { useApplyFilterFromMetric } from './hooks';
import { useTableStore } from './store';

interface CustomMetricsProps {
  lookup: Record<string, number>;
  metricTotals?: Record<string, number>;
  totalMetricNames?: readonly string[];
  /**
   * How many metrics to display before truncating and rendering a "Show more" button.
   */
  truncationCount?: number;
  /**
   * Callback for the "Show more" button. If provided, overwrites the default behavior of toggling
   * the showAll state.
   */
  onShowMore?: () => void;
}

interface MetricValueProps {
  metric: string;
  score: number;
  metricTotals?: Record<string, number>;
}

const MetricValue = ({ metric, score, metricTotals }: MetricValueProps) => {
  if (!Number.isFinite(score)) {
    return <span data-testid={`metric-value-${metric}`}>—</span>;
  }
  if (metricTotals && Object.prototype.hasOwnProperty.call(metricTotals, metric)) {
    const total = metricTotals[metric];
    const percentage = (score / total) * 100;
    if (Number.isFinite(total) && total !== 0 && Number.isFinite(percentage)) {
      return (
        <span data-testid={`metric-value-${metric}`}>
          {percentage.toFixed(2)}% ({score.toFixed(2)}/{total.toFixed(2)})
        </span>
      );
    }
  }
  return <span data-testid={`metric-value-${metric}`}>{score.toFixed(2)}</span>;
};

const MetricList = ({
  lookup,
  metricTotals,
  totalMetricNames = [],
  truncationCount = 10,
  onShowMore,
}: CustomMetricsProps) => {
  const applyFilterFromMetric = useApplyFilterFromMetric();
  const { data: cloudConfig } = useCloudConfig();
  const { config } = useTableStore();
  const policiesById = useCustomPoliciesMap(config?.redteam?.plugins ?? []);
  const [showAllMetrics, setShowAllMetrics] = useState(false);

  const metrics = Object.entries(lookup).sort(([metricA], [metricB]) =>
    metricA.localeCompare(metricB),
  );
  const displayMetrics = showAllMetrics ? metrics : metrics.slice(0, truncationCount);

  const handleClick = applyFilterFromMetric;

  return (
    <div className="custom-metric-container my-2" data-testid="custom-metrics">
      {displayMetrics.map(([metric, score]) => {
        let displayLabel: string = metric;
        let tooltipContent: React.ReactNode | null = null;
        const policyMetric = isPolicyMetric(metric);
        const totalMetric = totalMetricNames.includes(metric);
        const filterTargetLabel = policyMetric ? 'policy' : 'metric';
        // Display a tooltip for policy metrics.
        if (policyMetric) {
          const policyId = deserializePolicyIdFromMetric(metric);
          const policy = policiesById[policyId];
          if (policy) {
            displayLabel = formatPolicyIdentifierAsMetric(policy.name ?? policy.id, metric);
            tooltipContent = (
              <>
                <p className="text-sm font-semibold">{policy.name}</p>
                <p className="text-sm">{policy.text}</p>
                {determinePolicyTypeFromId(policy.id) === 'reusable' && cloudConfig?.appUrl && (
                  <p className="text-sm">
                    <a
                      href={makeCustomPolicyCloudUrl(cloudConfig?.appUrl, policy.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      <span>View policy in Promptfoo Cloud</span>
                      <ExternalLink className="size-3.5" />
                    </a>
                  </p>
                )}
              </>
            );
          }
        }
        if (totalMetric) {
          displayLabel = `${displayLabel} (total)`;
        }

        return metric && typeof score !== 'undefined' ? (
          <div
            data-testid={`metric-${metric}`}
            className="metric-chip filterable"
            key={`${metric}-${score}`}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="metric-content"
                  aria-label={`Filter by ${filterTargetLabel} ${displayLabel}`}
                  onClick={() => handleClick(metric)}
                >
                  <span data-testid={`metric-name-${metric}`} className="metric-name">
                    {displayLabel}
                  </span>
                  <span className="metric-value">
                    <MetricValue metric={metric} score={score} metricTotals={metricTotals} />
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <div className="space-y-2 max-w-[400px]">
                  {tooltipContent}
                  {totalMetric ? (
                    <p className="text-sm">Derived metric from the unfiltered evaluation.</p>
                  ) : null}
                  <p className="text-sm font-medium">Click to filter by this {filterTargetLabel}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        ) : null;
      })}
      {metrics.length > truncationCount && (
        <button
          type="button"
          className="show-more-toggle"
          data-testid="toggle-show-more"
          onClick={onShowMore ?? (() => setShowAllMetrics(!showAllMetrics))}
          aria-expanded={showAllMetrics}
        >
          {showAllMetrics ? 'Show less...' : 'Show more...'}
        </button>
      )}
    </div>
  );
};

export default function CustomMetrics(props: CustomMetricsProps) {
  return props.lookup && Object.keys(props.lookup).length > 0 ? <MetricList {...props} /> : null;
}
