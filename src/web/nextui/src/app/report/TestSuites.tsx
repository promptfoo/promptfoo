import React from 'react';
import {
  Box,
  Button,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Paper,
} from '@mui/material';

import {
  riskCategories,
  subCategoryDescriptions,
  categoryAliases,
  riskCategorySeverityMap,
} from './constants';
import './TestSuites.css';

const getSubCategoryStats = (categoryStats: Record<string, { pass: number; total: number }>) => {
  const subCategoryStats = [];
  for (const [category, subCategories] of Object.entries(riskCategories)) {
    for (const subCategory of subCategories) {
      subCategoryStats.push({
        type: categoryAliases[subCategory as keyof typeof categoryAliases] || subCategory,
        description:
          subCategoryDescriptions[subCategory as keyof typeof subCategoryDescriptions] || '',
        passRate: categoryStats[subCategory]
          ? ((categoryStats[subCategory].pass / categoryStats[subCategory].total) * 100).toFixed(
              1,
            ) + '%'
          : 'N/A',
        severity:
          riskCategorySeverityMap[subCategory as keyof typeof riskCategorySeverityMap] || 'Unknown',
      });
    }
  }
  return (
    subCategoryStats
      //.filter((subCategory) => subCategory.passRate !== 'N/A')
      .sort((a, b) => {
        if (a.passRate === 'N/A') return 1;
        if (b.passRate === 'N/A') return -1;
        return parseFloat(a.passRate) - parseFloat(b.passRate);
      })
  );
};

const TestSuites: React.FC<{ categoryStats: Record<string, { pass: number; total: number }> }> = ({
  categoryStats,
}) => {
  const subCategoryStats = getSubCategoryStats(categoryStats).filter(
    (subCategory) => subCategory.passRate !== 'N/A',
  );
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const [order, setOrder] = React.useState<'asc' | 'desc'>('asc');
  const [orderBy, setOrderBy] = React.useState<'passRate' | 'severity' | 'default'>('default');
  const handleSort = (property: 'passRate' | 'severity') => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Vulnerabilities and Mitigations
      </Typography>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>
                <TableSortLabel
                  active={orderBy === 'passRate'}
                  direction={orderBy === 'passRate' ? order : 'asc'}
                  onClick={() => handleSort('passRate')}
                >
                  Pass rate
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={orderBy === 'severity'}
                  direction={orderBy === 'severity' ? order : 'asc'}
                  onClick={() => handleSort('severity')}
                >
                  Severity
                </TableSortLabel>
              </TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {subCategoryStats
              .sort((a, b) => {
                if (orderBy === 'passRate') {
                  if (a.passRate === 'N/A') return 1;
                  if (b.passRate === 'N/A') return -1;
                  return order === 'asc'
                    ? parseFloat(a.passRate) - parseFloat(b.passRate)
                    : parseFloat(b.passRate) - parseFloat(a.passRate);
                } else if (orderBy === 'severity') {
                  if (a.passRate === 'N/A') return 1;
                  if (b.passRate === 'N/A') return -1;
                  const severityOrder = {
                    Critical: 4,
                    High: 3,
                    Medium: 2,
                    Low: 1,
                  };
                  return order === 'asc'
                    ? severityOrder[a.severity] - severityOrder[b.severity]
                    : severityOrder[b.severity] - severityOrder[a.severity];
                } else {
                  // Default sort: severity desc tiebroken by pass rate asc, N/A passRate goes to the bottom
                  const severityOrder = {
                    Critical: 4,
                    High: 3,
                    Medium: 2,
                    Low: 1,
                  };
                  if (a.severity === b.severity) {
                    return parseFloat(a.passRate) - parseFloat(b.passRate);
                  } else {
                    return severityOrder[b.severity] - severityOrder[a.severity];
                  }
                }
              })
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((subCategory, index) => {
                let passRateClass = '';
                if (subCategory.passRate !== 'N/A') {
                  const passRate = parseFloat(subCategory.passRate);
                  if (passRate >= 75) {
                    passRateClass = 'pass-high';
                  } else if (passRate >= 50) {
                    passRateClass = 'pass-medium';
                  } else {
                    passRateClass = 'pass-low';
                  }
                }
                return (
                  <TableRow key={index}>
                    <TableCell>{subCategory.type}</TableCell>
                    <TableCell>{subCategory.description}</TableCell>
                    <TableCell className={passRateClass}>{subCategory.passRate}</TableCell>
                    <TableCell className={`vuln-${subCategory.severity.toLowerCase()}`}>
                      {subCategory.severity}
                    </TableCell>
                    <TableCell>
                      <Button variant="contained" size="small">
                        View logs
                      </Button>
                      <Button variant="contained" size="small" style={{ marginLeft: 8 }}>
                        Apply mitigation
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
        {subCategoryStats.length > rowsPerPage && (
          <TablePagination
            rowsPerPageOptions={[10, 25, 50]}
            component="div"
            count={subCategoryStats.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        )}
      </TableContainer>
    </Box>
  );
};

export default TestSuites;
