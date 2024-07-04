import * as React from 'react';
import './CustomMetrics.css';

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
  return (
    <div className="custom-metric-container">
      {Object.entries(lookup).map(([metric, score]) =>
        metric && typeof score !== 'undefined' ? (
          <span
            key={metric}
            onClick={() => onSearchTextChange && onSearchTextChange(`metric=${metric}:[^0]`)}
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
    </div>
  );
};

export default CustomMetrics;
