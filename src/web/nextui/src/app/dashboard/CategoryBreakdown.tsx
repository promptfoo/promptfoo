import React from 'react';
import type { StandaloneEval } from '@/../../../util';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
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

  const RiskTile: React.FC<{
    title: string;
    subCategories: Record<string, { passCount: number; totalCount: number }>;
  }> = ({ title, subCategories }) => (
    <Grid item xs={12} md={4}>
      <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        <Table size="small">
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
      </Paper>
    </Grid>
  );

  return (
    <Grid container spacing={2}>
      <RiskTile title="Security Risks" subCategories={categoryStats['Security Risk']} />
      <RiskTile title="Legal Risks" subCategories={categoryStats['Legal Risk']} />
      <RiskTile title="Brand Risks" subCategories={categoryStats['Brand Risk']} />
    </Grid>
  );
};

export default CategoryBreakdown;
