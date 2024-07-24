import * as React from 'react';
import './CustomMetrics.css';

const NUM_METRICS_TO_DISPLAY_ABOVE_FOLD = 10;

interface CustomMetricsProps {
  lookup: Record<string, number>;
  metricTotals?: Record<string, number>;
  onSearchTextChange?: (searchText: string) => void;
}

const CustomMetrics: React.FC<CustomMetricsProps> = ({
  lookup,
  metricTotals,
  onSearchTextChange,
}) => {
  if (!lookup || !Object.keys(lookup).length) {
    return null;
  }

  const [showAll, setShowAll] = React.useState(false);
  const metrics = Object.entries(lookup);
  const displayMetrics = showAll ? metrics : metrics.slice(0, NUM_METRICS_TO_DISPLAY_ABOVE_FOLD);

  return (
    <div className="custom-metric-container">
      {displayMetrics.map(([metric, score]) =>
        metric && typeof score !== 'undefined' ? (
          <span
            key={metric}
            onClick={() => onSearchTextChange && onSearchTextChange(`metric=${metric}:`)}
            className={onSearchTextChange ? 'clickable' : ''}
          >
            {metric}:{' '}
            {metricTotals && metricTotals[metric] ? (
              <>
                {((score / metricTotals[metric]) * 100).toFixed(2)}% ({score}/{metricTotals[metric]}
                )
              </>
            ) : (
              score
            )}
          </span>
        ) : null,
      )}
      {metrics.length > 10 && (
        <span className="clickable" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show less' : 'Show more...'}
        </span>
      )}
    </div>
  );
};

export default CustomMetrics;
