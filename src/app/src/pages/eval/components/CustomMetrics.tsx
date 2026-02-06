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
  counts?: Record<string, number>;
  metricTotals?: Record<string, number>;
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
  counts?: Record<string, number>;
  metricTotals?: Record<string, number>;
}

const MetricValue = ({ metric, score, counts, metricTotals }: MetricValueProps) => {
  if (metricTotals && metricTotals[metric]) {
    if (metricTotals[metric] === 0) {
      return <span data-testid={`metric-value-${metric}`}>0%</span>;
    }
    return (
      <span data-testid={`metric-value-${metric}`}>
        {((score / metricTotals[metric]) * 100).toFixed(2)}% ({score?.toFixed(2) ?? '0'}/
        {metricTotals[metric]?.toFixed(2) ?? '0'})
      </span>
    );
  } else if (counts && counts[metric]) {
    if (counts[metric] === 0) {
      return <span data-testid={`metric-value-${metric}`}>0</span>;
    }
    return (
      <span data-testid={`metric-value-${metric}`}>
        {(score / counts[metric]).toFixed(2)} ({score?.toFixed(2) ?? '0'}/
        {counts[metric]?.toFixed(2) ?? '0'})
      </span>
    );
  }
  return <span data-testid={`metric-value-${metric}`}>{score?.toFixed(2) ?? '0'}</span>;
};

const CustomMetrics = ({
  lookup,
  counts,
  metricTotals,
  truncationCount = 10,
  onShowMore,
}: CustomMetricsProps) => {
  // Validate props BEFORE hooks to comply with Rules of Hooks
  if (!lookup || !Object.keys(lookup).length) {
    return null;
  }

  const applyFilterFromMetric = useApplyFilterFromMetric();
  const { data: cloudConfig } = useCloudConfig();
  const { config } = useTableStore();
  const policiesById = useCustomPoliciesMap(config?.redteam?.plugins ?? []);
  const [showAll, setShowAll] = useState(false);

  const metrics = Object.entries(lookup);
  const displayMetrics = showAll ? metrics : metrics.slice(0, truncationCount);

  const handleClick = applyFilterFromMetric;

  return (
    <div className="custom-metric-container my-2" data-testid="custom-metrics">
      {displayMetrics
        .sort(([metricA], [metricB]) => metricA.localeCompare(metricB))
        .map(([metric, score]) => {
          let displayLabel: string = metric;
          let tooltipContent: React.ReactNode | null = null;
          // Display a tooltip for policy metrics.
          if (isPolicyMetric(metric)) {
            const policyId = deserializePolicyIdFromMetric(metric);
            const policy = policiesById[policyId];
            if (policy) {
              displayLabel = formatPolicyIdentifierAsMetric(policy.name ?? policy.id, metric);
              tooltipContent = (
                <div className="space-y-2 max-w-[400px]">
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
                </div>
              );
            }
          }

          return metric && typeof score !== 'undefined' ? (
            <div
              data-testid={`metric-${metric}`}
              className="metric-chip filterable"
              key={`${metric}-${score}`}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="metric-content" onClick={() => handleClick(metric)}>
                    <span data-testid={`metric-name-${metric}`} className="metric-name">
                      {displayLabel}
                    </span>
                    <span className="metric-value">
                      <MetricValue
                        metric={metric}
                        score={score}
                        counts={counts}
                        metricTotals={metricTotals}
                      />
                    </span>
                  </div>
                </TooltipTrigger>
                {tooltipContent && <TooltipContent>{tooltipContent}</TooltipContent>}
              </Tooltip>
            </div>
          ) : null;
        })}
      {metrics.length > truncationCount && (
        <div
          className="show-more-toggle clickable"
          data-testid="toggle-show-more"
          onClick={onShowMore ?? (() => setShowAll(!showAll))}
        >
          {showAll ? 'Show less...' : 'Show more...'}
        </div>
      )}
    </div>
  );
};

export default CustomMetrics;
