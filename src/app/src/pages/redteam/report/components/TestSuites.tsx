import React from 'react';
import { useNavigate } from 'react-router-dom';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
import {
  categoryAliases,
  displayNameOverrides,
  riskCategories,
  Severity,
  subCategoryDescriptions,
  type Plugin,
} from '@promptfoo/redteam/constants';
import { getRiskCategorySeverityMap } from '@promptfoo/redteam/sharedFrontend';
import type { RedteamPluginObject } from '@promptfoo/redteam/types';
import './TestSuites.css';

interface TestSuitesProps {
  evalId: string;
  categoryStats: Record<string, { pass: number; total: number; passWithFilter: number }>;
  plugins: RedteamPluginObject[];
}

const getSubCategoryStats = (
  categoryStats: Record<string, { pass: number; total: number; passWithFilter: number }>,
  plugins: RedteamPluginObject[],
) => {
  const subCategoryStats = [];
  for (const subCategories of Object.values(riskCategories)) {
    for (const subCategory of subCategories) {
      subCategoryStats.push({
        pluginName: subCategory,
        type: categoryAliases[subCategory as keyof typeof categoryAliases] || subCategory,
        description:
          subCategoryDescriptions[subCategory as keyof typeof subCategoryDescriptions] || '',
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
        severity: getRiskCategorySeverityMap(plugins)[subCategory as Plugin] || 'Unknown',
        attackSuccessRate: categoryStats[subCategory]
          ? (
              ((categoryStats[subCategory].total - categoryStats[subCategory].pass) /
                categoryStats[subCategory].total) *
              100
            ).toFixed(1) + '%'
          : 'N/A',
      });
    }
  }
  return subCategoryStats.sort((a, b) => {
    if (a.passRate === 'N/A') {
      return 1;
    }
    if (b.passRate === 'N/A') {
      return -1;
    }
    return Number.parseFloat(a.passRate) - Number.parseFloat(b.passRate);
  });
};

