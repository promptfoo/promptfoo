import React from 'react';

import FileDownloadIcon from '@mui/icons-material/FileDownload';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
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
  type Plugin,
  riskCategories,
  Severity,
  severityRiskScores,
  subCategoryDescriptions,
} from '@promptfoo/redteam/constants';
import { getRiskCategorySeverityMap } from '@promptfoo/redteam/sharedFrontend';
import { useNavigate } from 'react-router-dom';
import { getSeverityColor } from './FrameworkComplianceUtils';
import { getPluginIdFromResult, getStrategyIdFromTest } from './shared';
import type { RedteamPluginObject } from '@promptfoo/redteam/types';
import './TestSuites.css';

import { RiskScoreService } from '@promptfoo/redteam/riskScoring';

interface TestSuitesProps {
  evalId: string;
  categoryStats: Record<string, { pass: number; total: number; passWithFilter: number }>;
  plugins: RedteamPluginObject[];
  vulnerabilitiesDataGridRef: React.RefObject<HTMLDivElement>;
  vulnerabilitiesDataGridFilterModel: any;
  setVulnerabilitiesDataGridFilterModel: (filterModel: any) => void;
  failuresByPlugin?: Record<string, any[]>;
  passesByPlugin?: Record<string, any[]>;
}

const getRiskScoreColor = (riskScore: number, theme: any): string => {
  if (riskScore >= severityRiskScores[Severity.Critical]) {
    return getSeverityColor(Severity.Critical, theme);
  } else if (riskScore >= severityRiskScores[Severity.High]) {
    return getSeverityColor(Severity.High, theme);
  } else if (riskScore >= severityRiskScores[Severity.Medium]) {
    return getSeverityColor(Severity.Medium, theme);
  } else {
    return getSeverityColor(Severity.Low, theme);
  }
};

