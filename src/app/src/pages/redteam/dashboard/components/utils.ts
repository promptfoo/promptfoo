import type { StandaloneEval } from '@/../../../util';
import {
  riskCategories,
  riskCategorySeverityMap,
  Severity,
} from '@app/pages/report/components/constants';

export function calculateTrend(current: number, previous: number, increaseIsBad: boolean) {
  const difference = current - previous;
  const percentChange = difference / previous;

  let direction: 'up' | 'down' | 'flat';
  if (percentChange > 0.01) {
    direction = 'up';
  } else if (percentChange < -0.01) {
    direction = 'down';
  } else {
    direction = 'flat';
  }

  let sentiment: 'good' | 'bad' | 'flat';
  if (increaseIsBad) {
    sentiment = direction === 'up' ? 'bad' : direction === 'down' ? 'good' : 'flat';
  } else {
    sentiment = direction === 'up' ? 'good' : direction === 'down' ? 'bad' : 'flat';
  }

  return {
    direction,
    value: Math.abs(percentChange),
    sentiment,
  };
}

export interface CategoryData {
  currentPassCount: number;
  currentTotalCount: number;
  currentFailCount: number;
  historicalPassCount: number;
  historicalTotalCount: number;
  historicalFailCount: number;
  severity: Severity;
  historicalChange: number;
}

export function processCategoryData(evals: StandaloneEval[]): Record<string, CategoryData> {
  const categoryData: Record<string, CategoryData> = {};

  Object.entries(riskCategories).forEach(([category, subCategories]) => {
    subCategories.forEach((subCategory) => {
      const pluginId = subCategory;
      const relevantEvals = evals.filter(
        (eval_) =>
          eval_.pluginPassCount &&
          eval_.pluginFailCount &&
          (eval_.pluginPassCount[pluginId] !== undefined ||
            eval_.pluginFailCount[pluginId] !== undefined),
      );
      // Split evals into historical and current
      const halfIndex = Math.floor(relevantEvals.length / 2);
      const currentEvals = relevantEvals.slice(halfIndex);
      const historicalEvals = relevantEvals.slice(0, halfIndex);

      // Calculate counts for current data
      const currentPassCount = currentEvals.reduce(
        (sum, eval_) => sum + (eval_.pluginPassCount?.[pluginId] || 0),
        0,
      );
      const currentFailCount = currentEvals.reduce(
        (sum, eval_) => sum + (eval_.pluginFailCount?.[pluginId] || 0),
        0,
      );
      const currentTotalCount = currentPassCount + currentFailCount;

      // Calculate counts for historical data
      const historicalPassCount = historicalEvals.reduce(
        (sum, eval_) => sum + (eval_.pluginPassCount?.[pluginId] || 0),
        0,
      );
      const historicalFailCount = historicalEvals.reduce(
        (sum, eval_) => sum + (eval_.pluginFailCount?.[pluginId] || 0),
        0,
      );
      const historicalTotalCount = historicalPassCount + historicalFailCount;

      const severity = riskCategorySeverityMap[subCategory] || Severity.Low;

      // Calculate historical change
      const historicalChange =
        historicalFailCount > 0
          ? (currentFailCount - historicalFailCount) / historicalFailCount
          : 0;

      categoryData[subCategory] = {
        currentPassCount,
        currentTotalCount,
        currentFailCount,
        historicalPassCount,
        historicalTotalCount,
        historicalFailCount,
        severity,
        historicalChange,
      };
    });
  });

  return categoryData;
}