const TestSuites: React.FC<TestSuitesProps> = ({ evalId, categoryStats, plugins }) => {
  const navigate = useNavigate();
  const subCategoryStats = getSubCategoryStats(categoryStats, plugins).filter(
    (subCategory) => subCategory.passRate !== 'N/A',
  );
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(Number.parseInt(event.target.value, 10));
    setPage(0);
  };

  const [order, setOrder] = React.useState<'asc' | 'desc'>('desc');
  const [orderBy, setOrderBy] = React.useState<'attackSuccessRate' | 'severity' | 'default'>(
    'attackSuccessRate',
  );
  const handleSort = (property: 'attackSuccessRate' | 'severity') => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const exportToCSV = () => {
    // Format data for CSV
    const headers = ['Type', 'Description', 'Attack Success Rate', 'Severity'];

    // Get the sorted data as displayed in the table
    const sortedData = [...subCategoryStats].sort((a, b) => {
      if (orderBy === 'attackSuccessRate') {
        if (a.passRate === 'N/A') {
          return 1;
        }
        if (b.passRate === 'N/A') {
          return -1;
        }
        return order === 'asc'
          ? Number.parseFloat(a.attackSuccessRate) - Number.parseFloat(b.attackSuccessRate)
          : Number.parseFloat(b.attackSuccessRate) - Number.parseFloat(a.attackSuccessRate);
      } else if (orderBy === 'severity') {
        if (a.passRate === 'N/A') {
          return 1;
        }
        if (b.passRate === 'N/A') {
          return -1;
        }
        const severityOrder = {
          [Severity.Critical]: 4,
          [Severity.High]: 3,
          [Severity.Medium]: 2,
          [Severity.Low]: 1,
        };
        return order === 'asc'
          ? severityOrder[a.severity] - severityOrder[b.severity]
          : severityOrder[b.severity] - severityOrder[a.severity];
      } else {
        // Default sort: severity desc tiebroken by pass rate asc, N/A passRate goes to the bottom
        const severityOrder = {
          [Severity.Critical]: 4,
          [Severity.High]: 3,
          [Severity.Medium]: 2,
          [Severity.Low]: 1,
        };
        if (a.severity === b.severity) {
          return Number.parseFloat(b.passRate) - Number.parseFloat(a.passRate);
        } else {
          return severityOrder[b.severity] - severityOrder[a.severity];
        }
      }
    });

    const csvData = sortedData.map((subCategory) => [
      displayNameOverrides[subCategory.pluginName as keyof typeof displayNameOverrides] ||
        subCategory.type,
      subCategory.description,
      subCategory.attackSuccessRate,
      subCategory.severity,
    ]);

    // Combine headers and data with proper escaping for CSV
    const escapeCSV = (cell: string) => {
      // If cell contains commas, quotes, or newlines, wrap in quotes and escape any quotes
      if (/[",\n]/.test(cell)) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    };

    const csvContent = [
      headers.map(escapeCSV).join(','),
      ...csvData.map((row) => row.map((cell) => escapeCSV(String(cell))).join(',')),
    ].join('\n');

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.setAttribute('download', `vulnerability-report-${evalId || 'export'}-${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Box sx={{ pageBreakBefore: 'always', breakBefore: 'always' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" id="table">
          Vulnerabilities and Mitigations
        </Typography>

        <Button
          variant="contained"
          color="primary"
          startIcon={<FileDownloadIcon />}
          onClick={exportToCSV}
          className="print-hide"
        >
          Export vulnerabilities to CSV
        </Button>
      </Box>

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell>Description</TableCell>
              <TableCell style={{ minWidth: '200px' }}>
                <TableSortLabel
                  active={orderBy === 'attackSuccessRate'}
                  direction={orderBy === 'attackSuccessRate' ? order : 'asc'}
                  onClick={() => handleSort('attackSuccessRate')}
                >
                  Attack Success Rate
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
              <TableCell style={{ minWidth: '275px' }} className="print-hide">
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {subCategoryStats
              .sort((a, b) => {
                if (orderBy === 'attackSuccessRate') {
                  if (a.attackSuccessRate === 'N/A') {
                    return 1;
                  }
                  if (b.attackSuccessRate === 'N/A') {
                    return -1;
                  }
                  return order === 'asc'
                    ? Number.parseFloat(a.attackSuccessRate) -
                        Number.parseFloat(b.attackSuccessRate)
                    : Number.parseFloat(b.attackSuccessRate) -
                        Number.parseFloat(a.attackSuccessRate);
                } else if (orderBy === 'severity') {
                  if (a.attackSuccessRate === 'N/A') {
                    return 1;
                  }
                  if (b.attackSuccessRate === 'N/A') {
                    return -1;
                  }
                  const severityOrder = {
                    [Severity.Critical]: 4,
                    [Severity.High]: 3,
                    [Severity.Medium]: 2,
                    [Severity.Low]: 1,
                  };
                  return order === 'asc'
                    ? severityOrder[a.severity] - severityOrder[b.severity]
                    : severityOrder[b.severity] - severityOrder[a.severity];
                } else {
                  // Default sort: severity desc tiebroken by pass rate asc, N/A passRate goes to the bottom
                  const severityOrder = {
                    [Severity.Critical]: 4,
                    [Severity.High]: 3,
                    [Severity.Medium]: 2,
                    [Severity.Low]: 1,
                  };
                  if (a.severity === b.severity) {
                    return (
                      Number.parseFloat(b.attackSuccessRate) -
                      Number.parseFloat(a.attackSuccessRate)
                    );
                  } else {
                    return severityOrder[b.severity] - severityOrder[a.severity];
                  }
                }
              })
              .map((subCategory, index) => {
                // Calculate if this row should be visible in normal view
                const isInCurrentPage =
                  index >= page * rowsPerPage && index < page * rowsPerPage + rowsPerPage;
                const rowStyle = isInCurrentPage ? {} : { display: 'none' };
                let passRateClass = '';
                if (subCategory.attackSuccessRate !== 'N/A') {
                  const passRate = Number.parseFloat(subCategory.attackSuccessRate);
                  if (passRate >= 75) {
                    passRateClass = 'asr-high';
                  } else if (passRate >= 50) {
                    passRateClass = 'asr-medium';
                  } else {
                    passRateClass = 'asr-low';
                  }
                }
                return (
                  <TableRow key={index} style={rowStyle}>
                    <TableCell>
                      <span style={{ fontWeight: 500 }}>
                        {displayNameOverrides[
                          subCategory.pluginName as keyof typeof displayNameOverrides
                        ] || subCategory.type}
                      </span>
                    </TableCell>
                    <TableCell>{subCategory.description}</TableCell>
                    <TableCell className={passRateClass}>
                      <strong>{subCategory.attackSuccessRate}</strong>
                      {subCategory.passRateWithFilter === subCategory.passRate ? null : (
                        <>
                          <br />({subCategory.passRateWithFilter} with mitigation)
                        </>
                      )}
                    </TableCell>
                    <TableCell className={`vuln-${subCategory.severity.toLowerCase()}`}>
                      {subCategory.severity}
                    </TableCell>
                    <TableCell style={{ minWidth: 270 }} className="print-hide">
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => {
                          const searchParams = new URLSearchParams(window.location.search);
                          const evalId = searchParams.get('evalId');
                          const pluginId = subCategory.pluginName;
                          const searchQuery = pluginId
                            ? `metadata=pluginId:${pluginId}`
                            : `metric=${subCategory.type}`;
                          navigate(
                            `/eval/?evalId=${evalId}&search=${encodeURIComponent(searchQuery)}`,
                          );
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
