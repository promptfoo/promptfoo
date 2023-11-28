import * as React from 'react';

import './CustomMetrics.css';

interface CustomMetricsProps {
  lookup: Record<string, number>;
}

const CustomMetrics: React.FC<CustomMetricsProps> = ({ lookup }) => {
  return (
    <div className="custom-metric-container">
      {Object.entries(lookup).map(([metric, score]) => (
        <div key={metric}>
          {metric}: {score.toFixed(2)}
        </div>
      ))}
    </div>
  );
};

export default CustomMetrics;
