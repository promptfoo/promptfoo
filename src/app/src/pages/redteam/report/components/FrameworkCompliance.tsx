import React from 'react';

import { Card, CardContent } from '@app/components/ui/card';
import { cn } from '@app/lib/utils';
import { formatASRForDisplay } from '@app/utils/redteam';
import {
  ALIASED_PLUGIN_MAPPINGS,
  FRAMEWORK_COMPLIANCE_IDS,
  type FrameworkComplianceId,
  Severity,
} from '@promptfoo/redteam/constants';
import { calculateAttackSuccessRate } from '@promptfoo/redteam/metrics';
import FrameworkCard from './FrameworkCard';
import {
  categorizePlugins,
  expandPluginCollections,
  getPluginSeverity,
  type PluginCategories,
  type TestResultStats,
} from './FrameworkComplianceUtils';
import CSVExporter from './FrameworkCsvExporter';
import { useReportStore } from './store';
import type { UnifiedConfig } from '@promptfoo/types';

interface FrameworkComplianceProps {
  evalId: string;
  categoryStats: Record<string, Required<TestResultStats>>;
  config?: Partial<UnifiedConfig>;
}

interface FrameworkSummary {
  pluginCategories: PluginCategories;
  isTested: boolean;
  isCompliant: boolean;
  severity: Severity;
}

function getFrameworkSeverity(nonCompliantPlugins: string[]): Severity {
  if (nonCompliantPlugins.length === 0) {
    return Severity.Low;
  }

  let highestSeverity: Severity = Severity.Low;
  for (const plugin of nonCompliantPlugins) {
    const pluginSeverity = getPluginSeverity(plugin);

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
}

const FrameworkCompliance = ({ evalId, categoryStats, config }: FrameworkComplianceProps) => {
  const { pluginPassRateThreshold, showUntestedPlugins } = useReportStore();

  // Filter frameworks based on config
  const frameworksToShow = React.useMemo(() => {
    const configuredFrameworks = config?.redteam?.frameworks;

    // If not configured or empty, show all frameworks (default behavior)
    if (!configuredFrameworks || configuredFrameworks.length === 0) {
      return FRAMEWORK_COMPLIANCE_IDS;
    }

    // Filter to only show configured frameworks
    return FRAMEWORK_COMPLIANCE_IDS.filter((id) =>
      configuredFrameworks.includes(id as FrameworkComplianceId),
    );
  }, [config?.redteam?.frameworks]);

  const frameworkSummaries = React.useMemo(() => {
    const summaries = new Map<FrameworkComplianceId, FrameworkSummary>();

    frameworksToShow.forEach((framework) => {
      const mappings = ALIASED_PLUGIN_MAPPINGS[framework];
      const allPlugins = new Set<string>();
      if (mappings) {
        Object.values(mappings).forEach(({ plugins }) => {
          const expanded = expandPluginCollections(plugins, categoryStats);
          expanded.forEach((plugin) => allPlugins.add(plugin));
        });
      }

      const pluginCategories = categorizePlugins(
        allPlugins,
        categoryStats,
        pluginPassRateThreshold,
      );
      const isTested = pluginCategories.compliant.length + pluginCategories.nonCompliant.length > 0;
      summaries.set(framework, {
        pluginCategories,
        isTested,
        isCompliant: isTested && pluginCategories.nonCompliant.length === 0,
        severity: getFrameworkSeverity(pluginCategories.nonCompliant),
      });
    });

    return summaries;
  }, [categoryStats, frameworksToShow, pluginPassRateThreshold]);

  const testedFrameworkCount = Array.from(frameworkSummaries.values()).filter(
    ({ isTested }) => isTested,
  ).length;
  const compliantFrameworkCount = Array.from(frameworkSummaries.values()).filter(
    ({ isCompliant }) => isCompliant,
  ).length;

  const pluginComplianceStats = React.useMemo(() => {
    const pluginsWithData = new Set<string>();
    frameworkSummaries.forEach(({ pluginCategories }) => {
      pluginCategories.compliant.forEach((plugin) => pluginsWithData.add(plugin));
      pluginCategories.nonCompliant.forEach((plugin) => pluginsWithData.add(plugin));
    });

    let totalTests = 0;
    let totalFailedTests = 0;
    pluginsWithData.forEach((plugin) => {
      const stats = categoryStats[plugin];
      totalTests += stats.total;
      totalFailedTests += stats.failCount;
    });

    return {
      total: pluginsWithData.size,
      attackSuccessRate: calculateAttackSuccessRate(totalTests, totalFailedTests),
      failedTests: totalFailedTests,
      totalTests,
    };
  }, [categoryStats, frameworkSummaries]);

  // Get progress bar color based on attack success rate (high is bad)
  // All colors are red-toned since attacks succeeding is always bad.
  const getProgressBarColor = (percentage: number): string => {
    if (percentage >= 90) {
      return 'bg-red-800';
    }
    if (percentage >= 75) {
      return 'bg-red-700';
    }
    if (percentage >= 50) {
      return 'bg-red-600';
    }
    if (percentage >= 25) {
      return 'bg-red-500';
    }
    return 'bg-red-400';
  };

  return (
    <div>
      <div
        data-testid="framework-compliance-header"
        className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <h2 className="text-xl font-semibold">
          Framework Compliance ({compliantFrameworkCount}/{testedFrameworkCount} tested)
        </h2>
        <CSVExporter
          categoryStats={categoryStats}
          pluginPassRateThreshold={pluginPassRateThreshold}
          frameworksToShow={frameworksToShow}
        />
      </div>
      <Card className="overflow-hidden rounded-xl transition-shadow duration-300">
        <CardContent className="pt-6">
          <p className="mb-2 text-sm text-muted-foreground">
            {formatASRForDisplay(pluginComplianceStats.attackSuccessRate)}% Attack Success Rate (
            {pluginComplianceStats.failedTests}/{pluginComplianceStats.totalTests} tests failed
            across {pluginComplianceStats.total} plugins)
          </p>
          {/* Progress bar */}
          <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                getProgressBarColor(pluginComplianceStats.attackSuccessRate),
              )}
              style={{ width: `${Math.min(100, pluginComplianceStats.attackSuccessRate)}%` }}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {frameworksToShow.map((framework, idx) => {
              const summary = frameworkSummaries.get(framework);
              if (!summary) {
                return null;
              }

              return (
                <FrameworkCard
                  key={framework}
                  evalId={evalId}
                  framework={framework}
                  isTested={summary.isTested}
                  isCompliant={summary.isCompliant}
                  frameworkSeverity={summary.severity}
                  categoryStats={categoryStats}
                  pluginPassRateThreshold={pluginPassRateThreshold}
                  pluginCategories={summary.pluginCategories}
                  showUntestedPlugins={showUntestedPlugins}
                  idx={idx}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FrameworkCompliance;
