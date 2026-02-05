import { Button } from '@app/components/ui/button';
import { DownloadIcon } from '@app/components/ui/icons';
import { formatASRForDisplay } from '@promptfoo/app/src/utils/redteam';
import {
  ALIASED_PLUGIN_MAPPINGS,
  FRAMEWORK_NAMES,
  type FrameworkComplianceId,
  OWASP_API_TOP_10_NAMES,
  OWASP_LLM_TOP_10_NAMES,
  riskCategorySeverityMap,
  Severity,
} from '@promptfoo/redteam/constants';
import { calculateAttackSuccessRate } from '@promptfoo/redteam/metrics';
import {
  type CategoryStats,
  categorizePlugins,
  expandPluginCollections,
  getPluginDisplayName,
} from './FrameworkComplianceUtils';

interface CSVExporterProps {
  categoryStats: CategoryStats;
  pluginPassRateThreshold: number;
  frameworksToShow: readonly FrameworkComplianceId[];
}

const CSVExporter = ({
  categoryStats,
  pluginPassRateThreshold,
  frameworksToShow,
}: CSVExporterProps) => {
  // Function to export framework compliance data to CSV
  const exportToCSV = () => {
    // Collect data for all frameworks
    const csvRows = [
      // Header row
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
    ];

    // Add data rows for configured frameworks
    frameworksToShow.forEach((frameworkId) => {
      const framework = FRAMEWORK_NAMES[frameworkId];

      if (frameworkId === 'owasp:api' || frameworkId === 'owasp:llm') {
        // Add data for categorized OWASP frameworks
        Object.entries(ALIASED_PLUGIN_MAPPINGS[frameworkId]).forEach(
          ([categoryId, { plugins: categoryPlugins }]) => {
            const categoryNumber = categoryId.split(':').pop();
            const categoryName =
              categoryNumber && frameworkId === 'owasp:llm'
                ? OWASP_LLM_TOP_10_NAMES[Number.parseInt(categoryNumber) - 1]
                : categoryNumber && frameworkId === 'owasp:api'
                  ? OWASP_API_TOP_10_NAMES[Number.parseInt(categoryNumber) - 1]
                  : `Category ${categoryNumber}`;

            // Expand plugins if needed
            const expandedPlugins = expandPluginCollections(categoryPlugins, categoryStats);

            // Categorize plugins into tested and untested
            const { compliant, nonCompliant, untested } = categorizePlugins(
              expandedPlugins,
              categoryStats,
              pluginPassRateThreshold,
            );

            const testedPlugins = [...compliant, ...nonCompliant];

            // Add tested plugins
            testedPlugins.forEach((plugin) => {
              const stats = categoryStats[plugin];
              const pluginSeverity =
                riskCategorySeverityMap[plugin as keyof typeof riskCategorySeverityMap] ||
                Severity.Low;
              const pluginName = getPluginDisplayName(plugin);
              const attacksSuccessful = stats.failCount;
              const asr = formatASRForDisplay(
                calculateAttackSuccessRate(stats.total, stats.failCount),
              );
              const status = stats.pass / stats.total >= pluginPassRateThreshold ? 'Pass' : 'Fail';

              csvRows.push([
                framework,
                `${categoryNumber}. ${categoryName}`,
                pluginName,
                pluginSeverity,
                stats.total.toString(),
                attacksSuccessful.toString(),
                asr,
                status,
              ]);
            });

            // Add untested plugins
            untested.forEach((plugin) => {
              const pluginSeverity =
                riskCategorySeverityMap[plugin as keyof typeof riskCategorySeverityMap] ||
                Severity.Low;
              const pluginName = getPluginDisplayName(plugin);

              csvRows.push([
                framework,
                `${categoryNumber}. ${categoryName}`,
                pluginName,
                pluginSeverity,
                '0',
                '0',
                '0',
                'Not Tested',
              ]);
            });
          },
        );
      } else {
        // Add data for other frameworks (without categories)
        // First get all plugins defined for this framework
        const frameworkPlugins = new Set<string>();
        if (ALIASED_PLUGIN_MAPPINGS[frameworkId]) {
          Object.values(ALIASED_PLUGIN_MAPPINGS[frameworkId]).forEach(({ plugins }) => {
            const expanded = expandPluginCollections(plugins, categoryStats);
            expanded.forEach((plugin) => frameworkPlugins.add(plugin));
          });
        }

        // Categorize plugins
        const { compliant, nonCompliant, untested } = categorizePlugins(
          frameworkPlugins,
          categoryStats,
          pluginPassRateThreshold,
        );

        const testedPlugins = [...compliant, ...nonCompliant];

        // Add tested plugins
        testedPlugins.forEach((plugin) => {
          const stats = categoryStats[plugin];
          const pluginSeverity =
            riskCategorySeverityMap[plugin as keyof typeof riskCategorySeverityMap] || Severity.Low;
          const pluginName = getPluginDisplayName(plugin);
          const attacksSuccessful = stats.failCount;
          const asr = formatASRForDisplay(calculateAttackSuccessRate(stats.total, stats.failCount));
          const status = stats.pass / stats.total >= pluginPassRateThreshold ? 'Pass' : 'Fail';

          csvRows.push([
            framework,
            'N/A',
            pluginName,
            pluginSeverity,
            stats.total.toString(),
            attacksSuccessful.toString(),
            asr,
            status,
          ]);
        });

        // Add untested plugins
        untested.forEach((plugin) => {
          const pluginSeverity =
            riskCategorySeverityMap[plugin as keyof typeof riskCategorySeverityMap] || Severity.Low;
          const pluginName = getPluginDisplayName(plugin);

          csvRows.push([framework, 'N/A', pluginName, pluginSeverity, '0', '0', '0', 'Not Tested']);
        });
      }
    });

    // Convert to CSV string
    const csvContent = csvRows
      .map((row) =>
        row
          .map((cell) => {
            // Quote cells that contain commas or quotes
            if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
              return `"${cell.replace(/"/g, '""')}"`;
            }
            return cell;
          })
          .join(','),
      )
      .join('\n');

    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fileName = `framework-compliance-${new Date().toISOString().slice(0, 10)}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Button onClick={exportToCSV} className="print-hide">
      <DownloadIcon className="mr-2 size-4" />
      Export framework results to CSV
    </Button>
  );
};

export default CSVExporter;
