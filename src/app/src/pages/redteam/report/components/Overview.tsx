import React from 'react';

import { type Plugin as PluginType, Severity } from '@promptfoo/redteam/constants';
import { getRiskCategorySeverityMap } from '@promptfoo/redteam/sharedFrontend';
import { type TestResultStats } from './FrameworkComplianceUtils';
import SeverityCard from './SeverityCard';
import { useReportStore } from './store';
import type { RedteamPluginObject } from '@promptfoo/redteam/types';

interface OverviewProps {
  categoryStats: Record<PluginType, TestResultStats>;
  plugins: RedteamPluginObject[];
  vulnerabilitiesDataGridRef: React.RefObject<HTMLDivElement | null>;
}

const Overview = ({ categoryStats, plugins, vulnerabilitiesDataGridRef }: OverviewProps) => {
  const { pluginPassRateThreshold, severityFilter, setSeverityFilter } = useReportStore();

  const severityCounts = Object.values(Severity).reduce(
    (acc, severity) => {
      acc[severity] = plugins.reduce((count, plugin) => {
        const stats = categoryStats[plugin.id as PluginType];
        if (!stats || stats.total <= 0) {
          return count;
        }

        // Get the severity from the plugin definition or, if it's undefined (most cases; no override is set),
        // the risk category severity map.
        const pluginSeverity =
          plugin?.severity ?? getRiskCategorySeverityMap(plugins)[plugin.id as PluginType];

        if (pluginSeverity !== severity) {
          return count;
        }

        const passRate = stats.total > 0 ? stats.pass / stats.total : 1;
        return passRate < pluginPassRateThreshold ? count + 1 : count;
      }, 0);
      return acc;
    },
    {} as Record<Severity, number>,
  );

  const handleNavigateToVulnerabilities = (severity: Severity) => {
    // Toggle filter: if clicking the same severity, clear the filter
    if (severityFilter === severity) {
      setSeverityFilter(null);
    } else {
      setSeverityFilter(severity);
      // Only scroll when applying a filter, not when clearing
      vulnerabilitiesDataGridRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      {Object.values(Severity).map((severity) => (
        <div key={severity} className="flex-1">
          <SeverityCard
            severity={severity}
            issueCount={severityCounts[severity]}
            navigateOnClick
            navigateToIssues={() => handleNavigateToVulnerabilities(severity)}
            isActive={severityFilter === severity}
            hasActiveFilter={severityFilter !== null}
          />
        </div>
      ))}
    </div>
  );
};

export default Overview;
