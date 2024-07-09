import React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import {
  categoryAliases,
  displayNameOverrides,
  riskCategories,
  riskCategorySeverityMap,
  subCategoryDescriptions,
} from './constants';
import './TestSuites.css';

const getSubCategoryStats = (
  categoryStats: Record<string, { pass: number; total: number; passWithFilter: number }>,
) => {
  const subCategoryStats = [];
  for (const [category, subCategories] of Object.entries(riskCategories)) {
    for (const subCategory of subCategories) {
      subCategoryStats.push({
        pluginName: subCategory,
        type: categoryAliases[subCategory as keyof typeof categoryAliases] || subCategory,
        description: subCategoryDescriptions[subCategory] || '',
        passRate: categoryStats[subCategory]
          ? ((categoryStats[subCategory].pass / categoryStats[subCategory].total) * 100).toFixed(
              1,
            ) + '%'
          : 'N/A',
        passRateWithFilter: categoryStats[subCategory]
          ? (
              (categoryStats[subCategory].passWithFilter / categoryStats[subCategory].total) *
              100
            ).toFixed(1) + '%'
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

const TestSuites: React.FC<{
  evalId: string;
  categoryStats: Record<string, { pass: number; total: number; passWithFilter: number }>;
}> = ({ evalId, categoryStats }) => {
  const router = useRouter();
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
      <Typography variant="h6" gutterBottom id="table">
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
                    <TableCell>
                      <span style={{ fontWeight: 500 }}>
                        {displayNameOverrides[
                          subCategory.pluginName as keyof typeof displayNameOverrides
                        ] || subCategory.type}
                      </span>
                    </TableCell>
                    <TableCell>{subCategory.description}</TableCell>
                    <TableCell className={passRateClass}>
                      <strong>{subCategory.passRate}</strong>
                      {subCategory.passRateWithFilter !== subCategory.passRate ? (
                        <>
                          <br />({subCategory.passRateWithFilter} with mitigation)
                        </>
                      ) : null}
                    </TableCell>
                    <TableCell className={`vuln-${subCategory.severity.toLowerCase()}`}>
                      {subCategory.severity}
                    </TableCell>
                    <TableCell style={{ minWidth: 270 }}>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => {
                          const searchParams = new URLSearchParams(window.location.search);
                          const evalId = searchParams.get('evalId');
                          window.location.href = `/eval/?evalId=${evalId}&search=${encodeURIComponent(`(var=${subCategory.type}|metric=${subCategory.type})`)}`;
                        }}
                      >
                        View logs
                      </Button>
                      <Tooltip title="Temporarily disabled while in beta, click to contact us to enable">
                        <Button
                          variant="contained"
                          size="small"
                          color="inherit"
                          style={{ marginLeft: 8 }}
                          onClick={() => {
                            window.location.href =
                              'mailto:inquiries@promptfoo.dev?subject=Promptfoo%20automatic%20vulnerability%20mitigation&body=Hello%20Promptfoo%20Team,%0D%0A%0D%0AI%20am%20interested%20in%20learning%20more%20about%20the%20automatic%20vulnerability%20mitigation%20beta.%20Please%20provide%20me%20with%20more%20details.%0D%0A%0D%0A';
                          }}
                        >
                          Apply mitigation
                        </Button>
                      </Tooltip>
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
