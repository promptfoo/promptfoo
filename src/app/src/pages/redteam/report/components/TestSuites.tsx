import React from 'react';

import { DataTable } from '@app/components/data-table/data-table';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { EVAL_ROUTES } from '@app/constants/routes';
import { useCustomPoliciesMap } from '@app/hooks/useCustomPoliciesMap';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { formatASRForDisplay } from '@app/utils/redteam';
import {
  categoryAliases,
  displayNameOverrides,
  type Plugin,
  Severity,
  severityDisplayNames,
  severityRiskScores,
  subCategoryDescriptions,
} from '@promptfoo/redteam/constants';
import { calculateAttackSuccessRate } from '@promptfoo/redteam/metrics';
import {
  formatPolicyIdentifierAsMetric,
  isValidPolicyObject,
  makeInlinePolicyId,
} from '@promptfoo/redteam/plugins/policy/utils';
import {
  calculatePluginRiskScore,
  prepareTestResultsFromStats,
} from '@promptfoo/redteam/riskScoring';
import { getRiskCategorySeverityMap } from '@promptfoo/redteam/sharedFrontend';
import { Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getSeverityColor } from '../utils/color';
import { type TestResultStats } from './FrameworkComplianceUtils';
import { getStrategyIdFromTest } from './shared';
import { useReportStore } from './store';
import type { RedteamPluginObject } from '@promptfoo/redteam/types';
import type { ColumnDef, SortingState } from '@tanstack/react-table';

interface TestSuitesProps {
  evalId: string;
  categoryStats: Record<string, Required<TestResultStats>>;
  plugins: RedteamPluginObject[];
  failuresByPlugin?: Record<string, unknown[]>;
  passesByPlugin?: Record<string, unknown[]>;
  vulnerabilitiesDataGridRef: React.RefObject<HTMLDivElement | null>;
}

const getRiskScoreColor = (riskScore: number): string => {
  if (riskScore >= severityRiskScores[Severity.Critical]) {
    return getSeverityColor(Severity.Critical);
  } else if (riskScore >= severityRiskScores[Severity.High]) {
    return getSeverityColor(Severity.High);
  } else if (riskScore >= severityRiskScores[Severity.Medium]) {
    return getSeverityColor(Severity.Medium);
  } else {
    return getSeverityColor(Severity.Low);
  }
};

