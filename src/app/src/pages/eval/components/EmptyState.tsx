import React from 'react';

export const EmptyState: React.FC = () => {
  return (
    <div className="empty-state">
      <div className="empty-state-content">
        <div className="empty-state-icon">📊</div>
        <h2 className="empty-state-title">Welcome to Promptfoo</h2>
        <p className="empty-state-message">
          Run your first evaluation and results will appear here!
        </p>
      </div>
    </div>
  );
};

export default EmptyState;
