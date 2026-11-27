import React from 'react';

import { Card, CardContent } from '@app/components/ui/card';
import { cn } from '@app/lib/utils';
import { formatASRForDisplay } from '@app/utils/redteam';
import { calculateAttackSuccessRate } from '@promptfoo/presentation/redteamMetrics';
import {
  FRAMEWORK_COMPLIANCE_IDS,
  type FrameworkComplianceId,
  riskCategorySeverityMap,
  Severity,
} from '@promptfoo/redteam/constants';
import FrameworkCard from './FrameworkCard';
import {
  categorizePlugins,
  getAiucCoverageGap,
  getFrameworkPlugins,
  type TestResultStats,
} from './FrameworkComplianceUtils';
import FrameworkExporter from './FrameworkExporter';
import { useReportStore } from './store';
import type { UnifiedConfig } from '@promptfoo/types';

interface FrameworkComplianceProps {
  evalId: string;
  categoryStats: Record<string, Required<TestResultStats>>;
  config?: Partial<UnifiedConfig>;
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

  const getNonCompliantPlugins = React.useCallback(
    (framework: string) => {
      return categorizePlugins(
        getFrameworkPlugins(framework, categoryStats),
        categoryStats,
        pluginPassRateThreshold,
      ).nonCompliant;
    },
    [categoryStats, pluginPassRateThreshold],
  );

  const getFrameworkSeverity = React.useCallback(
    (framework: string): Severity => {
      const nonCompliantPlugins = getNonCompliantPlugins(framework);

      if (nonCompliantPlugins.length === 0) {
        return Severity.Low;
      }

      // Find the highest severity among non-compliant plugins
      let highestSeverity: Severity = Severity.Low;

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
    const result: Partial<Record<FrameworkComplianceId, boolean>> = {};
    frameworksToShow.forEach((framework) => {
      const nonCompliantPlugins = getNonCompliantPlugins(framework);
      result[framework] =
        nonCompliantPlugins.length === 0 &&
        (framework !== 'aiuc:1' || !getAiucCoverageGap(categoryStats));
    });
    return result;
  }, [frameworksToShow, getNonCompliantPlugins, categoryStats]);

  const pluginComplianceStats = React.useMemo(() => {
    // Collect all unique plugins across all frameworks to show
    const allFrameworkPlugins = new Set(
      frameworksToShow.flatMap((framework) => [...getFrameworkPlugins(framework, categoryStats)]),
    );

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
      totalFailedTests += stats.failCount;
      return stats.pass / stats.total >= pluginPassRateThreshold;
    }).length;

    return {
      total: pluginsWithData.length,
      compliant: compliantPlugins,
      percentage:
        pluginsWithData.length > 0 ? (compliantPlugins / pluginsWithData.length) * 100 : 0,
      attackSuccessRate: calculateAttackSuccessRate(totalTests, totalFailedTests),
      failedTests: totalFailedTests,
      totalTests,
    };
  }, [frameworksToShow, categoryStats, pluginPassRateThreshold]);

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
          Framework Compliance ({Object.values(frameworkCompliance).filter(Boolean).length}/
          {frameworksToShow.length})
        </h2>
        <FrameworkExporter
          categoryStats={categoryStats}
          pluginPassRateThreshold={pluginPassRateThreshold}
          frameworksToShow={frameworksToShow}
        />
      </div>
      <Card className="overflow-hidden rounded-xl transition-shadow duration-300">
        <CardContent className="pt-6">
          <p className="mb-2 text-sm text-muted-foreground">
            {pluginComplianceStats.totalTests === 0 ? (
              'No test results for the mapped framework plugins.'
            ) : (
              <>
                {formatASRForDisplay(pluginComplianceStats.attackSuccessRate)}% Attack Success Rate
                ({pluginComplianceStats.failedTests}/{pluginComplianceStats.totalTests} tests failed
                across {pluginComplianceStats.total} plugins)
              </>
            )}
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
              const nonCompliantPlugins = getNonCompliantPlugins(framework);
              const isCompliant = frameworkCompliance[framework] ?? false;
              const frameworkSeverity = getFrameworkSeverity(framework);

              return (
                <FrameworkCard
                  key={framework}
                  evalId={evalId}
                  framework={framework}
                  isCompliant={isCompliant}
                  frameworkSeverity={frameworkSeverity}
                  categoryStats={categoryStats}
                  pluginPassRateThreshold={pluginPassRateThreshold}
                  nonCompliantPlugins={nonCompliantPlugins}
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