const TestSuites = ({
  evalId,
  categoryStats,
  plugins,
  failuresByPlugin,
  passesByPlugin,
  vulnerabilitiesDataGridRef,
}: TestSuitesProps) => {
  const navigate = useNavigate();
  const { recordEvent } = useTelemetry();
  const { severityFilter } = useReportStore();
  const [sortModel] = React.useState<SortingState>([{ id: 'riskScore', desc: true }]);

  const pluginSeverityMap = React.useMemo(() => getRiskCategorySeverityMap(plugins), [plugins]);

  const [pluginsById, setPluginsById] = React.useState<Record<string, RedteamPluginObject>>({});

  React.useEffect(() => {
    async function buildPluginsById() {
      const result: Record<string, RedteamPluginObject> = {};

      for (const plugin of plugins) {
        let pluginId: string;
        if (plugin.id === 'policy' && plugin.config?.policy) {
          // Use the policy id as the plugin id in order to differentiate custom policies from each other.
          // Either get the policy id from the metadata or construct it by hashing the policy text.
          pluginId = isValidPolicyObject(plugin.config.policy)
            ? plugin.config.policy.id
            : await makeInlinePolicyId(plugin.config.policy as string);
        } else {
          pluginId = plugin.id;
        }

        result[pluginId] = {
          ...plugin,
          // If the plugin does not have a severity defined, assign it here. Use original `plugin.id`
          // for `pluginSeverityMap` lookups.
          severity: plugin.severity ?? pluginSeverityMap[plugin.id as Plugin],
        };
      }

      setPluginsById(result);
    }

    buildPluginsById();
  }, [plugins, pluginSeverityMap]);

  const customPoliciesById = useCustomPoliciesMap(plugins);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  const allRows = React.useMemo(() => {
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

  // Apply severity filter if set
  const rows = React.useMemo(() => {
    if (severityFilter === null) {
      return allRows;
    }
    return allRows.filter((row) => row.severity === severityFilter);
  }, [allRows, severityFilter]);

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
      if (sortModel.length > 0 && sortModel[0].id === 'attackSuccessRate') {
        return sortModel[0].desc
          ? b.attackSuccessRate - a.attackSuccessRate
          : a.attackSuccessRate - b.attackSuccessRate;
      }

      if (sortModel.length > 0 && sortModel[0].id === 'severity') {
        const severityOrder: Record<Severity, number> = {
          [Severity.Critical]: 5,
          [Severity.High]: 4,
          [Severity.Medium]: 3,
          [Severity.Low]: 2,
          [Severity.Informational]: 1,
        };

        return sortModel[0].desc
          ? severityOrder[b.severity as Severity] - severityOrder[a.severity as Severity]
          : severityOrder[a.severity as Severity] - severityOrder[b.severity as Severity];
      }

      if (sortModel.length > 0 && sortModel[0].id === 'riskScore') {
        return sortModel[0].desc ? b.riskScore - a.riskScore : a.riskScore - b.riskScore;
      }

      if (sortModel.length > 0 && sortModel[0].id === 'complexityScore') {
        return sortModel[0].desc
          ? b.complexityScore - a.complexityScore
          : a.complexityScore - b.complexityScore;
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

  // Define columns for DataTable
  const columns: ColumnDef<(typeof rows)[number]>[] = React.useMemo(
    () => [
      {
        accessorKey: 'type',
        header: 'Type',
        size: 180,
        accessorFn: (row) =>
          displayNameOverrides[row.pluginName as keyof typeof displayNameOverrides] || row.type,
        cell: ({ getValue }) => <span style={{ fontWeight: 500 }}>{getValue<string>()}</span>,
      },
      {
        accessorKey: 'description',
        header: 'Description',
        size: 220,
        cell: ({ getValue }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block max-w-full truncate">{getValue<string>()}</span>
            </TooltipTrigger>
            <TooltipContent>{getValue<string>()}</TooltipContent>
          </Tooltip>
        ),
      },
      {
        accessorKey: 'riskScore',
        header: 'Risk Score',
        size: 100,
        cell: ({ row }) => {
          const value = row.original.riskScore;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex cursor-help items-center gap-2">
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: getRiskScoreColor(value) }}
                  />
                  {value.toFixed(2)}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <div className="space-y-1">
                  <p className="font-semibold">Risk Score</p>
                  <p className="text-xs">
                    Risk = Impact + Exploitability + Human Factor + Complexity
                  </p>
                  <div className="mt-2 space-y-0.5 text-xs">
                    <p>• Base Severity: {row.original.severity}</p>
                    <p>
                      • Attack Success Rate: {formatASRForDisplay(row.original.attackSuccessRate)}%
                    </p>
                    <p className="mt-1 italic">
                      Higher exploitability increases risk exponentially
                    </p>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: 'complexityScore',
        header: 'Complexity',
        size: 100,
        cell: ({ row }) => {
          const value = row.original.complexityScore;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help">{value.toFixed(0)}</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <div className="space-y-1">
                  <p className="font-semibold">Attack Complexity</p>
                  <p className="text-xs">How difficult this attack is to execute</p>
                  <div className="mt-2 space-y-0.5 text-xs">
                    <p>Strategy: {row.original.worstStrategy}</p>
                    <p>• Score: {value.toFixed(0)}/10</p>
                    <p className="mt-1">
                      {value >= 7
                        ? 'Very Hard - Requires automation/tools'
                        : value >= 5
                          ? 'Hard - Requires expertise'
                          : value >= 3
                            ? 'Medium - Requires some skill'
                            : 'Easy - Average user could exploit'}
                    </p>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: 'successfulAttacks',
        header: 'Successful Attacks',
        size: 110,
      },
      {
        accessorKey: 'attackSuccessRate',
        header: () => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help">ASR</span>
            </TooltipTrigger>
            <TooltipContent>Attack Success Rate</TooltipContent>
          </Tooltip>
        ),
        size: 80,
        cell: ({ row }) => {
          const value = row.original.attackSuccessRate;
          const passRateWithFilter = row.original.passRateWithFilter;
          const passRate = row.original.passRate;
          return (
            <div>
              <strong>{formatASRForDisplay(value)}%</strong>
              {passRateWithFilter !== passRate && (
                <>
                  <br />({formatASRForDisplay(100 - passRateWithFilter)}% with mitigation)
                </>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'severity',
        header: 'Severity',
        size: 90,
        cell: ({ getValue }) => {
          const value = getValue<Severity>();
          return severityDisplayNames[value] || 'Unknown';
        },
        sortingFn: (rowA, rowB) => {
          const severityOrder: Record<Severity, number> = {
            [Severity.Critical]: 5,
            [Severity.High]: 4,
            [Severity.Medium]: 3,
            [Severity.Low]: 2,
            [Severity.Informational]: 1,
          };
          const a = severityOrder[rowA.original.severity as Severity] ?? 0;
          const b = severityOrder[rowB.original.severity as Severity] ?? 0;
          return a - b;
        },
        meta: {
          filterVariant: 'select',
          filterOptions: [
            { label: 'Critical', value: Severity.Critical },
            { label: 'High', value: Severity.High },
            { label: 'Medium', value: Severity.Medium },
            { label: 'Low', value: Severity.Low },
            { label: 'Informational', value: Severity.Informational },
          ],
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        size: 220,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                const pluginId = row.original.pluginName;
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
                const mode = row.original.attackSuccessRate === 0 ? 'passes' : 'failures';
                navigate(`${EVAL_ROUTES.DETAIL(evalId)}?filter=${filterParam}&mode=${mode}`);
              }}
            >
              View logs
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    // Track the mitigation button click
                    recordEvent('feature_used', {
                      feature: 'redteam_apply_mitigation_clicked',
                      plugin: row.original.pluginName,
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
              </TooltipTrigger>
              <TooltipContent>
                Temporarily disabled while in beta, click to contact us to enable
              </TooltipContent>
            </Tooltip>
          </div>
        ),
      },
    ],
    [navigate, pluginsById, recordEvent, evalId],
  );

  return (
    <div className="break-before-page print:break-before-always" ref={vulnerabilitiesDataGridRef}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Vulnerabilities and Mitigations</h2>
        <Button onClick={exportToCSV} className="print:hidden">
          <Download className="mr-2 size-4" />
          Export vulnerabilities to CSV
        </Button>
      </div>
      <Card className="pb-4">
        <DataTable
          columns={columns}
          data={rows}
          initialSorting={sortModel}
          onExportCSV={exportToCSV}
          showToolbar={true}
          showColumnToggle={true}
          showFilter={true}
          showExport={false}
          showPagination={true}
          initialPageSize={10}
          getRowId={(row) => row.id}
        />
      </Card>
    </div>
  );
};

export default TestSuites;
