import React from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  DataGrid,
  GridColDef,
  GridFilterModel,
  GridRenderCellParams,
  type GridSortModel,
  GridToolbarColumnsButton,
  GridToolbarContainer,
  GridToolbarDensitySelector,
  GridToolbarFilterButton,
} from '@mui/x-data-grid';
import {
  categoryAliases,
  displayNameOverrides,
  type Plugin,
  Severity,
  severityDisplayNames,
  severityRiskScores,
  subCategoryDescriptions,
} from '@promptfoo/redteam/constants';
import { getRiskCategorySeverityMap } from '@promptfoo/redteam/sharedFrontend';
import { useNavigate } from 'react-router-dom';
import { getSeverityColor } from '../utils/color';
import { getStrategyIdFromTest } from './shared';
import type { RedteamPluginObject } from '@promptfoo/redteam/types';
import './TestSuites.css';

import {
  formatPolicyIdentifierAsMetric,
  isValidPolicyObject,
  makeInlinePolicyId,
} from '@promptfoo/redteam/plugins/policy/utils';
import {
  calculatePluginRiskScore,
  prepareTestResultsFromStats,
} from '@promptfoo/redteam/riskScoring';
import { calculateAttackSuccessRate } from '@promptfoo/redteam/metrics';
import { formatASRForDisplay } from '@app/utils/redteam';
import { type TestResultStats } from './FrameworkComplianceUtils';
import { useCustomPoliciesMap } from '@app/hooks/useCustomPoliciesMap';

interface TestSuitesProps {
  evalId: string;
  categoryStats: Record<string, Required<TestResultStats>>;
  plugins: RedteamPluginObject[];
  failuresByPlugin?: Record<string, any[]>;
  passesByPlugin?: Record<string, any[]>;
  vulnerabilitiesDataGridRef: React.RefObject<HTMLDivElement | null>;
  vulnerabilitiesDataGridFilterModel: GridFilterModel;
  setVulnerabilitiesDataGridFilterModel: (filterModel: GridFilterModel) => void;
}

