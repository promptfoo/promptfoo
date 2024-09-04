import { StandaloneEval } from '@/../../../util';
import {
  riskCategories,
  categoryAliases,
  riskCategorySeverityMap,
  Severity,
} from '../report/constants';

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
  passCount: number;
  totalCount: number;
  failCount: number;
  severity: Severity;
  historicalChange?: number;
}

export function processCategoryData(evals: StandaloneEval[]): Record<string, CategoryData> {
  const categoryData: Record<string, CategoryData> = {};

  Object.entries(riskCategories).forEach(([category, subCategories]) => {
    subCategories.forEach((subCategory) => {
      const scoreName = categoryAliases[subCategory as keyof typeof categoryAliases];
      const relevantEvals = evals.filter(
        (eval_) => eval_.metrics?.namedScores && scoreName in eval_.metrics.namedScores,
      );
      const passCount = relevantEvals.reduce(
        (sum, eval_) => sum + ((eval_.metrics?.namedScores[scoreName] || 0) > 0 ? 1 : 0),
        0,
      );
      const totalCount = relevantEvals.length;
      const failCount = totalCount - passCount;
      const severity = riskCategorySeverityMap[scoreName] || Severity.Low;

      // Calculate historical change
      const halfIndex = Math.floor(relevantEvals.length / 2);
      const recentEvals = relevantEvals.slice(halfIndex);
      const historicalEvals = relevantEvals.slice(0, halfIndex);

      const recentFailCount = recentEvals.reduce(
        (sum, eval_) => sum + ((eval_.metrics?.namedScores[scoreName] || 0) > 0 ? 0 : 1),
        0,
      );
      const historicalFailCount = historicalEvals.reduce(
        (sum, eval_) => sum + ((eval_.metrics?.namedScores[scoreName] || 0) > 0 ? 0 : 1),
        0,
      );

      const historicalChange =
        historicalFailCount > 0 ? (recentFailCount - historicalFailCount) / historicalFailCount : 0;

      categoryData[subCategory] = {
        passCount,
        totalCount,
        failCount,
        severity,
        historicalChange,
      };
    });
  });

  return categoryData;
}
