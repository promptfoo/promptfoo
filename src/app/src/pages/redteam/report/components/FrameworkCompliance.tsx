import React from 'react';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DownloadIcon from '@mui/icons-material/Download';
import InfoIcon from '@mui/icons-material/Info';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  ALIASED_PLUGIN_MAPPINGS,
  categoryAliases,
  displayNameOverrides,
  FRAMEWORK_NAMES,
  FRAMEWORK_COMPLIANCE_IDS,
  OWASP_LLM_TOP_10_NAMES,
  OWASP_API_TOP_10_NAMES,
  riskCategorySeverityMap,
  Severity,
} from '@promptfoo/redteam/constants';
import { useReportStore } from './store';
import './FrameworkCompliance.css';

interface FrameworkComplianceProps {
  categoryStats: Record<string, { pass: number; total: number; passWithFilter: number }>;
  strategyStats: Record<string, { pass: number; total: number }>;
}

const FRAMEWORK_DESCRIPTIONS: Record<string, string> = {
  'mitre:atlas': 'MITRE ATLAS framework for adversarial threat landscape for AI systems',
  'nist:ai:measure': 'NIST AI Risk Management Framework for responsible AI development',
  'owasp:api': 'OWASP API Top 10 security risks for application programming interfaces',
  'owasp:llm': 'OWASP LLM Top 10 security vulnerabilities for large language models',
};

const getSeverityColor = (severity: Severity): string => {
  switch (severity) {
    case Severity.Critical:
      return '#d32f2f';
    case Severity.High:
      return '#f57c00';
    case Severity.Medium:
      return '#fbc02d';
    case Severity.Low:
      return '#7cb342';
    default:
      return '#757575';
  }
};

const getProgressColor = (percentage: number, forAttackRate: boolean = false): string => {
  if (forAttackRate) {
    // For attack success rate, high percentages are bad
    if (percentage >= 75) {
      return '#d32f2f';
    } // Dark Red
    if (percentage >= 50) {
      return '#f44336';
    } // Red
    if (percentage >= 25) {
      return '#ff9800';
    } // Orange
    if (percentage >= 10) {
      return '#ffc107';
    } // Amber
    return '#4caf50'; // Green (low attack success is good)
  } else {
    // For pass rate, high percentages are good
    if (percentage >= 90) {
      return '#4caf50';
    } // Green
    if (percentage >= 75) {
      return '#8bc34a';
    } // Light Green
    if (percentage >= 50) {
      return '#ffeb3b';
    } // Yellow
    if (percentage >= 25) {
      return '#ff9800';
    } // Orange
    return '#f44336'; // Red
  }
};