// Custom toolbar without export button
function CustomToolbar() {
  return (
    <GridToolbarContainer>
      <GridToolbarColumnsButton />
      <GridToolbarFilterButton />
      <GridToolbarDensitySelector />
    </GridToolbarContainer>
  );
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

const TestSuites = ({
  evalId,
  categoryStats,
  plugins,
  failuresByPlugin,
  passesByPlugin,
  vulnerabilitiesDataGridRef,
  vulnerabilitiesDataGridFilterModel,
  setVulnerabilitiesDataGridFilterModel,
}: TestSuitesProps) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { recordEvent } = useTelemetry();
  const [sortModel, setSortModel] = React.useState<GridSortModel>([
    { field: 'riskScore', sort: 'desc' },
  ]);

  const pluginSeverityMap = React.useMemo(() => getRiskCategorySeverityMap(plugins), [plugins]);

  const pluginsById = React.useMemo(() => {
    return plugins.reduce(
      (acc, plugin) => {
        let pluginId: string;
        if (plugin.id === 'policy' && plugin.config?.policy) {
          // Use the policy id as the plugin id in order to differentiate custom policies from each other.
          // Either get the policy id from the metadata or construct it by hashing the policy text.
          pluginId = isValidPolicyObject(plugin.config.policy)
            ? plugin.config.policy.id
            : makeInlinePolicyId(plugin.config.policy as string);
        } else {
          pluginId = plugin.id;
        }

        acc[pluginId] = {
          ...plugin,
          // If the plugin does not have a severity defined, assign it here. Use original `plugin.id`
          // for `pluginSeverityMap` lookups.
          severity: plugin.severity ?? pluginSeverityMap[plugin.id as Plugin],
        };
        return acc;
      },
      {} as Record<string, RedteamPluginObject>,
    );
  }, [plugins, pluginSeverityMap]);

  const customPoliciesById = useCustomPoliciesMap(plugins);

  const rows = React.useMemo(() => {
    return (
      Object.entries(categoryStats)
        .filter(([_, stats]) => stats.total > 0)
        .map(([pluginName, stats]) => {
          const plugin = pluginsById[pluginName];

          // Handle case where plugin is not found (e.g., when plugins array is empty)
          // Use the severity map directly or default to 'Unknown'
          const severity =
            plugin?.severity || pluginSeverityMap[pluginName as Plugin] || ('Unknown' as Severity);

          // Calculate risk score with details
          const riskDetails = (() => {
            // Prepare test results using the helper function
            const testResults = prepareTestResultsFromStats(
              failuresByPlugin,
              passesByPlugin,
              pluginName,
              categoryStats,
              getStrategyIdFromTest,
            );

            if (testResults.length === 0) {
              return {
                riskScore: 0,
                complexityScore: 0,
                worstStrategy: 'none',
              };
            }

            // Calculate risk score once and extract values
            const riskScoreResult = calculatePluginRiskScore(pluginName, severity, testResults);
            return {
              riskScore: riskScoreResult.score,
              complexityScore: riskScoreResult.complexityScore,
              worstStrategy: riskScoreResult.worstStrategy,
            };
          })();

          let type = categoryAliases[pluginName as keyof typeof categoryAliases] || pluginName;
          let description =
            subCategoryDescriptions[pluginName as keyof typeof subCategoryDescriptions] ?? '';

          // Reads policy data from customPoliciesById
          if (plugin?.id === 'policy' && plugin?.config?.policy) {
            const policy = customPoliciesById[pluginName];
            if (policy) {
              // Render w/o strategy suffix as rows are aggregates across strategies
              type = formatPolicyIdentifierAsMetric(policy.name ?? policy.id);
              description = policy.text ?? '';
            }
          }

          return {
            id: pluginName,
            pluginName,
            type,
            description,
            severity,
            passRate: (stats.pass / stats.total) * 100,
            passRateWithFilter: (stats.passWithFilter / stats.total) * 100,
            attackSuccessRate: calculateAttackSuccessRate(stats.total, stats.failCount),
            total: stats.total,
            successfulAttacks: stats.total - stats.pass,
            riskScore: riskDetails.riskScore,
            complexityScore: riskDetails.complexityScore,
            worstStrategy: riskDetails.worstStrategy,
          };
        })
        // Filter out rows where ASR = 0
        .filter((row) => row.successfulAttacks > 0)
    );
  }, [
    categoryStats,
    plugins,
    failuresByPlugin,
    passesByPlugin,
    pluginsById,
    pluginSeverityMap,
    customPoliciesById,
  ]);

  const exportToCSV = React.useCallback(() => {
    // Format data for CSV
    const headers = [
      'Type',
      'Description',
      'Risk Score',
      'Complexity',
      'Successful Attacks',
      'Total Tests',
      'Attack Success Rate',
      'Severity',
    ];

    const compareRows = (a: (typeof rows)[number], b: (typeof rows)[number]) => {
      if (sortModel.length > 0 && sortModel[0].field === 'attackSuccessRate') {
        return sortModel[0].sort === 'asc'
          ? a.attackSuccessRate - b.attackSuccessRate
          : b.attackSuccessRate - a.attackSuccessRate;
      }

      if (sortModel.length > 0 && sortModel[0].field === 'severity') {
        const severityOrder = {
          [Severity.Critical]: 4,
          [Severity.High]: 3,
          [Severity.Medium]: 2,
          [Severity.Low]: 1,
        } as const;

        return sortModel[0].sort === 'asc'
          ? severityOrder[a.severity as Severity] - severityOrder[b.severity as Severity]
          : severityOrder[b.severity as Severity] - severityOrder[a.severity as Severity];
      }

      if (sortModel.length > 0 && sortModel[0].field === 'riskScore') {
        return sortModel[0].sort === 'asc' ? a.riskScore - b.riskScore : b.riskScore - a.riskScore;
      }

      if (sortModel.length > 0 && sortModel[0].field === 'complexityScore') {
        return sortModel[0].sort === 'asc'
          ? a.complexityScore - b.complexityScore
          : b.complexityScore - a.complexityScore;
      }

      return b.riskScore - a.riskScore;
    };

    const sortedData = rows.reduce<Array<(typeof rows)[number]>>((acc, current) => {
      const insertIndex = acc.findIndex((item) => compareRows(current, item) < 0);
      if (insertIndex === -1) {
        acc.push(current);
      } else {
        acc.splice(insertIndex, 0, current);
      }
      return acc;
    }, []);

    // Serialize the rows to CSV
    const csvData = sortedData.map((subCategory) => [
      displayNameOverrides[subCategory.pluginName as keyof typeof displayNameOverrides] ||
        subCategory.type,
      subCategory.description,
      subCategory.riskScore.toFixed(2),
      subCategory.complexityScore.toFixed(1),
      subCategory.successfulAttacks,
      subCategory.total,
      formatASRForDisplay(subCategory.attackSuccessRate) + '%',
      severityDisplayNames[subCategory.severity as Severity],
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
  }, [rows, sortModel, evalId]);

  // Define columns for DataGrid
  const columns: GridColDef[] = [
    {
      field: 'type',
      headerName: 'Type',
      flex: 1,
      valueGetter: (_, row) =>
        displayNameOverrides[row.pluginName as keyof typeof displayNameOverrides] || row.type,
      renderCell: (params: GridRenderCellParams) => (
        <span style={{ fontWeight: 500 }}>{params.value}</span>
      ),
    },
    {
      field: 'description',
      headerName: 'Description',
      flex: 1.75,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ wordBreak: 'break-word' }}>{params.value}</Box>
      ),
    },
    {
      field: 'riskScore',
      headerName: 'Risk Score',
      type: 'number',
      flex: 0.5,
      renderCell: (params: GridRenderCellParams) => {
        const value = params.row.riskScore;
        return (
          <Tooltip
            title={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  Risk Score
                </Typography>
                <Typography variant="caption" component="div">
                  Risk = Impact + Exploitability + Human Factor + Complexity
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" component="div">
                    • Base Severity: {params.row.severity}
                  </Typography>
                  <Typography variant="caption" component="div">
                    • Attack Success Rate: {formatASRForDisplay(params.row.attackSuccessRate)}%
                  </Typography>
                  <Typography
                    variant="caption"
                    component="div"
                    sx={{ mt: 0.5, fontStyle: 'italic' }}
                  >
                    Higher exploitability increases risk exponentially
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
                  backgroundColor: getRiskScoreColor(value, theme),
                }}
              />
              {value.toFixed(2)}
            </Box>
          </Tooltip>
        );
      },
    },
    {
      field: 'complexityScore',
      headerName: 'Complexity',
      type: 'number',
      flex: 0.5,
      renderCell: (params: GridRenderCellParams) => {
        const value = params.row.complexityScore;
        return (
          <Tooltip
            title={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  Attack Complexity
                </Typography>
                <Typography variant="caption" component="div">
                  How difficult this attack is to execute
                </Typography>
                <Typography variant="caption" component="div" sx={{ mt: 1 }}>
                  Strategy: {params.row.worstStrategy}
                </Typography>
                <Typography variant="caption" component="div">
                  • Score: {value.toFixed(0)}/10
                </Typography>
                <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                  {value >= 7
                    ? 'Very Hard - Requires automation/tools'
                    : value >= 5
                      ? 'Hard - Requires expertise'
                      : value >= 3
                        ? 'Medium - Requires some skill'
                        : 'Easy - Average user could exploit'}
                </Typography>
              </Box>
            }
            placement="top"
            arrow
          >
            <Box sx={{ cursor: 'help' }}>{value.toFixed(0)}</Box>
          </Tooltip>
        );
      },
    },
    {
      field: 'successfulAttacks',
      headerName: 'Successful Attacks',
      type: 'number',
      flex: 0.75,
    },
    {
      field: 'attackSuccessRate',
      headerName: 'Attack Success Rate',
      type: 'number',
      flex: 0.75,
      minWidth: 190,
      renderCell: (params: GridRenderCellParams) => {
        const value = params.row.attackSuccessRate;
        const passRateWithFilter = params.row.passRateWithFilter;
        const passRate = params.row.passRate;
        return (
          <Box sx={{ lineHeight: 1.4 }}>
            <strong>{formatASRForDisplay(value)}%</strong>
            {passRateWithFilter !== passRate && (
              <Box component="span" sx={{ display: 'block', fontSize: '0.85em' }}>
                ({formatASRForDisplay(100 - passRateWithFilter)}% with mitigation)
              </Box>
            )}
          </Box>
        );
      },
    },
    {
      field: 'severity',
      headerName: 'Severity',
      type: 'singleSelect',
      flex: 0.5,
      valueFormatter: (value: Severity) => severityDisplayNames[value],
      valueOptions: [
        ...Object.values(Severity).map((severity) => ({
          value: severity,
          label: severityDisplayNames[severity],
        })),
      ],
      sortComparator: (v1: Severity, v2: Severity) => {
        const severityOrder: Record<string, number> = {
          [Severity.Critical]: 4,
          [Severity.High]: 3,
          [Severity.Medium]: 2,
          [Severity.Low]: 1,
        };
        return severityOrder[v1] - severityOrder[v2];
      },
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 300,
      sortable: false,
      headerClassName: 'print-hide',
      cellClassName: 'print-hide',
      renderCell: (params: GridRenderCellParams) => (
        <>
          <Button
            variant="contained"
            size="small"
            onClick={() => {
              const pluginId = params.row.pluginName;
              const plugin = pluginsById[pluginId];

              const filterParam = encodeURIComponent(
                JSON.stringify([
                  {
                    type: plugin?.id === 'policy' ? 'policy' : 'plugin',
                    operator: 'equals',
                    value: pluginId,
                  },
                ]),
              );

              // If ASR is 0, show passes
              const mode = params.row.attackSuccessRate === 0 ? 'passes' : 'failures';
              navigate(`/eval/${evalId}?filter=${filterParam}&mode=${mode}`);
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
                // Track the mitigation button click
                recordEvent('feature_used', {
                  feature: 'redteam_apply_mitigation_clicked',
                  plugin: params.row.pluginName,
                  evalId,
                });

                // Open email in new tab
                window.open(
                  'mailto:inquiries@promptfoo.dev?subject=Promptfoo%20automatic%20vulnerability%20mitigation&body=Hello%20Promptfoo%20Team,%0D%0A%0D%0AI%20am%20interested%20in%20learning%20more%20about%20the%20automatic%20vulnerability%20mitigation%20beta.%20Please%20provide%20me%20with%20more%20details.%0D%0A%0D%0A',
                  '_blank',
                );
              }}
            >
              Apply mitigation
            </Button>
          </Tooltip>
        </>
      ),
    },
  ];

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
      <Paper>
        <Box
          sx={{
            height: 600,
            width: '100%',
            '@media print': {
              '& .print-hide': {
                display: 'none',
              },
              '& .MuiDataGrid-main': {
                height: 'auto !important',
              },
              '& .MuiDataGrid-virtualScroller': {
                height: 'auto !important',
              },
              '& .MuiDataGrid-footerContainer': {
                display: 'none',
              },
            },
          }}
        >
          <DataGrid
            rows={rows}
            columns={columns}
            sortModel={sortModel}
            onSortModelChange={setSortModel}
            filterModel={vulnerabilitiesDataGridFilterModel}
            onFilterModelChange={setVulnerabilitiesDataGridFilterModel}
            sx={{
              '& .MuiDataGrid-cell': {
                display: 'flex',
                alignItems: 'center',
              },
            }}
            slots={{ toolbar: CustomToolbar }}
            showToolbar
          />
        </Box>
      </Paper>
    </Box>
  );
};

export default TestSuites;
