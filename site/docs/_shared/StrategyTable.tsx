import React from 'react';
import { strategies } from './data/strategies';

type GroupedStrategies = Record<string, typeof strategies>;

const categoryOrder: (typeof strategies)[number]['category'][] = [
  'Static (Single-Turn)',
  'Dynamic (Single-Turn)',
  'Multi-turn',
  'Regression',
  'Custom',
];

const groupedStrategies = strategies.reduce((acc, strategy) => {
  if (!acc[strategy.category]) {
    acc[strategy.category] = [];
  }
  acc[strategy.category].push(strategy);
  return acc;
}, {} as GroupedStrategies);

Object.values(groupedStrategies).forEach((categoryStrategies) => {
  categoryStrategies.sort((a, b) => a.displayName.localeCompare(b.displayName));
});

const RecommendedBadge = () => (
  <span
    style={{
      backgroundColor: 'var(--ifm-color-primary)',
      color: 'white',
      padding: '2px 6px',
      borderRadius: '4px',
      fontSize: '0.75em',
      marginLeft: '8px',
      verticalAlign: 'middle',
    }}
  >
    Recommended
  </span>
);

const StrategyTable = ({
  shouldRenderCategory = true,
  shouldRenderStrategy = true,
  shouldRenderDescription = true,
  shouldRenderLongDescription = true,
  shouldRenderCost = true,
  shouldRenderAsrIncrease = true,
}) => {
  return (
    <div className="strategy-table-wrapper">
      <table className="strategy-table">
        <thead>
          <tr>
            {shouldRenderCategory && (
              <th style={{ verticalAlign: 'top', textAlign: 'left' }}>Category</th>
            )}
            {shouldRenderStrategy && <th>Strategy</th>}
            {shouldRenderDescription && <th>Description</th>}
            {shouldRenderLongDescription && <th>Details</th>}
            {shouldRenderCost && <th>Cost</th>}
            {shouldRenderAsrIncrease && (
              <th>
                ASR Increase
                <sup
                  style={{ cursor: 'help' }}
                  title="Relative increase in Attack Success Rate compared to running the same test without any strategy"
                >
                  *
                </sup>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {categoryOrder.map((category) => {
            const categoryStrategies = groupedStrategies[category] || [];
            return (
              <React.Fragment key={category}>
                {categoryStrategies.map((strategy, index) => (
                  <tr key={strategy.strategy} className={index % 2 === 0 ? 'even' : 'odd'}>
                    {index === 0 && shouldRenderCategory && (
                      <td
                        rowSpan={categoryStrategies.length}
                        style={{ verticalAlign: 'top' }}
                        className="category-cell"
                      >
                        {category}
                      </td>
                    )}
                    {shouldRenderStrategy && (
                      <td className="strategy-cell">
                        {strategy.link ? (
                          <a href={strategy.link} className="strategy-link">
                            {strategy.displayName}
                            {strategy.recommended && <RecommendedBadge />}
                          </a>
                        ) : (
                          <>
                            {strategy.displayName}
                            {strategy.recommended && <RecommendedBadge />}
                          </>
                        )}
                      </td>
                    )}
                    {shouldRenderDescription && <td>{strategy.description}</td>}
                    {shouldRenderLongDescription && (
                      <td className="details-cell">{strategy.longDescription}</td>
                    )}
                    {shouldRenderCost && <td className="metric-cell">{strategy.cost}</td>}
                    {shouldRenderAsrIncrease && (
                      <td className="metric-cell">{strategy.asrIncrease}</td>
                    )}
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      {shouldRenderAsrIncrease && (
        <div style={{ fontSize: '0.8em', marginTop: '8px', color: 'var(--ifm-color-gray-600)' }}>
          * ASR Increase: Relative increase in Attack Success Rate compared to running the same test
          without any strategy
        </div>
      )}
    </div>
  );
};

export default StrategyTable;
