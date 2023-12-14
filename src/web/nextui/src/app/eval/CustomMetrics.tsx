import * as React from 'react';

import './CustomMetrics.css';

interface CustomMetricsProps {
  lookup: Record<string, number>;
}

const CustomMetrics: React.FC<CustomMetricsProps> = ({ lookup }) => {
  if (!lookup || !Object.keys(lookup).length) {
    return null;
  }
  return (
    <div className="custom-metric-container">
      {Object.entries(lookup).map(([metric, score]) => (
        <span key={metric}>
          {metric}: {score.toFixed(2)}
        </span>
      ))}
    </div>
  );
};

export default CustomMetrics;
