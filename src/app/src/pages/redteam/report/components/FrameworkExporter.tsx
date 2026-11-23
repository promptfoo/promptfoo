import { Button } from '@app/components/ui/button';
import { DownloadIcon } from '@app/components/ui/icons';
import { formatASRForDisplay } from '@promptfoo/app/src/utils/redteam';
import { calculateAttackSuccessRate } from '@promptfoo/presentation/redteamMetrics';
import {
  ALIASED_PLUGIN_MAPPINGS,
  FRAMEWORK_NAMES,
  type FrameworkComplianceId,
  riskCategorySeverityMap,
  Severity,
} from '@promptfoo/redteam/constants';
import { stringify } from 'csv-stringify/browser/esm/sync';
import {
  type CategoryStats,
  categorizePlugins,
  expandPluginCollections,
  getCategoryLabel,
  getPluginDisplayName,
  hasNamedCategories,
  type TestResultStats,
} from './FrameworkComplianceUtils';

interface FrameworkExporterProps {
  categoryStats: CategoryStats;
  pluginPassRateThreshold: number;
  frameworksToShow: readonly FrameworkComplianceId[];
}

type FrameworkRow = {
  frameworkId: string;
  framework: string;
  categoryId: string | null;
  category: string;
  pluginId: string | null;
  plugin: string | null;
  severity: Severity | null;
  testsRun: number;
  attacksSuccessful: number;
  attackSuccessRate: number | null;
  status: 'Not Tested' | 'Pass' | 'Fail';
};

function getPluginResult(
  pluginId: string | null,
  stats: TestResultStats | undefined,
  status: FrameworkRow['status'],
) {
  return {
    pluginId,
    plugin: pluginId ? getPluginDisplayName(pluginId) : null,
    severity: pluginId
      ? riskCategorySeverityMap[pluginId as keyof typeof riskCategorySeverityMap] || Severity.Low
      : null,
    testsRun: stats?.total ?? 0,
    attacksSuccessful: stats?.failCount ?? 0,
    attackSuccessRate:
      stats && stats.total > 0 ? calculateAttackSuccessRate(stats.total, stats.failCount) : null,
    status,
  };
}

function getRows({
  categoryStats,
  pluginPassRateThreshold,
  frameworksToShow,
}: FrameworkExporterProps) {
  const rows: FrameworkRow[] = [];
  for (const frameworkId of frameworksToShow) {
    const mappings = ALIASED_PLUGIN_MAPPINGS[frameworkId];
    const categories = hasNamedCategories(frameworkId)
      ? Object.entries(mappings)
      : [[null, { plugins: Object.values(mappings).flatMap(({ plugins }) => plugins) }] as const];

    for (const [categoryId, { plugins }] of categories) {
      const category = categoryId ? getCategoryLabel(frameworkId, categoryId) : 'N/A';
      const { compliant, nonCompliant, untested } = categorizePlugins(
        expandPluginCollections(plugins, categoryStats),
        categoryStats,
        pluginPassRateThreshold,
      );
      const control = {
        frameworkId,
        framework: FRAMEWORK_NAMES[frameworkId],
        categoryId,
        category,
      };
      const untestedBehavior = categoryId && mappings[categoryId].untestedBehavior;
      if (untestedBehavior || (frameworkId === 'aiuc:1' && !plugins.length)) {
        rows.push({
          ...control,
          category: untestedBehavior ? `${category} (${untestedBehavior})` : category,
          ...getPluginResult(null, undefined, 'Not Tested'),
        });
      }
      for (const [status, ids] of [
        ['Pass', compliant],
        ['Fail', nonCompliant],
        ['Not Tested', untested],
      ] as const) {
        for (const id of ids) {
          rows.push({ ...control, ...getPluginResult(id, categoryStats[id], status) });
        }
      }
    }
  }
  return rows;
}

function toCsv(rows: FrameworkRow[]) {
  return stringify([
    [
      'Framework',
      'Category',
      'Plugin',
      'Severity',
      'Tests Run',
      'Attacks Successful',
      'Attack Success Rate (%)',
      'Status',
    ],
    ...rows.map((row) => [
      row.framework,
      row.category,
      row.plugin,
      row.severity,
      row.testsRun,
      row.attacksSuccessful,
      row.attackSuccessRate === null
        ? row.frameworkId === 'aiuc:1'
          ? ''
          : '0'
        : formatASRForDisplay(row.attackSuccessRate),
      row.status,
    ]),
  ]);
}

const FrameworkExporter = (props: FrameworkExporterProps) => {
  const download = (format: 'csv' | 'json') => {
    const rows = getRows(props);
    const content = format === 'csv' ? toCsv(rows) : JSON.stringify(rows, null, 2);
    const type = format === 'csv' ? 'text/csv' : 'application/json';
    const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8;` }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `framework-compliance-${new Date().toISOString().slice(0, 10)}.${format}`;
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="print-hide flex gap-2">
      {(['csv', 'json'] as const).map((format) => (
        <Button
          key={format}
          onClick={() => download(format)}
          aria-label={`Export framework results to ${format.toUpperCase()}`}
        >
          <DownloadIcon className="mr-2 size-4" />
          Export {format.toUpperCase()}
        </Button>
      ))}
    </div>
  );
};

export default FrameworkExporter;
