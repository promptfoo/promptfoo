import * as React from 'react';

import './CustomMetrics.css';

interface CustomMetricsProps {
  lookup: Record<string, number>;
  onSearchTextChange?: (searchText: string) => void;
}

const CustomMetrics: React.FC<CustomMetricsProps> = ({ lookup, onSearchTextChange }) => {
  if (!lookup || !Object.keys(lookup).length) {
    return null;
  }
  return (
    <div className="custom-metric-container">
      {Object.entries(lookup).map(([metric, score]) =>
        metric && typeof score !== 'undefined' ? (
          <span
            key={metric}
            onClick={() => onSearchTextChange && onSearchTextChange(metric)}
            className={onSearchTextChange ? 'clickable' : ''}
          >
            {metric}: {score.toFixed(2)}
          </span>
        ) : null,
      )}
    </div>
  );
};

export default CustomMetrics;
