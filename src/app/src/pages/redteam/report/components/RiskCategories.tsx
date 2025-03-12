import React from 'react';
import Stack from '@mui/material/Stack';
import type { TopLevelCategory } from '@promptfoo/redteam/constants';
import { categoryDescriptions, riskCategories } from '@promptfoo/redteam/constants';
import type { GradingResult } from '@promptfoo/types';
import RiskCard from './RiskCard';

const RiskCategories: React.FC<{
  categoryStats: Record<string, { pass: number; total: number }>;
  evalId: string;
  failuresByPlugin: Record<
    string,
    { prompt: string; output: string; gradingResult?: GradingResult }[]
  >;
  passesByPlugin: Record<
    string,
    { prompt: string; output: string; gradingResult?: GradingResult }[]
  >;
  strategyStats: Record<string, { pass: number; total: number }>;
}> = ({ categoryStats, evalId, failuresByPlugin, passesByPlugin, strategyStats }) => {
  const categories = Object.keys(riskCategories).map((category) => ({
    name: category,
    passed: riskCategories[category as TopLevelCategory].every(
      (subCategory) => categoryStats[subCategory]?.pass === categoryStats[subCategory]?.total,
    ),
  }));

  return (
    <Stack spacing={4}>
      {categories.map((category, index) => {
        const categoryName = category.name as TopLevelCategory;
        const subCategories = riskCategories[categoryName];

        const totalPasses = subCategories.reduce(
          (acc, subCategory) => acc + (categoryStats[subCategory]?.pass || 0),
          0,
        );
        const totalTests = subCategories.reduce(
          (acc, subCategory) => acc + (categoryStats[subCategory]?.total || 0),
          0,
        );

        return (
          <RiskCard
            key={index}
            title={category.name}
            subtitle={categoryDescriptions[categoryName as keyof typeof categoryDescriptions]}
            progressValue={(totalPasses / totalTests) * 100}
            numTestsPassed={totalPasses}
            numTestsFailed={totalTests - totalPasses}
            testTypes={subCategories.map((subCategory) => ({
              name: subCategory,
              categoryPassed:
                categoryStats[subCategory]?.pass === categoryStats[subCategory]?.total,
              numPassed: categoryStats[subCategory]?.pass || 0,
              numFailed:
                (categoryStats[subCategory]?.total || 0) - (categoryStats[subCategory]?.pass || 0),
            }))}
            evalId={evalId}
            failuresByPlugin={failuresByPlugin}
            passesByPlugin={passesByPlugin}
            strategyStats={strategyStats}
          />
        );
      })}
    </Stack>
  );
};

export default RiskCategories;