const getSubCategoryStats = (
  categoryStats: Record<string, { pass: number; total: number; passWithFilter: number }>,
  plugins: RedteamPluginObject[],
  failuresByPlugin?: any[],
  passesByPlugin?: any[],
) => {
  const subCategoryStats = [];
  for (const subCategories of Object.values(riskCategories)) {
    for (const subCategory of subCategories) {
      const attackSuccessRate = categoryStats[subCategory]
        ? (
            ((categoryStats[subCategory].total - categoryStats[subCategory].pass) /
              categoryStats[subCategory].total) *
            100
          ).toFixed(1) + '%'
        : 'N/A';

      const severity = getRiskCategorySeverityMap(plugins)[subCategory as Plugin] || 'Unknown';

      // Calculate risk score with details
      const riskDetails = (() => {
        // If no detailed strategy data, use basic calculation
        if (!failuresByPlugin || !passesByPlugin) {
          const successes = categoryStats[subCategory]
            ? categoryStats[subCategory].total - categoryStats[subCategory].pass
            : 0;
          const attempts = categoryStats[subCategory]?.total || 0;

          return RiskScoreService.calculateWithDetails({
            severity,
            successes,
            attempts,
            strategy: 'basic',
          });
        }

        // Aggregate strategy stats and calculate risk score
        // Flatten all test arrays from the plugin-keyed objects
        const allFailureTests = Object.values(failuresByPlugin).flat();
        const allPassTests = Object.values(passesByPlugin).flat();

        const strategyStats = RiskScoreService.aggregatePluginStrategyStats({
          pluginId: subCategory,
          failureTests: allFailureTests,
          passTests: allPassTests,
          getPluginIdFromResult,
          getStrategyIdFromTest,
        });

        return RiskScoreService.calculatePluginRiskScoreWithDetails({
          severity,
          strategyStats,
        });
      })();

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
        severity,
        riskScore: riskDetails.score,
        exploitabilityScore: riskDetails.exploitabilityScore,
        exploitabilityReason: riskDetails.exploitabilityReason,
        attackSuccessRate,
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

const TestSuites: React.FC<TestSuitesProps> = ({
  evalId,
  categoryStats,
  plugins,
  vulnerabilitiesDataGridRef,
  vulnerabilitiesDataGridFilterModel,
  setVulnerabilitiesDataGridFilterModel,
  failuresByPlugin,
  passesByPlugin,
}) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const subCategoryStats = getSubCategoryStats(
    categoryStats,
    plugins,
    failuresByPlugin,
    passesByPlugin,
  ).filter((subCategory) => subCategory.passRate !== 'N/A');
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(25);
  const [order, setOrder] = React.useState<'asc' | 'desc'>('desc');
  const [orderBy, setOrderBy] = React.useState<'attackSuccessRate' | 'severity' | 'riskScore'>(
    'riskScore',
  );

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(Number.parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSort = (property: 'attackSuccessRate' | 'severity' | 'riskScore') => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const exportToCSV = React.useCallback(() => {
    // Format data for CSV
    const headers = [
      'Type',
      'Risk Score',
      'Exploitability Score',
      'Severity',
      'Attack Success Rate',
      'Description',
    ];

    // Get the sorted data based on current sort model
    const sortedData = [...subCategoryStats].sort((a, b) => {
      if (orderBy === 'attackSuccessRate') {
        if (a.attackSuccessRate === 'N/A') {
          return 1;
        }
        if (b.attackSuccessRate === 'N/A') {
          return -1;
        }
        return order === 'asc'
          ? Number.parseFloat(a.attackSuccessRate) - Number.parseFloat(b.attackSuccessRate)
          : Number.parseFloat(b.attackSuccessRate) - Number.parseFloat(a.attackSuccessRate);
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
      } else if (orderBy === 'riskScore') {
        return order === 'asc' ? a.riskScore - b.riskScore : b.riskScore - a.riskScore;
      } else {
        // Default sort: severity desc tiebroken by pass rate asc, N/A passRate goes to the bottom
        const severityOrder = {
          [Severity.Critical]: 4,
          [Severity.High]: 3,
          [Severity.Medium]: 2,
          [Severity.Low]: 1,
        };
        if (a.severity === b.severity) {
          return Number.parseFloat(b.attackSuccessRate) - Number.parseFloat(a.attackSuccessRate);
        } else {
          return severityOrder[b.severity] - severityOrder[a.severity];
        }
      }
    });

    // Serialize the rows to CSV
    const csvData = sortedData.map((subCategory) => [
      displayNameOverrides[subCategory.pluginName as keyof typeof displayNameOverrides] ||
        subCategory.type,
      subCategory.riskScore,
      subCategory.exploitabilityScore,
      subCategory.severity,
      subCategory.attackSuccessRate,
      subCategory.description,
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
  }, [subCategoryStats, order, orderBy, evalId]);

  return (
    <Box sx={{ pageBreakBefore: 'always', breakBefore: 'always' }} ref={vulnerabilitiesDataGridRef}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Vulnerabilities and Mitigations</Typography>
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
              <TableCell>
                <TableSortLabel
                  active={orderBy === 'riskScore'}
                  direction={orderBy === 'riskScore' ? order : 'asc'}
                  onClick={() => handleSort('riskScore')}
                >
                  Risk Score
                </TableSortLabel>
              </TableCell>
              <TableCell>Exploitability</TableCell>
              <TableCell>
                <TableSortLabel
                  active={orderBy === 'severity'}
                  direction={orderBy === 'severity' ? order : 'asc'}
                  onClick={() => handleSort('severity')}
                >
                  Severity
                </TableSortLabel>
              </TableCell>
              <TableCell style={{ minWidth: '200px' }}>
                <TableSortLabel
                  active={orderBy === 'attackSuccessRate'}
                  direction={orderBy === 'attackSuccessRate' ? order : 'asc'}
                  onClick={() => handleSort('attackSuccessRate')}
                >
                  Attack Success Rate
                </TableSortLabel>
              </TableCell>
              <TableCell>Description</TableCell>
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
                } else if (orderBy === 'riskScore') {
                  return order === 'asc' ? a.riskScore - b.riskScore : b.riskScore - a.riskScore;
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

                return (
                  <TableRow key={index} style={rowStyle}>
                    <TableCell>
                      <span style={{ fontWeight: 500 }}>
                        {displayNameOverrides[
                          subCategory.pluginName as keyof typeof displayNameOverrides
                        ] || subCategory.type}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Tooltip
                        title={
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                              CVSS-Style Risk Score
                            </Typography>
                            <Typography variant="caption" component="div">
                              Risk Score = (Exploitability × 40%) + (Impact × 60%)
                            </Typography>
                            <Box sx={{ mt: 1 }}>
                              <Typography variant="caption" component="div">
                                • Impact Score: {subCategory.severity} (
                                {severityRiskScores[subCategory.severity as Severity] || 'N/A'}/10)
                              </Typography>
                              <Typography variant="caption" component="div">
                                • Exploitability Score: {subCategory.exploitabilityScore}/10
                              </Typography>
                              <Typography variant="caption" component="div">
                                • Attack Success Rate: {subCategory.attackSuccessRate}
                              </Typography>
                              <Typography variant="caption" component="div" sx={{ mt: 1 }}>
                                Industry-standard scoring: 60% weight on impact severity, 40% on
                                exploitability
                              </Typography>
                            </Box>
                          </Box>
                        }
                        placement="top"
                        arrow
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'help' }}>
                          <Box
                            sx={{
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              backgroundColor: getRiskScoreColor(subCategory.riskScore, theme),
                            }}
                          />
                          {subCategory.riskScore}
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Tooltip
                        title={
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                              CVSS-Style Exploitability Score
                            </Typography>
                            <Typography variant="caption" component="div" sx={{ mb: 1 }}>
                              {subCategory.exploitabilityReason}
                            </Typography>
                            <Box sx={{ mt: 1 }}>
                              <Typography
                                variant="caption"
                                component="div"
                                sx={{ fontWeight: 'bold' }}
                              >
                                Components (Equal Weight):
                              </Typography>
                              <Typography variant="caption" component="div">
                                • Attack Vector: How the attack is delivered
                              </Typography>
                              <Typography variant="caption" component="div">
                                • Attack Complexity: Conditions required for success
                              </Typography>
                              <Typography variant="caption" component="div">
                                • Success Rate: Empirical test results
                              </Typography>
                              <Box sx={{ mt: 1 }}>
                                <Typography
                                  variant="caption"
                                  component="div"
                                  sx={{ fontWeight: 'bold' }}
                                >
                                  Score Interpretation:
                                </Typography>
                                <Typography variant="caption" component="div">
                                  • 0-3: Very Low - Difficult to exploit
                                </Typography>
                                <Typography variant="caption" component="div">
                                  • 3-5: Low - Requires effort to exploit
                                </Typography>
                                <Typography variant="caption" component="div">
                                  • 5-7: Moderate - Reasonably exploitable
                                </Typography>
                                <Typography variant="caption" component="div">
                                  • 7-10: High - Easily exploitable
                                </Typography>
                              </Box>
                            </Box>
                          </Box>
                        }
                        placement="top"
                        arrow
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'help' }}>
                          <Box
                            sx={{
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              backgroundColor: (() => {
                                const score = subCategory.exploitabilityScore;
                                if (score >= 8) {
                                  return getSeverityColor(Severity.Critical, theme);
                                }
                                if (score >= 5.5) {
                                  return getSeverityColor(Severity.High, theme);
                                }
                                if (score >= 3.5) {
                                  return getSeverityColor(Severity.Medium, theme);
                                }
                                return getSeverityColor(Severity.Low, theme);
                              })(),
                            }}
                          />
                          {subCategory.exploitabilityScore}/10
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{subCategory.severity}</TableCell>
                    <TableCell>
                      {subCategory.attackSuccessRate}
                      {subCategory.passRateWithFilter === subCategory.passRate ? null : (
                        <>
                          <br />({subCategory.passRateWithFilter} with mitigation)
                        </>
                      )}
                    </TableCell>
                    <TableCell>{subCategory.description}</TableCell>
                    <TableCell style={{ minWidth: 270 }} className="print-hide">
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => {
                          const pluginId = subCategory.pluginName;
                          navigate(`/eval/${evalId}?plugin=${encodeURIComponent(pluginId)}`);
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
