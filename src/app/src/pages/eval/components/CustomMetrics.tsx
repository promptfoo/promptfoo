import {
  deserializePolicyIdFromMetric,
  determinePolicyTypeFromId,
  formatPolicyIdentifierAsMetric,
  isPolicyMetric,
  makeCustomPolicyCloudUrl,
} from '@promptfoo/redteam/plugins/policy/utils';
import './CustomMetrics.css';
import { useCallback } from 'react';

import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import { styled } from '@mui/material/styles';
import Tooltip, { TooltipProps, tooltipClasses } from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useCloudConfig from '../../../hooks/useCloudConfig';
import { useTableStore } from './store';
import { useCustomPoliciesMap } from '@app/hooks/useCustomPoliciesMap';
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

const MetricTooltip = styled(({ className, ...props }: TooltipProps) => (
  <Tooltip {...props} classes={{ popper: className }} />
))(({ theme }) => ({
  [`& .${tooltipClasses.tooltip}`]: {
    backgroundColor: theme.palette.background.default,
    color: theme.palette.text.primary,
    boxShadow: theme.shadows[1],
    padding: '16px',
    maxWidth: '400px',
  },
}));

const CustomMetrics = ({
  lookup,
  counts,
  metricTotals,
  truncationCount = 10,
  onShowMore,
}: CustomMetricsProps) => {
  const { data: cloudConfig } = useCloudConfig();
  const { filters, addFilter, config } = useTableStore();

  if (!lookup || !Object.keys(lookup).length) {
    return null;
  }

  const metrics = Object.entries(lookup);
  const displayMetrics = metrics.slice(0, truncationCount);

  /**
   * Applies a given metric as a filter.
   *
   * TODO:
   * The current filtering mechanism leaves at least the following edge cases unaddressed:
   * - Custom Policies w/ Strategies
   * Moreover, the row-level filter pills are not great (e.g. filtering on a Plugin will only display that Plugin's Metric).
   *
   * Ideally, metrics are applied as >=1 more filters i.e.:
   * - Non-redteam: Apply a metric filter
   * - Plugin/Strategy: Apply a plugin filter and a strategy filter
   * - Policy/Strategy: Apply a policy filter and a strategy filter
   *
   * This requires mapping metrics to plugins and strategies, which is presently non-trivial.
   */
  const handleClick = useCallback(
    (value: string) => {
      const asPolicy = isPolicyMetric(value);
      const filter = asPolicy
        ? {
            type: 'policy' as const,
            operator: 'equals' as const,
            value: deserializePolicyIdFromMetric(value),
            field: undefined,
            logicOperator: 'or' as const,
          }
        : {
            type: 'metric' as const,
            operator: 'is_defined' as const,
            value: '',
            field: value,
            logicOperator: 'or' as const,
          };

      // If this filter is already applied, do not re-apply it.
      if (
        Object.values(filters.values).find(
          (f) =>
            f.type === filter.type &&
            f.value === filter.value &&
            f.operator === filter.operator &&
            f.logicOperator === filter.logicOperator &&
            f.field === filter.field,
        )
      ) {
        return;
      }

      addFilter(filter);
    },
    [addFilter, filters.values],
  );

  const policiesById = useCustomPoliciesMap(config?.redteam?.plugins ?? []);

  return (
    <Box className="custom-metric-container" data-testid="custom-metrics" my={1}>
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
                <>
                  <Typography sx={{ fontSize: 14, lineHeight: 1.5, fontWeight: 600, mb: 1 }}>
                    {policy.name}
                  </Typography>
                  <Typography sx={{ fontSize: 14, lineHeight: 1.5, fontWeight: 400 }}>
                    {policy.text}
                  </Typography>
                  {determinePolicyTypeFromId(policy.id) === 'reusable' && cloudConfig?.appUrl && (
                    <Typography sx={{ fontSize: 14, lineHeight: 1.5, fontWeight: 400, mt: 1 }}>
                      <Link
                        href={makeCustomPolicyCloudUrl(cloudConfig?.appUrl, policy.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                      >
                        <span>View policy in Promptfoo Cloud</span>
                        <OpenInNewIcon fontSize="small" sx={{ fontSize: 14 }} />
                      </Link>
                    </Typography>
                  )}
                </>
              );
            }
          }

          return metric && typeof score !== 'undefined' ? (
            <div
              data-testid={`metric-${metric}`}
              className="metric-chip filterable"
              key={`${metric}-${score}`}
            >
              <MetricTooltip title={tooltipContent}>
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
              </MetricTooltip>
            </div>
          ) : null;
        })}
      {metrics.length > truncationCount && (
        <div
          className="show-more-toggle clickable"
          data-testid="toggle-show-more"
          onClick={onShowMore}
        >
          Show more...
        </div>
      )}
    </Box>
  );
};

export default CustomMetrics;
