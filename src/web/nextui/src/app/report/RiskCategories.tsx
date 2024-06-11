import React from 'react';
import { Stack } from '@mui/material';

import RiskCard from './RiskCard';
import { TopLevelCategory, categoryDescriptions, riskCategories } from './constants';

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
            }))}
          />
        );
      })}
    </Stack>
  );
};

export default RiskCategories;
