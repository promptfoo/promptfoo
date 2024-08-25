import React from 'react';
import type { StandaloneEval } from '@/../../../util';
import {
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
} from '@mui/material';
import {
  categoryAliases,
  riskCategories,
  displayNameOverrides,
  subCategoryDescriptions,
} from '../report/constants';

const CategoryBreakdown: React.FC<{ evals: StandaloneEval[] }> = ({ evals }) => {
  const categoryStats = Object.entries(riskCategories).reduce(
    (acc, [category, subCategories]) => {
      const stats = subCategories.reduce(
        (subAcc, subCategory) => {
          const scoreName = categoryAliases[subCategory as keyof typeof categoryAliases];
          const relevantEvals = evals.filter(
            (eval_) => eval_.metrics?.namedScores && scoreName in eval_.metrics.namedScores,
          );
          const passCount = relevantEvals.reduce(
            (sum, eval_) => sum + ((eval_.metrics?.namedScores[scoreName] || 0) > 0 ? 1 : 0),
            0,
          );
          const totalCount = relevantEvals.length;
          subAcc[subCategory] = { passCount, totalCount };
          return subAcc;
        },
        {} as Record<string, { passCount: number; totalCount: number }>,
      );

      acc[category] = stats;
      return acc;
    },
    {} as Record<string, Record<string, { passCount: number; totalCount: number }>>,
  );

  return (
    <>
      <Typography variant="h6" gutterBottom>
        Category Breakdown
      </Typography>
      {Object.entries(categoryStats).map(([category, subCategories]) => (
        <React.Fragment key={category}>
          <Typography variant="subtitle1" gutterBottom>
            {category}
          </Typography>
          <Table size="small" style={{ marginBottom: '20px' }}>
            <TableHead>
              <TableRow>
                <TableCell>Subcategory</TableCell>
                <TableCell align="right">Pass Rate</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(subCategories).map(([subCategory, stats]) => {
                const passRate =
                  stats.totalCount > 0 ? (stats.passCount / stats.totalCount) * 100 : 0;
                const displayName =
                  displayNameOverrides[subCategory as keyof typeof displayNameOverrides] ||
                  categoryAliases[subCategory as keyof typeof categoryAliases];
                return (
                  <Tooltip
                    key={subCategory}
                    title={
                      subCategoryDescriptions[subCategory as keyof typeof subCategoryDescriptions]
                    }
                    placement="left"
                    arrow
                  >
                    <TableRow>
                      <TableCell>{displayName}</TableCell>
                      <TableCell align="right">{passRate.toFixed(1)}%</TableCell>
                    </TableRow>
                  </Tooltip>
                );
              })}
            </TableBody>
          </Table>
        </React.Fragment>
      ))}
    </>
  );
};

export default CategoryBreakdown;
