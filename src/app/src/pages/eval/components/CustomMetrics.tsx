import React from 'react';
import Tooltip from '@mui/material/Tooltip';
import './CustomMetrics.css';

const NUM_METRICS_TO_DISPLAY_ABOVE_FOLD = 10;

interface CustomMetricsProps {
  lookup: Record<string, number>;
  counts?: Record<string, number>;
  metricTotals?: Record<string, number>;
  onSearchTextChange?: (searchText: string) => void;
  onMetricFilter?: (metric: string | null) => void;
}

interface MetricValueProps {
  metric: string;
  score: number;
  counts?: Record<string, number>;
  metricTotals?: Record<string, number>;
}

const MetricValue: React.FC<MetricValueProps> = ({ metric, score, counts, metricTotals }) => {
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

const CustomMetrics: React.FC<CustomMetricsProps> = ({
  lookup,
  counts,
  metricTotals,
  onSearchTextChange,
  onMetricFilter,
}) => {
  const [showAll, setShowAll] = React.useState(false);
  if (!lookup || !Object.keys(lookup).length) {
    return null;
  }

  const metrics = Object.entries(lookup);
  const displayMetrics = showAll ? metrics : metrics.slice(0, NUM_METRICS_TO_DISPLAY_ABOVE_FOLD);

  const handleMetricClick = (metric: string) => {
    if (onMetricFilter) {
      onMetricFilter(metric);
    } else if (onSearchTextChange) {
      onSearchTextChange(`metric=${metric}:`);
    }
  };

  return (
    <div className="custom-metric-container" data-testid="custom-metrics">
      {displayMetrics
        .sort(([metricA], [metricB]) => metricA.localeCompare(metricB))
        .map(([metric, score]) =>
          metric && typeof score !== 'undefined' ? (
            <Tooltip title={`Filter results to ${metric}`} key={metric}>
              <span
                data-testid={`metric-${metric}`}
                onClick={() => handleMetricClick(metric)}
                className="clickable"
              >
                <span data-testid={`metric-name-${metric}`}>{metric}</span>:{' '}
                <MetricValue
                  metric={metric}
                  score={score}
                  counts={counts}
                  metricTotals={metricTotals}
                />
              </span>
            </Tooltip>
          ) : null,
        )}
      {metrics.length > 10 && (
        <span
          className="clickable"
          data-testid="toggle-show-more"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Show less' : 'Show more...'}
        </span>
      )}
    </div>
  );
};

export default CustomMetrics;
