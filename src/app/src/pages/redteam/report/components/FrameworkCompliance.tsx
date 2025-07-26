import React from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import {
  ALIASED_PLUGIN_MAPPINGS,
  FRAMEWORK_COMPLIANCE_IDS,
  riskCategorySeverityMap,
  Severity,
} from '@promptfoo/redteam/constants';
import FrameworkCard from './FrameworkCard';
import {
  categorizePlugins,
  expandPluginCollections,
  getProgressColor,
} from './FrameworkComplianceUtils';
import CSVExporter from './FrameworkCsvExporter';
import { useReportStore } from './store';
import './FrameworkCompliance.css';

interface FrameworkComplianceProps {
  categoryStats: Record<string, { pass: number; total: number; passWithFilter: number }>;
  strategyStats: Record<string, { pass: number; total: number }>;
}

const FrameworkCompliance: React.FC<FrameworkComplianceProps> = ({
  categoryStats,
  strategyStats,
}) => {
  const { pluginPassRateThreshold } = useReportStore();

  const getNonCompliantPlugins = React.useCallback(
    (framework: string) => {
      const mappings = ALIASED_PLUGIN_MAPPINGS[framework];
      if (!mappings) {
        return [];
      }

      // First, collect all plugins from all subcategories
      const allPlugins = new Set<string>();
      Object.values(mappings).forEach(({ plugins }) => {
        const expanded = expandPluginCollections(plugins, categoryStats);
        expanded.forEach((plugin) => allPlugins.add(plugin));
      });

      // Then filter for non-compliant ones
      const { nonCompliant } = categorizePlugins(
        allPlugins,
        categoryStats,
        pluginPassRateThreshold,
      );
      return nonCompliant;
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

  const pluginComplianceStats = React.useMemo(() => {
    // Collect all unique plugins across all frameworks
    const allFrameworkPlugins = new Set<string>();

    FRAMEWORK_COMPLIANCE_IDS.forEach((framework) => {
      const mappings = ALIASED_PLUGIN_MAPPINGS[framework];
      if (!mappings) {
        return;
      }

      Object.values(mappings).forEach(({ plugins }) => {
        const expanded = expandPluginCollections(plugins, categoryStats);
        expanded.forEach((plugin) => allFrameworkPlugins.add(plugin));
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
    <Box sx={{ pageBreakBefore: 'always', breakBefore: 'always' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">
          Framework Compliance ({Object.values(frameworkCompliance).filter(Boolean).length}/
          {FRAMEWORK_COMPLIANCE_IDS.length})
        </Typography>
        <CSVExporter
          categoryStats={categoryStats}
          pluginPassRateThreshold={pluginPassRateThreshold}
        />
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
            {FRAMEWORK_COMPLIANCE_IDS.map((framework, idx) => {
              const nonCompliantPlugins = getNonCompliantPlugins(framework);
              const isCompliant = frameworkCompliance[framework];
              const frameworkSeverity = getFrameworkSeverity(framework);

              return (
                <Grid item xs={12} sm={6} md={4} key={framework}>
                  <FrameworkCard
                    framework={framework}
                    isCompliant={isCompliant}
                    frameworkSeverity={frameworkSeverity}
                    categoryStats={categoryStats}
                    pluginPassRateThreshold={pluginPassRateThreshold}
                    nonCompliantPlugins={nonCompliantPlugins}
                    sortedNonCompliantPlugins={sortedNonCompliantPlugins}
                    getPluginPassRate={getPluginPassRate}
                    idx={idx}
                  />
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
