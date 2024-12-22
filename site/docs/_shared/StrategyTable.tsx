import React from 'react';
import { strategies } from './data/strategies';

const StrategyTable = ({
  shouldRenderCategory = true,
  shouldRenderStrategy = true,
  shouldRenderDescription = true,
  shouldRenderLongDescription = true,
  shouldRenderCost = true,
  shouldRenderAsrIncrease = true,
}) => {
  return (
    <table>
      <thead>
        <tr>
          {shouldRenderCategory && <th>Category</th>}
          {shouldRenderStrategy && <th>Strategy</th>}
          {shouldRenderDescription && <th>Description</th>}
          {shouldRenderLongDescription && <th>Detailed Description</th>}
          {shouldRenderCost && <th>Cost</th>}
          {shouldRenderAsrIncrease && <th>ASR Increase over No Strategy</th>}
        </tr>
      </thead>
      <tbody>
        {strategies.map((strategy, index) => (
          <tr key={index}>
            {shouldRenderCategory && (
              <td>
                {strategy.categoryLink ? (
                  <a href={strategy.categoryLink}>{strategy.category}</a>
                ) : (
                  strategy.category
                )}
              </td>
            )}
            {shouldRenderStrategy && (
              <td>
                <a href={strategy.link}>{strategy.strategy}</a>
              </td>
            )}
            {shouldRenderDescription && <td>{strategy.description}</td>}
            {shouldRenderLongDescription && <td>{strategy.longDescription}</td>}
            {shouldRenderCost && <td>{strategy.cost}</td>}
            {shouldRenderAsrIncrease && <td>{strategy.asrIncrease}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default StrategyTable;
