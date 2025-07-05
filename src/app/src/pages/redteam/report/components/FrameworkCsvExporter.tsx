import React from 'react';
import DownloadIcon from '@mui/icons-material/Download';
import Button from '@mui/material/Button';
import {
  ALIASED_PLUGIN_MAPPINGS,
  FRAMEWORK_COMPLIANCE_IDS,
  FRAMEWORK_NAMES,
  OWASP_LLM_TOP_10_NAMES,
  OWASP_API_TOP_10_NAMES,
  riskCategorySeverityMap,
  Severity,
} from '@promptfoo/redteam/constants';
import {
  type CategoryStats,
  expandPluginCollections,
  categorizePlugins,
  getPluginDisplayName,
} from './FrameworkComplianceUtils';

interface CSVExporterProps {
  categoryStats: CategoryStats;
  pluginPassRateThreshold: number;
}

const CSVExporter: React.FC<CSVExporterProps> = ({ categoryStats, pluginPassRateThreshold }) => {
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

    // Add data rows
    FRAMEWORK_COMPLIANCE_IDS.forEach((frameworkId) => {
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
              const attacksSuccessful = stats.total - stats.pass;
              const asr = ((attacksSuccessful / stats.total) * 100).toFixed(2);
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
          const attacksSuccessful = stats.total - stats.pass;
          const asr = ((attacksSuccessful / stats.total) * 100).toFixed(2);
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
    <Button
      variant="contained"
      color="primary"
      startIcon={<DownloadIcon />}
      onClick={exportToCSV}
      className="print-hide"
    >
      Export framework results to CSV
    </Button>
  );
};

export default CSVExporter;
