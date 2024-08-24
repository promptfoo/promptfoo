import React from 'react';
import Stack from '@mui/material/Stack';
import RiskCard from './RiskCard';
import type { TopLevelCategory } from './constants';
import { categoryDescriptions, riskCategories } from './constants';
import './RiskCategories.css';

const RiskCategories: React.FC<{
  categoryStats: Record<string, { pass: number; total: number }>;
}> = ({ categoryStats }) => {
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
              passed: categoryStats[subCategory]?.pass === categoryStats[subCategory]?.total,
              // If there are no tests, default to 100% pass rate
              percentage:
                (categoryStats[subCategory]?.pass || 1) / (categoryStats[subCategory]?.total || 1),
              total: categoryStats[subCategory]?.total || 0,
            }))}
          />
        );
      })}
    </Stack>
  );
};

export default RiskCategories;
