import * as React from 'react';
import './CustomMetrics.css';

const NUM_METRICS_TO_DISPLAY_ABOVE_FOLD = 10;

interface CustomMetricsProps {
  lookup: Record<string, number>;
  counts?: Record<string, number>;
  metricTotals?: Record<string, number>;
  onSearchTextChange?: (searchText: string) => void;
}

const CustomMetrics: React.FC<CustomMetricsProps> = ({
  lookup,
  counts,
  metricTotals,
  onSearchTextChange,
}) => {
  const [showAll, setShowAll] = React.useState(false);
  if (!lookup || !Object.keys(lookup).length) {
    return null;
  }

  const metrics = Object.entries(lookup);
  const displayMetrics = showAll ? metrics : metrics.slice(0, NUM_METRICS_TO_DISPLAY_ABOVE_FOLD);

  return (
    <div className="custom-metric-container" data-testid="custom-metrics">
      {displayMetrics.map(([metric, score]) =>
        metric && typeof score !== 'undefined' ? (
          <span
            key={metric}
            data-testid={`metric-${metric}`}
            onClick={() => onSearchTextChange && onSearchTextChange(`metric=${metric}:`)}
            className={onSearchTextChange ? 'clickable' : ''}
          >
            <span data-testid={`metric-name-${metric}`}>{metric}</span>:{' '}
            {metricTotals && metricTotals[metric] ? (
              metricTotals[metric] === 0 ? (
                <span data-testid={`metric-value-${metric}`}>0%</span>
              ) : (
                <span data-testid={`metric-value-${metric}`}>
                  {((score / metricTotals[metric]) * 100).toFixed(2)}% ({score?.toFixed(2) ?? '0'}/
                  {metricTotals[metric]?.toFixed(2) ?? '0'})
                </span>
              )
            ) : counts && counts[metric] ? (
              counts[metric] === 0 ? (
                <span data-testid={`metric-value-${metric}`}>0</span>
              ) : (
                <span data-testid={`metric-value-${metric}`}>
                  {(score / counts[metric]).toFixed(2)} ({score?.toFixed(2) ?? '0'}/
                  {counts[metric]?.toFixed(2) ?? '0'})
                </span>
              )
            ) : (
              <span data-testid={`metric-value-${metric}`}>{score?.toFixed(2) ?? '0'}</span>
            )}
          </span>
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
