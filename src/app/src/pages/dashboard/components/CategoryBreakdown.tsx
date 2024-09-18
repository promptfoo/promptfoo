import React from 'react';
import {
  categoryAliases,
  riskCategories,
  displayNameOverrides,
  subCategoryDescriptions,
} from '@app/pages/report/components/constants';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { StandaloneEval } from '@promptfoo/util';
import { processCategoryData } from './utils';

const CategoryBreakdown: React.FC<{ evals: StandaloneEval[] }> = ({ evals }) => {
  const categoryData = processCategoryData(evals);

  const RiskTile: React.FC<{
    title: string;
    subCategories: string[];
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
              <TableCell align="right">Fail Rate</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {subCategories.map((subCategory) => {
              const stats = categoryData[subCategory];
              const failRate =
                stats.currentTotalCount > 0
                  ? (stats.currentFailCount / stats.currentTotalCount) * 100
                  : 0;
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
                    <TableCell align="right">{failRate.toFixed(1)}%</TableCell>
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
      <RiskTile title="Security Risks" subCategories={riskCategories['Security Risk']} />
      <RiskTile title="Legal Risks" subCategories={riskCategories['Legal Risk']} />
      <RiskTile title="Brand Risks" subCategories={riskCategories['Brand Risk']} />
    </Grid>
  );
};

export default CategoryBreakdown;