const FrameworkCompliance: React.FC<FrameworkComplianceProps> = ({
  categoryStats,
  strategyStats,
}) => {
  const { pluginPassRateThreshold } = useReportStore();

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
            const expandedPlugins = new Set<string>();
            categoryPlugins.forEach((plugin) => {
              if (plugin === 'harmful') {
                // Add all harmful:* plugins that have stats
                Object.keys(categoryStats)
                  .filter((key) => key.startsWith('harmful:'))
                  .forEach((key) => expandedPlugins.add(key));
              } else {
                expandedPlugins.add(plugin);
              }
            });

            // Categorize plugins into tested and untested
            const testedPlugins = Array.from(expandedPlugins).filter(
              (plugin) => categoryStats[plugin] && categoryStats[plugin].total > 0,
            );
            const untestedPlugins = Array.from(expandedPlugins).filter(
              (plugin) => !categoryStats[plugin] || categoryStats[plugin].total === 0,
            );

            // Add tested plugins
            testedPlugins.forEach((plugin) => {
              const stats = categoryStats[plugin];
              const pluginSeverity =
                riskCategorySeverityMap[plugin as keyof typeof riskCategorySeverityMap] ||
                Severity.Low;
              const pluginName =
                displayNameOverrides[plugin as keyof typeof displayNameOverrides] ||
                categoryAliases[plugin as keyof typeof categoryAliases] ||
                plugin;
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
            untestedPlugins.forEach((plugin) => {
              const pluginSeverity =
                riskCategorySeverityMap[plugin as keyof typeof riskCategorySeverityMap] ||
                Severity.Low;
              const pluginName =
                displayNameOverrides[plugin as keyof typeof displayNameOverrides] ||
                categoryAliases[plugin as keyof typeof categoryAliases] ||
                plugin;

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
        if (ALIASED_PLUGIN_MAPPINGS[framework]) {
          Object.values(ALIASED_PLUGIN_MAPPINGS[framework]).forEach(({ plugins }) => {
            plugins.forEach((plugin) => {
              if (plugin === 'harmful') {
                // Add all harmful:* plugins
                Object.keys(categoryStats)
                  .filter((key) => key.startsWith('harmful:'))
                  .forEach((key) => frameworkPlugins.add(key));
              } else {
                frameworkPlugins.add(plugin);
              }
            });
          });
        }

        // Categorize plugins
        const testedPlugins = Array.from(frameworkPlugins).filter(
          (plugin) => categoryStats[plugin] && categoryStats[plugin].total > 0,
        );
        const untestedPlugins = Array.from(frameworkPlugins).filter(
          (plugin) => !categoryStats[plugin] || categoryStats[plugin].total === 0,
        );

        // Add tested plugins
        testedPlugins.forEach((plugin) => {
          const stats = categoryStats[plugin];
          const pluginSeverity =
            riskCategorySeverityMap[plugin as keyof typeof riskCategorySeverityMap] || Severity.Low;
          const pluginName =
            displayNameOverrides[plugin as keyof typeof displayNameOverrides] ||
            categoryAliases[plugin as keyof typeof categoryAliases] ||
            plugin;
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
        untestedPlugins.forEach((plugin) => {
          const pluginSeverity =
            riskCategorySeverityMap[plugin as keyof typeof riskCategorySeverityMap] || Severity.Low;
          const pluginName =
            displayNameOverrides[plugin as keyof typeof displayNameOverrides] ||
            categoryAliases[plugin as keyof typeof categoryAliases] ||
            plugin;

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

  const getNonCompliantPlugins = React.useCallback(
    (framework: string) => {
      const mappings = ALIASED_PLUGIN_MAPPINGS[framework];
      if (!mappings) {
        return [];
      }

      // First, collect all plugins from all subcategories
      const allPlugins = new Set<string>();
      Object.values(mappings).forEach(({ plugins }) => {
        plugins.forEach((plugin) => {
          // Special handling for collection plugins like 'harmful'
          if (plugin === 'harmful') {
            // Include all harmful:* plugins
            Object.keys(categoryStats)
              .filter((key) => key.startsWith('harmful:'))
              .forEach((key) => allPlugins.add(key));
          } else {
            allPlugins.add(plugin);
          }
        });
      });

      // Then filter for non-compliant ones
      return Array.from(allPlugins).filter((plugin) => {
        const stats = categoryStats[plugin];
        return stats && stats.total > 0 && stats.pass / stats.total < pluginPassRateThreshold;
      });
    },
    [categoryStats, pluginPassRateThreshold],
  );

  const getPluginPassRate = React.useCallback(
    (plugin: string): { pass: number; total: number; rate: number } => {
      const stats = categoryStats[plugin] || { pass: 0, total: 0 };
      return {
        pass: stats.pass,
        total: stats.total,
        rate: stats.total > 0 ? (stats.pass / stats.total) * 100 : 0,
      };
    },
    [categoryStats],
  );

  const getFrameworkSeverity = React.useCallback(
    (framework: string): Severity => {
      const nonCompliantPlugins = getNonCompliantPlugins(framework);

      if (nonCompliantPlugins.length === 0) {
        return Severity.Low;
      }

      // Find the highest severity among non-compliant plugins
      let highestSeverity = Severity.Low;

      for (const plugin of nonCompliantPlugins) {
        const pluginSeverity =
          riskCategorySeverityMap[plugin as keyof typeof riskCategorySeverityMap] || Severity.Low;

        if (pluginSeverity === Severity.Critical) {
          return Severity.Critical;
        }

        if (pluginSeverity === Severity.High) {
          highestSeverity = Severity.High;
        } else if (pluginSeverity === Severity.Medium && highestSeverity === Severity.Low) {
          highestSeverity = Severity.Medium;
        }
      }

      return highestSeverity;
    },
    [getNonCompliantPlugins],
  );

  const frameworkCompliance = React.useMemo(() => {
    return FRAMEWORK_COMPLIANCE_IDS.reduce(
      (acc, framework) => {
        const nonCompliantPlugins = getNonCompliantPlugins(framework);
        acc[framework] = nonCompliantPlugins.length === 0;
        return acc;
      },
      {} as Record<string, boolean>,
    );
  }, [getNonCompliantPlugins]);

  const totalFrameworks = FRAMEWORK_COMPLIANCE_IDS.length;
  const compliantFrameworks = Object.values(frameworkCompliance).filter(Boolean).length;

  const pluginComplianceStats = React.useMemo(() => {
    // Collect all unique plugins across all frameworks
    const allFrameworkPlugins = new Set<string>();

    FRAMEWORK_COMPLIANCE_IDS.forEach((framework) => {
      const mappings = ALIASED_PLUGIN_MAPPINGS[framework];
      if (!mappings) {
        return;
      }

      Object.values(mappings).forEach(({ plugins }) => {
        plugins.forEach((plugin) => {
          // Special handling for collection plugins like 'harmful'
          if (plugin === 'harmful') {
            // Include all harmful:* plugins that have stats
            Object.keys(categoryStats)
              .filter((key) => key.startsWith('harmful:'))
              .forEach((key) => allFrameworkPlugins.add(key));
          } else {
            allFrameworkPlugins.add(plugin);
          }
        });
      });
    });

    // Filter for plugins that have test data
    const pluginsWithData = Array.from(allFrameworkPlugins).filter(
      (plugin) => categoryStats[plugin] && categoryStats[plugin].total > 0,
    );

    // Count compliant plugins and calculate actual attack success rate
    let totalTests = 0;
    let totalFailedTests = 0;
    const compliantPlugins = pluginsWithData.filter((plugin) => {
      const stats = categoryStats[plugin];
      totalTests += stats.total;
      totalFailedTests += stats.total - stats.pass;
      return stats.pass / stats.total >= pluginPassRateThreshold;
    }).length;

    // Calculate the true attack success rate based on all test runs
    const attackSuccessRate = totalTests > 0 ? (totalFailedTests / totalTests) * 100 : 0;

    return {
      total: pluginsWithData.length,
      compliant: compliantPlugins,
      percentage:
        pluginsWithData.length > 0 ? (compliantPlugins / pluginsWithData.length) * 100 : 0,
      attackSuccessRate,
      failedTests: totalFailedTests,
      totalTests,
    };
  }, [categoryStats, pluginPassRateThreshold]);

  const sortedNonCompliantPlugins = React.useCallback(
    (plugins: string[]): string[] => {
      return [...plugins].sort((a, b) => {
        // 1. First sort by severity (highest first)
        const severityA =
          riskCategorySeverityMap[a as keyof typeof riskCategorySeverityMap] || Severity.Low;
        const severityB =
          riskCategorySeverityMap[b as keyof typeof riskCategorySeverityMap] || Severity.Low;

        const severityOrder = {
          [Severity.Critical]: 0,
          [Severity.High]: 1,
          [Severity.Medium]: 2,
          [Severity.Low]: 3,
        };

        if (severityOrder[severityA] !== severityOrder[severityB]) {
          return severityOrder[severityA] - severityOrder[severityB];
        }

        // 2. Then sort by pass rate (lowest first)
        const passRateA = getPluginPassRate(a).rate;
        const passRateB = getPluginPassRate(b).rate;

        return passRateA - passRateB;
      });
    },
    [getPluginPassRate],
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">
          Framework Compliance ({compliantFrameworks}/{totalFrameworks})
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<DownloadIcon />}
          onClick={exportToCSV}
        >
          Export framework results to CSV
        </Button>
      </Box>

      <Card className="framework-compliance-card">
        <CardContent>
          <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" color="textSecondary">
              {pluginComplianceStats.attackSuccessRate.toFixed(1)}% Attack Success Rate (
              {pluginComplianceStats.failedTests}/{pluginComplianceStats.totalTests} tests failed
              across {pluginComplianceStats.total} plugins)
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={pluginComplianceStats.attackSuccessRate} // Show attack success rate (failure rate)
            sx={{
              mb: 3,
              height: 8,
              borderRadius: 4,
              backgroundColor: 'rgba(0, 0, 0, 0.1)',
              '& .MuiLinearProgress-bar': {
                borderRadius: 4,
                backgroundColor: getProgressColor(pluginComplianceStats.attackSuccessRate, true), // Invert color scale
              },
            }}
          />
          <Grid container spacing={3} className="framework-grid">
            {FRAMEWORK_COMPLIANCE_IDS.map((framework) => {
              const nonCompliantPlugins = getNonCompliantPlugins(framework);
              const sortedPlugins = sortedNonCompliantPlugins(nonCompliantPlugins);
              const isCompliant = frameworkCompliance[framework];
              const frameworkSeverity = getFrameworkSeverity(framework);

              return (
                <Grid item xs={12} sm={6} md={3} key={framework}>
                  <Card className={`framework-item ${isCompliant ? 'compliant' : 'non-compliant'}`}>
                    <CardContent>
                      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                        <Box display="flex" alignItems="center">
                          <Typography variant="h6" component="div" sx={{ mr: 1 }}>
                            {FRAMEWORK_NAMES[framework]}
                          </Typography>
                          <Tooltip title={FRAMEWORK_DESCRIPTIONS[framework] || ''} arrow>
                            <InfoIcon fontSize="small" color="action" sx={{ opacity: 0.7 }} />
                          </Tooltip>
                        </Box>
                        <Box display="flex" alignItems="center">
                          {isCompliant ? (
                            <CheckCircleIcon className="icon-compliant" />
                          ) : (
                            <Tooltip
                              title={
                                frameworkSeverity === Severity.Critical
                                  ? 'Critical: Requires immediate attention - high risk security vulnerabilities'
                                  : frameworkSeverity === Severity.High
                                    ? 'High: Serious security issues that should be prioritized'
                                    : frameworkSeverity === Severity.Medium
                                      ? 'Medium: Moderate security concerns that should be addressed'
                                      : 'Low: Minor issues with limited security impact'
                              }
                              arrow
                            >
                              <Chip
                                label={frameworkSeverity}
                                size="small"
                                sx={{
                                  backgroundColor: getSeverityColor(frameworkSeverity),
                                  color: 'white',
                                  fontWeight: 'bold',
                                }}
                              />
                            </Tooltip>
                          )}
                        </Box>
                      </Box>
                      {/* Always expanded */}
                      <Box mt={2}>
                        {(framework === 'owasp:api' || framework === 'owasp:llm') &&
                        Object.keys(ALIASED_PLUGIN_MAPPINGS[framework]).length > 0 ? (
                          // Show categorized plugins for OWASP frameworks
                          <div>
                            {Object.entries(ALIASED_PLUGIN_MAPPINGS[framework]).map(
                              ([categoryId, { plugins: categoryPlugins }]) => {
                                const categoryNumber = categoryId.split(':').pop();
                                const categoryName =
                                  categoryNumber && framework === 'owasp:llm'
                                    ? OWASP_LLM_TOP_10_NAMES[Number.parseInt(categoryNumber) - 1]
                                    : categoryNumber && framework === 'owasp:api'
                                      ? OWASP_API_TOP_10_NAMES[Number.parseInt(categoryNumber) - 1]
                                      : `Category ${categoryNumber}`;

                                // Expand harmful if present
                                const expandedPlugins = new Set<string>();
                                categoryPlugins.forEach((plugin) => {
                                  if (plugin === 'harmful') {
                                    // Add all harmful:* plugins that have stats
                                    Object.keys(categoryStats)
                                      .filter((key) => key.startsWith('harmful:'))
                                      .forEach((key) => expandedPlugins.add(key));
                                  } else {
                                    expandedPlugins.add(plugin);
                                  }
                                });

                                // Categorize all plugins: tested-compliant, tested-non-compliant, and not-tested
                                const compliantCategoryPlugins: string[] = [];
                                const nonCompliantCategoryPlugins: string[] = [];
                                const untestedPlugins: string[] = [];

                                // Process all plugins in the category
                                Array.from(expandedPlugins).forEach((plugin) => {
                                  // Check if plugin has test data
                                  if (categoryStats[plugin] && categoryStats[plugin].total > 0) {
                                    // Plugin was tested
                                    const stats = categoryStats[plugin];
                                    if (stats.pass / stats.total >= pluginPassRateThreshold) {
                                      compliantCategoryPlugins.push(plugin);
                                    } else {
                                      nonCompliantCategoryPlugins.push(plugin);
                                    }
                                  } else {
                                    // Plugin was not tested
                                    untestedPlugins.push(plugin);
                                  }
                                });

                                // Sort all sets by severity
                                const sortedNonCompliantItems = sortedNonCompliantPlugins(
                                  nonCompliantCategoryPlugins,
                                );
                                const sortedCompliantItems =
                                  sortedNonCompliantPlugins(compliantCategoryPlugins);
                                const sortedUntestedItems =
                                  sortedNonCompliantPlugins(untestedPlugins);

                                // Get all tested plugins
                                const testedPlugins = [
                                  ...compliantCategoryPlugins,
                                  ...nonCompliantCategoryPlugins,
                                ];

                                // Are all plugins compliant or are there no tested plugins?
                                const allCompliant =
                                  testedPlugins.length > 0 &&
                                  nonCompliantCategoryPlugins.length === 0;
                                const noTestedPlugins = testedPlugins.length === 0;

                                return (
                                  <Box
                                    key={categoryId}
                                    mb={2}
                                    sx={{
                                      border: '1px solid rgba(0, 0, 0, 0.08)',
                                      borderRadius: 1,
                                      overflow: 'hidden',
                                    }}
                                  >
                                    <Box
                                      display="flex"
                                      alignItems="center"
                                      justifyContent="space-between"
                                      p={1}
                                      sx={{
                                        bgcolor: 'rgba(0, 0, 0, 0.05)',
                                        borderBottom:
                                          allCompliant || noTestedPlugins
                                            ? 'none'
                                            : '1px solid rgba(0, 0, 0, 0.08)',
                                      }}
                                    >
                                      <Typography variant="subtitle2">
                                        {categoryNumber}. {categoryName}
                                      </Typography>
                                      {testedPlugins.length === 0 &&
                                      untestedPlugins.length === 0 ? (
                                        <Chip
                                          label="No Plugins"
                                          size="small"
                                          sx={{
                                            backgroundColor: '#9e9e9e',
                                            color: 'white',
                                            fontSize: '0.7rem',
                                            height: 20,
                                          }}
                                        />
                                      ) : testedPlugins.length > 0 ? (
                                        <Chip
                                          label={
                                            nonCompliantCategoryPlugins.length === 0
                                              ? '0% ASR'
                                              : `${Math.round((nonCompliantCategoryPlugins.length / testedPlugins.length) * 100)}% ASR`
                                          }
                                          size="small"
                                          sx={{
                                            backgroundColor:
                                              nonCompliantCategoryPlugins.length === 0
                                                ? '#4caf50'
                                                : '#f44336',
                                            color: 'white',
                                            fontSize: '0.7rem',
                                            height: 20,
                                          }}
                                        />
                                      ) : (
                                        <Chip
                                          label={`${untestedPlugins.length} Untested`}
                                          size="small"
                                          sx={{
                                            backgroundColor: '#9e9e9e',
                                            color: 'white',
                                            fontSize: '0.7rem',
                                            height: 20,
                                          }}
                                        />
                                      )}
                                    </Box>

                                    <List dense sx={{ py: 0 }}>
                                      {/* Failed plugins first */}
                                      {sortedNonCompliantItems.length > 0 && (
                                        <ListItem
                                          sx={{
                                            py: 0.5,
                                            px: 1,
                                            bgcolor: 'rgba(244, 67, 54, 0.05)',
                                          }}
                                        >
                                          <Typography
                                            variant="caption"
                                            fontWeight="bold"
                                            color="error.main"
                                          >
                                            Failed:
                                          </Typography>
                                        </ListItem>
                                      )}
                                      {sortedNonCompliantItems.map((plugin) => {
                                        const passRate = getPluginPassRate(plugin);
                                        const pluginSeverity =
                                          riskCategorySeverityMap[
                                            plugin as keyof typeof riskCategorySeverityMap
                                          ] || Severity.Low;

                                        return (
                                          <ListItem
                                            key={plugin}
                                            sx={{
                                              borderLeft: `3px solid ${getSeverityColor(pluginSeverity)}`,
                                              pl: 2,
                                              mb: 0.5,
                                              bgcolor: 'rgba(0, 0, 0, 0.02)',
                                              borderRadius: '0 4px 4px 0',
                                            }}
                                          >
                                            <ListItemIcon sx={{ minWidth: 30 }}>
                                              <CancelIcon fontSize="small" color="error" />
                                            </ListItemIcon>
                                            <ListItemText
                                              primary={
                                                <Box
                                                  display="flex"
                                                  alignItems="center"
                                                  justifyContent="space-between"
                                                >
                                                  <Typography variant="body2">
                                                    {displayNameOverrides[
                                                      plugin as keyof typeof displayNameOverrides
                                                    ] ||
                                                      categoryAliases[
                                                        plugin as keyof typeof categoryAliases
                                                      ] ||
                                                      plugin}
                                                  </Typography>
                                                  <Tooltip
                                                    title={`${passRate.total - passRate.pass}/${passRate.total} attacks successful`}
                                                  >
                                                    <Typography
                                                      variant="caption"
                                                      sx={{
                                                        fontWeight: 'bold',
                                                        color: 'error.main',
                                                      }}
                                                    >
                                                      {(100 - passRate.rate).toFixed(0)}%
                                                    </Typography>
                                                  </Tooltip>
                                                </Box>
                                              }
                                            />
                                          </ListItem>
                                        );
                                      })}

                                      {/* Passing plugins */}
                                      {sortedCompliantItems.length > 0 && (
                                        <ListItem
                                          sx={{
                                            py: 0.5,
                                            px: 1,
                                            bgcolor: 'rgba(76, 175, 80, 0.05)',
                                            mt: 1,
                                          }}
                                        >
                                          <Typography
                                            variant="caption"
                                            fontWeight="bold"
                                            color="success.main"
                                          >
                                            Passed:
                                          </Typography>
                                        </ListItem>
                                      )}
                                      {sortedCompliantItems.map((plugin) => {
                                        const passRate = getPluginPassRate(plugin);
                                        const pluginSeverity =
                                          riskCategorySeverityMap[
                                            plugin as keyof typeof riskCategorySeverityMap
                                          ] || Severity.Low;

                                        return (
                                          <ListItem
                                            key={plugin}
                                            sx={{
                                              borderLeft: `3px solid ${getSeverityColor(pluginSeverity)}`,
                                              pl: 2,
                                              mb: 0.5,
                                              bgcolor: 'rgba(0, 0, 0, 0.01)',
                                              borderRadius: '0 4px 4px 0',
                                            }}
                                          >
                                            <ListItemIcon sx={{ minWidth: 30 }}>
                                              <CheckCircleIcon fontSize="small" color="success" />
                                            </ListItemIcon>
                                            <ListItemText
                                              primary={
                                                <Box
                                                  display="flex"
                                                  alignItems="center"
                                                  justifyContent="space-between"
                                                >
                                                  <Typography variant="body2">
                                                    {displayNameOverrides[
                                                      plugin as keyof typeof displayNameOverrides
                                                    ] ||
                                                      categoryAliases[
                                                        plugin as keyof typeof categoryAliases
                                                      ] ||
                                                      plugin}
                                                  </Typography>
                                                  <Tooltip
                                                    title={`${passRate.total - passRate.pass}/${passRate.total} attacks successful`}
                                                  >
                                                    <Typography
                                                      variant="caption"
                                                      sx={{
                                                        fontWeight: 'bold',
                                                        color: 'success.main',
                                                      }}
                                                    >
                                                      {(100 - passRate.rate).toFixed(0)}%
                                                    </Typography>
                                                  </Tooltip>
                                                </Box>
                                              }
                                            />
                                          </ListItem>
                                        );
                                      })}

                                      {/* Untested plugins */}
                                      {sortedUntestedItems.length > 0 && (
                                        <>
                                          <ListItem
                                            sx={{
                                              py: 0.5,
                                              px: 1,
                                              bgcolor: 'rgba(158, 158, 158, 0.1)',
                                              mt: 1,
                                            }}
                                          >
                                            <Typography
                                              variant="caption"
                                              fontWeight="bold"
                                              color="text.secondary"
                                            >
                                              Not Tested:
                                            </Typography>
                                          </ListItem>
                                          {sortedUntestedItems.map((plugin) => {
                                            const pluginSeverity =
                                              riskCategorySeverityMap[
                                                plugin as keyof typeof riskCategorySeverityMap
                                              ] || Severity.Low;

                                            return (
                                              <ListItem
                                                key={plugin}
                                                sx={{
                                                  borderLeft: `3px solid ${getSeverityColor(pluginSeverity)}`,
                                                  pl: 2,
                                                  mb: 0.5,
                                                  bgcolor: 'rgba(0, 0, 0, 0.01)',
                                                  borderRadius: '0 4px 4px 0',
                                                  opacity: 0.7,
                                                }}
                                              >
                                                <ListItemIcon sx={{ minWidth: 30 }}>
                                                  <InfoIcon fontSize="small" color="action" />
                                                </ListItemIcon>
                                                <ListItemText
                                                  primary={
                                                    <Box
                                                      display="flex"
                                                      alignItems="center"
                                                      justifyContent="space-between"
                                                    >
                                                      <Typography variant="body2">
                                                        {displayNameOverrides[
                                                          plugin as keyof typeof displayNameOverrides
                                                        ] ||
                                                          categoryAliases[
                                                            plugin as keyof typeof categoryAliases
                                                          ] ||
                                                          plugin}
                                                      </Typography>
                                                      <Typography
                                                        variant="caption"
                                                        sx={{
                                                          fontWeight: 'medium',
                                                          color: 'text.secondary',
                                                        }}
                                                      >
                                                        Not Tested
                                                      </Typography>
                                                    </Box>
                                                  }
                                                />
                                              </ListItem>
                                            );
                                          })}
                                        </>
                                      )}
                                    </List>
                                  </Box>
                                );
                              },
                            )}
                          </div>
                        ) : (
                          // Standard list view for other frameworks but with same format
                          <Box
                            sx={{
                              border: '1px solid rgba(0, 0, 0, 0.08)',
                              borderRadius: 1,
                              overflow: 'hidden',
                            }}
                          >
                            <Box
                              display="flex"
                              alignItems="center"
                              justifyContent="space-between"
                              p={1}
                              sx={{
                                bgcolor: 'rgba(0, 0, 0, 0.05)',
                                borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
                              }}
                            >
                              <Typography variant="subtitle2">Framework Results</Typography>
                              {nonCompliantPlugins.length === 0 ? (
                                <Chip
                                  label="0%"
                                  size="small"
                                  sx={{
                                    backgroundColor: '#4caf50',
                                    color: 'white',
                                    fontSize: '0.7rem',
                                    height: 20,
                                  }}
                                />
                              ) : (
                                <Chip
                                  label={`${Math.round((nonCompliantPlugins.length / Object.keys(categoryStats).filter((plugin) => categoryStats[plugin].total > 0).length) * 100)}%`}
                                  size="small"
                                  sx={{
                                    backgroundColor: '#f44336',
                                    color: 'white',
                                    fontSize: '0.7rem',
                                    height: 20,
                                  }}
                                />
                              )}
                            </Box>

                            <List dense sx={{ py: 0 }}>
                              {/* Failed plugins first */}
                              {nonCompliantPlugins.length > 0 && (
                                <ListItem
                                  sx={{ py: 0.5, px: 1, bgcolor: 'rgba(244, 67, 54, 0.05)' }}
                                >
                                  <Typography
                                    variant="caption"
                                    fontWeight="bold"
                                    color="error.main"
                                  >
                                    Failed:
                                  </Typography>
                                </ListItem>
                              )}
                              {sortedPlugins.map((plugin) => {
                                const passRate = getPluginPassRate(plugin);
                                const pluginSeverity =
                                  riskCategorySeverityMap[
                                    plugin as keyof typeof riskCategorySeverityMap
                                  ] || Severity.Low;

                                return (
                                  <ListItem
                                    key={plugin}
                                    sx={{
                                      borderLeft: `3px solid ${getSeverityColor(pluginSeverity)}`,
                                      pl: 2,
                                      mb: 0.5,
                                      bgcolor: 'rgba(0, 0, 0, 0.02)',
                                      borderRadius: '0 4px 4px 0',
                                    }}
                                  >
                                    <ListItemIcon sx={{ minWidth: 30 }}>
                                      <CancelIcon fontSize="small" color="error" />
                                    </ListItemIcon>
                                    <ListItemText
                                      primary={
                                        <Box
                                          display="flex"
                                          alignItems="center"
                                          justifyContent="space-between"
                                        >
                                          <Typography variant="body2">
                                            {displayNameOverrides[
                                              plugin as keyof typeof displayNameOverrides
                                            ] ||
                                              categoryAliases[
                                                plugin as keyof typeof categoryAliases
                                              ] ||
                                              plugin}
                                          </Typography>
                                          <Tooltip
                                            title={`${passRate.total - passRate.pass}/${passRate.total} attacks successful`}
                                          >
                                            <Typography
                                              variant="caption"
                                              sx={{ fontWeight: 'bold', color: 'error.main' }}
                                            >
                                              {(100 - passRate.rate).toFixed(0)}%
                                            </Typography>
                                          </Tooltip>
                                        </Box>
                                      }
                                    />
                                  </ListItem>
                                );
                              })}

                              {/* Passing plugins */}
                              {Object.keys(categoryStats).filter(
                                (plugin) =>
                                  categoryStats[plugin].total > 0 &&
                                  categoryStats[plugin].pass / categoryStats[plugin].total >=
                                    pluginPassRateThreshold,
                              ).length > 0 && (
                                <ListItem
                                  sx={{ py: 0.5, px: 1, bgcolor: 'rgba(76, 175, 80, 0.05)', mt: 1 }}
                                >
                                  <Typography
                                    variant="caption"
                                    fontWeight="bold"
                                    color="success.main"
                                  >
                                    Passed:
                                  </Typography>
                                </ListItem>
                              )}
                              {Object.keys(categoryStats)
                                .filter(
                                  (plugin) =>
                                    categoryStats[plugin].total > 0 &&
                                    categoryStats[plugin].pass / categoryStats[plugin].total >=
                                      pluginPassRateThreshold,
                                )
                                .sort((a, b) => {
                                  // Sort by severity first
                                  const severityA =
                                    riskCategorySeverityMap[
                                      a as keyof typeof riskCategorySeverityMap
                                    ] || Severity.Low;
                                  const severityB =
                                    riskCategorySeverityMap[
                                      b as keyof typeof riskCategorySeverityMap
                                    ] || Severity.Low;

                                  const severityOrder = {
                                    [Severity.Critical]: 0,
                                    [Severity.High]: 1,
                                    [Severity.Medium]: 2,
                                    [Severity.Low]: 3,
                                  };

                                  return severityOrder[severityA] - severityOrder[severityB];
                                })
                                .map((plugin) => {
                                  const passRate = getPluginPassRate(plugin);
                                  const pluginSeverity =
                                    riskCategorySeverityMap[
                                      plugin as keyof typeof riskCategorySeverityMap
                                    ] || Severity.Low;

                                  return (
                                    <ListItem
                                      key={plugin}
                                      sx={{
                                        borderLeft: `3px solid ${getSeverityColor(pluginSeverity)}`,
                                        pl: 2,
                                        mb: 0.5,
                                        bgcolor: 'rgba(0, 0, 0, 0.01)',
                                        borderRadius: '0 4px 4px 0',
                                      }}
                                    >
                                      <ListItemIcon sx={{ minWidth: 30 }}>
                                        <CheckCircleIcon fontSize="small" color="success" />
                                      </ListItemIcon>
                                      <ListItemText
                                        primary={
                                          <Box
                                            display="flex"
                                            alignItems="center"
                                            justifyContent="space-between"
                                          >
                                            <Typography variant="body2">
                                              {displayNameOverrides[
                                                plugin as keyof typeof displayNameOverrides
                                              ] ||
                                                categoryAliases[
                                                  plugin as keyof typeof categoryAliases
                                                ] ||
                                                plugin}
                                            </Typography>
                                            <Tooltip
                                              title={`${passRate.total - passRate.pass}/${passRate.total} attacks successful`}
                                            >
                                              <Typography
                                                variant="caption"
                                                sx={{ fontWeight: 'bold', color: 'success.main' }}
                                              >
                                                {(100 - passRate.rate).toFixed(0)}%
                                              </Typography>
                                            </Tooltip>
                                          </Box>
                                        }
                                      />
                                    </ListItem>
                                  );
                                })}

                              {/* Untested plugins for this framework */}
                              {Object.keys(ALIASED_PLUGIN_MAPPINGS[framework] || {}).flatMap(
                                (categoryId) => {
                                  // Get all plugins from this category
                                  const categoryPlugins =
                                    ALIASED_PLUGIN_MAPPINGS[framework]?.[categoryId]?.plugins || [];
                                  // Expand harmful plugins
                                  const expandedPlugins = new Set<string>();
                                  categoryPlugins.forEach((plugin) => {
                                    if (plugin === 'harmful') {
                                      // Add all harmful:* plugins
                                      Object.keys(categoryStats)
                                        .filter((key) => key.startsWith('harmful:'))
                                        .forEach((key) => expandedPlugins.add(key));
                                    } else {
                                      expandedPlugins.add(plugin);
                                    }
                                  });
                                  // Return only untested plugins
                                  return Array.from(expandedPlugins).filter(
                                    (plugin) =>
                                      !categoryStats[plugin] || categoryStats[plugin].total === 0,
                                  );
                                },
                              ).length > 0 && (
                                <ListItem
                                  sx={{
                                    py: 0.5,
                                    px: 1,
                                    bgcolor: 'rgba(158, 158, 158, 0.1)',
                                    mt: 1,
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    fontWeight="bold"
                                    color="text.secondary"
                                  >
                                    Not Tested:
                                  </Typography>
                                </ListItem>
                              )}
                              {Object.keys(ALIASED_PLUGIN_MAPPINGS[framework] || {})
                                .flatMap((categoryId) => {
                                  // Get all plugins from this category
                                  const categoryPlugins =
                                    ALIASED_PLUGIN_MAPPINGS[framework]?.[categoryId]?.plugins || [];
                                  // Expand harmful plugins
                                  const expandedPlugins = new Set<string>();
                                  categoryPlugins.forEach((plugin) => {
                                    if (plugin === 'harmful') {
                                      // Add all harmful:* plugins
                                      Object.keys(categoryStats)
                                        .filter((key) => key.startsWith('harmful:'))
                                        .forEach((key) => expandedPlugins.add(key));
                                    } else {
                                      expandedPlugins.add(plugin);
                                    }
                                  });
                                  // Return only untested plugins
                                  return Array.from(expandedPlugins).filter(
                                    (plugin) =>
                                      !categoryStats[plugin] || categoryStats[plugin].total === 0,
                                  );
                                })
                                .sort((a, b) => {
                                  // Sort by severity first
                                  const severityA =
                                    riskCategorySeverityMap[
                                      a as keyof typeof riskCategorySeverityMap
                                    ] || Severity.Low;
                                  const severityB =
                                    riskCategorySeverityMap[
                                      b as keyof typeof riskCategorySeverityMap
                                    ] || Severity.Low;

                                  const severityOrder = {
                                    [Severity.Critical]: 0,
                                    [Severity.High]: 1,
                                    [Severity.Medium]: 2,
                                    [Severity.Low]: 3,
                                  };

                                  return severityOrder[severityA] - severityOrder[severityB];
                                })
                                .map((plugin) => {
                                  const pluginSeverity =
                                    riskCategorySeverityMap[
                                      plugin as keyof typeof riskCategorySeverityMap
                                    ] || Severity.Low;

                                  return (
                                    <ListItem
                                      key={plugin}
                                      sx={{
                                        borderLeft: `3px solid ${getSeverityColor(pluginSeverity)}`,
                                        pl: 2,
                                        mb: 0.5,
                                        bgcolor: 'rgba(0, 0, 0, 0.01)',
                                        borderRadius: '0 4px 4px 0',
                                        opacity: 0.7,
                                      }}
                                    >
                                      <ListItemIcon sx={{ minWidth: 30 }}>
                                        <InfoIcon fontSize="small" color="action" />
                                      </ListItemIcon>
                                      <ListItemText
                                        primary={
                                          <Box
                                            display="flex"
                                            alignItems="center"
                                            justifyContent="space-between"
                                          >
                                            <Typography variant="body2">
                                              {displayNameOverrides[
                                                plugin as keyof typeof displayNameOverrides
                                              ] ||
                                                categoryAliases[
                                                  plugin as keyof typeof categoryAliases
                                                ] ||
                                                plugin}
                                            </Typography>
                                            <Typography
                                              variant="caption"
                                              sx={{
                                                fontWeight: 'medium',
                                                color: 'text.secondary',
                                              }}
                                            >
                                              Not Tested
                                            </Typography>
                                          </Box>
                                        }
                                      />
                                    </ListItem>
                                  );
                                })}
                            </List>
                          </Box>
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
};

export default FrameworkCompliance;
